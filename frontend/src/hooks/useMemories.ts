import { useCallback, useEffect, useState } from 'react'
import type { ApiClient } from '../services/apiClient'
import { listCategories, listMemories } from '../services/memoryApi'
import type { Memory, MemoryCategory, MemoryFilters } from '../types/memory'
import { friendlyError } from '../utils/errors'

export function useMemories(client: ApiClient | null, initialFilters: MemoryFilters) {
  const [filters, setFilters] = useState<MemoryFilters>(initialFilters)
  const [items, setItems] = useState<Memory[]>([])
  const [categories, setCategories] = useState<MemoryCategory[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    if (!client) return
    setLoading(true)
    setError('')
    try {
      const [categoryRows, memoryRows] = await Promise.all([listCategories(client), listMemories(client, filters)])
      setCategories(categoryRows)
      setItems(memoryRows.items)
      setTotal(memoryRows.total)
    } catch (error) {
      setError(friendlyError(error))
    } finally {
      setLoading(false)
    }
  }, [client, filters])

  useEffect(() => {
    reload().catch(() => undefined)
  }, [reload])

  return { filters, setFilters, items, categories, total, loading, error, reload }
}
