import type { DocumentChunk, DocumentItem, DocumentPage } from './library'

export type Citation = {
  document_id: number
  document_title: string
  source_id: number
  source_filename: string
  page_id: number
  page_number: number
  chunk_id: number
  chunk_index: number
  excerpt: string
  character_start: number
  character_end: number
  relevance_score: number | null
  citation_label: string
}

export type RetrievalResult = {
  document: Pick<DocumentItem, 'id' | 'filename'>
  page: Pick<DocumentPage, 'id' | 'page_number'>
  chunk: DocumentChunk
  citation: Citation
  score_lexical: number
  score_semantic: number
  score_final: number
  excerpt: string
}

export type RetrievalResponse = {
  items: RetrievalResult[]
  total: number
  top_k: number
  provider: RetrievalProvider
}

export type RetrievalProvider = {
  provider: string
  model: string
  available: boolean
  dimension: number
  fallback?: boolean
  error?: string | null
}

export type IndexStatus = {
  chunks: number
  embeddings: number
  pending: number
  semantic_available: boolean
  provider: RetrievalProvider
}
