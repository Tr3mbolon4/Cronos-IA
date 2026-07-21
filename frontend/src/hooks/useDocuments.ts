import { useCallback, useEffect, useState } from 'react'
import type { ApiClient } from '../services/apiClient'
import { listDocuments } from '../services/libraryApi'
import { indexStatus, providers } from '../services/retrievalApi'
import type { DocumentItem } from '../types/library'
import type { IndexStatus, RetrievalProvider } from '../types/retrieval'
import { friendlyError } from '../utils/errors'

export function useDocuments(client: ApiClient | null, includeDeleted = false) {
  const [documents, setDocuments] = useState<DocumentItem[]>([])
  const [status, setStatus] = useState<IndexStatus | null>(null)
  const [providerRows, setProviderRows] = useState<RetrievalProvider[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    if (!client) return
    setLoading(true)
    setError('')
    try {
      const [docs, index, providerList] = await Promise.all([listDocuments(client, includeDeleted), indexStatus(client), providers(client)])
      setDocuments(docs)
      setStatus(index)
      setProviderRows(providerList)
    } catch (error) {
      setError(friendlyError(error))
    } finally {
      setLoading(false)
    }
  }, [client, includeDeleted])

  useEffect(() => {
    reload().catch(() => undefined)
  }, [reload])

  return { documents, status, providers: providerRows, loading, error, reload }
}
