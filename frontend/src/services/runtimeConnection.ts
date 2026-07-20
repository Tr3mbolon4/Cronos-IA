import { invoke } from '@tauri-apps/api/core'

export type RuntimeConnection = {
  base_url: string
  state: string
  version: string
  session_id: string
  runtime_token: string
}

const fallbackConnection: RuntimeConnection = {
  base_url: import.meta.env.VITE_CRONOS_API_URL || 'http://127.0.0.1:8000',
  state: 'web',
  version: '0.1.0',
  session_id: '',
  runtime_token: '',
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
