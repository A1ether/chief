export const MANAGER_IDS = ['brew', 'uv', 'mise', 'npm', 'pnpm', 'bun', 'gem'] as const

export type ManagerId = (typeof MANAGER_IDS)[number]

export type PackageKind = 'formula' | 'cask' | 'tool' | 'runtime' | 'npm-global' | 'gem'

export interface ManagerCapabilities {
  list: boolean
  outdated: boolean
  update: boolean
  updateAll: boolean
  uninstall: boolean
}

export interface ManagerProbe {
  detected: boolean
  version?: string
  executablePath?: string
  error?: string
}

export interface ManagerInfo extends ManagerProbe {
  id: ManagerId
  name: string
  description: string
  installHint: string
  capabilities: ManagerCapabilities
}

export interface PackageItem {
  /** Stable across scans: `${manager}:${key}` */
  id: string
  manager: ManagerId
  /** Human-facing name */
  name: string
  version: string
  latest?: string
  kind: PackageKind
  outdated: boolean
  pinned?: boolean
  description?: string
  homepage?: string
  installPath?: string
  /** Exact argument passed to the manager CLI */
  target: string
  meta?: Record<string, string>
}

export interface ManagerSnapshot {
  manager: ManagerInfo
  packages: PackageItem[]
  error?: string
  scannedAt: string
}

export interface ScanResult {
  managers: ManagerSnapshot[]
  scannedAt: string
  durationMs: number
}

export type TaskType = 'update' | 'uninstall' | 'update-all'

export interface TaskRequest {
  type: TaskType
  manager: ManagerId
  packageId?: string
}

export type TaskStream = 'stdout' | 'stderr' | 'system'

export interface TaskEvent {
  taskId: string
  type: TaskType
  manager: ManagerId
  stream: TaskStream
  text: string
  at: number
}

export interface TaskResult {
  taskId: string
  ok: boolean
  exitCode: number | null
  message: string
}

export interface ChiefApi {
  scan(): Promise<ScanResult>
  task(request: TaskRequest): Promise<TaskResult>
  onTaskEvent(listener: (event: TaskEvent) => void): () => void
  openExternal(url: string): Promise<void>
}