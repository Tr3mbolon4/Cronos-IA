import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CoreState } from '../../app/types'
import { startLocalAudioCapture } from './providers/localAudioCapture'
import { cancelLocalSpeechRecognition, getSttProviderStatuses, listAudioDevices, LOCAL_STT_PROVIDER_ID, nativeTtsStatus, pauseNativeTts, resumeNativeTts, runSpeechRecognition, speechSynthesisStatus, speakNativeTts, stopNativeTts, wakeWordStatus } from './providers/webVoiceProviders'
import type { VoiceController, VoiceDevice, VoiceProviderStatus, VoiceSettings, VoiceState, VoiceTranscript } from './types'
import { logVoiceRuntimeTransition, type VoiceRuntimeState } from './voiceRuntimeDiagnostics'
import { loadVoiceSettings, saveVoiceSettings } from './voiceStorage'

const VOICE_STATE_TIMEOUT_MS = 5000
const TTS_OPERATION_TIMEOUT_MS = 300000

export function useVoiceController(onCoreState: (state: CoreState) => void): VoiceController {
  const [settings, setSettings] = useState(loadVoiceSettings)
  const [state, setState] = useState<VoiceState>('idle')
  const [devices, setDevices] = useState<VoiceDevice[]>([])
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [transcript, setTranscript] = useState<VoiceTranscript | null>(null)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const [inputLevel, setInputLevel] = useState(0)
  const [elapsedMs, setElapsedMs] = useState(0)
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<number | null>(null)
  const startedAtRef = useRef(0)
  const operationRef = useRef(0)
  const requestIdRef = useRef('')
  const captureRef = useRef<{ stop: () => Uint8Array; cancel: () => void } | null>(null)
  const speechPollRef = useRef<number | null>(null)
  const stateWatchdogRef = useRef<number | null>(null)
  const returnToListeningRef = useRef<number | null>(null)
  const stateRef = useRef<VoiceState>('idle')
  const runtimeStateRef = useRef<VoiceRuntimeState>('IDLE')
  const runtimeStateStartedAtRef = useRef(Date.now())
  const speechStartedRef = useRef(false)
  const lastVoiceAtRef = useRef(0)

  const [sttProviders, setSttProviders] = useState<VoiceProviderStatus[]>([])
  const ttsProvider = useMemo(() => speechSynthesisStatus(), [])
  const wakeWordProvider = useMemo(() => wakeWordStatus(), [])
  const sttProvider = useMemo(
    () => sttProviders.find((provider) => provider.id === settings.selectedSttProvider) || sttProviders[0] || {
      id: 'cronos-local-whisper',
      name: 'CRONOS Local Whisper',
      version: 'pending',
      capability: 'stt',
      available: false,
      state: 'unavailable',
      diagnostic: 'Provider local ainda nao consultado.',
      local: true,
      offline: true,
      recommended: true,
    } satisfies VoiceProviderStatus,
    [settings.selectedSttProvider, sttProviders],
  )

  const refreshDevices = useCallback(async () => {
    setDevices(await listAudioDevices())
  }, [])

  const refreshSttProviders = useCallback(async () => {
    setSttProviders(await getSttProviderStatuses())
  }, [])

  const refreshVoices = useCallback(() => {
    if (!window.speechSynthesis) return
    setVoices(window.speechSynthesis.getVoices())
  }, [])

  useEffect(() => {
    refreshSttProviders().catch(() => undefined)
    refreshDevices().catch(() => undefined)
    refreshVoices()
    window.speechSynthesis?.addEventListener('voiceschanged', refreshVoices)
    return () => {
      window.speechSynthesis?.removeEventListener('voiceschanged', refreshVoices)
      if (speechPollRef.current) window.clearInterval(speechPollRef.current)
      if (stateWatchdogRef.current) window.clearInterval(stateWatchdogRef.current)
      if (returnToListeningRef.current) window.clearTimeout(returnToListeningRef.current)
      stopNativeTts().catch(() => undefined)
    }
  }, [refreshDevices, refreshSttProviders, refreshVoices])

  useEffect(() => {
    stateRef.current = state
  }, [state])

  function updateSettings(patch: Partial<VoiceSettings>) {
    setSettings((current) => {
      const next = { ...current, ...patch }
      saveVoiceSettings(next)
      return next
    })
  }

  function stopStream() {
    captureRef.current = null
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (timerRef.current) window.clearInterval(timerRef.current)
    timerRef.current = null
    setInputLevel(0)
  }

  async function startPushToTalk() {
    if (!settings.enabled) {
      setError('Recursos de voz estao desabilitados nas configuracoes.')
      setState('unavailable')
      return
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Microfone indisponivel neste runtime.')
      setState('unavailable')
      return
    }
    if (!sttProvider.available) {
      setError(sttProvider.diagnostic)
      setState('unavailable')
      onCoreState('error')
      return
    }
    transitionRuntimeState('LISTENING')
    setError('')
    if (settings.bargeIn && (stateRef.current === 'speaking' || stateRef.current === 'paused')) {
      await stopNativeTts().catch(() => undefined)
    }
    setState('requesting_permission')
    onCoreState('listening')
    try {
      const constraints: MediaStreamConstraints = { audio: settings.selectedMicrophoneId ? { deviceId: { exact: settings.selectedMicrophoneId } } : true }
      streamRef.current = await navigator.mediaDevices.getUserMedia(constraints)
      startedAtRef.current = Date.now()
      speechStartedRef.current = false
      lastVoiceAtRef.current = Date.now()
      operationRef.current += 1
      requestIdRef.current = createVoiceRequestId()
      if (settings.selectedSttProvider === LOCAL_STT_PROVIDER_ID) {
        captureRef.current = await startLocalAudioCapture(streamRef.current, handleInputLevel)
      }
      stateRef.current = 'recording'
      setState('recording')
      timerRef.current = window.setInterval(() => {
        const elapsed = Date.now() - startedAtRef.current
        setElapsedMs(elapsed)
        if (settings.selectedSttProvider !== LOCAL_STT_PROVIDER_ID) setInputLevel((value) => (value > 88 ? 18 : value + 17))
        if (settings.conversationMode && elapsed >= settings.maxRecordingMs) stopPushToTalk()
      }, 160)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Permissao de microfone negada ou dispositivo indisponivel.')
      setState('error')
      onCoreState('error')
      stopStream()
    }
  }

  function stopPushToTalk() {
    if (stateRef.current !== 'recording') return
    let audioBytes: Uint8Array | undefined
    if (settings.selectedSttProvider === LOCAL_STT_PROVIDER_ID) {
      audioBytes = captureRef.current?.stop()
    }
    stopStream()
    const operationId = operationRef.current
    const requestId = requestIdRef.current
    stateRef.current = 'transcribing'
    transitionRuntimeState('TRANSCRIBING')
    setState('transcribing')
    onCoreState('processing')
    runSpeechRecognition(settings, sttProvider, audioBytes, requestId)
      .then((result) => {
        if (operationId !== operationRef.current) return
        setTranscript(result)
        setDraft(result.text)
        stateRef.current = 'reviewing'
        setState('reviewing')
        onCoreState('success')
      })
      .catch((error) => {
        if (operationId !== operationRef.current) return
        setError(error instanceof Error ? error.message : 'Nao foi possivel transcrever.')
        stateRef.current = 'error'
        transitionRuntimeState('IDLE', error instanceof Error ? error.message : 'transcription_failed')
        setState('error')
        onCoreState('error')
      })
  }

  function cancelVoice() {
    operationRef.current += 1
    const requestId = requestIdRef.current
    captureRef.current?.cancel()
    stopStream()
    stopNativeTts().catch(() => undefined)
    void cancelLocalSpeechRecognition(requestId)
    setState('cancelled')
    transitionRuntimeState('IDLE', 'cancelled')
    onCoreState('ready')
  }

  function speak(text: string) {
    if (!text.trim()) return
    if (speechPollRef.current) window.clearInterval(speechPollRef.current)
    transitionRuntimeState('STARTING_TTS')
    stopNativeTts()
      .catch(() => undefined)
      .finally(() => speakNativeTts(text, settings.rate, settings.volume))
      .then(() => {
      stateRef.current = 'speaking'
      setState('speaking')
      transitionRuntimeState('PLAYING_TTS')
      onCoreState('speaking')
      startSpeechPolling()
    })
      .catch((error) => {
        setError(error instanceof Error ? error.message : 'Nao foi possivel iniciar o TTS local.')
        transitionRuntimeState('IDLE', error instanceof Error ? error.message : 'tts_start_failed')
        setState('error')
        onCoreState('error')
      })
  }

  function pauseSpeech() {
    pauseNativeTts()
      .then(() => setState('paused'))
      .catch((error) => {
        setError(error instanceof Error ? error.message : 'Nao foi possivel pausar o TTS.')
        setState('error')
        onCoreState('error')
      })
  }

  function resumeSpeech() {
    resumeNativeTts()
      .then(() => {
        setState('speaking')
        onCoreState('speaking')
        startSpeechPolling()
      })
      .catch((error) => {
        setError(error instanceof Error ? error.message : 'Nao foi possivel retomar o TTS.')
        setState('error')
        onCoreState('error')
      })
  }

  function stopSpeech() {
    stopNativeTts()
      .catch(() => undefined)
      .finally(() => {
        if (speechPollRef.current) window.clearInterval(speechPollRef.current)
        speechPollRef.current = null
        stateRef.current = 'completed'
        setState('completed')
        transitionRuntimeState('FINISHED_TTS', 'manual_stop')
        scheduleReturnAfterTts('manual_stop')
        onCoreState('ready')
      })
  }

  function startSpeechPolling() {
    if (speechPollRef.current) window.clearInterval(speechPollRef.current)
    const started = Date.now()
    speechPollRef.current = window.setInterval(() => {
      if (Date.now() - started > TTS_OPERATION_TIMEOUT_MS) {
        stopNativeTts().catch(() => undefined)
        if (speechPollRef.current) window.clearInterval(speechPollRef.current)
        speechPollRef.current = null
        stateRef.current = 'error'
        setError('TTS excedeu o tempo maximo e foi encerrado com seguranca.')
        setState('error')
        transitionRuntimeState('IDLE', 'tts_frontend_timeout')
        onCoreState('error')
        return
      }
      nativeTtsStatus()
        .then((status) => {
          if (status.state === 'completed' || status.state === 'failed' || status.state === 'stopped') {
            if (speechPollRef.current) window.clearInterval(speechPollRef.current)
            speechPollRef.current = null
            stateRef.current = status.state === 'failed' ? 'error' : 'completed'
            setState(status.state === 'failed' ? 'error' : 'completed')
            if (status.diagnostic) setError(status.diagnostic)
            transitionRuntimeState(status.state === 'failed' ? 'IDLE' : 'FINISHED_TTS', status.diagnostic || status.state)
            if (status.state === 'failed') {
              onCoreState('error')
            } else {
              onCoreState('ready')
              scheduleReturnAfterTts(status.state)
            }
          }
        })
        .catch((error) => {
          transitionRuntimeState('IDLE', error instanceof Error ? error.message : 'native_tts_status_failed')
          if (speechPollRef.current) window.clearInterval(speechPollRef.current)
          speechPollRef.current = null
          stateRef.current = 'idle'
          setState('idle')
          onCoreState('ready')
        })
    }, 500)
  }

  function scheduleReturnAfterTts(reason: string) {
    if (returnToListeningRef.current) window.clearTimeout(returnToListeningRef.current)
    transitionRuntimeState('RETURN_TO_LISTENING', reason)
    returnToListeningRef.current = window.setTimeout(() => {
      returnToListeningRef.current = null
      if (!settings.conversationMode || !settings.enabled) {
        stateRef.current = 'idle'
        setState('idle')
        transitionRuntimeState('IDLE', 'conversation_mode_disabled')
        onCoreState('ready')
        return
      }
      if (stateRef.current === 'recording' || stateRef.current === 'transcribing' || stateRef.current === 'speaking') return
      startPushToTalk().catch((error) => {
        const message = error instanceof Error ? error.message : 'return_to_listening_failed'
        setError(message)
        stateRef.current = 'idle'
        setState('idle')
        transitionRuntimeState('IDLE', message)
        onCoreState('ready')
      })
    }, 450)
  }

  function transitionRuntimeState(next: VoiceRuntimeState, reason = '') {
    startStateWatchdog()
    const previous = runtimeStateRef.current
    runtimeStateRef.current = next
    runtimeStateStartedAtRef.current = Date.now()
    logVoiceRuntimeTransition({ previous, next, reason })
  }

  function startStateWatchdog() {
    if (stateWatchdogRef.current) return
    stateWatchdogRef.current = window.setInterval(() => {
      const ageMs = Date.now() - runtimeStateStartedAtRef.current
      if (ageMs <= VOICE_STATE_TIMEOUT_MS) return
      const current = runtimeStateRef.current
      logVoiceRuntimeTransition({ previous: current, next: current, reason: `blocked>${VOICE_STATE_TIMEOUT_MS}ms`, blockedMs: ageMs, stack: new Error('voice-state-watchdog').stack })
      if (current === 'RETURN_TO_LISTENING') {
        stateRef.current = 'idle'
        setState('idle')
        transitionRuntimeState('IDLE', 'return_to_listening_timeout')
        onCoreState('ready')
      }
    }, 1000)
  }

  function handleInputLevel(level: number) {
    setInputLevel(level)
    if (!settings.conversationMode || stateRef.current !== 'recording') return
    const now = Date.now()
    const threshold = Math.max(4, Math.min(80, settings.vadSensitivity))
    if (level >= threshold) {
      speechStartedRef.current = true
      lastVoiceAtRef.current = now
      return
    }
    if (speechStartedRef.current && now - lastVoiceAtRef.current >= settings.silenceMs) {
      stopPushToTalk()
    }
  }

  async function testMicrophone() {
    await startPushToTalk()
  }

  return {
    state,
    settings,
    devices,
    voices,
    transcript,
    draft,
    error,
    inputLevel,
    elapsedMs,
    sttProvider,
    sttProviders,
    ttsProvider,
    wakeWordProvider,
    updateSettings,
    refreshDevices,
    refreshSttProviders,
    refreshVoices,
    startPushToTalk,
    stopPushToTalk,
    cancelVoice,
    applyTranscriptDraft: setDraft,
    clearTranscript: () => {
      setTranscript(null)
      setDraft('')
      setState('idle')
    },
    speak,
    pauseSpeech,
    resumeSpeech,
    stopSpeech,
    testMicrophone,
    stopMicrophoneTest: cancelVoice,
    testVoice: speak,
    markRuntimeState: transitionRuntimeState,
  }
}

function createVoiceRequestId() {
  const raw = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return raw.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 80)
}
