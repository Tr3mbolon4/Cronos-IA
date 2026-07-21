import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CoreState } from '../../app/types'
import { getSttProviderStatuses, listAudioDevices, runSpeechRecognition, speechSynthesisStatus, wakeWordStatus } from './providers/webVoiceProviders'
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
    return () => window.speechSynthesis?.removeEventListener('voiceschanged', refreshVoices)
  }, [refreshDevices, refreshSttProviders, refreshVoices])

  function updateSettings(patch: Partial<VoiceSettings>) {
    setSettings((current) => {
      const next = { ...current, ...patch }
      saveVoiceSettings(next)
      return next
    })
  }

  function stopStream() {
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
    setState('requesting_permission')
    onCoreState('listening')
    try {
      const constraints: MediaStreamConstraints = { audio: settings.selectedMicrophoneId ? { deviceId: { exact: settings.selectedMicrophoneId } } : true }
      streamRef.current = await navigator.mediaDevices.getUserMedia(constraints)
      startedAtRef.current = Date.now()
      operationRef.current += 1
      setState('recording')
      timerRef.current = window.setInterval(() => {
        setElapsedMs(Date.now() - startedAtRef.current)
        setInputLevel((value) => (value > 88 ? 18 : value + 17))
      }, 160)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Permissao de microfone negada ou dispositivo indisponivel.')
      setState('error')
      onCoreState('error')
      stopStream()
    }
  }

  function stopPushToTalk() {
    if (state !== 'recording') return
    stopStream()
    const operationId = operationRef.current
    setState('transcribing')
    onCoreState('processing')
    runSpeechRecognition(settings, sttProvider)
      .then((result) => {
        if (operationId !== operationRef.current) return
        setTranscript(result)
        setDraft(result.text)
        setState('reviewing')
        onCoreState('success')
      })
      .catch((error) => {
        if (operationId !== operationRef.current) return
        setError(error instanceof Error ? error.message : 'Nao foi possivel transcrever.')
        setState('error')
        onCoreState('error')
      })
  }

  function cancelVoice() {
    operationRef.current += 1
    stopStream()
    window.speechSynthesis?.cancel()
    setState('cancelled')
    onCoreState('ready')
  }

  function speak(text: string) {
    if (!window.speechSynthesis || !text.trim()) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = settings.language
    utterance.rate = settings.rate
    utterance.volume = settings.volume
    const selected = voices.find((voice) => voice.voiceURI === settings.selectedVoiceURI)
    if (selected) utterance.voice = selected
    utterance.onstart = () => {
      setState('speaking')
      onCoreState('speaking')
    }
    utterance.onend = () => {
      setState('completed')
      onCoreState('ready')
    }
    utterance.onerror = () => {
      setState('error')
      onCoreState('error')
    }
    window.speechSynthesis.speak(utterance)
  }

  function pauseSpeech() {
    window.speechSynthesis?.pause()
    setState('paused')
  }

  function resumeSpeech() {
    window.speechSynthesis?.resume()
    setState('speaking')
    onCoreState('speaking')
  }

  function stopSpeech() {
    window.speechSynthesis?.cancel()
    setState('completed')
    onCoreState('ready')
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
