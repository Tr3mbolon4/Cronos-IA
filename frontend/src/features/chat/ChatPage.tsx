import { Archive, BookOpen, ChevronDown, Copy, Edit3, FileText, Info, MessageSquarePlus, MoreVertical, PanelRightClose, PanelRightOpen, Paperclip, Pin, RefreshCw, RotateCcw, Search, Send, Square, Star, Trash2, X } from 'lucide-react'
import type { Message } from '../../app/types'
import { CronosCore } from '../../components/core/CronosCore'
import { SpeechControls } from '../voice/components/SpeechControls'
import { TranscriptionReview } from '../voice/components/TranscriptionReview'
import { VoiceButton } from '../voice/components/VoiceButton'
import { filterConversations, formatChatTime, messageKey, renderSafeMarkdown, trimMessage } from './chatUtils'
import type { ChatAction, ChatPageProps, ConversationFilter, ConversationSummary } from './types'

const filterLabels: Record<ConversationFilter, string> = {
  active: 'Ativas',
  pinned: 'Fixadas',
  archived: 'Arquivadas',
}

export function ChatPage(props: ChatPageProps) {
  const visibleConversations = filterConversations(props.conversations, props.filter, props.debouncedSearchTerm)
  const activeConversation = props.conversations.find((item) => item.id === props.activeConversationId) || props.conversations[0]
  const activeMessages = props.messages

  return (
    <section className={`chat-route chat-workspace-v3 ${props.contextOpen ? 'context-visible' : 'context-hidden'}`} data-visual="chat">
      <ConversationSidebar {...props} conversations={visibleConversations} />
      <main className="conversation-stage-v3" aria-label="Conversa ativa">
        <ConversationHeader {...props} conversation={activeConversation} messageCount={activeMessages.length} />
        <MessageTimeline {...props} messages={activeMessages} />
        <MessageComposer {...props} />
      </main>
      {props.contextOpen && <ContextPanel {...props} conversation={activeConversation} />}
      {props.notices.length > 0 && (
        <div className="chat-toast-stack" aria-live="polite">
          {props.notices.map((item) => (
            <button key={item.id} type="button" className={`chat-toast ${item.tone}`} onClick={() => props.onDismissNotice(item.id)}>
              {item.message}
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

function ConversationSidebar({
  conversations,
  activeConversationId,
  filter,
  searchTerm,
  loading,
  offline,
  onNewConversation,
  onCancelProvisional,
  onSelectConversation,
  onSearchChange,
  onFilterChange,
  onTogglePin,
  onRenameConversation,
  onArchiveConversation,
  onRestoreConversation,
  onDeleteConversation,
}: ChatPageProps & { conversations: ConversationSummary[] }) {
  return (
    <aside className="conversation-sidebar-v3" aria-label="Lista de conversas">
      <header className="chat-panel-header">
        <div>
          <span>Conversas</span>
          <strong>{offline ? 'Offline' : loading ? 'Carregando' : `${conversations.length} visiveis`}</strong>
        </div>
        <button type="button" className="icon-button primary" onClick={onNewConversation} aria-label="Criar nova conversa" title="Nova conversa">
          <MessageSquarePlus size={16} />
        </button>
      </header>
      <label className="chat-search-box">
        <Search size={15} />
        <input value={searchTerm} onChange={(event) => onSearchChange(event.target.value)} placeholder="Pesquisar conversa" aria-label="Pesquisar conversas" />
      </label>
      <div className="segmented-tabs" role="tablist" aria-label="Filtros de conversa">
        {(Object.keys(filterLabels) as ConversationFilter[]).map((key) => (
          <button key={key} type="button" className={filter === key ? 'active' : ''} onClick={() => onFilterChange(key)}>{filterLabels[key]}</button>
        ))}
      </div>
      <div className="conversation-list-v3">
        {loading && <div className="chat-inline-state">Carregando historico...</div>}
        {offline && <div className="chat-inline-state error">Backend offline. O historico protegido nao foi carregado.</div>}
        {!loading && !offline && conversations.length === 0 && <div className="chat-inline-state">Nenhuma conversa para este filtro.</div>}
        {conversations.map((item) => (
          <article key={item.id} className={`conversation-card-v3 ${activeConversationId === item.id ? 'active' : ''} ${item.archived ? 'archived' : ''}`}>
            <button type="button" className="conversation-open" onClick={() => onSelectConversation(item.id)}>
              <span>{item.pinned && <Pin size={12} />} {item.title}</span>
              <small>{item.excerpt}</small>
              <em>{item.messageCount} mensagens | {item.updatedAt ? formatChatTime(item.updatedAt) : 'rascunho'}</em>
            </button>
            <div className="conversation-card-actions">
              <button type="button" aria-label="Fixar conversa" title="Fixar" onClick={() => onTogglePin(item.id)}><Pin size={13} /></button>
              <button type="button" aria-label="Renomear conversa" title="Renomear" onClick={() => onRenameConversation(item.id)}><Edit3 size={13} /></button>
              {item.archived
                ? <button type="button" aria-label="Restaurar conversa" title="Restaurar" onClick={() => onRestoreConversation(item.id)}><RotateCcw size={13} /></button>
                : <button type="button" aria-label="Arquivar conversa" title="Arquivar" onClick={() => onArchiveConversation(item.id)}><Archive size={13} /></button>}
              <button type="button" aria-label="Excluir conversa" title="Excluir" onClick={() => onDeleteConversation(item.id)}><Trash2 size={13} /></button>
            </div>
            {item.provisional && <button type="button" className="ghost-link" onClick={onCancelProvisional}>Cancelar rascunho vazio</button>}
          </article>
        ))}
      </div>
    </aside>
  )
}

function ConversationHeader({ conversation, messageCount, coreState, owner, submitting, contextOpen, onToggleContext, onLock }: ChatPageProps & { conversation?: ConversationSummary; messageCount: number }) {
  return (
    <header className="conversation-header-v3">
      <CronosCore state={coreState} compact />
      <div className="conversation-title-block">
        <span>{owner} com CRONOS</span>
        <h2>{conversation?.title || 'Conversa'}</h2>
        <p>{submitting ? 'Preparando resposta segura' : `${messageCount} mensagens carregadas no contrato atual`}</p>
      </div>
      <div className="conversation-header-actions">
        <button type="button" onClick={onLock}><Square size={15} /> Bloquear</button>
        <button type="button" onClick={onToggleContext} aria-pressed={contextOpen}>
          {contextOpen ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />} Contexto
        </button>
      </div>
    </header>
  )
}

function MessageTimeline(props: ChatPageProps & { messages: Message[] }) {
  return (
    <section className="message-timeline-v3" aria-live={props.submitting ? 'polite' : 'off'}>
      {props.activeConversationId !== 'principal' && <div className="chat-empty-state">Digite para iniciar uma conversa real sem criar sessao vazia.</div>}
      {props.activeConversationId === 'principal' && props.messages.length === 0 && <div className="chat-empty-state">Nenhuma mensagem nesta sessao protegida.</div>}
      {props.messages.map((message, index) => (
        <MessageBubble key={messageKey(message, index)} {...props} message={message} index={index} />
      ))}
      {props.submitting && <div className="chat-processing" role="status">CRONOS esta preparando resposta...</div>}
      {props.cancelled && <div className="chat-inline-state warn">Cancelamento aplicado no frontend. A resposta tardia nao sera simulada.</div>}
    </section>
  )
}

function MessageBubble(props: ChatPageProps & { message: Message; index: number }) {
  const { message, index, menuMessageId, editingMessageId, editingText } = props
  const key = messageKey(message, index)
  const isOwner = message.role === 'user'
  const isEditing = editingMessageId === key
  const menuOpen = menuMessageId === key
  const roleLabel = isOwner ? 'Proprietario' : message.role === 'assistant' ? 'CRONOS' : message.role
  return (
    <article className={`message-bubble-v3 ${isOwner ? 'owner' : 'cronos'} role-${message.role}`} data-message-edge={isOwner ? 'right' : 'left'}>
      <header>
        <strong>{roleLabel}</strong>
        <span>{formatChatTime(message.created_at)} {message.status === 'edited' ? '| editada' : ''}</span>
        <button type="button" className="message-menu-trigger" aria-haspopup="menu" aria-expanded={menuOpen} aria-label={`Abrir acoes da mensagem de ${roleLabel}`} onClick={() => props.onMenuChange(menuOpen ? null : key)}>
          <MoreVertical size={15} />
        </button>
      </header>
      {message.reply_to_id && <button type="button" className="reply-reference">Resposta vinculada #{message.reply_to_id}</button>}
      {isEditing ? (
        <div className="inline-editor">
          <textarea value={editingText} onChange={(event) => props.onEditingTextChange(event.target.value)} aria-label="Editar mensagem" />
          <div>
            <button type="button" className="primary" onClick={props.onSaveEdit}>Salvar</button>
            <button type="button" onClick={props.onCancelEdit}>Cancelar</button>
          </div>
        </div>
      ) : (
        <div className="message-content" dangerouslySetInnerHTML={{ __html: renderSafeMarkdown(message.content) }} />
      )}
      <footer>
        <span>{message.status || (isOwner ? 'sent' : 'received')}</span>
        {!isOwner && <button type="button" className="message-citation-chip" onClick={() => props.onMessageAction('citations', message)}><BookOpen size={12} /> Citações</button>}
      </footer>
      {!isOwner && <SpeechControls text={message.content} voice={props.voice} />}
      {menuOpen && <MessageActions isOwner={isOwner} message={message} onAction={props.onMessageAction} />}
    </article>
  )
}

function MessageActions({ isOwner, message, onAction }: { isOwner: boolean; message: Message; onAction: (action: ChatAction, message: Message) => void }) {
  const actions: Array<{ id: ChatAction; label: string; icon: typeof Copy; disabled?: boolean }> = [
    { id: 'copy', label: 'Copiar', icon: Copy },
    { id: 'reply', label: 'Responder', icon: RotateCcw },
    { id: 'quote', label: 'Citar', icon: BookOpen },
    { id: 'edit', label: 'Editar', icon: Edit3, disabled: !isOwner },
    { id: 'regenerate', label: 'Regenerar', icon: RefreshCw, disabled: isOwner },
    { id: 'helpful', label: 'Util', icon: Star, disabled: isOwner },
    { id: 'details', label: 'Detalhes', icon: Info },
  ]
  return (
    <div className={`message-action-menu ${isOwner ? 'menu-left' : 'menu-right'}`} role="menu">
      {actions.map((item) => {
        const Icon = item.icon
        return (
          <button key={item.id} type="button" role="menuitem" disabled={item.disabled} onClick={() => onAction(item.id, message)}>
            <Icon size={14} /> {item.label}
          </button>
        )
      })}
    </div>
  )
}

function MessageComposer(props: ChatPageProps) {
  return (
    <form className="message-composer" onSubmit={props.onSubmit}>
      {props.replyTarget && (
        <div className="reply-preview">
          <span>Respondendo {props.replyTarget.role === 'user' ? 'Proprietario' : 'CRONOS'}: {trimMessage(props.replyTarget.content, 84)}</span>
          <button type="button" aria-label="Cancelar resposta" onClick={props.onCancelReply}><X size={14} /></button>
        </div>
      )}
      {props.attachments.length > 0 && (
        <div className="attachment-tray">
          {props.attachments.map((item) => (
            <span key={item.id} className={item.status}>
              <FileText size={13} /> {item.name} <em>{Math.ceil(item.size / 1024)} KB</em>
              <button type="button" aria-label={`Remover ${item.name}`} onClick={() => props.onRemoveAttachment(item.id)}><X size={12} /></button>
            </span>
          ))}
        </div>
      )}
      <div className="composer-row">
        <label className="icon-button" title="Anexar arquivo">
          <Paperclip size={17} />
          <input type="file" multiple accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown" onChange={(event) => props.onFilesSelected(event.target.files)} />
        </label>
        <textarea
          value={props.draft}
          onChange={(event) => props.onDraftChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              props.onSubmit(event)
            }
          }}
          disabled={!props.backendReady || props.offline}
          placeholder="Digite uma mensagem para o CRONOS..."
        />
        <VoiceButton voice={props.voice} label="Falar" />
        {props.submitting
          ? <button type="button" className="warn" onClick={props.onStopResponse}><Square size={16} /> Parar</button>
          : <button type="submit" className="primary" disabled={!props.draft.trim() || props.offline}><Send size={16} /> Enviar</button>}
      </div>
      <TranscriptionReview voice={props.voice} onUseText={props.onDraftChange} onSend={(text) => { props.onDraftChange(text); setTimeout(() => document.querySelector<HTMLButtonElement>('.message-composer button[type="submit"]')?.click(), 0) }} />
    </form>
  )
}

function ContextPanel({ conversation, retrieval, documents, attachments, onToggleContext, onOpenLibrary }: ChatPageProps & { conversation?: ConversationSummary }) {
  return (
    <aside className="chat-context-panel-v3" aria-label="Painel contextual">
      <header className="chat-panel-header">
        <div>
          <span>Contexto seguro</span>
          <strong>{conversation?.title || 'Conversa'}</strong>
        </div>
        <button type="button" className="icon-button" onClick={onToggleContext} aria-label="Fechar painel contextual"><X size={15} /></button>
      </header>
      <section>
        <h3>Retrieval</h3>
        <p>Modo {retrieval.mode}. Provider {retrieval.loaded ? 'carregado' : 'em fallback'}.</p>
      </section>
      <section>
        <h3>Biblioteca</h3>
        <p>{documents.length} documentos disponiveis para consulta persistida.</p>
        <button type="button" onClick={onOpenLibrary}><BookOpen size={14} /> Abrir Biblioteca</button>
      </section>
      <section>
        <h3>Anexos</h3>
        {attachments.length ? attachments.map((item) => <p key={item.id}>{item.name}: {item.reason || 'aguardando envio integrado'}</p>) : <p>Nenhum anexo selecionado.</p>}
      </section>
      <section>
        <h3>Limites atuais</h3>
        <p>Replies, edicao auditada, regeneracao e conversas reais aguardam contrato backend futuro.</p>
      </section>
      <button type="button" className="context-collapse"><ChevronDown size={14} /> Detalhes operacionais seguros</button>
    </aside>
  )
}
