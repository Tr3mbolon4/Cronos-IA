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
    const method = String(options.method || 'GET')
    const url = `${this.baseUrl}${path}`
    const startedAt = performance.now()
    const payload = summarizeRequestBody(options.body)
    try {
      const response = await fetch(url, { ...options, headers, signal: options.signal || controller.signal })
      const responseText = response.status === 204 ? '' : await response.text()
      const responsePayload = parseResponseText(responseText)
      logHttpCall({ url: path, method, status: response.status, elapsedMs: performance.now() - startedAt, payload, response: responsePayload })
      if (!response.ok) {
        throw new ApiError(response.status, (responsePayload || { detail: 'Erro inesperado.' }) as ApiErrorPayload)
      }
      if (response.status === 204) return undefined as T
      return responsePayload as T
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        logHttpCall({ url: path, method, status: 408, elapsedMs: performance.now() - startedAt, payload, error: `Timeout apos ${timeout} ms.` })
        throw new ApiError(408, { code: 'CRONOS_TIMEOUT', detail: `Timeout apos ${timeout} ms.` })
      }
      if (error instanceof ApiError) throw error
      logHttpCall({ url: path, method, elapsedMs: performance.now() - startedAt, payload, error: error instanceof Error ? error.message : String(error) })
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

function parseResponseText(text: string): unknown {
  if (!text.trim()) return undefined
  try {
    return JSON.parse(text)
  } catch {
    return text.slice(0, 800)
  }
}

function summarizeRequestBody(body: BodyInit | null | undefined): unknown {
  if (body instanceof FormData) {
    const files: Array<{ field: string; filename: string; size: number; type: string }> = []
    body.forEach((value, key) => {
      if (value instanceof File) files.push({ field: key, filename: value.name, size: value.size, type: value.type })
    })
    return { multipart: true, files }
  }
  if (typeof body === 'string') return redactPayload(parseResponseText(body))
  return body ? '[body]' : undefined
}

function logHttpCall(entry: { url: string; method: string; status?: number; elapsedMs: number; payload?: unknown; response?: unknown; error?: string }) {
  const safe = {
    event: 'http_client_request',
    url: entry.url,
    method: entry.method,
    status: entry.status,
    elapsed_ms: Math.round(entry.elapsedMs),
    payload: redactPayload(entry.payload),
    response: redactPayload(entry.response),
    error: entry.error,
  }
  if (entry.error) {
    console.error('[CRONOS HTTP]', safe)
    return
  }
  console.info('[CRONOS HTTP]', safe)
}

function redactPayload(value: unknown): unknown {
  const secretKeys = ['authorization', 'password', 'pin', 'token', 'runtime_token', 'x-cronos-runtime-token']
  if (Array.isArray(value)) return value.slice(0, 20).map(redactPayload)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key,
      secretKeys.some((secret) => key.toLowerCase().includes(secret)) ? '***redacted***' : redactPayload(item),
    ]))
  }
  return value
}
