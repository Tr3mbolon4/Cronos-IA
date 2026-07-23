import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CoreState } from '../../app/types'
import { startLocalAudioCapture } from './providers/localAudioCapture'
import { cancelLocalSpeechRecognition, getSttProviderStatuses, listAudioDevices, LOCAL_STT_PROVIDER_ID, nativeTtsStatus, pauseNativeTts, resumeNativeTts, runSpeechRecognition, speechSynthesisStatus, speakNativeTts, stopNativeTts, wakeWordStatus } from './providers/webVoiceProviders'
import type { VoiceController, VoiceDevice, VoiceProviderStatus, VoiceSettings, VoiceState, VoiceTranscript } from './types'
import { loadVoiceSettings, saveVoiceSettings } from './voiceStorage'

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
  const stateRef = useRef<VoiceState>('idle')
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
    onCoreState('ready')
  }

  function speak(text: string) {
    if (!text.trim()) return
    if (speechPollRef.current) window.clearInterval(speechPollRef.current)
    stopNativeTts()
      .catch(() => undefined)
      .finally(() => speakNativeTts(text, settings.rate, settings.volume))
      .then(() => {
      setState('speaking')
      onCoreState('speaking')
      startSpeechPolling()
    })
      .catch((error) => {
        setError(error instanceof Error ? error.message : 'Nao foi possivel iniciar o TTS local.')
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
        setState('completed')
        onCoreState('ready')
      })
  }

  function startSpeechPolling() {
    if (speechPollRef.current) window.clearInterval(speechPollRef.current)
    speechPollRef.current = window.setInterval(() => {
      nativeTtsStatus()
        .then((status) => {
          if (status.state === 'completed' || status.state === 'failed' || status.state === 'stopped') {
            if (speechPollRef.current) window.clearInterval(speechPollRef.current)
            speechPollRef.current = null
            setState(status.state === 'failed' ? 'error' : 'completed')
            onCoreState(status.state === 'failed' ? 'error' : 'ready')
            if (status.diagnostic) setError(status.diagnostic)
          }
        })
        .catch(() => undefined)
    }, 500)
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
  }
}

function createVoiceRequestId() {
  const raw = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return raw.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 80)
}
