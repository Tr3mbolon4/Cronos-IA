import type { ApiClient } from './apiClient'
import type { PaginatedResponse } from '../types/api'
import type { Memory, MemoryCategory, MemoryFilters, MemoryInput, MemoryRelation, MemoryRelationType, MemoryRevision } from '../types/memory'

export function listCategories(client: ApiClient) {
  return client.get<MemoryCategory[]>('/memory/categories')
}

export function listMemories(client: ApiClient, filters: MemoryFilters) {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== '' && value !== false) params.set(key, String(value))
  })
  return client.get<PaginatedResponse<Memory>>(`/memories?${params.toString()}`)
}

export function createMemory(client: ApiClient, input: MemoryInput) {
  return client.post<Memory>('/memories', input)
}

export function getMemory(client: ApiClient, id: number, includeDeleted = true) {
  return client.get<Memory>(`/memories/${id}?include_deleted=${includeDeleted}`)
}

export function updateMemory(client: ApiClient, id: number, input: Partial<MemoryInput>) {
  return client.patch<Memory>(`/memories/${id}`, input)
}

export function archiveMemory(client: ApiClient, id: number) {
  return client.post<Memory>(`/memories/${id}/archive`)
}

export function activateMemory(client: ApiClient, id: number) {
  return client.post<Memory>(`/memories/${id}/activate`)
}

export function deleteMemory(client: ApiClient, id: number) {
  return client.delete<Memory>(`/memories/${id}`)
}

export function restoreMemory(client: ApiClient, id: number) {
  return client.post<Memory>(`/memories/${id}/restore`)
}

export function listRevisions(client: ApiClient, id: number) {
  return client.get<MemoryRevision[]>(`/memories/${id}/revisions`)
}

export function listRelations(client: ApiClient, id: number) {
  return client.get<MemoryRelation[]>(`/memories/${id}/relations`)
}

export function createRelation(client: ApiClient, input: {
  source_memory_id: number
  target_memory_id: number
  relation_type: MemoryRelationType
  strength: number
  description?: string
}) {
  return client.post<MemoryRelation>('/memory-relations', input)
}

export function updateRelation(client: ApiClient, id: number, input: Partial<Pick<MemoryRelation, 'strength' | 'description' | 'relation_type' | 'target_memory_id'>>) {
  return client.patch<MemoryRelation>(`/memory-relations/${id}`, input)
}

export function deleteRelation(client: ApiClient, id: number) {
  return client.delete<MemoryRelation>(`/memory-relations/${id}`)
}
