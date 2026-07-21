import { Archive, KeyRound, Lock, Shield, UserRound } from 'lucide-react'
import { BaseModulePage, PlaceholderPanel } from './BaseModulePage'

export function SecurityPage({ owner, onBackup, onLock }: { owner: string; onBackup: () => void; onLock: () => void }) {
  return (
    <BaseModulePage title="Seguranca" description="Autenticacao preservada, auditoria segura e acoes criticas confirmadas." icon={<Shield size={24} />}>
      <PlaceholderPanel title="Proprietario">
        <UserRound size={14} /> {owner}. Hashes, salts e tokens permanecem ocultos.
      </PlaceholderPanel>
      <PlaceholderPanel title="Sessao">
        Sessao ativa no dispositivo atual. O bloqueio exige PIN para retorno.
      </PlaceholderPanel>
      <PlaceholderPanel title="Permissoes de voz">
        Microfone e palavra de ativacao ficam desligados por padrao ate configuracao explicita.
      </PlaceholderPanel>
      <div className="action-row">
        <button type="button" onClick={onBackup}><Archive size={15} /> Criar backup</button>
        <button type="button"><KeyRound size={15} /> Alterar PIN futuramente</button>
        <button type="button" className="danger" onClick={onLock}><Lock size={15} /> Bloquear agora</button>
      </div>
    </BaseModulePage>
  )
}
