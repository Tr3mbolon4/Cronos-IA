import { Cpu, Mic, RefreshCw, Shield, Volume2 } from 'lucide-react'
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
        <button type="button" onClick={() => { void voice.refreshDevices(); void voice.refreshSttProviders() }}><RefreshCw size={14} /> Atualizar</button>
      </header>
      <div className="voice-settings-grid">
        <label className="inline-toggle">
          <input type="checkbox" checked={voice.settings.enabled} onChange={(event) => voice.updateSettings({ enabled: event.target.checked })} />
          Habilitar recursos de voz
        </label>
        <label className="inline-toggle">
          <input type="checkbox" checked={voice.settings.conversationMode} onChange={(event) => voice.updateSettings({ conversationMode: event.target.checked, transcriptionMode: event.target.checked ? 'auto-send' : voice.settings.transcriptionMode })} />
          Conversa continua
        </label>
        <label className="inline-toggle">
          <input type="checkbox" checked={voice.settings.bargeIn} onChange={(event) => voice.updateSettings({ bargeIn: event.target.checked })} />
          Interromper fala ao ouvir
        </label>
        <label>Microfone
          <select value={voice.settings.selectedMicrophoneId} onChange={(event) => voice.updateSettings({ selectedMicrophoneId: event.target.value })}>
            <option value="">Padrao do sistema</option>
            {microphones.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label}</option>)}
          </select>
        </label>
        <label>Provider STT
          <select value={voice.settings.selectedSttProvider} onChange={(event) => voice.updateSettings({ selectedSttProvider: event.target.value as typeof voice.settings.selectedSttProvider })}>
            {voice.sttProviders.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.name}{provider.experimental ? ' - experimental' : ''}
              </option>
            ))}
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
        <label>Silencio<input type="range" min="600" max="2200" step="100" value={voice.settings.silenceMs} onChange={(event) => voice.updateSettings({ silenceMs: Number(event.target.value) })} /></label>
        <label>Sensibilidade<input type="range" min="6" max="45" step="1" value={voice.settings.vadSensitivity} onChange={(event) => voice.updateSettings({ vadSensitivity: Number(event.target.value) })} /></label>
        <label>Tempo maximo<input type="range" min="10000" max="90000" step="5000" value={voice.settings.maxRecordingMs} onChange={(event) => voice.updateSettings({ maxRecordingMs: Number(event.target.value) })} /></label>
        <label>Visual do nucleo
          <select value={voice.settings.visualMode} onChange={(event) => voice.updateSettings({ visualMode: event.target.value as typeof voice.settings.visualMode })}>
            <option value="chat">Chat</option>
            <option value="immersive">Imersivo</option>
            <option value="compact">Compacto</option>
          </select>
        </label>
      </div>
      <div className="voice-provider-details">
        <article>
          <Cpu size={14} />
          <strong>{voice.sttProvider.name}</strong>
          <span>{voice.sttProvider.available ? 'Disponivel' : 'Indisponivel'} | {voice.sttProvider.offline ? 'offline' : 'offline nao garantido'} | {voice.sttProvider.experimental ? 'experimental' : 'recomendado'}</span>
          <small>{voice.sttProvider.diagnostic}</small>
          <small>Modelo: {voice.sttProvider.modelName || 'runtime'} | Checksum: {voice.sttProvider.checksum || 'n/a'}</small>
          <small>Provider: {voice.sttProvider.id} | Integridade: {voice.sttProvider.available ? 'valida' : 'pendente'}</small>
          {voice.sttProvider.sourceKind && <small>Origem: {voice.sttProvider.sourceKind}</small>}
          {voice.sttProvider.sourcePath && <small>Caminho de origem: {voice.sttProvider.sourcePath}</small>}
          {voice.sttProvider.modelPath && <small>Modelo local: {voice.sttProvider.modelPath}</small>}
          {voice.sttProvider.runtimePath && <small>Runtime: {voice.sttProvider.runtimePath}</small>}
        </article>
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
