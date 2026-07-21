import type { Message } from '../../app/types'
import type { StoredConversationMeta } from './chatStorage'
import type { AttachmentDraft, ConversationFilter, ConversationSummary } from './types'

export function formatChatTime(value?: string) {
  if (!value) return 'agora'
  return new Date(value).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function messageKey(message: Message, index = 0) {
  return message.id || `${message.role}-${message.created_at || index}`
}

export function trimMessage(value: string, max = 120) {
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized.length > max ? `${normalized.slice(0, max - 1)}...` : normalized
}

export function buildConversationSummaries(messages: Message[], meta: StoredConversationMeta, provisionalId: string | null): ConversationSummary[] {
  const last = messages[messages.length - 1]
  const principal: ConversationSummary = {
    id: 'principal',
    title: 'Conversa principal',
    excerpt: last ? trimMessage(last.content, 96) : 'Historico textual preservado da v0.2.0.',
    updatedAt: last?.created_at || '',
    messageCount: messages.length,
    pinned: Boolean(meta.principal?.pinned),
    archived: Boolean(meta.principal?.archived),
  }
  const items = [{ ...principal, title: meta.principal?.title || principal.title }]
  if (provisionalId) {
    items.unshift({
      id: provisionalId,
      title: meta[provisionalId]?.title || 'Nova conversa',
      excerpt: 'Rascunho local. A sessao real nasce no primeiro envio.',
      updatedAt: '',
      messageCount: 0,
      pinned: false,
      archived: false,
      provisional: true,
    })
  }
  return items.sort((a, b) => Number(b.pinned) - Number(a.pinned))
}

export function filterConversations(items: ConversationSummary[], filter: ConversationFilter, query: string) {
  const clean = query.trim().toLocaleLowerCase('pt-BR')
  return items.filter((item) => {
    if (filter === 'pinned' && !item.pinned) return false
    if (filter === 'archived' && !item.archived) return false
    if (filter === 'active' && item.archived) return false
    return !clean || `${item.title} ${item.excerpt}`.toLocaleLowerCase('pt-BR').includes(clean)
  })
}

export function validateAttachment(file: File): AttachmentDraft {
  const allowed = new Set(['application/pdf', 'text/plain', 'text/markdown'])
  const markdownByName = file.name.toLowerCase().endsWith('.md') && (file.type === '' || file.type === 'text/markdown')
  const ok = allowed.has(file.type) || markdownByName
  return {
    id: `${file.name}-${file.size}-${file.lastModified}`,
    name: file.name,
    size: file.size,
    type: file.type || (markdownByName ? 'text/markdown' : 'desconhecido'),
    status: ok ? 'ready' : 'blocked',
    reason: ok ? undefined : 'Tipo ainda nao suportado pelo backend de documentos.',
  }
}

export function renderSafeMarkdown(value: string) {
  const escaped = value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return escaped
    .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br />')
}
