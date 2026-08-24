package cmd

import (
	"bufio"
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"strings"

	"github.com/spf13/cobra"
	"github.com/voidsuite/voidbackups-agent/internal/client"
	"github.com/voidsuite/voidbackups-agent/internal/config"
)

var registerCmd = &cobra.Command{
	Use:   "register",
	Short: "Register this agent with the VoidBackups server",
	RunE: func(cmd *cobra.Command, args []string) error {
		serverURL, _ := cmd.Flags().GetString("server")
		setupToken, _ := cmd.Flags().GetString("token")
		name, _ := cmd.Flags().GetString("name")
		configPath, _ := cmd.Flags().GetString("config")

		// Interactive prompts if not provided
		reader := bufio.NewReader(os.Stdin)

		if serverURL == "" {
			fmt.Print("Server URL (e.g., https://backups.void.ts.net:3010): ")
			serverURL, _ = reader.ReadString('\n')
			serverURL = strings.TrimSpace(serverURL)
		}
		if serverURL == "" {
			return fmt.Errorf("server URL is required")
		}

		if setupToken == "" {
			fmt.Print("Setup token: ")
			setupToken, _ = reader.ReadString('\n')
			setupToken = strings.TrimSpace(setupToken)
		}
		if setupToken == "" {
			return fmt.Errorf("setup token is required")
		}

		hostname, _ := os.Hostname()
		if name == "" {
			fmt.Printf("Agent name [%s]: ", hostname)
			name, _ = reader.ReadString('\n')
			name = strings.TrimSpace(name)
		}
		if name == "" {
			name = hostname
		}

		// Detect platform info
		platform := runtime.GOOS
		arch := runtime.GOARCH

		// Get restic version
		var resticVersion string
		if out, err := exec.Command("restic", "version").Output(); err == nil {
			resticVersion = strings.Split(strings.TrimSpace(string(out)), "\n")[0]
		}

		// Get Tailscale IP if available
		var tailscaleIP string
		if out, err := exec.Command("tailscale", "ip", "-4").Output(); err == nil {
			tailscaleIP = strings.TrimSpace(string(out))
		}

		fmt.Println()
		fmt.Println("Registering with server...")
		fmt.Printf("  Server:   %s\n", serverURL)
		fmt.Printf("  Name:     %s\n", name)
		fmt.Printf("  Platform: %s/%s\n", platform, arch)
		if tailscaleIP != "" {
			fmt.Printf("  Tailscale: %s\n", tailscaleIP)
		}
		fmt.Println()

		// Register with server
		api := client.New(serverURL, "")
		resp, err := api.Register(client.RegisterRequest{
			Name:          name,
			Hostname:      hostname,
			TailscaleIP:   tailscaleIP,
			Platform:      platform,
			Arch:          arch,
			ResticVersion: resticVersion,
			SetupToken:    setupToken,
		})
		if err != nil {
			return fmt.Errorf("registration failed: %w", err)
		}

		// Save config
		cfg := &config.Config{
			ServerURL:  serverURL,
			AgentName:  name,
			AgentToken: resp.Token,
			AgentID:    resp.Agent.ID,
			ConfigPath: configPath,
		}
		if err := cfg.Save(); err != nil {
			return fmt.Errorf("saving config: %w", err)
		}

		fmt.Println("✓ Registration successful!")
		fmt.Printf("  Agent ID:   %s\n", resp.Agent.ID)
		fmt.Printf("  Agent Name: %s\n", resp.Agent.Name)
		fmt.Printf("  Config:     %s\n", cfg.ConfigPath)
		fmt.Println()
		fmt.Println("Run 'voidbackups-agent daemon' to start the agent.")
		return nil
	},
}

func init() {
	rootCmd.AddCommand(registerCmd)
	registerCmd.Flags().StringP("server", "s", "", "Server URL")
	registerCmd.Flags().StringP("token", "t", "", "Setup token")
	registerCmd.Flags().StringP("name", "n", "", "Agent name")
	registerCmd.Flags().String("config", "", "Config file path")
}
