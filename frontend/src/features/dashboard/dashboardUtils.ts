import type { DashboardActivity, DocumentItem, Hardware, MemorySummary, Message, RetrievalSummary } from '../../app/types'

export function greetingFor(date = new Date()) {
  const hour = date.getHours()
  if (hour < 12) return 'Bom dia'
  if (hour < 18) return 'Boa tarde'
  return 'Boa noite'
}

export function recentConversationItems(messages: Message[]) {
  return messages.slice(-5).reverse().map((message, index) => ({
    id: `${message.role}-${message.id || index}`,
    title: message.role === 'user' ? 'Voce' : 'CRONOS',
    excerpt: trimText(message.content, 96),
    time: message.created_at ? new Date(message.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : 'agora',
  }))
}

export function buildActivities({
  messages,
  memories,
  documents,
  retrieval,
}: {
  messages: Message[]
  memories: MemorySummary[]
  documents: DocumentItem[]
  retrieval: RetrievalSummary
}): DashboardActivity[] {
  const activities: DashboardActivity[] = []
  if (messages.length) {
    activities.push({ id: 'chat', title: 'Conversa atualizada', detail: `${messages.length} mensagens carregadas com seguranca.`, tone: 'info' })
  }
  if (memories.length) {
    activities.push({ id: 'memory', title: 'Memoria recente', detail: trimText(memories[0].title, 80), tone: 'success' })
  }
  if (documents.length) {
    activities.push({ id: 'document', title: 'Biblioteca pronta', detail: `${documents.length} documento(s) disponiveis.`, tone: 'info' })
  }
  activities.push({
    id: 'retrieval',
    title: retrieval.loaded ? 'Retrieval hibrido disponivel' : 'Fallback lexical ativo',
    detail: `${retrieval.provider} em modo ${retrieval.mode}.`,
    tone: retrieval.loaded ? 'success' : 'warning',
  })
  return activities.slice(0, 5)
}

export function dashboardAlerts({
  hardware,
  retrieval,
  online,
}: {
  hardware: Hardware | null
  retrieval: RetrievalSummary
  online: boolean
}) {
  const alerts = []
  if (!online) alerts.push({ title: 'Aplicativo offline', detail: 'O CRONOS continua local; recursos externos ficam indisponiveis.', tone: 'warning' as const })
  if (!retrieval.loaded) alerts.push({ title: 'Provider semantico degradado', detail: 'A busca lexical permanece funcional.', tone: 'warning' as const })
  if ((hardware?.disk_percent ?? 0) > 90) alerts.push({ title: 'Espaco em disco baixo', detail: 'Considere liberar espaco antes de importar documentos grandes.', tone: 'error' as const })
  if (!alerts.length) alerts.push({ title: 'Nucleo operacional', detail: 'Nenhum alerta critico detectado.', tone: 'success' as const })
  return alerts
}

export function trimText(value: string, max: number) {
  const clean = value.replace(/\s+/g, ' ').trim()
  return clean.length > max ? `${clean.slice(0, max - 1)}...` : clean
}
