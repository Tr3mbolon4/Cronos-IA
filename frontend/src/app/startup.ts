import type { SetupStatus, StartupPhase } from './types'
import { ApiError, mergeHeaders } from '../services/apiClient'

const LOGIN_INVALID_MESSAGE = 'Senha ou PIN invalido. Verifique os dados e tente novamente.'
const LOGIN_BACKEND_UNAVAILABLE_MESSAGE = 'Nao foi possivel acessar o nucleo do CRONOS. Tente novamente.'
const LOGIN_UNKNOWN_MESSAGE = 'Nao foi possivel concluir o login.'

export function loginFailureMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 401) return LOGIN_INVALID_MESSAGE
    if (error.status === 408 || error.code === 'CRONOS_TIMEOUT') return LOGIN_BACKEND_UNAVAILABLE_MESSAGE
    return LOGIN_UNKNOWN_MESSAGE
  }
  if (error instanceof TypeError) return LOGIN_BACKEND_UNAVAILABLE_MESSAGE
  return LOGIN_UNKNOWN_MESSAGE
}

export function authHeaders(token: string) {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
}

export async function loadSetupStatus(baseUrl: string, runtimeToken: string): Promise<SetupStatus> {
  const response = await fetchWithTimeout(`${baseUrl}/setup/status`, {
    headers: mergeHeaders(undefined, runtimeToken),
  }, 15000)
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ detail: 'Falha ao carregar identidade.' }))
    throw new Error(payload.detail || 'Falha ao carregar identidade.')
  }
  return response.json()
}

export function startupMessage(phase: StartupPhase) {
  return {
    initializing: 'Iniciando nucleo local...',
    backend_starting: 'Iniciando nucleo local...',
    backend_ready: 'Nucleo local pronto...',
    loading_identity: 'Carregando identidade...',
    owner_exists: 'Identidade carregada...',
    owner_not_registered: 'Preparando primeiro cadastro...',
    authentication_required: 'Aguardando autorizacao...',
    error: 'Falha na inicializacao.',
    retrying: 'Tentando reiniciar o nucleo local...',
  }[phase]
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = 12000) {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`Timeout apos ${timeoutMs} ms.`)
    }
    throw error
  } finally {
    window.clearTimeout(timer)
  }
}
