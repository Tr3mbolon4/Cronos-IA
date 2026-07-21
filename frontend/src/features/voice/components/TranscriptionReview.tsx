import { RefreshCw, Send, X } from 'lucide-react'
import type { VoiceController } from '../types'

export function TranscriptionReview({ voice, onUseText, onSend }: { voice: VoiceController; onUseText: (value: string) => void; onSend?: (value: string) => void }) {
  if (voice.state !== 'reviewing' && !voice.draft && !voice.error) return null
  return (
    <section className="transcription-review" aria-live="polite" data-visual="voice-review">
      <header>
        <strong>Transcricao de voz</strong>
        <span>{voice.transcript?.providerId || voice.sttProvider.id}</span>
      </header>
      {voice.error && <p className="voice-error">{voice.error}</p>}
      <textarea value={voice.draft} onChange={(event) => voice.applyTranscriptDraft(event.target.value)} aria-label="Revisar transcricao" />
      <footer>
        <button type="button" onClick={() => voice.startPushToTalk()}><RefreshCw size={14} /> Gravar novamente</button>
        <button type="button" onClick={() => { onUseText(voice.draft); voice.clearTranscript() }}>Copiar para campo</button>
        {onSend && <button type="button" className="primary" disabled={!voice.draft.trim()} onClick={() => { onSend(voice.draft); voice.clearTranscript() }}><Send size={14} /> Enviar</button>}
        <button type="button" onClick={voice.clearTranscript}><X size={14} /> Descartar</button>
      </footer>
    </section>
  )
}
