import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type { DocumentItem, Message, RetrievalSummary } from '../../app/types'
import { authHeaders } from '../../app/startup'
import { ApiClient, readableApiError } from '../../services/apiClient'
import { importDocument } from '../../services/libraryApi'
import { rebuildIndex } from '../../services/retrievalApi'
import type { ImportResult } from '../../types/library'
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
  onDocumentsImported,
}: {
  client: ApiClient
  token: string
  initialMessages: Message[]
  retrieval: RetrievalSummary
  documents: DocumentItem[]
  onCoreState: (state: 'ready' | 'thinking' | 'processing' | 'success' | 'warning' | 'error' | 'offline') => void
  onHistoryChange: (messages: Message[]) => void
  onDocumentsImported?: () => Promise<void>
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
  const [contextOpen, setContextOpen] = useState(false)
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
    onCoreState(attachments.length ? 'processing' : 'thinking')
    let optimistic: Message | null = null
    try {
      const importedDocuments = await processAttachments()
      optimistic = { role: 'user', content: clean, created_at: new Date().toISOString(), status: 'sending', reply_to_id: replyTarget ? messageKey(replyTarget) : undefined }
      setMessages((current) => [...current, optimistic as Message])
      setDraft('')
      setReplyTarget(null)
      onCoreState('thinking')
      const response = await client.post<Message>(
        '/chat',
        { message: clean, conversation_id: activeConversationId, document_ids: importedDocuments.map((item) => item.document.id) },
        { headers: authHeaders(token), timeoutMs: 30000 },
      )
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
      if (optimistic) setMessages((current) => current.map((item) => item === optimistic ? { ...optimistic, status: 'failed' } : item))
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
      pushNotice(selected.some((item) => item.status === 'BLOCKED') ? 'Alguns arquivos nao sao PDF e foram bloqueados.' : 'PDF pronto para enviar e indexar na Biblioteca.', selected.some((item) => item.status === 'BLOCKED') ? 'warning' : 'info')
    },
    onRemoveAttachment: (id: string) => setAttachments((current) => current.filter((item) => item.id !== id)),
    onRetryAttachment: (id: string) => updateAttachment(id, { status: 'READY', progress: 0, reason: 'Pronto para tentar novamente.' }),
    onDismissNotice: (id: string) => setNotices((current) => current.filter((item) => item.id !== id)),
    onMenuChange: setMenuMessageId,
    filteredConversations: conversations,
    debouncedSearchTerm: debouncedSearch,
  }

  async function processAttachments(): Promise<ImportResult[]> {
    const pending = attachments.filter((item) => item.status !== 'BLOCKED' && item.status !== 'FAILED')
    if (!pending.length) return []
    const imported: ImportResult[] = []
    for (const attachment of pending) {
      updateAttachment(attachment.id, { status: 'UPLOADING', progress: 12, reason: 'Enviando para a Biblioteca.' })
      let result: ImportResult
      try {
        result = await importDocument(client, attachment.file)
      } catch (error) {
        updateAttachment(attachment.id, { status: 'FAILED', progress: 100, reason: readableApiError(error) || 'Falha ao indexar documento.' })
        pushNotice('Falha ao indexar documento.', 'error')
        throw error
      }
      imported.push(result)
      updateAttachment(attachment.id, {
        status: result.source.extraction_status === 'failed' ? 'FAILED' : 'EXTRACTING',
        documentId: result.document.id,
        pageCount: result.page_count,
        chunkCount: result.chunk_count,
        progress: 45,
        reason: result.source.extraction_status === 'failed' ? 'Falha ao extrair texto do PDF.' : 'Texto extraido.',
      })
      if (result.source.extraction_status === 'failed' || result.chunk_count === 0) {
        updateAttachment(attachment.id, { status: 'FAILED', progress: 100, reason: result.source.error_message || 'Falha ao indexar documento.' })
        pushNotice('Falha ao indexar documento.', 'error')
        throw new Error(result.source.error_message || 'Falha ao indexar documento.')
      }
      updateAttachment(attachment.id, { status: 'CHUNKING', progress: 60, reason: `${result.chunk_count} chunks criados.` })
      updateAttachment(attachment.id, { status: 'EMBEDDING', progress: 74, reason: 'Gerando embeddings ausentes.' })
      const index = await rebuildIndex(client, { filters: { document_id: result.document.id } })
      updateAttachment(attachment.id, {
        status: 'INDEXING',
        progress: 90,
        reason: index.provider_available ? `${index.embeddings} embeddings no indice.` : 'Fallback lexical ativo; documento pesquisavel por texto.',
      })
      updateAttachment(attachment.id, { status: 'READY', progress: 100, reason: 'Documento pronto para consulta.' })
    }
    setAttachments((current) => current.filter((item) => item.status === 'BLOCKED' || item.status === 'FAILED'))
    if (imported.length) {
      await onDocumentsImported?.()
      pushNotice(`${imported.length} documento(s) pronto(s) na Biblioteca.`, 'success')
    }
    return imported
  }

  function updateAttachment(id: string, patch: Partial<AttachmentDraft>) {
    setAttachments((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item))
  }
}
