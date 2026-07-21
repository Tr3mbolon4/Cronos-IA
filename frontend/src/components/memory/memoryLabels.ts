import type { MemoryRelationType, MemoryStatus } from '../../types/memory'

export const memoryStatusLabels: Record<MemoryStatus, string> = {
  active: 'Ativa',
  archived: 'Arquivada',
  pending_review: 'Pendente de revisao',
  deleted: 'Excluida',
}

export const relationTypeLabels: Record<MemoryRelationType, string> = {
  related_to: 'Relacionada a',
  depends_on: 'Depende de',
  derived_from: 'Derivada de',
  supersedes: 'Substitui',
  contradicts: 'Contradiz',
  part_of: 'Parte de',
}
