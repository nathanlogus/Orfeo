import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { cancelCountIn } from '../utils/countInRunner'
import { t } from '../utils/i18n'
import '../styles/redesign-tools.css'

// ── Big 1-2-3-4 over the piano roll while a count-in runs (see
// utils/countInRunner.ts). Follows the click schedule by wall clock; the
// disc changes in the same frame as the click, with no animation. ────────────────────────────────────
export function CountInOverlay() {
  const countIn = useStore((s) => s.countIn)
  const [shown, setShown] = useState<{ n: number; key: number } | null>(null)
  useEffect(() => {
    if (!countIn) { setShown(null); return }
    let raf = 0
    const tick = () => {
      const t = (performance.now() - countIn.startPerf) / 1000
      let idx = -1
      for (let i = 0; i < countIn.clicks.length; i++) if (countIn.clicks[i].rel <= t) idx = i
      setShown(idx >= 0 ? { n: countIn.clicks[idx].n, key: idx } : null)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [countIn])
  if (!countIn || !shown) return null
  const beats = Math.max(...countIn.clicks.map(c => c.n))
  const bars = Math.round(countIn.clicks.length / beats)
  const [a, b] = countIn.clicks
  const bpm = b ? Math.round(60 / (b.rel - a.rel)) : null
  return (
    <div aria-live="polite" className="xp-countin">
      <div className="xp-countin-disc">{shown.n}</div>
      <div className="xp-countin-dots" aria-hidden="true">
        {Array.from({ length: beats }, (_, i) => <i key={i} data-on={i < shown.n ? (i === 0 ? '1' : '') : undefined} />)}
      </div>
      <span className="xp-countin-note">{t`Count-in`} · {bars === 1 ? t`1 bar` : t`${bars} bars`}{bpm ? ` ${t`at`} ${bpm} BPM` : ''}</span>
      <button data-instant onClick={cancelCountIn}>{t`Tap to cancel`}</button>
    </div>
  )
}
