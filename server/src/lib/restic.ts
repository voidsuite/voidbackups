/**
 * Restic command wrapper — server-side operations.
 * Used for restore operations and repository management.
 */

import { $ } from "bun"

export interface ResticSnapshot {
  id: string
  short_id: string
  time: string
  tree: string
  paths: string[]
  hostname: string
  tags: string[]
}

export interface ResticStats {
  total_size: number
  total_file_count: number
  snapshots_count: number
}

export interface ResticFileNode {
  name: string
  path: string
  type: string
  mode: string
  size: number
  time: string
}

/**
 * Run a restic command with the given repository and password.
 */
async function runRestic(repo: string, password: string, args: string[]): Promise<string> {
  try {
    const result = await $`restic -r ${repo} ${args}`.env({
      ...process.env,
      RESTIC_PASSWORD: password,
    }).text()
    return result
  } catch (err: any) {
    throw new Error(`restic error: ${err.stderr || err.message}`)
  }
}

/**
 * Initialize a restic repository.
 */
export async function initRepo(repo: string, password: string): Promise<void> {
  try {
    await runRestic(repo, password, ["init", "--repo-version", "2"])
  } catch (err: any) {
    if (!err.message?.includes("already initialized")) {
      throw err
    }
  }
}

/**
 * List all snapshots in a repository.
 */
export async function listSnapshots(repo: string, password: string): Promise<ResticSnapshot[]> {
  const output = await runRestic(repo, password, ["snapshots", "--json"])
  return JSON.parse(output)
}

/**
 * List files in a snapshot.
 */
export async function listFiles(
  repo: string,
  password: string,
  snapshotId: string,
  path: string = "/"
): Promise<ResticFileNode[]> {
  const output = await runRestic(repo, password, ["ls", snapshotId, path, "--json"])
  const nodes: ResticFileNode[] = []
  for (const line of output.split("\n")) {
    try {
      const msg = JSON.parse(line)
      if (msg.message_type === "node") {
        nodes.push({
          name: msg.name,
          path: msg.path,
          type: msg.node_type,
          mode: msg.mode || "",
          size: msg.size || 0,
          time: msg.time || "",
        })
      }
    } catch {}
  }
  return nodes
}

/**
 * Restore files from a snapshot.
 */
export async function restore(
  repo: string,
  password: string,
  snapshotId: string,
  target: string,
  includePath?: string
): Promise<void> {
  const args = ["restore", snapshotId, "--target", target]
  if (includePath) {
    args.push("--include", includePath)
  }
  await runRestic(repo, password, args)
}

/**
 * Get repository statistics.
 */
export async function getStats(repo: string, password: string): Promise<ResticStats> {
  const output = await runRestic(repo, password, ["stats", "--json"])
  return JSON.parse(output)
}

/**
 * Forget (prune) snapshots according to retention policy.
 */
export async function forget(
  repo: string,
  password: string,
  keepDaily: number = 7,
  keepWeekly: number = 4,
  keepMonthly: number = 6,
  keepYearly: number = 2
): Promise<void> {
  await runRestic(repo, password, [
    "forget",
    "--keep-daily", String(keepDaily),
    "--keep-weekly", String(keepWeekly),
    "--keep-monthly", String(keepMonthly),
    "--keep-yearly", String(keepYearly),
    "--prune",
  ])
}

/**
 * Check repository integrity.
 */
export async function check(repo: string, password: string): Promise<void> {
  await runRestic(repo, password, ["check"])
}

/**
 * Get the repository path for a job.
 */
export function getRepoPath(dataDir: string, jobId: string): string {
  return `${dataDir}/repos/${jobId}`
}
