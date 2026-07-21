import { Mic, RefreshCw, Shield, Volume2 } from 'lucide-react'
import type { VoiceController } from '../types'
import { AudioLevelMeter } from './AudioLevelMeter'

const testText = 'Ola. Eu sou o CRONOS. O sistema de voz local esta funcionando.'

export function VoiceSettingsPanel({ voice }: { voice: VoiceController }) {
  const microphones = voice.devices.filter((device) => device.kind === 'audioinput')
  return (
    <section className="voice-settings-panel" data-visual="voice-settings">
      <header>
        <div>
          <span>Voz local e privada</span>
          <h2>Configuracoes de voz</h2>
        </div>
        <button type="button" onClick={voice.refreshDevices}><RefreshCw size={14} /> Atualizar dispositivos</button>
      </header>
      <div className="voice-settings-grid">
        <label className="inline-toggle">
          <input type="checkbox" checked={voice.settings.enabled} onChange={(event) => voice.updateSettings({ enabled: event.target.checked })} />
          Habilitar recursos de voz
        </label>
        <label>Microfone
          <select value={voice.settings.selectedMicrophoneId} onChange={(event) => voice.updateSettings({ selectedMicrophoneId: event.target.value })}>
            <option value="">Padrao do sistema</option>
            {microphones.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label}</option>)}
          </select>
        </label>
        <label>Idioma
          <select value={voice.settings.language} onChange={(event) => voice.updateSettings({ language: event.target.value })}>
            <option value="pt-BR">Portugues do Brasil</option>
            <option value="en-US">Ingles EUA</option>
          </select>
        </label>
        <label>Voz
          <select value={voice.settings.selectedVoiceURI} onChange={(event) => voice.updateSettings({ selectedVoiceURI: event.target.value })}>
            <option value="">Padrao local</option>
            {voice.voices.map((item) => <option key={item.voiceURI} value={item.voiceURI}>{item.name} ({item.lang})</option>)}
          </select>
        </label>
        <label>Velocidade<input type="range" min="0.6" max="1.4" step="0.1" value={voice.settings.rate} onChange={(event) => voice.updateSettings({ rate: Number(event.target.value) })} /></label>
        <label>Volume<input type="range" min="0" max="1" step="0.05" value={voice.settings.volume} onChange={(event) => voice.updateSettings({ volume: Number(event.target.value) })} /></label>
        <label>Depois de transcrever
          <select value={voice.settings.transcriptionMode} onChange={(event) => voice.updateSettings({ transcriptionMode: event.target.value as typeof voice.settings.transcriptionMode })}>
            <option value="review">Revisar antes de enviar</option>
            <option value="copy">Copiar para o campo</option>
            <option value="show-only">Somente mostrar</option>
            <option value="auto-send">Enviar automaticamente</option>
          </select>
        </label>
        <label>Resposta falada
          <select value={voice.settings.autoSpeak} onChange={(event) => voice.updateSettings({ autoSpeak: event.target.value as typeof voice.settings.autoSpeak })}>
            <option value="never">Nunca automaticamente</option>
            <option value="voice-only">Somente quando enviado por voz</option>
            <option value="all">Todas as respostas</option>
            <option value="ask">Perguntar antes</option>
          </select>
        </label>
      </div>
      <div className="voice-diagnostics">
        <article><Mic size={14} /><strong>STT</strong><span>{voice.sttProvider.available ? voice.sttProvider.name : 'Indisponivel'}</span><small>{voice.sttProvider.diagnostic}</small></article>
        <article><Volume2 size={14} /><strong>TTS</strong><span>{voice.ttsProvider.available ? voice.ttsProvider.name : 'Indisponivel'}</span><small>{voice.ttsProvider.diagnostic}</small></article>
        <article><Shield size={14} /><strong>Wake word</strong><span>Experimental desligado</span><small>{voice.wakeWordProvider.diagnostic}</small></article>
      </div>
      <div className="voice-test-grid">
        <section>
          <h3>Teste de microfone</h3>
          <AudioLevelMeter level={voice.inputLevel} elapsedMs={voice.elapsedMs} />
          <button type="button" onClick={voice.testMicrophone}>Testar microfone</button>
          <button type="button" onClick={voice.stopMicrophoneTest}>Encerrar teste</button>
        </section>
        <section>
          <h3>Teste de voz</h3>
          <textarea defaultValue={testText} onBlur={(event) => event.currentTarget.dataset.text = event.currentTarget.value} />
          <button type="button" onClick={(event) => voice.testVoice(event.currentTarget.parentElement?.querySelector('textarea')?.value || testText)}>Reproduzir</button>
          <button type="button" onClick={voice.stopSpeech}>Parar</button>
        </section>
      </div>
      <p className="privacy-note">Audio nao e armazenado por padrao. Wake word Cronos esta preparada na arquitetura, mas permanece desabilitada ate validacao local real.</p>
    </section>
  )
}
