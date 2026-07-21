export type VoiceState =
  | 'idle'
  | 'requesting_permission'
  | 'ready'
  | 'recording'
  | 'transcribing'
  | 'reviewing'
  | 'speaking'
  | 'paused'
  | 'completed'
  | 'cancelled'
  | 'error'
  | 'unavailable'

export type VoiceProviderStatus = {
  id: string
  name: string
  version: string
  capability: 'stt' | 'tts' | 'wake-word' | 'device'
  available: boolean
  state: VoiceState
  diagnostic: string
  local: boolean
}

export type VoiceSettings = {
  enabled: boolean
  language: string
  selectedMicrophoneId: string
  selectedVoiceURI: string
  rate: number
  volume: number
  transcriptionMode: 'review' | 'copy' | 'show-only' | 'auto-send'
  autoSpeak: 'never' | 'voice-only' | 'all' | 'ask'
  stopOnConversationChange: boolean
  storeAudio: boolean
  wakeWordEnabled: boolean
}

export type VoiceDevice = {
  deviceId: string
  label: string
  kind: MediaDeviceKind
  isDefault: boolean
}

export type VoiceTranscript = {
  text: string
  confidence: number | null
  providerId: string
  language: string
  createdAt: string
}

export type VoiceController = {
  state: VoiceState
  settings: VoiceSettings
  devices: VoiceDevice[]
  voices: SpeechSynthesisVoice[]
  transcript: VoiceTranscript | null
  draft: string
  error: string
  inputLevel: number
  elapsedMs: number
  sttProvider: VoiceProviderStatus
  ttsProvider: VoiceProviderStatus
  wakeWordProvider: VoiceProviderStatus
  updateSettings: (patch: Partial<VoiceSettings>) => void
  refreshDevices: () => Promise<void>
  refreshVoices: () => void
  startPushToTalk: () => Promise<void>
  stopPushToTalk: () => void
  cancelVoice: () => void
  applyTranscriptDraft: (value: string) => void
  clearTranscript: () => void
  speak: (text: string) => void
  pauseSpeech: () => void
  resumeSpeech: () => void
  stopSpeech: () => void
  testMicrophone: () => Promise<void>
  stopMicrophoneTest: () => void
  testVoice: (text: string) => void
}
