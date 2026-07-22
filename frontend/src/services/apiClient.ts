export function runtimeHeaders(runtimeToken: string) {
  return runtimeToken ? { 'X-Cronos-Runtime-Token': runtimeToken } : {}
}

export function mergeHeaders(base: HeadersInit | undefined, runtimeToken: string): HeadersInit {
  const headers = new Headers(base)
  if (runtimeToken) {
    headers.set('X-Cronos-Runtime-Token', runtimeToken)
  }
  return headers
}

export type ApiErrorPayload = {
  detail?: string
  code?: string
  message?: string
  details?: Record<string, unknown>
  request_id?: string | null
}

export class ApiError extends Error {
  status: number
  code: string
  details: Record<string, unknown>
  requestId: string | null

  constructor(status: number, payload: ApiErrorPayload) {
    super(payload.message || payload.detail || 'Erro inesperado.')
    this.name = 'ApiError'
    this.status = status
    this.code = payload.code || 'CRONOS_ERROR'
    this.details = payload.details || {}
    this.requestId = payload.request_id || null
  }
}

type ApiClientOptions = {
  baseUrl: string
  runtimeToken: string
  authToken?: string
  timeoutMs?: number
}

type RequestOptions = RequestInit & {
  timeoutMs?: number
}

export class ApiClient {
  private baseUrl: string
  private runtimeToken: string
  private authToken: string
  private timeoutMs: number

  constructor({ baseUrl, runtimeToken, authToken = '', timeoutMs = 12000 }: ApiClientOptions) {
    this.baseUrl = baseUrl
    this.runtimeToken = runtimeToken
    this.authToken = authToken
    this.timeoutMs = timeoutMs
  }

  get<T>(path: string, options: RequestOptions = {}) {
    return this.request<T>(path, { ...options, method: 'GET' })
  }

  baseUrlForDisplay() {
    return this.baseUrl
  }

  post<T>(path: string, body?: unknown, options: RequestOptions = {}) {
    const headers = new Headers(options.headers)
    headers.set('Content-Type', 'application/json')
    return this.request<T>(path, {
      ...options,
      method: 'POST',
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  }

  patch<T>(path: string, body?: unknown, options: RequestOptions = {}) {
    const headers = new Headers(options.headers)
    headers.set('Content-Type', 'application/json')
    return this.request<T>(path, {
      ...options,
      method: 'PATCH',
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  }

  delete<T>(path: string, options: RequestOptions = {}) {
    return this.request<T>(path, { ...options, method: 'DELETE' })
  }

  upload<T>(path: string, file: File, fieldName = 'file', options: RequestOptions = {}) {
    const body = new FormData()
    body.append(fieldName, file)
    return this.request<T>(path, { ...options, method: 'POST', body, timeoutMs: options.timeoutMs || 30000 })
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const controller = new AbortController()
    const timeout = options.timeoutMs || this.timeoutMs
    const timer = window.setTimeout(() => controller.abort(), timeout)
    const headers = new Headers(options.headers)
    if (this.runtimeToken) headers.set('X-Cronos-Runtime-Token', this.runtimeToken)
    if (this.authToken) headers.set('Authorization', `Bearer ${this.authToken}`)
    try {
      const response = await fetch(`${this.baseUrl}${path}`, { ...options, headers, signal: options.signal || controller.signal })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({ detail: 'Erro inesperado.' }))
        throw new ApiError(response.status, payload)
      }
      if (response.status === 204) return undefined as T
      return response.json()
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new ApiError(408, { code: 'CRONOS_TIMEOUT', detail: `Timeout apos ${timeout} ms.` })
      }
      throw error
    } finally {
      window.clearTimeout(timer)
    }
  }
}

export function readableApiError(error: unknown) {
  if (error instanceof ApiError) return error.message
  if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
    return 'Nao foi possivel comunicar com o backend. Verifique se o nucleo local esta iniciado e tente novamente.'
  }
  if (error instanceof Error) return error.message
  return 'Erro inesperado.'
}
