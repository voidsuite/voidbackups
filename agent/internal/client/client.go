package client

import (
	"bytes"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// Client communicates with the VoidBackups server API.
type Client struct {
	ServerURL  string
	AgentToken string
	HTTP       *http.Client
}

// New creates a new API client.
func New(serverURL, agentToken string) *Client {
	return &Client{
		ServerURL:  serverURL,
		AgentToken: agentToken,
		HTTP: &http.Client{
			Timeout: 30 * time.Second,
			Transport: &http.Transport{
				TLSClientConfig: &tls.Config{
					// Tailscale handles TLS, but we allow self-signed for local dev
					InsecureSkipVerify: false,
				},
			},
		},
	}
}

// RegisterRequest is sent to register a new agent.
type RegisterRequest struct {
	Name         string `json:"name"`
	Hostname     string `json:"hostname"`
	TailscaleIP  string `json:"tailscaleIp,omitempty"`
	Platform     string `json:"platform"`
	Arch         string `json:"arch"`
	ResticVersion string `json:"resticVersion,omitempty"`
	SetupToken   string `json:"setupToken"`
}

// RegisterResponse is returned after successful registration.
type RegisterResponse struct {
	Agent struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	} `json:"agent"`
	Token string `json:"token"`
}

// Register registers this agent with the server.
func (c *Client) Register(req RegisterRequest) (*RegisterResponse, error) {
	var resp RegisterResponse
	if err := c.post("/api/agents/register", req, &resp); err != nil {
		return nil, err
	}
	return &resp, nil
}

// HeartbeatRequest is sent during heartbeat.
type HeartbeatRequest struct {
	Platform      string `json:"platform,omitempty"`
	Arch          string `json:"arch,omitempty"`
	ResticVersion string `json:"resticVersion,omitempty"`
	TailscaleIP   string `json:"tailscaleIp,omitempty"`
}

// HeartbeatResponse is returned after heartbeat.
type HeartbeatResponse struct {
	OK           bool  `json:"ok"`
	PendingTasks int   `json:"pendingTasks"`
	ServerTime   int64 `json:"serverTime"`
}

// Heartbeat sends a heartbeat to the server.
func (c *Client) Heartbeat(req HeartbeatRequest) (*HeartbeatResponse, error) {
	var resp HeartbeatResponse
	if err := c.post("/api/agents/heartbeat", req, &resp); err != nil {
		return nil, err
	}
	return &resp, nil
}

// Task represents a pending backup task.
type Task struct {
	ID              string          `json:"id"`
	JobID           string          `json:"job_id"`
	JobName         string          `json:"job_name"`
	Status          string          `json:"status"`
	TriggeredBy     string          `json:"triggered_by"`
	SourcesDetail   []Source        `json:"sources_detail"`
	StorageConfig   json.RawMessage `json:"storage_config"`
	EncryptionConfig json.RawMessage `json:"encryption_config"`
	Sources         json.RawMessage `json:"sources"`
}

// Source represents a backup source.
type Source struct {
	ID       string          `json:"id"`
	Type     string          `json:"type"`
	Name     string          `json:"name"`
	Path     string          `json:"path"`
	Metadata json.RawMessage `json:"metadata"`
}

// TasksResponse is returned when polling for tasks.
type TasksResponse struct {
	Tasks []Task `json:"tasks"`
}

// PollTasks checks for pending backup tasks.
func (c *Client) PollTasks() (*TasksResponse, error) {
	var resp TasksResponse
	if err := c.get("/api/agents/tasks", &resp); err != nil {
		return nil, err
	}
	return &resp, nil
}

// StartTask marks a task as running.
func (c *Client) StartTask(taskID string) error {
	return c.post(fmt.Sprintf("/api/agents/tasks/%s/start", taskID), map[string]string{}, nil)
}

// ProgressUpdate is sent during task execution.
type ProgressUpdate struct {
	Log string `json:"log,omitempty"`
}

// ReportProgress sends progress updates for a task.
func (c *Client) ReportProgress(taskID string, log string) error {
	return c.post(fmt.Sprintf("/api/agents/tasks/%s/progress", taskID), ProgressUpdate{Log: log}, nil)
}

// TaskResult is sent when a task completes.
type TaskResult struct {
	Status      string `json:"status"`
	BytesNew    int64  `json:"bytesNew,omitempty"`
	BytesTotal  int64  `json:"bytesTotal,omitempty"`
	FilesNew    int    `json:"filesNew,omitempty"`
	FilesChanged int  `json:"filesChanged,omitempty"`
	FilesTotal  int    `json:"filesTotal,omitempty"`
	Error       string `json:"error,omitempty"`
	SnapshotID  string `json:"snapshotId,omitempty"`
	Logs        string `json:"logs,omitempty"`
}

// ReportResult sends the final result of a task.
func (c *Client) ReportResult(taskID string, result TaskResult) error {
	return c.post(fmt.Sprintf("/api/agents/tasks/%s/result", taskID), result, nil)
}

// --- HTTP helpers ---

func (c *Client) post(path string, body interface{}, result interface{}) error {
	var reqBody io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return fmt.Errorf("marshaling request: %w", err)
		}
		reqBody = bytes.NewReader(data)
	}

	req, err := http.NewRequest("POST", c.ServerURL+path, reqBody)
	if err != nil {
		return fmt.Errorf("creating request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if c.AgentToken != "" {
		req.Header.Set("Authorization", "Bearer "+c.AgentToken)
	}

	return c.do(req, result)
}

func (c *Client) get(path string, result interface{}) error {
	req, err := http.NewRequest("GET", c.ServerURL+path, nil)
	if err != nil {
		return fmt.Errorf("creating request: %w", err)
	}
	if c.AgentToken != "" {
		req.Header.Set("Authorization", "Bearer "+c.AgentToken)
	}

	return c.do(req, result)
}

func (c *Client) do(req *http.Request, result interface{}) error {
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("reading response: %w", err)
	}

	if resp.StatusCode >= 400 {
		var errResp struct {
			Error string `json:"error"`
		}
		if json.Unmarshal(respBody, &errResp) == nil && errResp.Error != "" {
			return fmt.Errorf("server error (%d): %s", resp.StatusCode, errResp.Error)
		}
		return fmt.Errorf("server error (%d): %s", resp.StatusCode, string(respBody))
	}

	if result != nil && len(respBody) > 0 {
		if err := json.Unmarshal(respBody, result); err != nil {
			return fmt.Errorf("parsing response: %w", err)
		}
	}
	return nil
}
