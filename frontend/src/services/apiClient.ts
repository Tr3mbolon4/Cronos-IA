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
