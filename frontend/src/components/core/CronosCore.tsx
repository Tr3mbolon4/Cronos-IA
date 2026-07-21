import type { CoreState } from '../../app/types'
import { stateLabel } from '../../app/stateLabels'

export function CronosCore({ state, compact = false }: { state: CoreState; compact?: boolean }) {
  return (
    <div className={`cronos-core-v3 ${state} ${compact ? 'compact' : ''}`} aria-label={`Estado do CRONOS: ${stateLabel(state)}`}>
      <div className="core-wave left" />
      <div className="core-wave right" />
      <div className="core-orbit orbit-a" />
      <div className="core-orbit orbit-b" />
      <div className="core-orbit orbit-c" />
      <div className="core-eye" />
    </div>
  )
}
