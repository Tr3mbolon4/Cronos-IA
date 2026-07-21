export function AudioLevelMeter({ level, elapsedMs }: { level: number; elapsedMs: number }) {
  return (
    <div className="audio-level-meter" aria-label={`Nivel de entrada ${Math.round(level)} por cento`}>
      <div style={{ width: `${Math.min(100, Math.max(0, level))}%` }} />
      <span>{Math.round(elapsedMs / 100) / 10}s</span>
    </div>
  )
}
