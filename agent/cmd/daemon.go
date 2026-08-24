package cmd

import (
	"fmt"
	"log"
	"os"
	"os/exec"
	"os/signal"
	"runtime"
	"strings"
	"syscall"
	"time"

	"github.com/spf13/cobra"
	"github.com/voidsuite/voidbackups-agent/internal/client"
	"github.com/voidsuite/voidbackups-agent/internal/config"
	"github.com/voidsuite/voidbackups-agent/internal/discovery"
	"github.com/voidsuite/voidbackups-agent/internal/executor"
)

var (
	heartbeatInterval = 30 * time.Second
	taskPollInterval  = 10 * time.Second
)

var daemonCmd = &cobra.Command{
	Use:   "daemon",
	Short: "Start the backup agent daemon",
	RunE: func(cmd *cobra.Command, args []string) error {
		configPath, _ := cmd.Flags().GetString("config")

		// Load config
		cfg, err := config.Load(configPath)
		if err != nil {
			return fmt.Errorf("loading config: %w\nRun 'voidbackups-agent register' first", err)
		}
		if !cfg.IsRegistered() {
			return fmt.Errorf("agent not registered\nRun 'voidbackups-agent register' first")
		}

		log.Printf("[daemon] Starting VoidBackups agent v%s", version)
		log.Printf("[daemon] Server: %s", cfg.ServerURL)
		log.Printf("[daemon] Agent: %s (%s)", cfg.AgentName, cfg.AgentID)

		// Create API client
		api := client.New(cfg.ServerURL, cfg.AgentToken)

		// Create executor
		executorSvc := executor.New(api)

		// Create discovery scanner
		scanner := discovery.New()

		// Detect platform info
		platform := runtime.GOOS
		arch := runtime.GOARCH
		var resticVersion string
		if out, err := execCmd("restic", "version"); err == nil {
			resticVersion = strings.Split(strings.TrimSpace(string(out)), "\n")[0]
		}
		var tailscaleIP string
		if out, err := execCmd("tailscale", "ip", "-4"); err == nil {
			tailscaleIP = strings.TrimSpace(string(out))
		}

		// Set up signal handling
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

		// Send initial heartbeat
		go func() {
			for {
				heartbeat(api, platform, arch, resticVersion, tailscaleIP)
				time.Sleep(heartbeatInterval)
			}
		}()

		// Discover sources periodically
		go func() {
			// Initial discovery
			discoverAndReport(api, scanner)
			// Re-discover every 5 minutes
			ticker := time.NewTicker(5 * time.Minute)
			for range ticker.C {
				discoverAndReport(api, scanner)
			}
		}()

		// Poll for tasks
		log.Printf("[daemon] Polling for tasks every %v", taskPollInterval)
		go func() {
			ticker := time.NewTicker(taskPollInterval)
			for range ticker.C {
				pollAndExecute(api, executorSvc)
			}
		}()

		// Wait for signal
		sig := <-sigCh
		log.Printf("[daemon] Received signal %v, shutting down...", sig)
		return nil
	},
}

func heartbeat(api *client.Client, platform, arch, resticVersion, tailscaleIP string) {
	resp, err := api.Heartbeat(client.HeartbeatRequest{
		Platform:      platform,
		Arch:          arch,
		ResticVersion: resticVersion,
		TailscaleIP:   tailscaleIP,
	})
	if err != nil {
		log.Printf("[daemon] Heartbeat failed: %v", err)
		return
	}
	if resp.PendingTasks > 0 {
		log.Printf("[daemon] Heartbeat OK — %d pending task(s)", resp.PendingTasks)
	}
}

func discoverAndReport(api *client.Client, scanner *discovery.Scanner) {
	sources := scanner.DiscoverAll()
	if len(sources) == 0 {
		return
	}
	log.Printf("[discovery] Found %d backup source(s)", len(sources))
	for _, s := range sources {
		log.Printf("[discovery]   - [%s] %s (%s)", s.Type, s.Name, s.Path)
	}
}

func pollAndExecute(api *client.Client, exec *executor.Executor) {
	tasks, err := api.PollTasks()
	if err != nil {
		log.Printf("[daemon] Task poll failed: %v", err)
		return
	}

	for _, task := range tasks.Tasks {
		log.Printf("[daemon] Executing task %s (job: %s)", task.ID, task.JobName)
		go exec.Run(task)
	}
}

// execCmd runs a command and returns its output.
func execCmd(name string, args ...string) (string, error) {
	out, err := exec.Command(name, args...).Output()
	return string(out), err
}

func init() {
	rootCmd.AddCommand(daemonCmd)
	daemonCmd.Flags().String("config", "", "Config file path")
}
