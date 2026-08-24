package discovery

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// Source represents a discovered backup source.
type Source struct {
	Type     string                 `json:"type"`
	Name     string                 `json:"name"`
	Path     string                 `json:"path"`
	Metadata map[string]interface{} `json:"metadata,omitempty"`
}

// Scanner discovers backup sources on the system.
type Scanner struct {
	Hostname string
}

// New creates a new discovery scanner.
func New() *Scanner {
	hostname, _ := os.Hostname()
	return &Scanner{Hostname: hostname}
}

// DiscoverAll runs all discovery methods and returns combined sources.
func (s *Scanner) DiscoverAll() []Source {
	var sources []Source
	sources = append(sources, s.DiscoverDockerVolumes()...)
	sources = append(sources, s.DiscoverDockerContainers()...)
	sources = append(sources, s.DiscoverSQLiteDatabases()...)
	sources = append(sources, s.DiscoverSystemConfigs()...)
	return sources
}

// DiscoverDockerVolumes finds Docker volumes on the system.
func (s *Scanner) DiscoverDockerVolumes() []Source {
	if !s.commandExists("docker") {
		return nil
	}

	out, err := exec.Command("docker", "volume", "ls", "--format", "{{.Name}}").Output()
	if err != nil {
		return nil
	}

	var sources []Source
	for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		if line == "" {
			continue
		}

		// Get the mount point for this volume
		inspect, err := exec.Command("docker", "volume", "inspect", line, "--format", "{{.Mountpoint}}").Output()
		if err != nil {
			continue
		}
		mountPoint := strings.TrimSpace(string(inspect))

		sources = append(sources, Source{
			Type: "docker_volume",
			Name: fmt.Sprintf("Docker Volume: %s", line),
			Path: mountPoint,
			Metadata: map[string]interface{}{
				"volume_name": line,
				"mountpoint":  mountPoint,
			},
		})
	}
	return sources
}

// DiscoverDockerContainers finds running Docker containers.
func (s *Scanner) DiscoverDockerContainers() []Source {
	if !s.commandExists("docker") {
		return nil
	}

	out, err := exec.Command("docker", "ps", "--format", "{{.ID}}|{{.Names}}|{{.Image}}").Output()
	if err != nil {
		return nil
	}

	var sources []Source
	for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		if line == "" {
			continue
		}
		parts := strings.SplitN(line, "|", 3)
		if len(parts) < 3 {
			continue
		}

		sources = append(sources, Source{
			Type: "docker_container",
			Name: fmt.Sprintf("Container: %s (%s)", parts[1], parts[2]),
			Path: parts[0], // Container ID
			Metadata: map[string]interface{}{
				"container_id":   parts[0],
				"container_name": parts[1],
				"image":          parts[2],
			},
		})
	}
	return sources
}

// DiscoverSQLiteDatabases finds SQLite database files on the system.
func (s *Scanner) DiscoverSQLiteDatabases() []Source {
	var sources []Source
	searchPaths := []string{
		"/var/lib",
		"/opt",
		"/srv",
		filepath.Join(os.Getenv("HOME"), ".local/share"),
	}

	for _, searchPath := range searchPaths {
		filepath.Walk(searchPath, func(path string, info os.FileInfo, err error) error {
			if err != nil || info.IsDir() {
				return nil
			}
			if strings.HasSuffix(path, ".db") || strings.HasSuffix(path, ".sqlite") || strings.HasSuffix(path, ".sqlite3") {
				sources = append(sources, Source{
					Type: "sqlite",
					Name: fmt.Sprintf("SQLite: %s", filepath.Base(path)),
					Path: path,
					Metadata: map[string]interface{}{
						"size": info.Size(),
					},
				})
			}
			return nil
		})
	}
	return sources
}

// DiscoverSystemConfigs finds important system configuration files.
func (s *Scanner) DiscoverSystemConfigs() []Source {
	var sources []Source

	// Check for common config directories
	configPaths := []struct {
		path string
		name string
	}{
		{"/etc/crontab", "System crontab"},
		{"/etc/hosts", "Hosts file"},
		{"/etc/resolv.conf", "DNS config"},
		{"/etc/nginx", "Nginx config"},
		{"/etc/docker/daemon.json", "Docker daemon config"},
	}

	for _, cp := range configPaths {
		if _, err := os.Stat(cp.path); err == nil {
			sources = append(sources, Source{
				Type: "path",
				Name: fmt.Sprintf("System Config: %s", cp.name),
				Path: cp.path,
			})
		}
	}

	// Discover user crontabs
	if out, err := exec.Command("crontab", "-l").Output(); err == nil && len(out) > 0 {
		sources = append(sources, Source{
			Type: "path",
			Name: "User Crontab",
			Path: "/var/spool/cron/crontabs/" + s.Hostname,
			Metadata: map[string]interface{}{
				"content": string(out),
			},
		})
	}

	return sources
}

func (s *Scanner) commandExists(name string) bool {
	_, err := exec.LookPath(name)
	return err == nil
}
