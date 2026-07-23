import type { ApiClient } from './apiClient'
import type { PaginatedResponse } from '../types/api'
import type { DocumentChunk, DocumentDetails, DocumentItem, DocumentPage, ImportResult } from '../types/library'

export function listDocuments(client: ApiClient, includeDeleted = false) {
  return client.get<DocumentItem[]>(`/documents?include_deleted=${includeDeleted}`)
}

export function importDocument(client: ApiClient, file: File) {
  return client.upload<ImportResult>('/documents/import', file, 'file', { timeoutMs: 120000 })
}

export function getDocument(client: ApiClient, id: number, includeDeleted = true) {
  return client.get<DocumentDetails>(`/documents/${id}?include_deleted=${includeDeleted}`)
}

export function deleteDocument(client: ApiClient, id: number) {
  return client.delete<DocumentItem>(`/documents/${id}`)
}

export function restoreDocument(client: ApiClient, id: number) {
  return client.post<DocumentItem>(`/documents/${id}/restore`)
}

export function reindexDocument(client: ApiClient, id: number) {
  return client.post<ImportResult>(`/documents/${id}/reindex`)
}

export function listPages(client: ApiClient, documentId: number, includeDeleted = false) {
  return client.get<DocumentPage[]>(`/documents/${documentId}/pages?include_deleted=${includeDeleted}`)
}

export function listChunks(client: ApiClient, documentId: number, filters: { limit?: number; offset?: number; include_deleted?: boolean } = {}) {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined) params.set(key, String(value))
  })
  return client.get<PaginatedResponse<DocumentChunk>>(`/documents/${documentId}/chunks?${params.toString()}`)
}
