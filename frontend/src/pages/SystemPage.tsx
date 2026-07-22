import { useEffect, useState } from 'react'
import { Activity, Clipboard, Cpu, Database, FolderOpen, HardDrive, Network } from 'lucide-react'
import type { Hardware, RetrievalSummary, RuntimeIdentity } from '../app/types'
import { BaseModulePage, PlaceholderPanel } from './BaseModulePage'
import type { ApiClient } from '../services/apiClient'

export function SystemPage({
  hardware,
  retrieval,
  apiBaseUrl,
  client,
}: {
  hardware: Hardware | null
  retrieval: RetrievalSummary
  apiBaseUrl: string
  client: ApiClient
}) {
  const [identity, setIdentity] = useState<RuntimeIdentity | null>(null)
  const [identityError, setIdentityError] = useState('')

  useEffect(() => {
    let cancelled = false
    client.get<RuntimeIdentity>('/runtime/identity')
      .then((result) => {
        if (!cancelled) {
          setIdentity(result)
          setIdentityError('')
        }
      })
      .catch((error) => {
        if (!cancelled) setIdentityError(error instanceof Error ? error.message : 'Identidade da build indisponivel.')
      })
    return () => {
      cancelled = true
    }
  }, [client])

  return (
    <BaseModulePage title="Sistema" description="Diagnostico seguro do runtime, hardware e provider local." icon={<Activity size={24} />}>
      <PlaceholderPanel title="Hardware">
        CPU {Math.round(hardware?.cpu_percent ?? 0)}%, RAM {Math.round(hardware?.ram_percent ?? 0)}%, disco {Math.round(hardware?.disk_percent ?? 0)}%.
      </PlaceholderPanel>
      <PlaceholderPanel title="Identidade da build">
        {identity ? (
          <dl className="diagnostic-grid">
            <div><dt>Versao</dt><dd>{identity.appVersion}</dd></div>
            <div><dt>Commit</dt><dd>{identity.gitCommit}</dd></div>
            <div><dt>Build</dt><dd>{identity.buildTimestamp}</dd></div>
            <div><dt>Build ID</dt><dd>{identity.buildId}</dd></div>
            <div><dt>Backend PID</dt><dd>{identity.backendPid}</dd></div>
            <div><dt>Ambiente</dt><dd>{identity.environment}</dd></div>
            <div><dt>Fallback</dt><dd>{identity.fallbackEnabled ? 'ativado' : 'desativado'}</dd></div>
            <div><dt>Provider</dt><dd>{identity.provider}</dd></div>
            <div><dt>Modelo</dt><dd>{identity.model}</dd></div>
            <div><dt>Provider pronto</dt><dd>{identity.providerReady ? 'sim' : 'nao'}</dd></div>
            <div><dt>Backend</dt><dd>{identity.backendExecutable}</dd></div>
            <div><dt>Resources</dt><dd>{identity.resourceDir}</dd></div>
            <div><dt>Dados</dt><dd>{identity.dataDir}</dd></div>
          </dl>
        ) : identityError ? identityError : 'Carregando identidade da build...'}
      </PlaceholderPanel>
      <PlaceholderPanel title="Runtime">
        Backend em {apiBaseUrl}. Porta dinamica e token de runtime nao sao exibidos.
      </PlaceholderPanel>
      <PlaceholderPanel title="Provider semantico">
        {retrieval.provider}, modo {retrieval.mode}, carregado: {retrieval.loaded ? 'sim' : 'nao'}.
      </PlaceholderPanel>
      <div className="action-row">
        <button type="button"><Clipboard size={15} /> Copiar diagnostico</button>
        <button type="button"><FolderOpen size={15} /> Abrir logs</button>
        <button type="button"><Network size={15} /> Verificar saude</button>
        <button type="button"><Cpu size={15} /> Hardware</button>
        <button type="button"><Database size={15} /> Banco</button>
        <button type="button"><HardDrive size={15} /> Dados</button>
      </div>
    </BaseModulePage>
  )
}
