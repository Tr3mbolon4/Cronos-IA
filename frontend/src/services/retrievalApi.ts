import type { ApiClient } from './apiClient'
import type { IndexStatus, RetrievalProvider, RetrievalResponse } from '../types/retrieval'

export function retrieve(client: ApiClient, input: { query: string; top_k?: number; filters?: Record<string, string | number | undefined> }) {
  return client.post<RetrievalResponse>('/library/retrieve', input)
}

export function indexStatus(client: ApiClient) {
  return client.get<IndexStatus>('/library/index/status')
}

export function providers(client: ApiClient) {
  return client.get<RetrievalProvider[]>('/library/index/providers')
}

export function rebuildIndex(client: ApiClient, input: { force?: boolean; filters?: Record<string, string | number | undefined> } = {}) {
  return client.post<{ provider_available: boolean; indexed: number; skipped: number; chunks: number; embeddings: number; pending: number }>('/library/index/rebuild', input)
}
