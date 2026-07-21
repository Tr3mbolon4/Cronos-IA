import { Mic, Square, X } from 'lucide-react'
import type { VoiceController } from '../types'

export function VoiceButton({ voice, label = 'Falar' }: { voice: VoiceController; label?: string }) {
  const disabled = !voice.settings.enabled || voice.state === 'unavailable'
  const active = voice.state === 'recording' || voice.state === 'requesting_permission'
  return (
    <div className="voice-button-wrap" data-visual="voice-button">
      <button
        type="button"
        className={`voice-button ${active ? 'recording' : ''}`}
        disabled={disabled}
        aria-pressed={active}
        aria-label={active ? 'Parar captura de voz' : label}
        onClick={() => active ? voice.stopPushToTalk() : voice.startPushToTalk()}
      >
        {active ? <Square size={16} /> : <Mic size={16} />}
        {active ? 'Parar' : label}
      </button>
      {active && <button type="button" className="voice-cancel" aria-label="Cancelar voz" onClick={voice.cancelVoice}><X size={14} /></button>}
      <span className="voice-state-label">{voice.settings.enabled ? voice.state : 'voz desligada'}</span>
    </div>
  )
}
