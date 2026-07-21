export function formatDate(value?: string | null) {
  if (!value) return '--'
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
}

export function shortHash(value?: string | null) {
  return value ? value.slice(0, 12) : '--'
}

export function fileSize(bytes?: number | null) {
  if (!bytes) return '--'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function percent(value: number) {
  return `${Math.round(value * 100)}%`
}
