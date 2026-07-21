import type { FormEvent } from 'react'
import { Keyboard, Mic, Paperclip, Send, X } from 'lucide-react'

export function CommandComposer({
  value,
  backendReady,
  submitting,
  onChange,
  onSubmit,
  onClear,
  onUnavailable,
}: {
  value: string
  backendReady: boolean
  submitting: boolean
  onChange: (value: string) => void
  onSubmit: (event: FormEvent) => void
  onClear: () => void
  onUnavailable: (message: string) => void
}) {
  return (
    <form className="dashboard-command" onSubmit={onSubmit}>
      <label htmlFor="dashboard-command-input">Comando principal</label>
      <div className="dashboard-command-box">
        <textarea
          id="dashboard-command-input"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Digite uma pergunta, pedido ou tarefa para o CRONOS..."
          disabled={!backendReady || submitting}
          rows={3}
        />
        <div className="command-side-actions">
          <button type="button" title="Entrada de voz sera ativada na Fase 5" onClick={() => onUnavailable('Entrada de voz sera implementada na Fase 5.')}>
            <Mic size={15} />
          </button>
          <button type="button" title="Anexos pelo Dashboard serao refinados em fase futura" onClick={() => onUnavailable('Para importar documentos agora, use Biblioteca.')}>
            <Paperclip size={15} />
          </button>
          {value && <button type="button" title="Limpar comando" onClick={onClear}><X size={15} /></button>}
        </div>
      </div>
      <footer>
        <span><Keyboard size={13} /> Enter envia pela tecla do botao. Voz ainda nao esta funcional.</span>
        <button type="submit" className="primary" disabled={!backendReady || submitting || !value.trim()}>
          <Send size={15} /> {submitting ? 'Enviando...' : 'Enviar e abrir chat'}
        </button>
      </footer>
    </form>
  )
}
