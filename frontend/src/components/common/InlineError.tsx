export function InlineError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  if (!message) return null
  return (
    <div className="state-panel error-state" role="alert">
      <strong>Algo saiu do esperado</strong>
      <p>{message}</p>
      {onRetry && <button type="button" onClick={onRetry}>Tentar novamente</button>}
    </div>
  )
}
