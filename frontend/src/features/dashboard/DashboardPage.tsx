import type { FormEvent } from 'react'
import type { AppRoute, CoreState, DocumentItem, Hardware, MemorySummary, Message, RetrievalSummary } from '../../app/types'
import { DashboardHero } from './DashboardHero'
import { QuickActions } from './QuickActions'
import { AlertPanel, ActivityFeed, FutureTasksPanel, RecentConversations, RecentDocuments, RecentMemories } from './RecentPanels'
import { CoreStatusPanel, SystemSummary } from './StatusPanels'

export function DashboardPage({
  owner,
  notice,
  coreState,
  hardware,
  messages,
  memories,
  documents,
  retrieval,
  command,
  backendReady,
  online,
  version,
  submitting,
  onCommandChange,
  onSubmitCommand,
  onClearCommand,
  onNavigate,
  onLock,
  onUnavailable,
}: {
  owner: string
  notice: string
  coreState: CoreState
  hardware: Hardware | null
  messages: Message[]
  memories: MemorySummary[]
  documents: DocumentItem[]
  retrieval: RetrievalSummary
  command: string
  backendReady: boolean
  online: boolean
  version: string
  submitting: boolean
  onCommandChange: (value: string) => void
  onSubmitCommand: (event: FormEvent) => void
  onClearCommand: () => void
  onNavigate: (route: AppRoute) => void
  onLock: () => void
  onUnavailable: (message: string) => void
}) {
  return (
    <section className="dashboard-route route-page dashboard-v2" data-visual="dashboard">
      {notice && <div className="notice-line-v3">{notice}</div>}
      <DashboardHero
        owner={owner}
        coreState={coreState}
        command={command}
        backendReady={backendReady}
        submitting={submitting}
        onCommandChange={onCommandChange}
        onSubmitCommand={onSubmitCommand}
        onClearCommand={onClearCommand}
        onUnavailable={onUnavailable}
      />
      <QuickActions onNavigate={onNavigate} onLock={onLock} onUnavailable={onUnavailable} />
      <section className="dashboard-grid dashboard-grid-v2">
        <CoreStatusPanel backendReady={backendReady} retrieval={retrieval} version={version} />
        <SystemSummary hardware={hardware} backendReady={backendReady} version={version} />
        <RecentConversations messages={messages} onOpen={() => onNavigate('/chat')} />
        <RecentMemories memories={memories} onOpen={() => onNavigate('/memory')} />
        <RecentDocuments documents={documents} retrieval={retrieval} onOpen={() => onNavigate('/library')} />
        <ActivityFeed messages={messages} memories={memories} documents={documents} retrieval={retrieval} />
        <AlertPanel hardware={hardware} retrieval={retrieval} online={online} />
        <FutureTasksPanel />
      </section>
    </section>
  )
}
