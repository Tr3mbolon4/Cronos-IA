import { Activity, BrainCircuit, Cpu, Database, Lock, Mic, Server, ShieldCheck, Volume2 } from 'lucide-react'
import type { Hardware, RetrievalSummary } from '../../app/types'

export function CoreStatusPanel({
  backendReady,
  retrieval,
  version,
}: {
  backendReady: boolean
  retrieval: RetrievalSummary
  version: string
}) {
  return (
    <article className="dashboard-panel core-status-panel">
      <h3><BrainCircuit size={15} /> Status do nucleo</h3>
      <StatusRow icon={<Server size={14} />} label="Backend" value={backendReady ? 'Pronto' : 'Indisponivel'} tone={backendReady ? 'ok' : 'bad'} />
      <StatusRow icon={<Database size={14} />} label="Banco" value={backendReady ? 'Ready' : 'Carregando'} tone={backendReady ? 'ok' : 'warn'} />
      <StatusRow icon={<ShieldCheck size={14} />} label="Provider" value={retrieval.provider} tone={retrieval.loaded ? 'ok' : 'warn'} />
      <StatusRow icon={<Activity size={14} />} label="Retrieval" value={retrieval.mode} tone={retrieval.loaded ? 'ok' : 'warn'} />
      <StatusRow icon={<Mic size={14} />} label="Microfone" value="Fase 5" tone="neutral" />
      <StatusRow icon={<Volume2 size={14} />} label="Voz" value="Fase 5" tone="neutral" />
      <StatusRow icon={<Lock size={14} />} label="Sessao" value="Autenticada" tone="ok" />
      <StatusRow icon={<BrainCircuit size={14} />} label="Versao" value={version} tone="neutral" />
    </article>
  )
}

export function SystemSummary({ hardware, backendReady, version }: { hardware: Hardware | null; backendReady: boolean; version: string }) {
  return (
    <article className="dashboard-panel system-summary-panel">
      <h3><Cpu size={15} /> Resumo do sistema</h3>
      <MetricBar label="CPU" value={hardware?.cpu_percent ?? 0} />
      <MetricBar label="RAM" value={hardware?.ram_percent ?? 0} />
      <MetricBar label="Disco" value={hardware?.disk_percent ?? 0} />
      <div className="system-mini-grid">
        <span>Backend<strong>{backendReady ? 'pronto' : 'offline'}</strong></span>
        <span>Windows<strong>{hardware?.release || '--'}</strong></span>
        <span>Perfil<strong>{hardware?.recommended_profile || '--'}</strong></span>
        <span>Versao<strong>{version}</strong></span>
      </div>
    </article>
  )
}

function StatusRow({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: 'ok' | 'warn' | 'bad' | 'neutral' }) {
  return <div className={`status-row ${tone}`}><span>{icon}{label}</span><strong>{value}</strong></div>
}

function MetricBar({ label, value }: { label: string; value: number }) {
  const safeValue = Math.max(0, Math.min(100, Math.round(value)))
  return (
    <div className="metric-bar dashboard-metric">
      <div><span>{label}</span><strong>{safeValue}%</strong></div>
      <meter min="0" max="100" value={safeValue} />
    </div>
  )
}
