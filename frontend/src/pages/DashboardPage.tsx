import type { FormEvent } from 'react'
import { BookOpen, BrainCircuit, FileText, FolderOpen, Mic, Plus, Send, Shield, Sparkles } from 'lucide-react'
import type { CoreState, DocumentItem, Hardware, Message, RetrievalSummary } from '../app/types'
import type { AppRoute } from '../app/types'
import { CronosCore } from '../components/core/CronosCore'

export function DashboardPage({
  owner,
  notice,
  coreState,
  hardware,
  messages,
  documents,
  retrieval,
  command,
  onCommandChange,
  onSubmitCommand,
  onNavigate,
  onSetCoreState,
}: {
  owner: string
  notice: string
  coreState: CoreState
  hardware: Hardware | null
  messages: Message[]
  documents: DocumentItem[]
  retrieval: RetrievalSummary
  command: string
  onCommandChange: (value: string) => void
  onSubmitCommand: (event: FormEvent) => void
  onNavigate: (route: AppRoute) => void
  onSetCoreState: (state: CoreState) => void
}) {
  return (
    <section className="dashboard-route route-page" data-visual="dashboard">
      {notice && <div className="notice-line-v3">{notice}</div>}
      <section className="dashboard-hero">
        <div className="hero-copy">
          <span>Nucleo local privado</span>
          <h2>Boa tarde, {owner}.</h2>
          <p>Escolha um modulo ou envie um comando direto para o CRONOS.</p>
          <form className="command-box" onSubmit={onSubmitCommand}>
            <input value={command} onChange={(event) => onCommandChange(event.target.value)} placeholder="Digite uma tarefa, pergunta ou comando..." />
            <button type="submit" aria-label="Enviar comando"><Send size={16} /></button>
          </form>
          <div className="hero-actions">
            <button type="button" onClick={() => onSetCoreState('listening')}><Mic size={15} /> Falar</button>
            <button type="button" onClick={() => onNavigate('/chat')}><Sparkles size={15} /> Nova conversa</button>
            <button type="button" onClick={() => onNavigate('/library')}><FileText size={15} /> Abrir biblioteca</button>
            <button type="button" onClick={() => onNavigate('/memory')}><Plus size={15} /> Criar memoria</button>
          </div>
        </div>
        <div className="hero-core">
          <CronosCore state={coreState} />
        </div>
      </section>

      <section className="dashboard-grid">
        <article className="panel-card">
          <h3><BrainCircuit size={15} /> Estado do CRONOS</h3>
          <MetricLine label="Backend" value="Pronto" tone="ok" />
          <MetricLine label="Banco" value="Ready" tone="ok" />
          <MetricLine label="Retrieval" value={retrieval.mode} tone={retrieval.loaded ? 'ok' : 'warn'} />
          <MetricLine label="Microfone" value="Manual" tone="warn" />
        </article>
        <article className="panel-card">
          <h3><Sparkles size={15} /> Ultimas conversas</h3>
          {messages.slice(-3).map((message, index) => <p key={`${message.role}-${message.id || index}`}>{message.role === 'user' ? 'Voce' : 'CRONOS'}: {message.content.slice(0, 90)}</p>)}
          {messages.length === 0 && <p>Nenhuma conversa recente.</p>}
        </article>
        <article className="panel-card">
          <h3><BookOpen size={15} /> Documentos recentes</h3>
          {documents.slice(0, 4).map((document) => <p key={document.id}>{document.filename}</p>)}
          {documents.length === 0 && <p>Nenhum documento importado.</p>}
        </article>
        <article className="panel-card">
          <h3><Shield size={15} /> Recursos do computador</h3>
          <MetricBar label="CPU" value={hardware?.cpu_percent ?? 0} />
          <MetricBar label="RAM" value={hardware?.ram_percent ?? 0} />
          <MetricBar label="Disco" value={hardware?.disk_percent ?? 0} />
        </article>
        <article className="panel-card wide">
          <h3><FolderOpen size={15} /> Atalhos operacionais</h3>
          <div className="shortcut-grid">
            <button type="button" onClick={() => onNavigate('/projects')}>Projetos</button>
            <button type="button" onClick={() => onNavigate('/learning')}>Aprendizado</button>
            <button type="button" onClick={() => onNavigate('/tools')}>Ferramentas</button>
            <button type="button" onClick={() => onNavigate('/system')}>Sistema</button>
            <button type="button" onClick={() => onNavigate('/settings')}>Configuracoes</button>
            <button type="button" onClick={() => onNavigate('/security')}>Seguranca</button>
          </div>
        </article>
      </section>
    </section>
  )
}

function MetricLine({ label, value, tone }: { label: string; value: string; tone: 'ok' | 'warn' }) {
  return <div className="metric-line"><span>{label}</span><strong className={tone}>{value}</strong></div>
}

function MetricBar({ label, value }: { label: string; value: number }) {
  const safeValue = Math.max(0, Math.min(100, Math.round(value)))
  return (
    <div className="metric-bar">
      <div><span>{label}</span><strong>{safeValue}%</strong></div>
      <meter min="0" max="100" value={safeValue} />
    </div>
  )
}
