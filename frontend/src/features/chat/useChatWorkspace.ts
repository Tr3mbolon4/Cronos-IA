import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type { DocumentItem, Message, RetrievalSummary } from '../../app/types'
import { authHeaders } from '../../app/startup'
import { ApiClient, readableApiError } from '../../services/apiClient'
import { buildConversationSummaries, messageKey, validateAttachment } from './chatUtils'
import { loadActiveConversation, loadConversationMeta, loadDrafts, saveActiveConversation, saveDraft, updateConversationMeta } from './chatStorage'
import type { AttachmentDraft, ChatAction, ChatNotice, ConversationFilter } from './types'

const PRIMARY_CONVERSATION_ID = 'principal'

function notice(message: string, tone: ChatNotice['tone'] = 'info'): ChatNotice {
  return { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, message, tone }
}

export function useChatWorkspace({
  client,
  token,
  initialMessages,
  onCoreState,
  onHistoryChange,
}: {
  client: ApiClient
  token: string
  initialMessages: Message[]
  retrieval: RetrievalSummary
  documents: DocumentItem[]
  onCoreState: (state: 'ready' | 'thinking' | 'processing' | 'success' | 'warning' | 'error' | 'offline') => void
  onHistoryChange: (messages: Message[]) => void
}) {
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [meta, setMeta] = useState(() => loadConversationMeta())
  const [activeConversationId, setActiveConversationId] = useState(() => loadActiveConversation())
  const [provisionalId, setProvisionalId] = useState<string | null>(null)
  const [drafts, setDrafts] = useState(() => loadDrafts())
  const [filter, setFilter] = useState<ConversationFilter>('active')
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [replyTarget, setReplyTarget] = useState<Message | null>(null)
  const [editingMessageId, setEditingMessageId] = useState<number | string | null>(null)
  const [editingText, setEditingText] = useState('')
  const [attachments, setAttachments] = useState<AttachmentDraft[]>([])
  const [notices, setNotices] = useState<ChatNotice[]>([])
  const [loading, setLoading] = useState(false)
  const [offline, setOffline] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [cancelled, setCancelled] = useState(false)
  const [contextOpen, setContextOpen] = useState(() => window.innerWidth > 1320)
  const [menuMessageId, setMenuMessageId] = useState<number | string | null>(null)

  const draft = drafts[activeConversationId] || ''
  const conversations = useMemo(() => buildConversationSummaries(messages, meta, provisionalId), [messages, meta, provisionalId])

  const pushNotice = useCallback((message: string, tone: ChatNotice['tone'] = 'info') => {
    setNotices((current) => [notice(message, tone), ...current].slice(0, 3))
  }, [])

  const refreshHistory = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const history = await client.get<Message[]>(`/chat/history?conversation_id=${encodeURIComponent(activeConversationId)}`)
      setMessages(history)
      onHistoryChange(history)
      setOffline(false)
    } catch (error) {
      setOffline(true)
      pushNotice(readableApiError(error), 'error')
      onCoreState('offline')
    } finally {
      setLoading(false)
    }
  }, [activeConversationId, client, onCoreState, onHistoryChange, pushNotice, token])

  useEffect(() => setMessages(initialMessages), [initialMessages])

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchTerm), 220)
    return () => window.clearTimeout(timer)
  }, [searchTerm])

  useEffect(() => {
    saveActiveConversation(activeConversationId)
  }, [activeConversationId])

  useEffect(() => {
    if (!token || activeConversationId === provisionalId) return
    refreshHistory().catch(() => undefined)
  }, [activeConversationId, provisionalId, refreshHistory, token])

  useEffect(() => {
    function handleKeys(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      const editingText = target?.matches('input, textarea, [contenteditable="true"]')
      if (event.key === 'Escape') {
        setMenuMessageId(null)
        setContextOpen(false)
        setReplyTarget(null)
        if (submitting) {
          setCancelled(true)
          setSubmitting(false)
          onCoreState('warning')
        }
      }
      if (editingText) return
      if (event.ctrlKey && event.key.toLowerCase() === 'n') {
        event.preventDefault()
        newConversation()
      }
      if (event.ctrlKey && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        document.querySelector<HTMLInputElement>('.chat-search-box input')?.focus()
      }
    }
    window.addEventListener('keydown', handleKeys)
    return () => window.removeEventListener('keydown', handleKeys)
  })

  function setDraft(value: string) {
    setDrafts((current) => {
      const next = { ...current, [activeConversationId]: value }
      saveDraft(activeConversationId, value)
      return next
    })
  }

  async function submitMessage(event?: FormEvent) {
    event?.preventDefault()
    const clean = draft.trim()
    if (!clean || submitting || offline) return
    setSubmitting(true)
    setCancelled(false)
    onCoreState('thinking')
    const optimistic: Message = { role: 'user', content: clean, created_at: new Date().toISOString(), status: 'sending', reply_to_id: replyTarget ? messageKey(replyTarget) : undefined }
    setMessages((current) => [...current, optimistic])
    setDraft('')
    setReplyTarget(null)
    try {
      const response = await client.post<Message>('/chat', { message: clean, conversation_id: activeConversationId }, { headers: authHeaders(token), timeoutMs: 30000 })
      setMessages((current) => {
        const withoutOptimistic = current.map((item) => item === optimistic ? { ...optimistic, status: 'sent' as const } : item)
        const next = [...withoutOptimistic, { ...response, status: 'received' as const }]
        onHistoryChange(next)
        return next
      })
      if (activeConversationId === provisionalId) setProvisionalId(null)
      onCoreState('success')
      pushNotice('Mensagem enviada.', 'success')
      await refreshHistory()
      window.setTimeout(() => onCoreState('ready'), 700)
    } catch (error) {
      setMessages((current) => current.map((item) => item === optimistic ? { ...optimistic, status: 'failed' } : item))
      pushNotice(readableApiError(error), 'error')
      onCoreState('error')
    } finally {
      setSubmitting(false)
    }
  }

  function selectConversation(id: string) {
    setActiveConversationId(id)
    setMenuMessageId(null)
  }

  function newConversation() {
    const id = `draft-${Date.now()}`
    setProvisionalId(id)
    setActiveConversationId(id)
    setMessages([])
    onHistoryChange([])
    setMeta((current) => ({ ...current, [id]: { title: 'Nova conversa' } }))
    pushNotice('Nova conversa em rascunho. Ela sera persistida no primeiro envio.', 'info')
  }

  function updateMeta(id: string, patch: Parameters<typeof updateConversationMeta>[1]) {
    setMeta(updateConversationMeta(id, patch))
  }

  function messageAction(action: ChatAction, message: Message) {
    setMenuMessageId(null)
    if (action === 'copy') {
      navigator.clipboard?.writeText(message.content).catch(() => undefined)
      pushNotice('Mensagem copiada.', 'success')
      return
    }
    if (action === 'reply' || action === 'quote') {
      setReplyTarget(message)
      window.setTimeout(() => document.querySelector<HTMLTextAreaElement>('.message-composer textarea')?.focus(), 0)
      return
    }
    if (action === 'edit') {
      if (message.role !== 'user') {
        pushNotice('Somente mensagens do proprietario podem ser editadas.', 'warning')
        return
      }
      setEditingMessageId(messageKey(message))
      setEditingText(message.content)
      return
    }
    if (action === 'helpful') {
      pushNotice('Avaliacao marcada localmente. Persistencia de feedback fica para contrato futuro.', 'success')
      return
    }
    if (action === 'retry' || action === 'regenerate') {
      pushNotice('Regeneracao e reenvio auditado dependem de contrato backend futuro.', 'warning')
      return
    }
    pushNotice('Detalhes seguros exibidos no painel contextual.', 'info')
    setContextOpen(true)
  }

  return {
    messages,
    conversations,
    activeConversationId,
    draft,
    filter,
    searchTerm,
    replyTarget,
    editingMessageId,
    editingText,
    attachments,
    notices,
    loading,
    offline,
    submitting,
    cancelled,
    contextOpen,
    menuMessageId,
    onDraftChange: (value: string) => {
      setDraft(value)
    },
    onSubmit: submitMessage,
    onNewConversation: newConversation,
    onCancelProvisional: () => {
      if (provisionalId) {
        setDraft('')
        setProvisionalId(null)
        setActiveConversationId(PRIMARY_CONVERSATION_ID)
      }
    },
    onSelectConversation: selectConversation,
    onSearchChange: setSearchTerm,
    onFilterChange: setFilter,
    onTogglePin: (id: string) => updateMeta(id, { pinned: !meta[id]?.pinned }),
    onRenameConversation: (id: string) => {
      const currentTitle = conversations.find((item) => item.id === id)?.title || 'Conversa'
      const title = window.prompt('Renomear conversa', currentTitle)
      if (title?.trim()) {
        updateMeta(id, { title: title.trim().slice(0, 80) })
        pushNotice('Titulo alterado.', 'success')
      }
    },
    onArchiveConversation: (id: string) => {
      if (window.confirm('Arquivar esta conversa?')) {
        updateMeta(id, { archived: true })
        pushNotice('Conversa arquivada localmente.', 'success')
      }
    },
    onRestoreConversation: (id: string) => {
      updateMeta(id, { archived: false })
      pushNotice('Conversa restaurada.', 'success')
    },
    onDeleteConversation: (id: string) => {
      if (id === PRIMARY_CONVERSATION_ID) {
        pushNotice('Exclusao fisica nao esta disponivel no contrato atual. Use arquivar.', 'warning')
        return
      }
      if (window.confirm('Excluir este rascunho local?')) {
        setProvisionalId(null)
        setActiveConversationId(PRIMARY_CONVERSATION_ID)
      }
    },
    onMessageAction: messageAction,
    onToggleContext: () => setContextOpen((value) => !value),
    onStopResponse: () => {
      setCancelled(true)
      setSubmitting(false)
      pushNotice('Resposta cancelada no frontend. O backend atual nao expõe cancelamento cooperativo.', 'warning')
      onCoreState('warning')
    },
    onCancelReply: () => setReplyTarget(null),
    onStartEdit: (message: Message) => messageAction('edit', message),
    onSaveEdit: () => {
      setMessages((current) => current.map((item, index) => messageKey(item, index) === editingMessageId ? { ...item, content: editingText, status: 'edited', edited_at: new Date().toISOString() } : item))
      setEditingMessageId(null)
      setEditingText('')
      pushNotice('Edicao aplicada somente na interface. Auditoria persistente requer contrato backend.', 'warning')
    },
    onCancelEdit: () => {
      setEditingMessageId(null)
      setEditingText('')
    },
    onEditingTextChange: setEditingText,
    onFilesSelected: (files: FileList | null) => {
      if (!files) return
      const selected = Array.from(files).map(validateAttachment)
      setAttachments((current) => [...current, ...selected].slice(0, 6))
      pushNotice('Anexos preparados. Envio integrado a Biblioteca permanece limitado ao contrato atual.', selected.some((item) => item.status === 'blocked') ? 'warning' : 'info')
    },
    onRemoveAttachment: (id: string) => setAttachments((current) => current.filter((item) => item.id !== id)),
    onDismissNotice: (id: string) => setNotices((current) => current.filter((item) => item.id !== id)),
    onMenuChange: setMenuMessageId,
    filteredConversations: conversations,
    debouncedSearchTerm: debouncedSearch,
  }
}
