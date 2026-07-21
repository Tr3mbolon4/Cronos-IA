import { Activity, Clipboard, Cpu, Database, FolderOpen, HardDrive, Network } from 'lucide-react'
import type { Hardware, RetrievalSummary } from '../app/types'
import { BaseModulePage, PlaceholderPanel } from './BaseModulePage'

export function SystemPage({ hardware, retrieval, apiBaseUrl }: { hardware: Hardware | null; retrieval: RetrievalSummary; apiBaseUrl: string }) {
  return (
    <BaseModulePage title="Sistema" description="Diagnostico seguro do runtime, hardware e provider local." icon={<Activity size={24} />}>
      <PlaceholderPanel title="Hardware">
        CPU {Math.round(hardware?.cpu_percent ?? 0)}%, RAM {Math.round(hardware?.ram_percent ?? 0)}%, disco {Math.round(hardware?.disk_percent ?? 0)}%.
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
