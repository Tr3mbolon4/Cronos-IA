import type { RuntimeIdentity, SetupStatus, StartupPhase } from './types'
import { ApiError, mergeHeaders } from '../services/apiClient'
import type { RuntimeConnection } from '../services/runtimeConnection'

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

export async function loadRuntimeIdentity(baseUrl: string, runtimeToken: string): Promise<RuntimeIdentity> {
  const response = await fetchWithTimeout(`${baseUrl}/runtime/identity`, {
    headers: mergeHeaders(undefined, runtimeToken),
  }, 15000)
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ detail: 'Falha ao validar identidade do backend.' }))
    throw new Error(payload.detail || 'Falha ao validar identidade do backend.')
  }
  return response.json()
}

export function assertRuntimeIdentityMatches(connection: RuntimeConnection, identity: RuntimeIdentity) {
  if (connection.state === 'web') return
  const mismatches = [
    normalizeVersion(identity.appVersion) === normalizeVersion(connection.version) ? '' : 'appVersion',
    identity.buildId === connection.build_id ? '' : 'buildId',
    identity.runtimeBuildId === connection.build_id ? '' : 'runtimeBuildId',
    identity.gitCommit === connection.git_commit ? '' : 'gitCommit',
    identity.runtimeGitCommit === connection.git_commit ? '' : 'runtimeGitCommit',
    identity.protocolVersion === connection.protocol_version ? '' : 'protocolVersion',
    identity.runtimeProtocolVersion === connection.protocol_version ? '' : 'runtimeProtocolVersion',
    identity.backendPid === connection.backend_pid ? '' : 'backendPid',
  ].filter(Boolean)
  if (mismatches.length > 0) {
    throw new Error(`Backend local incompativel. Reinstale ou atualize o CRONOS. Divergencias: ${mismatches.join(', ')}.`)
  }
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

function normalizeVersion(version: string) {
  return version.trim().replace(/^v/i, '')
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
