import { useCallback, useEffect, useState } from 'react'
import type { ApiClient } from '../services/apiClient'
import { getMemory, listRelations, listRevisions } from '../services/memoryApi'
import type { Memory, MemoryRelation, MemoryRevision } from '../types/memory'
import { friendlyError } from '../utils/errors'

export function useMemoryDetails(client: ApiClient | null, id: number | null) {
  const [memory, setMemory] = useState<Memory | null>(null)
  const [revisions, setRevisions] = useState<MemoryRevision[]>([])
  const [relations, setRelations] = useState<MemoryRelation[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    if (!client || !id) return
    setLoading(true)
    setError('')
    try {
      const [memoryRow, revisionRows, relationRows] = await Promise.all([getMemory(client, id), listRevisions(client, id), listRelations(client, id)])
      setMemory(memoryRow)
      setRevisions(revisionRows)
      setRelations(relationRows)
    } catch (error) {
      setError(friendlyError(error))
    } finally {
      setLoading(false)
    }
  }, [client, id])

  useEffect(() => {
    reload().catch(() => undefined)
  }, [reload])

  return { memory, revisions, relations, loading, error, reload }
}
