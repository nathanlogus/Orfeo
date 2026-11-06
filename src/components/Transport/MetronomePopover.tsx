import { useRef } from 'react'
import { useMenuDismiss } from '../ContextMenu'
import { useStore } from '../../store'
import { t } from '../../utils/i18n'

const BARS = [1, 2, 3, 4]

// ── Metronome: on or off, how loud, and the clicks before the music. Opens beside
// the Click tile; volume and count-in are remembered between sessions. ───────
export function MetronomePopover({ x, y, onClose }: { x: number; y: number; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const on = useStore((s) => s.metronomeEnabled)
  const volume = useStore((s) => s.metronomeVolume)
  const countInEnabled = useStore((s) => s.countInEnabled)
  const countInBars = useStore((s) => s.countInBars)
  const store = useStore.getState()
  const pct = Math.round(volume * 100)
  useMenuDismiss(true, ref, onClose)
  return (
    <div ref={ref} role="dialog" aria-labelledby="pr-metro-title" className="pr-metro theme-paper app-no-drag touch-hit" style={{ left: x, top: y }}>
      <div className="pr-metro-head">
        <h2 id="pr-metro-title">{t`Metronome`}</h2>
        <button role="switch" aria-checked={on} aria-label={t`Metronome`} className="o-switch" onClick={() => store.setMetronomeEnabled(!on)}><span /></button>
      </div>
      <div className="pr-metro-group">
        <span className="pr-metro-line">
          {t`Click volume`} · {pct}%
          {volume !== 1 && <button className="o-link" onClick={() => store.setMetronomeVolume(1)}>{t`Reset to 100%`}</button>}
        </span>
        <input type="range" min={0} max={150} step={5} value={pct} aria-label={t`Click volume`} className="pliage-slider-amber"
          onChange={(e) => store.setMetronomeVolume(Number(e.target.value) / 100)}
          style={{ '--fill': `${pct / 1.5}%` } as React.CSSProperties} />
        <span className="pr-metro-small">{t`Goes up to 150%, for loud rooms.`}</span>
      </div>
      <div className="pr-metro-group">
        <span className="pr-metro-line">{t`Count-in before the music starts`}</span>
        <div className="o-seg" role="group" aria-label={t`Count-in bars`} style={{ display: 'flex' }}>
          <button aria-pressed={!countInEnabled} onClick={() => store.setCountInEnabled(false)}>{t`Off`}</button>
          {BARS.map(n => (
            <button key={n} aria-pressed={countInEnabled && countInBars === n} aria-label={t`${n} bars`}
              onClick={() => { store.setCountInBars(n); store.setCountInEnabled(true) }}>{n === 1 ? t`1 bar` : n}</button>
          ))}
        </div>
      </div>
      <span className="pr-metro-note">{t`The clicks follow the song’s own tempo, even where it changes.`}</span>
    </div>
  )
}
