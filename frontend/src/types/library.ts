export type DocumentItem = {
  id: number
  filename: string
  stored_path?: string
  created_at: string
  updated_at?: string
  deleted_at?: string | null
}

export type DocumentSource = {
  id: number
  owner_id: number
  document_id: number
  source_type: string
  original_filename: string
  stored_filename: string | null
  original_path: string | null
  stored_path: string | null
  mime_type: string | null
  file_size: number
  file_hash: string | null
  page_count: number
  language: string | null
  extraction_status: string
  indexing_status: string
  error_code: string | null
  error_message: string | null
  created_at: string
  updated_at: string
  indexed_at: string | null
  deleted_at: string | null
}

export type DocumentDetails = {
  document: DocumentItem & { text?: string }
  source: DocumentSource | null
}

export type DocumentPage = {
  id: number
  document_id: number
  source_id: number
  page_number: number
  text_content: string
  character_count: number
  extraction_status: string
  error_message: string | null
}

export type DocumentChunk = {
  id: number
  document_id: number
  source_id: number
  page_id: number
  chunk_index: number
  text_content: string
  normalized_text: string
  character_start: number
  character_end: number
  token_estimate: number
  content_hash: string | null
}

export type ImportResult = {
  document: DocumentItem & { text?: string }
  source: DocumentSource
  page_count: number
  chunk_count: number
  duplicate?: boolean
}
