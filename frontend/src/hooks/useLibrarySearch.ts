import { useState } from 'react'
import type { ApiClient } from '../services/apiClient'
import { retrieve } from '../services/retrievalApi'
import type { RetrievalResponse } from '../types/retrieval'
import { friendlyError } from '../utils/errors'

export function useLibrarySearch(client: ApiClient | null) {
  const [result, setResult] = useState<RetrievalResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function search(query: string, top_k: number, filters: Record<string, string | number | undefined> = {}) {
    if (!client || !query.trim()) return
    setLoading(true)
    setError('')
    try {
      setResult(await retrieve(client, { query, top_k, filters }))
    } catch (error) {
      setError(friendlyError(error))
    } finally {
      setLoading(false)
    }
  }

  return { result, loading, error, search }
}
