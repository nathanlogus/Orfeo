// ── Shared Arcade screens: the keyboard, stars, Meet it, and the end of a run ──
import { useEffect, useRef, useState } from 'react'
import { Lightbulb, RotateCcw, Star, Volume2 } from 'lucide-react'
import { useStore } from '../store'
import { t } from '../utils/i18n'
import { ringChord } from '../utils/explorerShared'
import { miniKeyboardLayout } from '../utils/miniKeyboard'
import { chordOf, type Target } from './library/chords'
import { chordLabel, onKeyDown } from './keys'

// C3 up to B5: every lit voicing fits, and it stays put from chord to chord
const BOARD = [48, 83]
const MEET_CHORD_MS = 900
// A key still being lifted from the last chord isn't a request to go again
const RETRY_ARM_MS = 700

export function ArcadeKeys({ lit }: { lit: number[] }) {
  const held = useStore(s => s.midiHeldKeys)
  const { whites, blacks } = miniKeyboardLayout(BOARD)
  const want = new Set(lit)
  const state = (midi: number) => (held.has(midi) ? 'root' : want.has(midi) ? 'on' : undefined)
  return (
    <div className="xp-mini ac-keys" role="img" aria-label={t`Piano. Keys to play are lit.`}>
      {whites.map(k => <i key={k.midi} data-lit={state(k.midi)} />)}
      {blacks.map(k => <b key={k.midi} data-lit={state(k.midi)} style={{ left: `${k.x}%`, width: `${62 / whites.length}%` }} />)}
    </div>
  )
}

export function Stars({ count, of = 3 }: { count: number; of?: number }) {
  return (
    <span className="ac-stars" role="img" aria-label={t`${count} of ${of} stars`}>
      {Array.from({ length: of }, (_, i) => <Star key={i} size={16} aria-hidden fill={i < count ? 'currentColor' : 'none'} />)}
    </span>
  )
}

export function NeedKeyboard() {
  return <div role="alert" className="lib-alert ac-alert"><span className="o-dot o-dot-alert" />{t`The Arcade is played on a MIDI keyboard. Connect one to start.`}</div>
}

// Meet it: a short card that plays the idea, then says it
export function MeetCard({ title, text, numerals, connected, assist, onStart, onBack }: {
  title: string; text: string; numerals: string[]; connected: boolean; assist: boolean; onStart: (assist: boolean) => void; onBack: () => void
}) {
  const [step, setStep] = useState(-1)
  const [plays, setPlays] = useState(1)
  const chords: Target[] = numerals.map(n => chordOf(n, 'C'))
  useEffect(() => {
    const timers = chords.map((chord, i) => setTimeout(() => { setStep(i); ringChord(chord.keys) }, i * MEET_CHORD_MS))
    timers.push(setTimeout(() => setStep(-1), chords.length * MEET_CHORD_MS))
    return () => timers.forEach(clearTimeout)
  }, [plays]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && connected && !(e.target instanceof HTMLButtonElement)) onStart(false)
      if (e.key === 'Escape') onBack()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [connected, onStart, onBack])

  return (
    <div className="ac-sheet pliage-rise-in">
      <span className="lib-tag" style={{ background: 'var(--paint-yellow)' }}>{t`Meet it`}</span>
      <h1 className="ac-title">{title}</h1>
      <p className="ac-text">{text}</p>
      <div className="ac-meet-chords">
        {chords.map((chord, i) => <span key={chord.numeral} className="ac-meet-chord" data-on={i === step || undefined}>{chordLabel(chord.name)}</span>)}
        <button className="o-icon-btn" aria-label={t`Hear it again`} onClick={() => setPlays(p => p + 1)}><Volume2 size={18} /></button>
      </div>
      <ArcadeKeys lit={step >= 0 ? chords[step].keys : []} />
      {!connected && <NeedKeyboard />}
      <div className="ac-actions">
        <button className="o-btn-primary o-btn-lg" disabled={!connected} onClick={() => onStart(false)}>{t`Play it`}</button>
        {assist && <button className="o-btn-quiet o-btn-lg" disabled={!connected} onClick={() => onStart(true)}><Lightbulb size={16} aria-hidden />{t`Play with Assist`}</button>}
        <button className="o-btn-quiet o-btn-lg" onClick={onBack}>{t`Back`}</button>
      </div>
    </div>
  )
}

export interface RunSummary { cleared: boolean; stars: number; score: number; best: number; accuracy: number; bestCombo: number; assist: boolean }

// Game over and clear share one card. Retry is one key: any on the piano, or Enter.
export function ResultCard({ summary, concept, endless, assistOffered, onRetry, onBack }: {
  summary: RunSummary; concept: string; endless: boolean; assistOffered: boolean; onRetry: (assist: boolean) => void; onBack: () => void
}) {
  const { cleared, stars, score, best, accuracy, bestCombo, assist } = summary
  const retry = useRef(onRetry)
  retry.current = onRetry
  useEffect(() => {
    const armed = performance.now() + RETRY_ARM_MS
    const off = onKeyDown(() => { if (performance.now() >= armed) retry.current(assist) })
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'Enter' || e.key === ' ') && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); retry.current(assist) }
      if (e.key === 'Escape') onBack()
    }
    window.addEventListener('keydown', onKey)
    return () => { off(); window.removeEventListener('keydown', onKey) }
  }, [assist, onBack])

  return (
    <div className="ac-veil">
      <div className="ac-sheet ac-result pliage-rise-in" role="status">
        <h2 className="ac-title">{cleared ? t`The village sleeps` : endless ? t`The night is over` : t`The lanterns went out`}</h2>
        {!endless && <Stars count={cleared ? stars : 0} />}
        <dl className="ac-numbers">
          <div><dt>{t`Score`}</dt><dd>{score.toLocaleString()}</dd></div>
          <div><dt>{t`Best`}</dt><dd>{best.toLocaleString()}</dd></div>
          <div><dt>{t`Clean chords`}</dt><dd>{`${Math.round(accuracy * 100)}%`}</dd></div>
          <div><dt>{t`Top combo`}</dt><dd>{bestCombo}</dd></div>
        </dl>
        <p className="ac-text">{`${t`You just played:`} ${concept}`}{assist ? ` ${t`Assist caps a clear at one star.`}` : ''}</p>
        <div className="ac-actions">
          <button className="o-btn-primary o-btn-lg" onClick={() => onRetry(assist)}><RotateCcw size={16} aria-hidden />{t`Retry`}</button>
          {!assist && assistOffered && <button className="o-btn-quiet o-btn-lg" onClick={() => onRetry(true)}><Lightbulb size={16} aria-hidden />{t`Retry with Assist`}</button>}
          <button className="o-btn-quiet o-btn-lg" onClick={onBack}>{t`Back to the Hollow`}</button>
        </div>
        <p className="o-note ac-hint">{t`Press any piano key or Enter to retry.`}</p>
      </div>
    </div>
  )
}
