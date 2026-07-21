import { Monitor, Moon, Settings, SlidersHorizontal, Volume2 } from 'lucide-react'
import { BaseModulePage, PlaceholderPanel } from './BaseModulePage'
import { VoiceSettingsPanel } from '../features/voice/components/VoiceSettingsPanel'
import type { VoiceController } from '../features/voice/types'

export function SettingsPage({ reducedMotion, onReducedMotionChange, voice }: { reducedMotion: boolean; onReducedMotionChange: (value: boolean) => void; voice: VoiceController }) {
  return (
    <BaseModulePage title="Configuracoes" description="Preferencias de aparencia, comportamento, audio e privacidade." icon={<Settings size={24} />}>
      <PlaceholderPanel title="Aparencia">
        <Moon size={14} /> Tema escuro ativo. Tema claro e alto contraste preparados por tokens.
      </PlaceholderPanel>
      <PlaceholderPanel title="Movimento">
        <label className="inline-toggle">
          <input type="checkbox" checked={reducedMotion} onChange={(event) => onReducedMotionChange(event.target.checked)} />
          Reduzir animacoes
        </label>
      </PlaceholderPanel>
      <VoiceSettingsPanel voice={voice} />
      <div className="action-row">
        <button type="button"><Monitor size={15} /> Tema</button>
        <button type="button"><Volume2 size={15} /> Audio</button>
        <button type="button"><SlidersHorizontal size={15} /> Avancado</button>
      </div>
    </BaseModulePage>
  )
}
