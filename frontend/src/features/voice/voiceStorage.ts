import type { VoiceSettings } from './types'

const SETTINGS_KEY = 'cronos.voice.settings.v1'

export const defaultVoiceSettings: VoiceSettings = {
  enabled: false,
  language: 'pt-BR',
  selectedSttProvider: 'cronos-local-whisper',
  selectedMicrophoneId: '',
  selectedVoiceURI: '',
  rate: 1,
  volume: 0.9,
  transcriptionMode: 'review',
  autoSpeak: 'never',
  conversationMode: false,
  silenceMs: 1100,
  vadSensitivity: 18,
  maxRecordingMs: 45000,
  bargeIn: false,
  autoReturnToListening: false,
  voiceWatchdogEnabled: true,
  vadEnabled: true,
  visualMode: 'chat',
  stopOnConversationChange: true,
  storeAudio: false,
  wakeWordEnabled: false,
}

export function loadVoiceSettings(): VoiceSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return { ...defaultVoiceSettings, ...parsed }
  } catch {
    return defaultVoiceSettings
  }
}

export function saveVoiceSettings(settings: VoiceSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
}
