import { AlertTriangle, Clock3, FileText, MessageSquare, Network, Sparkles } from 'lucide-react'
import type { DashboardActivity, DocumentItem, MemorySummary, Message, RetrievalSummary } from '../../app/types'
import { buildActivities, dashboardAlerts, recentConversationItems, trimText } from './dashboardUtils'

export function RecentConversations({ messages, onOpen }: { messages: Message[]; onOpen: () => void }) {
  const items = recentConversationItems(messages)
  return (
    <article className="dashboard-panel">
      <h3><MessageSquare size={15} /> Conversas recentes</h3>
      <div className="compact-list">
        {items.map((item) => (
          <button type="button" key={item.id} onClick={onOpen}>
            <strong>{item.title}</strong>
            <span>{item.excerpt}</span>
            <small>{item.time}</small>
          </button>
        ))}
        {!items.length && <p className="empty-inline">Nenhuma conversa recente.</p>}
      </div>
    </article>
  )
}

export function RecentMemories({ memories, onOpen }: { memories: MemorySummary[]; onOpen: () => void }) {
  return (
    <article className="dashboard-panel">
      <h3><Sparkles size={15} /> Memorias recentes</h3>
      <div className="compact-list">
        {memories.slice(0, 4).map((memory) => (
          <button type="button" key={memory.id} onClick={onOpen}>
            <strong>{trimText(memory.title, 72)}</strong>
            <span>{memory.status || 'active'}</span>
            <small>{memory.updated_at ? new Date(memory.updated_at).toLocaleDateString('pt-BR') : '--'}</small>
          </button>
        ))}
        {!memories.length && <p className="empty-inline">Nenhuma memoria recente.</p>}
      </div>
    </article>
  )
}

export function RecentDocuments({ documents, retrieval, onOpen }: { documents: DocumentItem[]; retrieval: RetrievalSummary; onOpen: () => void }) {
  return (
    <article className="dashboard-panel">
      <h3><FileText size={15} /> Documentos recentes</h3>
      <div className="compact-list">
        {documents.slice(0, 4).map((document) => (
          <button type="button" key={document.id} onClick={onOpen}>
            <strong>{trimText(document.filename, 70)}</strong>
            <span>PDF | {retrieval.mode}</span>
            <small>{document.created_at ? new Date(document.created_at).toLocaleDateString('pt-BR') : '--'}</small>
          </button>
        ))}
        {!documents.length && <p className="empty-inline">Nenhum documento recente.</p>}
      </div>
    </article>
  )
}

export function ActivityFeed({ messages, memories, documents, retrieval }: { messages: Message[]; memories: MemorySummary[]; documents: DocumentItem[]; retrieval: RetrievalSummary }) {
  const activities = buildActivities({ messages, memories, documents, retrieval })
  return (
    <article className="dashboard-panel">
      <h3><Clock3 size={15} /> Atividade recente</h3>
      <div className="activity-feed">
        {activities.map((activity) => <ActivityItem key={activity.id} activity={activity} />)}
      </div>
    </article>
  )
}

export function AlertPanel({ hardware, retrieval, online }: { hardware: Parameters<typeof dashboardAlerts>[0]['hardware']; retrieval: RetrievalSummary; online: boolean }) {
  const alerts = dashboardAlerts({ hardware, retrieval, online })
  return (
    <article className="dashboard-panel alerts-panel">
      <h3><AlertTriangle size={15} /> Alertas</h3>
      <div className="activity-feed">
        {alerts.map((alert) => <ActivityItem key={alert.title} activity={{ id: alert.title, title: alert.title, detail: alert.detail, tone: alert.tone }} />)}
      </div>
    </article>
  )
}

export function FutureTasksPanel() {
  return (
    <article className="dashboard-panel future-panel">
      <h3><Network size={15} /> Tarefas e automacoes futuras</h3>
      <p>Espaco reservado para filas, autorizacoes e automacoes aprovadas pelo proprietario.</p>
      <span className="status-chip warn">Nao automatizado nesta fase</span>
    </article>
  )
}

function ActivityItem({ activity }: { activity: DashboardActivity }) {
  return (
    <div className={`activity-item ${activity.tone}`}>
      <strong>{activity.title}</strong>
      <span>{activity.detail}</span>
    </div>
  )
}
