import { invoke } from '@tauri-apps/api/core'

export type RuntimeConnection = {
  base_url: string
  state: string
  version: string
  session_id: string
  backend_pid?: number | null
  runtime_token: string
  build_id: string
  git_commit: string
  protocol_version: string
}

const fallbackConnection: RuntimeConnection = {
  base_url: import.meta.env.VITE_CRONOS_API_URL || 'http://127.0.0.1:8000',
  state: 'web',
  version: '0.3.0',
  session_id: '',
  backend_pid: null,
  runtime_token: '',
  build_id: 'web-development',
  git_commit: 'web-development',
  protocol_version: '1',
}

export function isTauriRuntime() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export async function resolveRuntimeConnection(): Promise<RuntimeConnection> {
  if (!isTauriRuntime()) {
    return fallbackConnection
  }
  return invoke<RuntimeConnection>('get_runtime_connection')
}

export async function restartRuntimeConnection(): Promise<RuntimeConnection> {
  if (!isTauriRuntime()) {
    return fallbackConnection
  }
  return invoke<RuntimeConnection>('restart_backend')
}

export async function openRuntimeLogs(): Promise<void> {
  if (!isTauriRuntime()) return
  await invoke('open_logs_directory')
}

export async function shutdownCronos(): Promise<void> {
  if (!isTauriRuntime()) return
  await invoke('shutdown_cronos')
}
