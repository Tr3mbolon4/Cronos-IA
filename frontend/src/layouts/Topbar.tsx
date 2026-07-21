import { Bell, Lock, Mic, Search, UserRound, Wifi, WifiOff } from 'lucide-react'
import type { AppRoute, RetrievalSummary } from '../app/types'
import { routeTitle } from '../app/navigation'

export function Topbar({
  route,
  owner,
  backendReady,
  online,
  retrieval,
  onLock,
}: {
  route: AppRoute
  owner: string
  backendReady: boolean
  online: boolean
  retrieval: RetrievalSummary
  onLock: () => void
}) {
  return (
    <header className="app-topbar">
      <div>
        <span className="topbar-kicker">CRONOS</span>
        <h1>{routeTitle(route)}</h1>
      </div>
      <label className="global-search">
        <Search size={15} />
        <input aria-label="Busca global futura" placeholder="Busca global futura" disabled />
      </label>
      <div className="topbar-actions">
        <span className={`status-chip ${backendReady ? 'ok' : 'bad'}`}>Backend {backendReady ? 'pronto' : 'indisponivel'}</span>
        <span className={`status-chip ${retrieval.loaded ? 'ok' : 'warn'}`}>{retrieval.mode}</span>
        <button type="button" aria-label="Voz"><Mic size={16} /></button>
        <button type="button" aria-label="Notificacoes"><Bell size={16} /></button>
        <span className="owner-chip"><UserRound size={15} /> {owner}</span>
        <span aria-label={online ? 'Internet disponivel' : 'Internet offline'}>{online ? <Wifi size={16} /> : <WifiOff size={16} />}</span>
        <button type="button" className="danger" onClick={onLock}><Lock size={15} /> Bloquear</button>
      </div>
    </header>
  )
}
