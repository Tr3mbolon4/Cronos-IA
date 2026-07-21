import type { FormEvent } from 'react'
import { Keyboard, Paperclip, Send, X } from 'lucide-react'
import { VoiceButton } from '../voice/components/VoiceButton'
import { TranscriptionReview } from '../voice/components/TranscriptionReview'
import type { VoiceController } from '../voice/types'

export function CommandComposer({
  value,
  backendReady,
  submitting,
  onChange,
  onSubmit,
  onClear,
  onUnavailable,
  voice,
}: {
  value: string
  backendReady: boolean
  submitting: boolean
  onChange: (value: string) => void
  onSubmit: (event: FormEvent) => void
  onClear: () => void
  onUnavailable: (message: string) => void
  voice: VoiceController
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
          <VoiceButton voice={voice} label="Falar" />
          <button type="button" title="Anexos pelo Dashboard serao refinados em fase futura" onClick={() => onUnavailable('Para importar documentos agora, use Biblioteca.')}>
            <Paperclip size={15} />
          </button>
          {value && <button type="button" title="Limpar comando" onClick={onClear}><X size={15} /></button>}
        </div>
      </div>
      <footer>
        <span><Keyboard size={13} /> Voz opcional. Revise a transcricao antes de enviar.</span>
        <button type="submit" className="primary" disabled={!backendReady || submitting || !value.trim()}>
          <Send size={15} /> {submitting ? 'Enviando...' : 'Enviar e abrir chat'}
        </button>
      </footer>
      <TranscriptionReview voice={voice} onUseText={onChange} onSend={(text) => { onChange(text); setTimeout(() => document.querySelector<HTMLButtonElement>('.dashboard-command button[type="submit"]')?.click(), 0) }} />
    </form>
  )
}
