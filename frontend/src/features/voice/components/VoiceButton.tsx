import { Mic, Square, X } from 'lucide-react'
import type { VoiceController } from '../types'

export function VoiceButton({ voice, label = 'Falar', compact = false }: { voice: VoiceController; label?: string; compact?: boolean }) {
  const disabled = !voice.settings.enabled || voice.state === 'unavailable'
  const active = voice.state === 'recording' || voice.state === 'requesting_permission'
  const processing = voice.state === 'transcribing'
  const errored = voice.state === 'error'
  const buttonLabel = active ? 'Gravando' : processing ? 'Processando' : errored ? 'Erro' : label
  return (
    <div className={`voice-button-wrap ${compact ? 'compact' : ''}`} data-visual="voice-button">
      <button
        type="button"
        className={`voice-button ${active ? 'recording' : ''} ${processing ? 'processing' : ''} ${errored ? 'error' : ''}`}
        disabled={disabled || processing}
        aria-pressed={active}
        aria-label={active ? 'Parar captura de voz' : buttonLabel}
        onClick={() => active ? voice.stopPushToTalk() : voice.startPushToTalk()}
        title={buttonLabel}
      >
        {active ? <Square size={16} /> : <Mic size={16} />}
        {!compact && buttonLabel}
      </button>
      {active && <button type="button" className="voice-cancel" aria-label="Cancelar voz" onClick={voice.cancelVoice}><X size={14} /></button>}
      {!compact && <span className="voice-state-label">{voice.settings.enabled ? buttonLabel : 'voz desligada'}</span>}
    </div>
  )
}
