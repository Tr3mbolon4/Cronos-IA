import { Pause, Play, RefreshCw, RotateCw, Square } from 'lucide-react'
import type { VoiceController } from '../types'

export function SpeechControls({ text, voice }: { text: string; voice: VoiceController }) {
  const canSpeak = voice.ttsProvider.available && text.trim()
  return (
    <div className="speech-controls" data-visual="speech-controls">
      <button type="button" disabled={!canSpeak || voice.state === 'speaking'} onClick={() => voice.speak(text)}><Play size={13} /> Ouvir</button>
      <button type="button" disabled={voice.state !== 'speaking'} onClick={voice.pauseSpeech}><Pause size={13} /> Pausar</button>
      <button type="button" disabled={voice.state !== 'paused'} onClick={voice.resumeSpeech}><RotateCw size={13} /> Retomar</button>
      <button type="button" disabled={voice.state !== 'speaking' && voice.state !== 'paused'} onClick={voice.stopSpeech}><Square size={13} /> Parar</button>
      <button type="button" onClick={() => voice.recoverVoiceRuntime('speech_controls_recover_button')}><RefreshCw size={13} /> Recuperar voz</button>
    </div>
  )
}
