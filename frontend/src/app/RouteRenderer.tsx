import type { FormEvent } from 'react'
import type { AppRoute, CoreState, DocumentItem, Hardware, MemorySummary, Message, RetrievalSummary } from './types'
import type { ApiClient } from '../services/apiClient'
import { DashboardPage } from '../features/dashboard/DashboardPage'
import { ChatPage } from '../features/chat/ChatPage'
import type { useChatWorkspace } from '../features/chat/useChatWorkspace'
import { LibraryPage } from '../pages/LibraryPage'
import { MemoryPage } from '../pages/MemoryPage'
import { SecurityPage } from '../pages/SecurityPage'
import { SettingsPage } from '../pages/SettingsPage'
import { ProjectsPage, LearningPage, NotFoundPage, ToolsPage } from '../pages/StaticModulePages'
import { SystemPage } from '../pages/SystemPage'

type ChatWorkspace = ReturnType<typeof useChatWorkspace>

export function RouteRenderer({
  route,
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
  commandSubmitting,
  chat,
  apiClient,
  reducedMotion,
  onCommandChange,
  onSubmitCommand,
  onClearCommand,
  onNavigate,
  onLock,
  onUnavailable,
  onBackup,
  onNotice,
  onReducedMotionChange,
}: {
  route: AppRoute
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
  commandSubmitting: boolean
  chat: ChatWorkspace
  apiClient: ApiClient
  reducedMotion: boolean
  onCommandChange: (value: string) => void
  onSubmitCommand: (event: FormEvent) => void
  onClearCommand: () => void
  onNavigate: (route: AppRoute) => void
  onLock: () => void
  onUnavailable: (message: string) => void
  onBackup: () => void
  onNotice: (message: string) => void
  onReducedMotionChange: (value: boolean) => void
}) {
  if (route === '/dashboard') {
    return (
      <DashboardPage
        owner={owner}
        notice={notice}
        coreState={coreState}
        hardware={hardware}
        messages={messages}
        memories={memories}
        documents={documents}
        retrieval={retrieval}
        command={command}
        backendReady={backendReady}
        online={online}
        version={version}
        submitting={commandSubmitting}
        onCommandChange={onCommandChange}
        onSubmitCommand={onSubmitCommand}
        onClearCommand={onClearCommand}
        onNavigate={onNavigate}
        onLock={onLock}
        onUnavailable={onUnavailable}
      />
    )
  }
  if (route === '/chat') {
    return (
      <ChatPage
        {...chat}
        coreState={coreState}
        owner={owner}
        backendReady={backendReady}
        retrieval={retrieval}
        documents={documents}
        onOpenLibrary={() => onNavigate('/library')}
        onLock={onLock}
      />
    )
  }
  if (route === '/memory') return <MemoryPage client={apiClient} onNotice={onNotice} />
  if (route === '/library') return <LibraryPage client={apiClient} onNotice={onNotice} />
  if (route === '/projects') return <ProjectsPage />
  if (route === '/learning') return <LearningPage />
  if (route === '/tools') return <ToolsPage />
  if (route === '/system') return <SystemPage hardware={hardware} retrieval={retrieval} apiBaseUrl={apiClient.baseUrlForDisplay()} />
  if (route === '/settings') return <SettingsPage reducedMotion={reducedMotion} onReducedMotionChange={onReducedMotionChange} />
  if (route === '/security') return <SecurityPage owner={owner} onBackup={onBackup} onLock={onLock} />
  return <NotFoundPage />
}
