import { readableApiError } from '../services/apiClient'

export function friendlyError(error: unknown) {
  return readableApiError(error)
}
