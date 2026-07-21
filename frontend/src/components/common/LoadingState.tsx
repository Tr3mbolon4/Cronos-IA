export function LoadingState({ label = 'Carregando...' }: { label?: string }) {
  return (
    <div className="state-panel loading-state" aria-live="polite">
      <div className="skeleton-line" />
      <div className="skeleton-line short" />
      <span>{label}</span>
    </div>
  )
}
