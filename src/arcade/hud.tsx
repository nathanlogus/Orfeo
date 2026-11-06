// ── The HUD and keyboard every game shares ────────────────────────────────────
import { useEffect, useMemo, useRef } from 'react'
import { Pause, X } from 'lucide-react'
import { useStore } from '../store'
import { t } from '../utils/i18n'
import { noteLabel } from './keys'

export interface HudState { score: number; combo: number; multiplier: number; detail: string; lives: number }
export interface KeysState {
  sun: number[]             // keys to play, yellow
  labels: boolean           // name the yellow keys
  names?: string[]          // their names, in `sun` order, when a chord spells them its own way
  split: number             // the key the hands divide at, 0 for none: held and lit keys below it go blue, the rest pink
  from: number
  octaves: number
}

export const HUD_START: HudState = { score: 0, combo: 0, multiplier: 1, detail: '', lives: 3 }
export const KEYS_START: KeysState = { sun: [], labels: true, split: 0, from: 48, octaves: 3 }
const MAX_LIVES = 3
const BLACK = [1, 3, 6, 8, 10]
const BLACK_WIDTH = 0.62

export function ArcadeHud({ label, state, onLeave, onPause }: { label: string; state: HudState; onLeave: () => void; onPause: () => void }) {
  const { score, combo, multiplier, detail, lives } = state
  return (
    <header className="ac-hud">
      <div className="ac-hud-side">
        <button className="ac-hud-round" aria-label={t`Leave the game`} onClick={onLeave}><X size={20} strokeWidth={2.4} aria-hidden /></button>
        <div className="ac-hud-box">
          <span className="ac-hud-score">{score.toLocaleString()}</span>
          {combo > 0 && <span className="ac-hud-combo">{`×${multiplier}`} <span>{t`· ${combo} in a row`}</span></span>}
        </div>
      </div>
      <div className="ac-hud-box ac-hud-stage"><b>{label}</b>{detail && <span>{detail}</span>}</div>
      <div className="ac-hud-side">
        <div className="ac-hud-box ac-hud-lives" role="img" aria-label={t`${lives} of ${MAX_LIVES} lives left`}>
          {Array.from({ length: MAX_LIVES }, (_, i) => (
            <svg key={i} width="24" height="28" viewBox="56 20 148 216" aria-hidden data-lit={i < lives || undefined}>
              <path className="ac-life-sheet" d="M60,24 L196,24 L196,132 L96,232 L60,232 Z" />
              <path className="ac-life-fold" d="M196,132 L96,232 L96,132 Z" />
            </svg>
          ))}
        </div>
        <button className="ac-hud-round" aria-label={t`Pause`} onClick={onPause}><Pause size={18} fill="currentColor" aria-hidden /></button>
      </div>
    </header>
  )
}

// The keys are drawn once; a held key is set on the element as its note arrives,
// so what you press never waits for React.
export function ArcadeKeys({ sun, labels, names, split, from, octaves }: KeysState) {
  const box = useRef<HTMLDivElement>(null)
  const { whites, blacks, width } = useMemo(() => {
    const keys = Array.from({ length: octaves * 12 + 1 }, (_, i) => from + i)
    const isWhite = (k: number) => !BLACK.includes(k % 12)
    const whites = keys.filter(isWhite)
    return { whites, width: 100 / whites.length, blacks: keys.filter(k => !isWhite(k)).map(k => ({ key: k, slot: keys.slice(0, k - from).filter(isWhite).length })) }
  }, [from, octaves])

  useEffect(() => {
    const paint = (held: Set<number>, before: Set<number>) => {
      const key = (k: number) => box.current?.querySelector(`[data-key="${k}"]`)
      for (const k of before) if (!held.has(k)) key(k)?.removeAttribute('data-held')
      for (const k of held) if (!before.has(k)) key(k)?.setAttribute('data-held', split && k < split ? 'left' : 'right')
    }
    paint(useStore.getState().midiHeldKeys, new Set())
    return useStore.subscribe((s, prev) => { if (s.midiHeldKeys !== prev.midiHeldKeys) paint(s.midiHeldKeys, prev.midiHeldKeys) })
  }, [split, whites])

  const want = new Set(sun)
  const lit = (k: number) => (want.has(k) ? (split ? (k < split ? 'left' : 'right') : true) : undefined)
  const text = (k: number) => (labels && want.has(k) ? names?.[sun.indexOf(k)] ?? noteLabel(k) : null)
  const named = (names ?? sun.map(noteLabel)).join(' ')
  return (
    <div ref={box} className="ac-keys" role="img" aria-label={named ? t`Keyboard, lit: ${named}` : t`Keyboard`}>
      {whites.map((k, i) => <i key={k} data-key={k} data-sun={lit(k)} style={{ left: `${i * width}%`, width: `${width}%` }}><span>{text(k)}</span></i>)}
      {blacks.map(({ key: k, slot }) => <b key={k} data-key={k} data-sun={lit(k)} style={{ left: `${(slot - BLACK_WIDTH / 2) * width}%`, width: `${width * BLACK_WIDTH}%` }}><span>{text(k)}</span></b>)}
      {split > 0 && <u style={{ left: `${whites.filter(k => k < split).length * width}%` }} />}
    </div>
  )
}
