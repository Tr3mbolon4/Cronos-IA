import {
  Bell,
  BookOpen,
  BrainCircuit,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  Gauge,
  Home,
  Library,
  MessageSquare,
  Settings,
  Shield,
  SlidersHorizontal,
  Wrench,
} from 'lucide-react'
import type { AppRoute } from '../app/types'

const items = [
  { label: 'Dashboard', route: '/dashboard', icon: Home },
  { label: 'Conversas', route: '/chat', icon: MessageSquare },
  { label: 'Memoria', route: '/memory', icon: BrainCircuit },
  { label: 'Biblioteca', route: '/library', icon: Library },
  { label: 'Projetos', route: '/projects', icon: FolderOpen },
  { label: 'Aprendizado', route: '/learning', icon: BookOpen },
  { label: 'Ferramentas', route: '/tools', icon: Wrench },
  { label: 'Sistema', route: '/system', icon: Gauge },
  { label: 'Configuracoes', route: '/settings', icon: Settings },
  { label: 'Seguranca', route: '/security', icon: Shield },
] as const

export function Sidebar({
  route,
  compact,
  onNavigate,
  onToggle,
}: {
  route: AppRoute
  compact: boolean
  onNavigate: (route: AppRoute) => void
  onToggle: () => void
}) {
  return (
    <aside className={`app-sidebar ${compact ? 'compact' : ''}`} aria-label="Navegacao principal">
      <div className="sidebar-brand">
        <div className="brand-mark" />
        {!compact && (
          <div>
            <strong>CRONOS</strong>
            <span>Local Intelligence</span>
          </div>
        )}
      </div>
      <nav className="sidebar-nav">
        {items.map(({ label, route: itemRoute, icon: Icon }) => (
          <button
            type="button"
            key={itemRoute}
            className={route === itemRoute ? 'active' : ''}
            title={compact ? label : undefined}
            aria-label={label}
            onClick={() => onNavigate(itemRoute)}
          >
            <Icon size={17} />
            {!compact && <span>{label}</span>}
          </button>
        ))}
      </nav>
      <div className="sidebar-footer">
        <button type="button" title={compact ? 'Alternar menu' : undefined} onClick={onToggle}>
          {compact ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          {!compact && <span>Compactar</span>}
        </button>
        <div className="sidebar-status" title="Preferencias e notificacoes">
          <SlidersHorizontal size={14} />
          {!compact && <span>Preferencias salvas</span>}
          <Bell size={14} />
        </div>
      </div>
    </aside>
  )
}
