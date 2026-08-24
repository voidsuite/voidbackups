package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

// Config holds the agent configuration.
type Config struct {
	ServerURL  string `json:"server_url"`
	AgentName  string `json:"agent_name"`
	AgentToken string `json:"agent_token,omitempty"`
	AgentID    string `json:"agent_id,omitempty"`
	ConfigPath string `json:"-"`
}

var defaultPaths = []string{
	"/etc/voidbackups/agent.json",
	"/opt/voidbackups/agent.json",
	"agent.json",
}

// Load reads the agent config from file.
func Load(path string) (*Config, error) {
	if path == "" {
		for _, p := range defaultPaths {
			if _, err := os.Stat(p); err == nil {
				path = p
				break
			}
		}
	}
	if path == "" {
		return nil, fmt.Errorf("no config file found")
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("reading config: %w", err)
	}

	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("parsing config: %w", err)
	}
	cfg.ConfigPath = path
	return &cfg, nil
}

// Save writes the config to disk.
func (c *Config) Save() error {
	if c.ConfigPath == "" {
		home, _ := os.UserHomeDir()
		c.ConfigPath = filepath.Join(home, ".voidbackups", "agent.json")
		os.MkdirAll(filepath.Dir(c.ConfigPath), 0700)
	}

	data, err := json.MarshalIndent(c, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(c.ConfigPath, data, 0600)
}

// IsRegistered returns true if the agent has a token and ID.
func (c *Config) IsRegistered() bool {
	return c.AgentToken != "" && c.AgentID != ""
}
