import type { FormEvent } from 'react'
import type { CoreState } from '../../app/types'
import { coreStateMeta, stateIcon } from '../../app/coreState'
import { CronosCore } from '../../components/core/CronosCore'
import { greetingFor } from './dashboardUtils'
import { CommandComposer } from './CommandComposer'
import type { VoiceController } from '../voice/types'

export function DashboardHero({
  owner,
  coreState,
  command,
  backendReady,
  submitting,
  voice,
  onCommandChange,
  onSubmitCommand,
  onClearCommand,
  onUnavailable,
}: {
  owner: string
  coreState: CoreState
  command: string
  backendReady: boolean
  submitting: boolean
  voice: VoiceController
  onCommandChange: (value: string) => void
  onSubmitCommand: (event: FormEvent) => void
  onClearCommand: () => void
  onUnavailable: (message: string) => void
}) {
  const meta = coreStateMeta[coreState]
  const Icon = stateIcon(coreState)
  return (
    <section className="dashboard-command-center">
      <div className="hero-copy">
        <span className="hero-eyebrow">Inteligencia local privada</span>
        <h2>{greetingFor()}, {owner || 'bem-vindo'}.</h2>
        <p>O nucleo CRONOS esta {meta.label.toLowerCase()}.</p>
        <div className="core-state-badge">
          <Icon size={15} />
          <strong>{meta.label}</strong>
          <span>{meta.description}</span>
        </div>
        <CommandComposer
          value={command}
          backendReady={backendReady}
          submitting={submitting}
          voice={voice}
          onChange={onCommandChange}
          onSubmit={onSubmitCommand}
          onClear={onClearCommand}
          onUnavailable={onUnavailable}
        />
      </div>
      <div className="hero-core" data-visual="cronos-core">
        <CronosCore state={coreState} showLabel />
      </div>
    </section>
  )
}
