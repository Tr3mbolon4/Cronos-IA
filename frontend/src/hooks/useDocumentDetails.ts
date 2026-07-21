import { useCallback, useEffect, useState } from 'react'
import type { ApiClient } from '../services/apiClient'
import { getDocument, listChunks, listPages } from '../services/libraryApi'
import type { DocumentChunk, DocumentDetails, DocumentPage } from '../types/library'
import { friendlyError } from '../utils/errors'

export function useDocumentDetails(client: ApiClient | null, id: number | null) {
  const [details, setDetails] = useState<DocumentDetails | null>(null)
  const [pages, setPages] = useState<DocumentPage[]>([])
  const [chunks, setChunks] = useState<DocumentChunk[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    if (!client || !id) return
    setLoading(true)
    setError('')
    try {
      const [documentDetails, pageRows, chunkRows] = await Promise.all([getDocument(client, id), listPages(client, id), listChunks(client, id, { limit: 50 })])
      setDetails(documentDetails)
      setPages(pageRows)
      setChunks(chunkRows.items)
    } catch (error) {
      setError(friendlyError(error))
    } finally {
      setLoading(false)
    }
  }, [client, id])

  useEffect(() => {
    reload().catch(() => undefined)
  }, [reload])

  return { details, pages, chunks, loading, error, reload }
}
