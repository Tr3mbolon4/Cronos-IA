export type MemoryStatus = 'active' | 'archived' | 'pending_review' | 'deleted'
export type MemoryRelationType = 'related_to' | 'depends_on' | 'derived_from' | 'supersedes' | 'contradicts' | 'part_of'

export type MemoryCategory = {
  id: number
  name: string
  description?: string
  created_at: string
}

export type Memory = {
  id: number
  owner_id: number
  category_id: number
  title: string
  content: string
  normalized_content: string
  source_type: string
  source_reference: string | null
  confidence: number
  importance: number
  status: MemoryStatus
  created_at: string
  updated_at: string
  last_accessed_at: string | null
  access_count: number
  deleted_at: string | null
}

export type MemoryRevision = {
  id: number
  memory_id: number
  revision_number: number
  previous_title: string
  previous_content: string
  previous_category_id: number | null
  previous_confidence: number
  previous_importance: number
  previous_status: MemoryStatus
  changed_fields: string
  change_reason: string | null
  created_at: string
}

export type MemoryRelation = {
  id: number
  owner_id: number
  source_memory_id: number
  target_memory_id: number
  relation_type: MemoryRelationType
  strength: number
  description: string | null
  created_at: string
  deleted_at: string | null
}

export type MemoryFilters = {
  search?: string
  category_id?: string
  status?: string
  source_type?: string
  minimum_confidence?: string
  minimum_importance?: string
  include_deleted?: boolean
  limit?: number
  offset?: number
  order_by?: string
  order_direction?: string
}

export type MemoryInput = {
  title: string
  content: string
  category_id: number
  confidence: number
  importance: number
  source_type: string
  source_reference?: string
  status: MemoryStatus
  change_reason?: string
}
