import type { VoiceDevice, VoiceProviderStatus, VoiceSettings, VoiceTranscript } from '../types'

type SpeechRecognitionConstructor = new () => SpeechRecognition

type SpeechRecognitionResultItem = {
  transcript: string
  confidence: number
}

type SpeechRecognitionAlternativeList = {
  readonly length: number
  item(index: number): SpeechRecognitionResultItem
  [index: number]: SpeechRecognitionResultItem
}

type SpeechRecognitionResultList = {
  readonly length: number
  item(index: number): SpeechRecognitionAlternativeList
  [index: number]: SpeechRecognitionAlternativeList
}

type SpeechRecognitionEvent = Event & {
  results: SpeechRecognitionResultList
}

type SpeechRecognition = EventTarget & {
  lang: string
  interimResults: boolean
  continuous: boolean
  maxAlternatives: number
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onerror: ((event: Event & { error?: string }) => void) | null
  onend: (() => void) | null
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor
    webkitSpeechRecognition?: SpeechRecognitionConstructor
  }
}

export function speechRecognitionStatus(): VoiceProviderStatus {
  const available = Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)
  return {
    id: 'web-speech-recognition',
    name: 'WebView Speech Recognition',
    version: 'runtime',
    capability: 'stt',
    available,
    state: available ? 'ready' : 'unavailable',
    diagnostic: available
      ? 'Provider de STT exposto pelo runtime WebView. Uso depende das capacidades locais do Windows/WebView.'
      : 'STT indisponivel neste runtime. Texto continua funcional.',
    local: false,
  }
}

export function speechSynthesisStatus(): VoiceProviderStatus {
  const available = typeof window.speechSynthesis !== 'undefined'
  return {
    id: 'web-speech-synthesis',
    name: 'Windows/WebView Speech Synthesis',
    version: 'runtime',
    capability: 'tts',
    available,
    state: available ? 'ready' : 'unavailable',
    diagnostic: available ? 'TTS disponivel via vozes instaladas no sistema/WebView.' : 'TTS indisponivel neste runtime.',
    local: true,
  }
}

export function wakeWordStatus(): VoiceProviderStatus {
  return {
    id: 'wake-word-cronos-future',
    name: 'Wake word Cronos',
    version: 'planned',
    capability: 'wake-word',
    available: false,
    state: 'unavailable',
    diagnostic: 'Arquitetura preparada. Detecao real da palavra Cronos nao esta habilitada nesta fase.',
    local: true,
  }
}

export async function listAudioDevices(): Promise<VoiceDevice[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return []
  const rows = await navigator.mediaDevices.enumerateDevices()
  return rows
    .filter((device) => device.kind === 'audioinput' || device.kind === 'audiooutput')
    .map((device, index) => ({
      deviceId: device.deviceId,
      label: device.label || (device.kind === 'audioinput' ? `Microfone ${index + 1}` : `Saida ${index + 1}`),
      kind: device.kind,
      isDefault: device.deviceId === 'default',
    }))
}

export function runSpeechRecognition(settings: VoiceSettings): Promise<VoiceTranscript> {
  return new Promise((resolve, reject) => {
    const Constructor = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!Constructor) {
      reject(new Error('Provider de transcricao indisponivel neste WebView.'))
      return
    }
    const recognition = new Constructor()
    recognition.lang = settings.language
    recognition.interimResults = false
    recognition.continuous = false
    recognition.maxAlternatives = 1
    let resolved = false
    recognition.onresult = (event) => {
      const item = event.results?.[0]?.[0]
      const text = item?.transcript?.trim() || ''
      if (!text) {
        reject(new Error('Transcricao vazia. Tente novamente com fala mais clara.'))
        return
      }
      resolved = true
      resolve({
        text,
        confidence: Number.isFinite(item.confidence) ? item.confidence : null,
        providerId: 'web-speech-recognition',
        language: settings.language,
        createdAt: new Date().toISOString(),
      })
    }
    recognition.onerror = (event) => reject(new Error(`Falha do provider de voz: ${event.error || 'erro desconhecido'}.`))
    recognition.onend = () => {
      if (!resolved) reject(new Error('Captura encerrada sem transcricao.'))
    }
    recognition.start()
  })
}
