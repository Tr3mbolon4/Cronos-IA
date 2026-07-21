import type { CoreState } from '../../app/types'
import { coreStateMeta, stateDescription, stateLabel } from '../../app/coreState'

export function CronosCore({ state, compact = false, showLabel = false }: { state: CoreState; compact?: boolean; showLabel?: boolean }) {
  const meta = coreStateMeta[state]
  return (
    <figure
      className={`cronos-core-v3 ${state} tone-${meta.tone} ${compact ? 'compact' : ''}`}
      role="img"
      aria-label={`Cronos Core: ${stateLabel(state)}. ${stateDescription(state)}`}
      data-core-state={state}
    >
      <svg className="core-glyph" viewBox="0 0 240 240" aria-hidden="true">
        <defs>
          <radialGradient id={`coreGlow-${state}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="currentColor" stopOpacity=".95" />
            <stop offset="36%" stopColor="currentColor" stopOpacity=".32" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle className="core-halo" cx="120" cy="120" r="98" />
        <path className="core-temporal-mark" d="M120 20 A100 100 0 0 1 220 120 M120 220 A100 100 0 0 1 20 120" />
        <ellipse className="core-iris iris-a" cx="120" cy="120" rx="78" ry="52" />
        <ellipse className="core-iris iris-b" cx="120" cy="120" rx="52" ry="78" />
        <circle className="core-ring-svg ring-outer" cx="120" cy="120" r="74" />
        <circle className="core-ring-svg ring-middle" cx="120" cy="120" r="46" />
        <circle className="core-ring-svg ring-inner" cx="120" cy="120" r="23" />
        <circle className="core-pupil" cx="120" cy="120" r="10" />
        <g className="core-particles">
          <circle cx="48" cy="120" r="2.4" />
          <circle cx="72" cy="84" r="1.8" />
          <circle cx="168" cy="84" r="1.8" />
          <circle cx="192" cy="120" r="2.4" />
          <circle cx="72" cy="156" r="1.8" />
          <circle cx="168" cy="156" r="1.8" />
        </g>
      </svg>
      <div className="core-wave left" />
      <div className="core-wave right" />
      {showLabel && (
        <figcaption className="core-caption">
          <strong>{meta.label}</strong>
          <span>{meta.description}</span>
        </figcaption>
      )}
    </figure>
  )
}
