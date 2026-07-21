import type { FormEvent } from 'react'
import { Archive, Copy, MessageSquarePlus, Paperclip, Pin, Search, Send, Square } from 'lucide-react'
import type { Message } from '../app/types'

export function ChatPage({
  messages,
  draft,
  onDraftChange,
  onSubmit,
}: {
  messages: Message[]
  draft: string
  onDraftChange: (value: string) => void
  onSubmit: (event: FormEvent) => void
}) {
  return (
    <section className="chat-route route-page" data-visual="chat">
      <aside className="conversation-list">
        <div className="page-tools">
          <button type="button" className="primary"><MessageSquarePlus size={15} /> Nova</button>
          <button type="button" aria-label="Pesquisar conversas"><Search size={15} /></button>
        </div>
        <button type="button" className="conversation-item active">
          <strong>Conversa principal</strong>
          <span>{messages.length} mensagens</span>
        </button>
        <button type="button" className="conversation-item">
          <strong>Biblioteca e memoria</strong>
          <span>Preparada para historico</span>
        </button>
      </aside>
      <section className="conversation-stage">
        <header className="conversation-header">
          <div>
            <h2>Conversa principal</h2>
            <p>Chat textual preservado da v0.2.0, agora em tela propria.</p>
          </div>
          <div className="page-tools">
            <button type="button"><Pin size={15} /> Fixar</button>
            <button type="button"><Archive size={15} /> Arquivar</button>
          </div>
        </header>
        <div className="message-timeline">
          {messages.map((message, index) => (
            <article key={`${message.role}-${message.id || index}`} className={`chat-message ${message.role}`}>
              <strong>{message.role === 'user' ? 'Proprietario' : 'CRONOS'}</strong>
              <p>{message.content}</p>
              <div className="message-actions">
                <button type="button" aria-label="Copiar resposta"><Copy size={13} /></button>
                <span>{message.created_at ? new Date(message.created_at).toLocaleTimeString('pt-BR') : 'agora'}</span>
              </div>
            </article>
          ))}
          {messages.length === 0 && <div className="empty-route-state">Nenhuma mensagem nesta sessao.</div>}
        </div>
        <form className="chat-composer" onSubmit={onSubmit}>
          <button type="button" aria-label="Anexar arquivo"><Paperclip size={16} /></button>
          <textarea value={draft} onChange={(event) => onDraftChange(event.target.value)} placeholder="Digite uma mensagem para o CRONOS..." />
          <button type="button" aria-label="Interromper geracao"><Square size={16} /></button>
          <button type="submit" className="primary" aria-label="Enviar mensagem"><Send size={16} /></button>
        </form>
      </section>
      <aside className="context-panel">
        <h3>Contexto</h3>
        <p>Memorias, documentos e ferramentas consultadas aparecerao aqui em fases seguintes.</p>
        <span className="status-chip warn">Sem cadeia privada</span>
      </aside>
    </section>
  )
}
