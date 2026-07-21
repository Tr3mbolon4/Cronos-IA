import { invoke } from '@tauri-apps/api/core'
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

export const LOCAL_STT_PROVIDER_ID = 'cronos-local-whisper'
export const WEBVIEW_STT_PROVIDER_ID = 'webview-speech-recognition'

type LocalWhisperStatus = {
  available: boolean
  diagnostic: string
  runtimePath: string
  modelPath: string
  modelName: string
  version: string
  checksum: string
  sizeMb: number
  lastStartedAt: string
}

const localWhisperUnavailable: VoiceProviderStatus = {
  id: LOCAL_STT_PROVIDER_ID,
  name: 'CRONOS Local Whisper',
  version: 'whisper.cpp planned',
  capability: 'stt',
  available: false,
  state: 'unavailable',
  diagnostic: 'Runtime/modelo local nao encontrados no pacote. O provider WebView nao sera usado automaticamente.',
  local: true,
  offline: true,
  experimental: false,
  recommended: true,
  modelName: 'ggml-base.bin',
  checksum: 'pending-release-artifact',
  sizeMb: 142,
}

export function webSpeechRecognitionStatus(): VoiceProviderStatus {
  const available = Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)
  return {
    id: WEBVIEW_STT_PROVIDER_ID,
    name: 'WebView Speech Recognition',
    version: 'runtime',
    capability: 'stt',
    available,
    state: available ? 'ready' : 'unavailable',
    diagnostic: available
      ? 'Provider experimental do WebView. Processamento local/offline nao e garantido; use somente por escolha explicita.'
      : 'STT WebView indisponivel neste runtime. Texto continua funcional.',
    local: false,
    offline: false,
    experimental: true,
    recommended: false,
  }
}

export async function localWhisperStatus(): Promise<VoiceProviderStatus> {
  try {
    const status = await invoke<LocalWhisperStatus>('get_local_whisper_status')
    return {
      ...localWhisperUnavailable,
      version: status.version,
      available: status.available,
      state: status.available ? 'ready' : 'unavailable',
      diagnostic: status.diagnostic,
      runtimePath: status.runtimePath,
      modelPath: status.modelPath,
      modelName: status.modelName,
      checksum: status.checksum,
      sizeMb: status.sizeMb,
      lastStartedAt: status.lastStartedAt,
    }
  } catch (error) {
    return {
      ...localWhisperUnavailable,
      diagnostic: error instanceof Error ? error.message : localWhisperUnavailable.diagnostic,
    }
  }
}

export async function getSttProviderStatuses(): Promise<VoiceProviderStatus[]> {
  const local = await localWhisperStatus()
  return [local, webSpeechRecognitionStatus()]
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
    offline: true,
    experimental: true,
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

function runWebSpeechRecognition(settings: VoiceSettings): Promise<VoiceTranscript> {
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
        providerId: WEBVIEW_STT_PROVIDER_ID,
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

export async function runSpeechRecognition(settings: VoiceSettings, provider: VoiceProviderStatus): Promise<VoiceTranscript> {
  if (settings.selectedSttProvider === WEBVIEW_STT_PROVIDER_ID) {
    return runWebSpeechRecognition(settings)
  }
  if (!provider.available) {
    throw new Error('Provider CRONOS Local Whisper indisponivel: runtime/modelo local nao encontrados no pacote.')
  }
  throw new Error('Provider CRONOS Local Whisper detectado, mas a transcricao PCM WAV empacotada ainda exige validacao real antes de ser habilitada.')
}
