import { useEffect, useRef, useState } from 'react'
import { Hourglass, Pause, Play, Repeat, Shrink } from 'lucide-react'
import { useStore } from '../../store'
import { usePlayback } from '../../hooks/usePlayback'
import { isCountingIn, cancelCountIn } from '../../utils/countInRunner'
import { t } from '../../utils/i18n'
import { touchScreen } from '../../utils/touchScreen'

const HIDE_AFTER_MS = 3000

// ── Presentation Mode's small toolbar: there is no top bar to reach by finger,
// so this is how a tablet leaves. Any pointer move or tap brings it back. ───
export default function PresentationBar() {
  const [shown, setShown] = useState(true)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const playing = useStore((s) => s.playbackState === 'playing')
  const name = useStore((s) => s.midi?.fileName?.replace(/\.[^.]+$/, '') ?? '')
  const totalBars = useStore((s) => s.barStarts.length)
  const bar = useStore((s) => {
    let lo = 0, hi = s.barStarts.length - 1
    if (hi < 0) return 0
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (s.barStarts[mid] <= s.currentTime) lo = mid
      else hi = mid - 1
    }
    return lo + 1
  })
  const { play, pause, toggleLoop } = usePlayback()
  const looping = useStore((s) => s.loopRegionActive)
  const waiting = useStore((s) => s.waitForNotes)
  const keysTop = useStore((s) => s.keyboardTopY)

  useEffect(() => {
    const wake = () => {
      setShown(true)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setShown(false), HIDE_AFTER_MS)
    }
    wake()
    window.addEventListener('pointermove', wake)
    window.addEventListener('pointerdown', wake)
    return () => {
      if (timer.current) clearTimeout(timer.current)
      window.removeEventListener('pointermove', wake)
      window.removeEventListener('pointerdown', wake)
    }
  }, [])

  const hint = (
    <div className="pr-present-hint" style={keysTop !== null ? { top: keysTop - 60, bottom: 'auto' } : undefined}>
      {shown ? t`Controls hide after 3 seconds` : touchScreen ? t`Tap anywhere to show controls` : t`Move the mouse to show controls`}
    </div>
  )
  if (!shown) return hint
  return (
    <>
      <div role="toolbar" aria-label={t`Presentation controls`} className="pr-present app-no-drag" data-instant>
        <button className="pr-present-exit" aria-label={t`Exit presentation mode`} onClick={() => useStore.getState().setPresentationMode(false)}>
          <Shrink size={18} strokeWidth={1.8} />
        </button>
        <button className="pr-present-play" aria-label={playing ? t`Pause` : t`Play`}
          onClick={() => { if (isCountingIn()) cancelCountIn(); else if (playing) pause(); else play() }}>
          {playing ? <Pause size={20} fill="currentColor" strokeWidth={0} /> : <Play size={20} fill="currentColor" strokeWidth={0} style={{ marginLeft: 3 }} />}
        </button>
        <button className="pr-present-toggle" aria-label={t`Loop`} aria-pressed={looping} onClick={toggleLoop}><Repeat size={18} strokeWidth={1.8} /></button>
        <button className="pr-present-toggle" aria-label={t`Wait for notes`} aria-pressed={waiting} onClick={() => useStore.getState().setWaitForNotes(!waiting)}><Hourglass size={18} strokeWidth={1.8} /></button>
        <span className="pr-present-text">{name}{totalBars > 0 && ` · bar ${bar} / ${totalBars}`}</span>
      </div>
      {hint}
    </>
  )
}
