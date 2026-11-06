import { useEffect, type RefObject } from 'react'
import { useStore } from '../store'

type Click = { rel: number; n: number }

const DECAY_SEC = 0.45   // a slow tempo's pulse still snaps, it doesn't drag
const OFF_BEAT = 0.7     // the first beat of the bar hits hardest
const EXIT_FROM = 0.55   // the last beat opens out over its second half

// Where the pulse is at `t` seconds into the count-in. pulse: 1 on the beat,
// falling to 0. exit: 0 to 1 across the end of the last beat, into the first note.
export function beatPulse(clicks: Click[], total: number, t: number): { pulse: number; exit: number } {
  let i = -1
  for (let k = 0; k < clicks.length; k++) if (clicks[k].rel <= t) i = k
  if (i < 0) return { pulse: 0, exit: 0 }
  const last = i === clicks.length - 1
  const beat = (last ? total : clicks[i + 1].rel) - clicks[i].rel
  const since = t - clicks[i].rel
  const fall = Math.max(0, 1 - since / Math.min(beat, DECAY_SEC))
  const pulse = fall * fall * (clicks[i].n === 1 ? 1 : OFF_BEAT)
  const exit = last ? Math.min(1, Math.max(0, (since / beat - EXIT_FROM) / (1 - EXIT_FROM))) : 0
  return { pulse, exit }
}

// ── Drives the count-in disc from the click schedule itself, so it holds at any
// tempo. Sets two CSS variables; the look stays in motion-expressive.css. ─────
export function useCountInPulse(disc: RefObject<HTMLElement | null>) {
  const countIn = useStore(s => s.countIn)
  useEffect(() => {
    if (!countIn) return
    let raf = 0
    const tick = () => {
      const { pulse, exit } = beatPulse(countIn.clicks, countIn.total, (performance.now() - countIn.startPerf) / 1000)
      disc.current?.style.setProperty('--pulse', pulse.toFixed(3))
      disc.current?.style.setProperty('--exit', exit.toFixed(3))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [countIn, disc])
}
