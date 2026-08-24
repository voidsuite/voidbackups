/**
 * VoidBackups API client.
 * All API calls go through this module with credentials included.
 */

export const gatewayBase = (import.meta as any).env?.VITE_API_URL || ""

export class ApiError extends Error {
  status: number
  constructor(message: string, status = 500) {
    super(message)
    this.status = status
  }
}

async function readError(res: Response): Promise<string> {
  try {
    const data = await res.json()
    return data?.error || `Request failed (${res.status})`
  } catch {
    return `Request failed (${res.status})`
  }
}

async function gateway<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${gatewayBase}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    },
  })
  if (!res.ok) {
    throw new ApiError(await readError(res), res.status)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

// --- Auth ---

export async function getAuthStatus(): Promise<{ isSetup: boolean }> {
  return gateway("/api/auth/status")
}

export async function getMe(): Promise<{ user: { id: string; name: string } } | null> {
  try {
    return await gateway("/api/auth/me")
  } catch {
    return null
  }
}

export async function startRegistration(name: string): Promise<PublicKeyCredentialCreationOptionsJSON> {
  return gateway("/api/auth/register/start", {
    method: "POST",
    body: JSON.stringify({ name }),
  })
}

export async function completeRegistration(
  response: Record<string, unknown>,
  challenge: string,
  name: string
): Promise<{ user: { id: string; name: string } }> {
  return gateway("/api/auth/register/complete", {
    method: "POST",
    body: JSON.stringify({ response, challenge, name }),
  })
}

export async function startLogin(): Promise<PublicKeyCredentialRequestOptionsJSON> {
  return gateway("/api/auth/login/start", {
    method: "POST",
  })
}

export async function completeLogin(
  response: Record<string, unknown>,
  challenge: string
): Promise<{ user: { id: string; name: string } }> {
  return gateway("/api/auth/login/complete", {
    method: "POST",
    body: JSON.stringify({ response, challenge }),
  })
}

export async function logout(): Promise<void> {
  await gateway("/api/auth/logout", { method: "POST" })
}

// --- Agents ---

export interface Agent {
  id: string
  name: string
  hostname: string
  tailscale_ip: string | null
  status: string
  platform: string | null
  arch: string | null
  restic_version: string | null
  last_seen: number | null
  registered_at: number
}

export function listAgents(): Promise<Agent[]> {
  return gateway("/api/agents")
}

export function deleteAgent(id: string): Promise<void> {
  return gateway(`/api/agents/${id}`, { method: "DELETE" })
}

export function getAgentInstallScript(id: string): Promise<{ script: string; setupToken: string }> {
  return gateway(`/api/agents/${id}/install-script`)
}

// --- Sources ---

export interface Source {
  id: string
  agent_id: string
  type: string
  name: string
  path: string
  metadata: Record<string, unknown>
  discovered: number
  enabled: number
  created_at: number
}

export interface AgentSources {
  agent: { id: string; name: string }
  sources: Source[]
}

export function listSources(): Promise<AgentSources[]> {
  return gateway("/api/sources")
}

// --- Jobs ---

export interface Job {
  id: string
  name: string
  agent_id: string
  agent_name?: string
  schedule: Record<string, unknown>
  sources: string[]
  retention: Record<string, unknown>
  storage: Record<string, unknown>
  encryption: Record<string, unknown>
  conditions: unknown[]
  enabled: number
  last_run: number | null
  next_run: number | null
  created_at: number
  updated_at: number
}

export function listJobs(): Promise<Job[]> {
  return gateway("/api/jobs")
}

export function getJob(id: string): Promise<Job & { sources_detail: Source[]; recent_runs: Run[] }> {
  return gateway(`/api/jobs/${id}`)
}

export function createJob(data: Record<string, unknown>): Promise<{ id: string }> {
  return gateway("/api/jobs", {
    method: "POST",
    body: JSON.stringify(data),
  })
}

export function updateJob(id: string, patch: Partial<Job>): Promise<void> {
  return gateway(`/api/jobs/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  })
}

export function deleteJob(id: string): Promise<void> {
  return gateway(`/api/jobs/${id}`, { method: "DELETE" })
}

export function triggerJob(id: string): Promise<{ runId: string }> {
  return gateway(`/api/jobs/${id}/run`, { method: "POST" })
}

// --- Runs ---

export interface Run {
  id: string
  job_id: string
  job_name?: string
  agent_id: string
  agent_name?: string
  status: string
  started_at: number | null
  finished_at: number | null
  duration_ms: number | null
  bytes_new: number
  bytes_total: number
  files_new: number
  files_changed: number
  files_total: number
  error: string | null
  snapshot_id: string | null
  triggered_by: string
  created_at: number
}

export function listRuns(params?: {
  page?: number
  limit?: number
  status?: string
  jobId?: string
  agentId?: string
}): Promise<{ runs: Run[]; pagination: { page: number; limit: number; total: number; pages: number } }> {
  const query = new URLSearchParams()
  if (params?.page) query.set("page", String(params.page))
  if (params?.limit) query.set("limit", String(params.limit))
  if (params?.status) query.set("status", params.status)
  if (params?.jobId) query.set("jobId", params.jobId)
  if (params?.agentId) query.set("agentId", params.agentId)
  const qs = query.toString()
  return gateway(`/api/runs${qs ? `?${qs}` : ""}`)
}

export function getRunLogs(id: string): Promise<{ logs: string }> {
  return gateway(`/api/runs/${id}/logs`)
}

export function getRunStats(): Promise<{
  totalRuns: number
  successfulRuns: number
  failedRuns: number
  successRate: number
  totalBytesBackedUp: number
  runsLast24h: number
  avgDurationMs: number
}> {
  return gateway("/api/runs/stats/overview")
}

// --- Wizard ---

export function configureStorage(data: Record<string, unknown>): Promise<void> {
  return gateway("/api/wizard/storage", {
    method: "POST",
    body: JSON.stringify(data),
  })
}

export function generateEncryptionKey(): Promise<{ keyId: string; password: string }> {
  return gateway("/api/wizard/encryption", { method: "POST" })
}

export function completeWizard(): Promise<void> {
  return gateway("/api/wizard/complete", { method: "POST" })
}

// --- Notifications ---

export interface NotificationChannel {
  id: string
  type: string
  name: string
  config: Record<string, unknown>
  events: string[]
  enabled: number
  created_at: number
}

export function listNotifications(): Promise<NotificationChannel[]> {
  return gateway("/api/notifications")
}

export function createNotification(data: Record<string, unknown>): Promise<{ id: string }> {
  return gateway("/api/notifications", {
    method: "POST",
    body: JSON.stringify(data),
  })
}

export function deleteNotification(id: string): Promise<void> {
  return gateway(`/api/notifications/${id}`, { method: "DELETE" })
}

export function testNotification(id: string): Promise<{ ok: boolean; error?: string }> {
  return gateway(`/api/notifications/${id}/test`, { method: "POST" })
}
