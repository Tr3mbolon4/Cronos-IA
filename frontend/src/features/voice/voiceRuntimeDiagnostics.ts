export type VoiceRuntimeState =
  | 'IDLE'
  | 'LISTENING'
  | 'TRANSCRIBING'
  | 'SENDING'
  | 'WAITING_LLM'
  | 'GENERATING_RESPONSE'
  | 'STARTING_TTS'
  | 'PLAYING_TTS'
  | 'FINISHED_TTS'
  | 'RETURN_TO_LISTENING'

export type VoiceRuntimeLogEntry = {
  at: string
  previous: VoiceRuntimeState
  next: VoiceRuntimeState
  reason: string
  blockedMs?: number
  stack?: string
}

const LOG_KEY = 'cronos.voice.runtime.log.v1'
const MAX_ENTRIES = 240

export function logVoiceRuntimeTransition(entry: Omit<VoiceRuntimeLogEntry, 'at'>) {
  const payload: VoiceRuntimeLogEntry = { at: new Date().toISOString(), ...entry }
  try {
    const current = JSON.parse(localStorage.getItem(LOG_KEY) || '[]') as VoiceRuntimeLogEntry[]
    localStorage.setItem(LOG_KEY, JSON.stringify([payload, ...current].slice(0, MAX_ENTRIES)))
  } catch {
    localStorage.setItem(LOG_KEY, JSON.stringify([payload]))
  }
  console.info('[CRONOS voice runtime]', payload)
}

export function simulateVoiceRuntimeCycles(cycles: number) {
  const sequence: VoiceRuntimeState[] = [
    'IDLE',
    'LISTENING',
    'TRANSCRIBING',
    'SENDING',
    'WAITING_LLM',
    'GENERATING_RESPONSE',
    'STARTING_TTS',
    'PLAYING_TTS',
    'FINISHED_TTS',
    'RETURN_TO_LISTENING',
  ]
  const states: VoiceRuntimeState[] = []
  for (let cycle = 0; cycle < cycles; cycle += 1) {
    states.push(...sequence.slice(cycle === 0 ? 0 : 1))
  }
  states.push('LISTENING')
  return states
}
