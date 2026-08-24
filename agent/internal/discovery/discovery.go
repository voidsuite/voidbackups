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
// Void apps are discovered first with high priority so their data
// is always captured even if generic scanners miss it.
func (s *Scanner) DiscoverAll() []Source {
	var sources []Source
	sources = append(sources, s.DiscoverVoidApps()...)
	sources = append(sources, s.DiscoverDockerVolumes()...)
	sources = append(sources, s.DiscoverDockerContainers()...)
	sources = append(sources, s.DiscoverSQLiteDatabases()...)
	sources = append(sources, s.DiscoverSystemConfigs()...)
	return sources
}

// --- Void App Auto-Discovery ---

// voidAppPattern defines how to identify a Void suite app by container name or image.
type voidAppPattern struct {
	Names   []string // Container name substrings (case-insensitive)
	Images  []string // Image substrings (case-insensitive)
	AppName string   // Human-readable name
}

var voidApps = []voidAppPattern{
	{Names: []string{"voidauth", "void-auth"}, Images: []string{"voidsuite/auth", "void-auth"}, AppName: "VoidAuth"},
	{Names: []string{"m3il", "voidmail", "void-mail"}, Images: []string{"voidsuite/mail", "void-mail"}, AppName: "VoidMail"},
	{Names: []string{"vdocs", "voiddocs", "void-docs"}, Images: []string{"voidsuite/docs", "void-docs"}, AppName: "VoidDocs"},
	{Names: []string{"voidboard", "void-board"}, Images: []string{"voidsuite/board", "void-board"}, AppName: "VoidBoard"},
	{Names: []string{"voidsheets", "void-sheets"}, Images: []string{"voidsuite/sheets", "void-sheets"}, AppName: "VoidSheets"},
	{Names: []string{"voidbackups"}, Images: []string{"voidsuite/voidbackups"}, AppName: "VoidBackups"},
	{Names: []string{"voiddraw", "void-draw"}, Images: []string{"voidsuite/draw", "void-draw"}, AppName: "VoidDraw"},
	{Names: []string{"authiov", "voidauthiov"}, Images: []string{"voidsuite/authiov"}, AppName: "VoidAuthIO"},
}

// DiscoverVoidApps detects running Void suite containers and extracts their
// backup-relevant data (volumes, databases, config paths).
func (s *Scanner) DiscoverVoidApps() []Source {
	if !s.commandExists("docker") {
		return nil
	}

	// List all containers: ID|Names|Image|Mounts
	out, err := exec.Command("docker", "ps", "-a", "--format", "{{.ID}}|{{.Names}}|{{.Image}}").Output()
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
		containerID, containerName, image := parts[0], parts[1], parts[2]

		// Match against known Void apps
		for _, pattern := range voidApps {
			if matchVoidApp(containerName, image, pattern) {
				appSources := s.discoverVoidAppData(containerID, containerName, image, pattern.AppName)
				sources = append(sources, appSources...)
				break
			}
		}
	}
	return sources
}

// matchVoidApp checks if a container matches a Void app pattern.
func matchVoidApp(name, image string, p voidAppPattern) bool {
	nameLower := strings.ToLower(name)
	imageLower := strings.ToLower(image)
	for _, n := range p.Names {
		if strings.Contains(nameLower, n) {
			return true
		}
	}
	for _, img := range p.Images {
		if strings.Contains(imageLower, img) {
			return true
		}
	}
	return false
}

// discoverVoidAppData inspects a Void app container and returns its backup sources.
func (s *Scanner) discoverVoidAppData(containerID, containerName, image, appName string) []Source {
	var sources []Source

	// Get container mount points via docker inspect
	inspect, err := exec.Command("docker", "inspect", containerID,
		"--format", `{{range .Mounts}}{{.Type}}|{{.Source}}|{{.Destination}}|{{.Name}}{{"\n"}}{{end}}`).Output()
	if err == nil {
		for _, line := range strings.Split(strings.TrimSpace(string(inspect)), "\n") {
			if line == "" {
				continue
			}
			mountParts := strings.SplitN(line, "|", 4)
			if len(mountParts) < 3 {
				continue
			}
			mountType, source, dest := mountParts[0], mountParts[1], mountParts[2]
			volumeName := ""
			if len(mountParts) > 3 {
				volumeName = mountParts[3]
			}

			// Skip tmpfs and proc mounts
			if mountType == "tmpfs" || mountType == "proc" || mountType == "sysfs" {
				continue
			}

			// Detect what kind of data this mount holds
			sourceType := "path"
			sourceName := fmt.Sprintf("%s Data: %s", appName, filepath.Base(source))

			if strings.HasSuffix(source, ".db") || strings.HasSuffix(source, ".sqlite") || strings.HasSuffix(source, ".sqlite3") {
				sourceType = "sqlite"
				sourceName = fmt.Sprintf("%s Database: %s", appName, filepath.Base(source))
			} else if mountType == "volume" && volumeName != "" {
				sourceType = "docker_volume"
				sourceName = fmt.Sprintf("%s Volume: %s", appName, volumeName)
			}

			meta := map[string]interface{}{
				"app":              appName,
				"container_id":     containerID,
				"container_name":   containerName,
				"image":            image,
				"mount_type":       mountType,
				"mount_destination": dest,
			}
			if volumeName != "" {
				meta["volume_name"] = volumeName
			}

			sources = append(sources, Source{
				Type:     sourceType,
				Name:     sourceName,
				Path:     source,
				Metadata: meta,
			})
		}
	}

	// If no mounts found, fall back to known data paths
	if len(sources) == 0 {
		sources = append(sources, Source{
			Type: "docker_container",
			Name: fmt.Sprintf("%s Container: %s", appName, containerName),
			Path: containerID,
			Metadata: map[string]interface{}{
				"app":            appName,
				"container_id":   containerID,
				"container_name": containerName,
				"image":          image,
			},
		})
	}

	return sources
}

// matchVoidAppByName is a simpler check for the old generic container scanner
// to tag containers that are Void apps.
func matchVoidAppByName(name string) string {
	nameLower := strings.ToLower(name)
	for _, pattern := range voidApps {
		for _, n := range pattern.Names {
			if strings.Contains(nameLower, n) {
				return pattern.AppName
			}
		}
	}
	return ""
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
