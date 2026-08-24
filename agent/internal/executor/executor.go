package executor

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/voidsuite/voidbackups-agent/internal/client"
	"github.com/voidsuite/voidbackups-agent/internal/restic"
)

// Executor runs backup tasks using restic.
type Executor struct {
	API *client.Client
}

// New creates a new executor.
func New(api *client.Client) *Executor {
	return &Executor{API: api}
}

// StorageConfig represents the backup storage configuration.
type StorageConfig struct {
	Type   string `json:"type"`
	Path   string `json:"path,omitempty"`
	// S3/R2/B2 config
	Endpoint  string `json:"endpoint,omitempty"`
	Bucket    string `json:"bucket,omitempty"`
	AccessKey string `json:"accessKey,omitempty"`
	SecretKey string `json:"secretKey,omitempty"`
	Region    string `json:"region,omitempty"`
}

// EncryptionConfig represents encryption settings.
type EncryptionConfig struct {
	Enabled  bool   `json:"enabled"`
	KeyID    string `json:"keyId,omitempty"`
	Password string `json:"password,omitempty"`
}

// RetentionConfig represents backup retention policy.
type RetentionConfig struct {
	KeepDaily   int `json:"keepDaily"`
	KeepWeekly  int `json:"keepWeekly"`
	KeepMonthly int `json:"keepMonthly"`
	KeepYearly  int `json:"keepYearly"`
}

// Run executes a backup task.
func (e *Executor) Run(task client.Task) {
	log.Printf("[executor] Starting task %s (job: %s)", task.ID, task.JobName)

	// Notify server we're starting
	if err := e.API.StartTask(task.ID); err != nil {
		log.Printf("[executor] Failed to start task: %v", err)
		return
	}

	var logs strings.Builder
	logs.WriteString(fmt.Sprintf("=== Backup started at %s ===\n", time.Now().Format(time.RFC3339)))
	logs.WriteString(fmt.Sprintf("Job: %s\n", task.JobName))
	logs.WriteString(fmt.Sprintf("Triggered by: %s\n", task.TriggeredBy))

	// Parse configs
	var storage StorageConfig
	json.Unmarshal(task.StorageConfig, &storage)

	var encryption EncryptionConfig
	json.Unmarshal(task.EncryptionConfig, &encryption)

	// Determine repository path
	repoPath := e.getRepoPath(task.JobID, storage)

	// Set up restic password
	password := encryption.Password
	if password == "" {
		password = "voidbackups-default" // Fallback — not recommended
	}

	// Initialize restic wrapper
	r := restic.New(repoPath, password)

	// Initialize repository if needed
	logs.WriteString("Initializing restic repository...\n")
	if err := r.Init(); err != nil {
		logs.WriteString(fmt.Sprintf("Repository init error: %v\n", err))
		e.reportFailure(task.ID, task.JobID, logs.String(), err)
		return
	}
	logs.WriteString("Repository ready.\n")

	// Collect source paths
	sourcePaths := e.resolveSourcePaths(task.SourcesDetail)
	if len(sourcePaths) == 0 {
		logs.WriteString("No source paths to back up.\n")
		e.reportFailure(task.ID, task.JobID, logs.String(), fmt.Errorf("no sources"))
		return
	}

	logs.WriteString(fmt.Sprintf("Backing up %d source(s):\n", len(sourcePaths)))
	for _, p := range sourcePaths {
		logs.WriteString(fmt.Sprintf("  - %s\n", p))
	}

	// Run backup
	logs.WriteString("Running restic backup...\n")
	e.API.ReportProgress(task.ID, "Starting backup...")

	result, err := r.Backup(sourcePaths, []string{"job:" + task.JobID, "voidbackups"})
	if err != nil {
		logs.WriteString(fmt.Sprintf("Backup error: %v\n", err))
		e.reportFailure(task.ID, task.JobID, logs.String(), err)
		return
	}

	logs.WriteString(fmt.Sprintf("Backup complete: %d files new, %d changed, %s added\n",
		result.FilesNew, result.FilesChanged, formatBytes(result.BytesAdded)))
	logs.WriteString(fmt.Sprintf("Snapshot: %s\n", result.SnapshotID))

	// Run retention/prune
	logs.WriteString("Applying retention policy...\n")
	var retention RetentionConfig
	json.Unmarshal([]byte("{}"), &retention) // Default empty

	// Parse retention from task (would come from job config)
	if err := e.applyRetention(r, retention, &logs); err != nil {
		logs.WriteString(fmt.Sprintf("Retention warning: %v\n", err))
	}

	// Report success
	logs.WriteString(fmt.Sprintf("=== Backup completed at %s ===\n", time.Now().Format(time.RFC3339)))

	e.API.ReportResult(task.ID, client.TaskResult{
		Status:       "success",
		BytesNew:     result.BytesAdded,
		BytesTotal:   result.BytesTotal,
		FilesNew:     result.FilesNew,
		FilesChanged: result.FilesChanged,
		FilesTotal:   result.FilesTotal,
		SnapshotID:   result.SnapshotID,
		Logs:         logs.String(),
	})

	log.Printf("[executor] Task %s completed successfully (snapshot: %s)", task.ID, result.SnapshotID)
}

func (e *Executor) getRepoPath(jobID string, storage StorageConfig) string {
	if storage.Path != "" {
		return filepath.Join(storage.Path, "repos", jobID)
	}
	// Default local path
	return filepath.Join("/var/backups/voidbackups/repos", jobID)
}

func (e *Executor) resolveSourcePaths(sources []client.Source) []string {
	var paths []string
	for _, src := range sources {
		switch src.Type {
		case "path", "docker_volume", "sqlite":
			paths = append(paths, src.Path)
		case "docker_container":
			// For containers, we'd use docker cp to a temp dir
			// For now, skip — this needs special handling
			log.Printf("[executor] Container backup not yet implemented: %s", src.Name)
		default:
			paths = append(paths, src.Path)
		}
	}
	return paths
}

func (e *Executor) applyRetention(r *restic.Wrapper, retention RetentionConfig, logs *strings.Builder) error {
	if retention.KeepDaily == 0 && retention.KeepWeekly == 0 && retention.KeepMonthly == 0 && retention.KeepYearly == 0 {
		// No retention configured — use defaults
		retention.KeepDaily = 7
		retention.KeepWeekly = 4
		retention.KeepMonthly = 6
	}

	logs.WriteString(fmt.Sprintf("Retention: daily=%d, weekly=%d, monthly=%d, yearly=%d\n",
		retention.KeepDaily, retention.KeepWeekly, retention.KeepMonthly, retention.KeepYearly))

	return r.Forget(retention.KeepDaily, retention.KeepWeekly, retention.KeepMonthly, retention.KeepYearly)
}

func (e *Executor) reportFailure(taskID, jobID string, logs string, err error) {
	logs += fmt.Sprintf("=== Backup FAILED: %v ===\n", err)

	e.API.ReportResult(taskID, client.TaskResult{
		Status: "failed",
		Error:  err.Error(),
		Logs:   logs,
	})

	log.Printf("[executor] Task %s failed: %v", taskID, err)
}

func formatBytes(bytes int64) string {
	const unit = 1024
	if bytes < unit {
		return fmt.Sprintf("%d B", bytes)
	}
	div, exp := int64(unit), 0
	for n := bytes / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %cB", float64(bytes)/float64(div), "KMGTPE"[exp])
}

// ensureDir creates a directory if it doesn't exist.
func ensureDir(path string) error {
	return os.MkdirAll(path, 0700)
}
