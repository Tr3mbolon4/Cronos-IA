import type { FormEvent } from 'react'
import { LogIn } from 'lucide-react'
import type { SetupStatus, StartupError } from './types'
import { startupMessage } from './startup'
import { CronosCore } from '../components/core/CronosCore'

export function LockedScreen({
  setup,
  ownerName,
  password,
  pin,
  loginError,
  submitting,
  onOwnerNameChange,
  onPasswordChange,
  onPinChange,
  onSubmit,
}: {
  setup: SetupStatus
  ownerName: string
  password: string
  pin: string
  loginError: string
  submitting: boolean
  onOwnerNameChange: (value: string) => void
  onPasswordChange: (value: string) => void
  onPinChange: (value: string) => void
  onSubmit: (event: FormEvent) => void
}) {
  return (
    <main className="auth-screen">
      <section className="auth-core-panel">
        <CronosCore state={setup.configured ? 'locked' : 'offline'} />
        <form className="auth-panel-v3" onSubmit={onSubmit}>
          <span>CRONOS</span>
          <h1>{setup.configured ? 'Autorizacao do proprietario' : 'Primeira configuracao'}</h1>
          {!setup.configured && (
            <label>
              Nome do proprietario
              <input value={ownerName} onChange={(event) => onOwnerNameChange(event.target.value)} required />
            </label>
          )}
          <label>
            Senha principal
            <input type="password" value={password} onChange={(event) => onPasswordChange(event.target.value)} required />
          </label>
          <label>
            PIN
            <input inputMode="numeric" value={pin} onChange={(event) => onPinChange(event.target.value)} required />
          </label>
          {setup.configured && loginError && <p className="auth-error" role="alert">{loginError}</p>}
          <button type="submit" className="primary" disabled={setup.configured && submitting}>
            <LogIn size={14} /> {setup.configured ? (submitting ? 'Entrando...' : 'Entrar') : 'Criar proprietario'}
          </button>
        </form>
      </section>
    </main>
  )
}

export function StartupErrorScreen({
  error,
  onRetry,
  onOpenLogs,
  onClose,
}: {
  error: StartupError
  onRetry: () => void
  onOpenLogs: () => void
  onClose: () => void
}) {
  return (
    <main className="startup-error">
      <section className="startup-error-panel">
        <div className="brand-mark alert-core" />
        <span>{error.code}</span>
        <h1>Nao foi possivel iniciar o CRONOS</h1>
        <p>O nucleo local nao respondeu dentro do tempo esperado.</p>
        <details>
          <summary>Mostrar detalhes tecnicos</summary>
          <code>{error.detail || startupMessage(error.phase)}</code>
        </details>
        <div className="startup-actions">
          <button type="button" className="primary" onClick={onRetry}>Tentar novamente</button>
          <button type="button" onClick={onOpenLogs}>Abrir pasta de logs</button>
          <button type="button" className="danger" onClick={onClose}>Fechar CRONOS</button>
        </div>
      </section>
    </main>
  )
}
