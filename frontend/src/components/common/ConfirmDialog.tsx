import type { ReactNode } from 'react'

export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  busy,
  onConfirm,
  onCancel,
}: {
  title: string
  description: ReactNode
  confirmLabel: string
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <h2 id="confirm-title">{title}</h2>
        <div className="modal-description">{description}</div>
        <div className="modal-actions">
          <button type="button" onClick={onCancel} disabled={busy}>Cancelar</button>
          <button type="button" className="danger" onClick={onConfirm} disabled={busy}>{busy ? 'Processando...' : confirmLabel}</button>
        </div>
      </section>
    </div>
  )
}
