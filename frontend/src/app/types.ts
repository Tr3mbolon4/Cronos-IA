export type SetupStatus = {
  configured: boolean
  owner: { id: number; name: string } | null
}

export type Message = {
  id?: number
  role: 'user' | 'assistant' | 'system' | 'tool' | 'error' | 'warning'
  content: string
  created_at?: string
  status?: 'sending' | 'sent' | 'failed' | 'received' | 'edited' | 'cancelled'
  reply_to_id?: number | string
  edited_at?: string
}

export type DocumentItem = {
  id: number
  filename: string
  created_at: string
}

export type Hardware = {
  system: string
  release: string
  processor: string
  cpu_count: number
  cpu_percent: number
  ram_gb: number
  ram_percent: number
  disk_total_gb: number
  disk_free_gb: number
  disk_percent: number
  recommended_profile: string
  gpu: string
  gpu_percent: number | null
  vram_gb: number | null
  gpu_temperature_c: number | null
}

export type CoreState =
  | 'idle'
  | 'ready'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'processing'
  | 'searching'
  | 'success'
  | 'warning'
  | 'error'
  | 'locked'
  | 'offline'

export type AppRoute =
  | '/dashboard'
  | '/chat'
  | '/memory'
  | '/library'
  | '/projects'
  | '/learning'
  | '/tools'
  | '/system'
  | '/settings'
  | '/security'
  | '/not-found'

export type StartupPhase =
  | 'initializing'
  | 'backend_starting'
  | 'backend_ready'
  | 'loading_identity'
  | 'owner_exists'
  | 'owner_not_registered'
  | 'authentication_required'
  | 'error'
  | 'retrying'

export type StartupError = {
  code: string
  message: string
  detail?: string
  phase: StartupPhase
}

export type RetrievalSummary = {
  mode: string
  provider: string
  loaded: boolean
}

export type RuntimeIdentity = {
  appVersion: string
  gitCommit: string
  runtimeGitCommit?: string
  buildTimestamp: string
  buildId: string
  runtimeBuildId?: string
  protocolVersion?: string
  runtimeProtocolVersion?: string
  sessionId?: string
  backendExecutable: string
  backendPid: number
  parentPid?: string
  resourceDir: string
  dataDir: string
  environment: string
  provider: string
  model: string
  modelPath?: string | null
  providerReady: boolean
  fallbackEnabled: boolean
  runtime?: string | null
  runtimePort?: number | null
}

export type MemorySummary = {
  id: number
  title: string
  status: string
  category_id?: number
  updated_at?: string
}

export type DashboardActivity = {
  id: string
  title: string
  detail: string
  tone: 'info' | 'success' | 'warning' | 'error'
}
