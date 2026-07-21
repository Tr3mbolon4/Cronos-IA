import { AlertTriangle, CheckCircle2, Ear, Lock, MessageCircle, Moon, Orbit, Power, Radio, Search, ShieldCheck, Sparkles, Zap } from 'lucide-react'
import type { CoreState, RetrievalSummary } from './types'

export type CoreStateMeta = {
  state: CoreState
  label: string
  description: string
  tone: 'blue' | 'cyan' | 'green' | 'gold' | 'orange' | 'red' | 'muted'
  priority: number
  icon: typeof Sparkles
}

export const coreStatePriority: CoreState[] = [
  'locked',
  'offline',
  'error',
  'processing',
  'searching',
  'thinking',
  'speaking',
  'listening',
  'success',
  'warning',
  'ready',
  'idle',
]

export const coreStateMeta: Record<CoreState, CoreStateMeta> = {
  idle: {
    state: 'idle',
    label: 'Disponivel',
    description: 'Nucleo em espera, pronto para receber comandos.',
    tone: 'blue',
    priority: 10,
    icon: Moon,
  },
  ready: {
    state: 'ready',
    label: 'Pronto',
    description: 'Backend, banco e sessao estao prontos.',
    tone: 'cyan',
    priority: 20,
    icon: ShieldCheck,
  },
  listening: {
    state: 'listening',
    label: 'Ouvindo',
    description: 'Estado visual reservado para entrada de voz da Fase 5.',
    tone: 'green',
    priority: 50,
    icon: Ear,
  },
  thinking: {
    state: 'thinking',
    label: 'Pensando',
    description: 'Preparando interpretacao do pedido.',
    tone: 'gold',
    priority: 60,
    icon: Orbit,
  },
  speaking: {
    state: 'speaking',
    label: 'Falando',
    description: 'Estado visual reservado para resposta falada da Fase 5.',
    tone: 'cyan',
    priority: 55,
    icon: MessageCircle,
  },
  processing: {
    state: 'processing',
    label: 'Processando',
    description: 'Executando uma solicitacao autenticada.',
    tone: 'orange',
    priority: 80,
    icon: Zap,
  },
  searching: {
    state: 'searching',
    label: 'Pesquisando',
    description: 'Consultando memoria, biblioteca ou retrieval.',
    tone: 'cyan',
    priority: 70,
    icon: Search,
  },
  success: {
    state: 'success',
    label: 'Concluido',
    description: 'A ultima acao foi concluida com sucesso.',
    tone: 'green',
    priority: 40,
    icon: CheckCircle2,
  },
  warning: {
    state: 'warning',
    label: 'Atencao',
    description: 'Existe uma condicao degradada ou experimental.',
    tone: 'gold',
    priority: 30,
    icon: AlertTriangle,
  },
  error: {
    state: 'error',
    label: 'Erro',
    description: 'O CRONOS encontrou uma falha que exige atencao.',
    tone: 'red',
    priority: 90,
    icon: AlertTriangle,
  },
  locked: {
    state: 'locked',
    label: 'Bloqueado',
    description: 'Sessao protegida aguardando autorizacao do proprietario.',
    tone: 'gold',
    priority: 100,
    icon: Lock,
  },
  offline: {
    state: 'offline',
    label: 'Offline',
    description: 'Nucleo local indisponivel ou em inicializacao.',
    tone: 'muted',
    priority: 95,
    icon: Power,
  },
}

export function resolveCoreState({
  authenticated,
  runtimeReady,
  transient,
  retrieval,
}: {
  authenticated: boolean
  runtimeReady: boolean
  transient: CoreState
  retrieval: RetrievalSummary
}): CoreState {
  if (!runtimeReady) return 'offline'
  if (!authenticated) return 'locked'
  if (['error', 'processing', 'searching', 'thinking', 'speaking', 'listening', 'success'].includes(transient)) return transient
  if (!retrieval.loaded && retrieval.mode !== 'lexical') return 'warning'
  return 'ready'
}

export function stateLabel(state: CoreState) {
  return coreStateMeta[state].label
}

export function stateDescription(state: CoreState) {
  return coreStateMeta[state].description
}

export function stateIcon(state: CoreState) {
  return coreStateMeta[state].icon || Radio
}
