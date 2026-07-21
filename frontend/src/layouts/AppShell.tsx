import type { ReactNode } from 'react'
import { BrainCircuit, Cpu, Database, HardDrive, MemoryStick, Mic } from 'lucide-react'
import type { AppRoute, CoreState, Hardware, RetrievalSummary } from '../app/types'
import { stateLabel } from '../app/stateLabels'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'

export function AppShell({
  route,
  owner,
  sidebarCompact,
  backendReady,
  online,
  retrieval,
  hardware,
  coreState,
  children,
  onNavigate,
  onToggleSidebar,
  onLock,
  version,
}: {
  route: AppRoute
  owner: string
  sidebarCompact: boolean
  backendReady: boolean
  online: boolean
  retrieval: RetrievalSummary
  hardware: Hardware | null
  coreState: CoreState
  children: ReactNode
  onNavigate: (route: AppRoute) => void
  onToggleSidebar: () => void
  onLock: () => void
  version: string
}) {
  return (
    <main className={`app-shell ${sidebarCompact ? 'compact' : ''}`}>
      <Sidebar route={route} compact={sidebarCompact} onNavigate={onNavigate} onToggle={onToggleSidebar} />
      <section className="app-workspace">
        <Topbar route={route} owner={owner} backendReady={backendReady} online={online} retrieval={retrieval} onLock={onLock} />
        <section className="route-viewport">{children}</section>
        <footer className="app-statusbar">
          <span><BrainCircuit size={12} /> {stateLabel(coreState)}</span>
          <span><Database size={12} /> SQLite</span>
          <span><Cpu size={12} /> CPU {Math.round(hardware?.cpu_percent ?? 0)}%</span>
          <span><MemoryStick size={12} /> RAM {Math.round(hardware?.ram_percent ?? 0)}%</span>
          <span><HardDrive size={12} /> {hardware?.disk_free_gb ?? 0} GB livres</span>
          <span><Mic size={12} /> Voz preparada</span>
          <span>{retrieval.provider}</span>
          <span>{version}</span>
        </footer>
      </section>
    </main>
  )
}
