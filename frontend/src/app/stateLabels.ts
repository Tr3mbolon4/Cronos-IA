import type { CoreState } from './types'

export function stateLabel(state: CoreState) {
  return {
    idle: 'Disponivel',
    listening: 'Ouvindo',
    thinking: 'Pensando',
    speaking: 'Falando',
    processing: 'Processando',
    success: 'Concluido',
    warning: 'Atencao',
    error: 'Erro',
    locked: 'Bloqueado',
    offline: 'Offline',
  }[state]
}
