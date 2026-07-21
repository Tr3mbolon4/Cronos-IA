export type PaginatedResponse<T> = {
  items: T[]
  total: number
  limit: number
  offset: number
}

export type ApiStatus = 'idle' | 'loading' | 'saving' | 'error' | 'ready'
