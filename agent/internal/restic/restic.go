package restic

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"strings"
)

// Wrapper provides methods to interact with restic.
type Wrapper struct {
	Repository string
	Password   string
}

// New creates a new restic wrapper.
func New(repository, password string) *Wrapper {
	return &Wrapper{
		Repository: repository,
		Password:   password,
	}
}

// Snapshot represents a restic snapshot.
type Snapshot struct {
	ID       string   `json:"id"`
	ShortID  string   `json:"short_id"`
	Time     string   `json:"time"`
	Tree     string   `json:"tree"`
	Paths    []string `json:"paths"`
	Hostname string   `json:"hostname"`
	Tags     []string `json:"tags"`
}

// BackupResult holds the output of a backup operation.
type BackupResult struct {
	FilesNew    int    `json:"files_new"`
	FilesChanged int   `json:"files_changed"`
	FilesTotal  int    `json:"files_total"`
	BytesAdded  int64  `json:"bytes_added"`
	BytesTotal  int64  `json:"bytes_total"`
	SnapshotID  string `json:"snapshot_id"`
}

// Init initializes a new restic repository.
func (r *Wrapper) Init() error {
	_, err := r.run("init", "----repo-version", "2")
	if err != nil && !strings.Contains(err.Error(), "already initialized") {
		return fmt.Errorf("restic init: %w", err)
	}
	return nil
}

// Backup runs a backup of the given paths.
func (r *Wrapper) Backup(paths []string, tags []string) (*BackupResult, error) {
	args := []string{"backup"}
	args = append(args, paths...)
	for _, tag := range tags {
		args = append(args, "--tag", tag)
	}
	args = append(args, "--json")

	output, err := r.run(args...)
	if err != nil {
		return nil, fmt.Errorf("restic backup: %w", err)
	}

	// Parse the JSON output (last line is the summary)
	lines := strings.Split(strings.TrimSpace(output), "\n")
	for i := len(lines) - 1; i >= 0; i-- {
		var msg struct {
			MessageType string `json:"message_type"`
			FilesNew    int    `json:"files_new"`
			FilesChanged int   `json:"files_changed"`
			FilesTotal  int    `json:"total_files"`
			BytesAdded  int64  `json:"bytes_added"`
			BytesTotal  int64  `json:"total_bytes"`
			SnapshotID  string `json:"snapshot_id"`
		}
		if json.Unmarshal([]byte(lines[i]), &msg) == nil && msg.MessageType == "summary" {
			return &BackupResult{
				FilesNew:    msg.FilesNew,
				FilesChanged: msg.FilesChanged,
				FilesTotal:  msg.FilesTotal,
				BytesAdded:  msg.BytesAdded,
				BytesTotal:  msg.BytesTotal,
				SnapshotID:  msg.SnapshotID,
			}, nil
		}
	}

	return &BackupResult{}, nil
}

// Snapshots lists all snapshots in the repository.
func (r *Wrapper) Snapshots() ([]Snapshot, error) {
	output, err := r.run("snapshots", "--json")
	if err != nil {
		return nil, fmt.Errorf("restic snapshots: %w", err)
	}

	var snapshots []Snapshot
	if err := json.Unmarshal([]byte(output), &snapshots); err != nil {
		return nil, fmt.Errorf("parsing snapshots: %w", err)
	}
	return snapshots, nil
}

// Restore restores files from a snapshot.
func (r *Wrapper) Restore(snapshotID, target, includePath string) error {
	args := []string{"restore", snapshotID, "--target", target}
	if includePath != "" {
		args = append(args, "--include", includePath)
	}
	_, err := r.run(args...)
	if err != nil {
		return fmt.Errorf("restic restore: %w", err)
	}
	return nil
}

// List lists files in a snapshot.
func (r *Wrapper) List(snapshotID, path string) ([]string, error) {
	args := []string{"ls", snapshotID}
	if path != "" {
		args = append(args, path)
	}
	args = append(args, "--json")

	output, err := r.run(args...)
	if err != nil {
		return nil, fmt.Errorf("restic ls: %w", err)
	}

	var files []string
	for _, line := range strings.Split(output, "\n") {
		var node struct {
			MessageType string `json:"message_type"`
			Name        string `json:"name"`
			Path        string `json:"path"`
			NodeType    string `json:"node_type"`
		}
		if json.Unmarshal([]byte(line), &node) == nil && node.MessageType == "node" {
			files = append(files, node.Path)
		}
	}
	return files, nil
}

// Forget removes snapshots according to retention policy.
func (r *Wrapper) Forget(keepDaily, keepWeekly, keepMonthly, keepYearly int) error {
	args := []string{"forget"}
	if keepDaily > 0 {
		args = append(args, "--keep-daily", fmt.Sprintf("%d", keepDaily))
	}
	if keepWeekly > 0 {
		args = append(args, "--keep-weekly", fmt.Sprintf("%d", keepWeekly))
	}
	if keepMonthly > 0 {
		args = append(args, "--keep-monthly", fmt.Sprintf("%d", keepMonthly))
	}
	if keepYearly > 0 {
		args = append(args, "--keep-yearly", fmt.Sprintf("%d", keepYearly))
	}
	args = append(args, "--prune")

	_, err := r.run(args...)
	if err != nil {
		return fmt.Errorf("restic forget: %w", err)
	}
	return nil
}

// Stats returns repository statistics.
func (r *Wrapper) Stats() (map[string]interface{}, error) {
	output, err := r.run("stats", "--json")
	if err != nil {
		return nil, fmt.Errorf("restic stats: %w", err)
	}

	var stats map[string]interface{}
	if err := json.Unmarshal([]byte(output), &stats); err != nil {
		return nil, fmt.Errorf("parsing stats: %w", err)
	}
	return stats, nil
}

// Check verifies repository integrity.
func (r *Wrapper) Check() error {
	_, err := r.run("check")
	return err
}

// run executes a restic command with the configured repository and password.
func (r *Wrapper) run(args ...string) (string, error) {
	cmdArgs := append([]string{"-r", r.Repository}, args...)

	cmd := exec.Command("restic", cmdArgs...)
	cmd.Env = append(os.Environ(), "RESTIC_PASSWORD="+r.Password)

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()
	if err != nil {
		if stderr.Len() > 0 {
			return "", fmt.Errorf("%s: %s", err, strings.TrimSpace(stderr.String()))
		}
		return "", err
	}
	return stdout.String(), nil
}
