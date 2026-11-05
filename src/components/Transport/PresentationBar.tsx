import { useEffect, useRef, useState } from 'react'
import { Pause, Play, Shrink } from 'lucide-react'
import { useStore } from '../../store'
import { usePlayback } from '../../hooks/usePlayback'
import { isCountingIn, cancelCountIn } from '../../utils/countInRunner'
import { t } from '../../utils/i18n'

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
  const { play, pause } = usePlayback()

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

  if (!shown) return null
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
        <span className="pr-present-text">{name}{totalBars > 0 && ` · bar ${bar} / ${totalBars}`}</span>
      </div>
      <div className="pr-present-hint">{t`Controls hide after 3 seconds`}</div>
    </>
  )
}
