// ── Echo: a run on screen. The rules live in run.ts ───────────────────────────
import { useEffect, useReducer, useRef, useState } from 'react'
import { Check, RotateCcw, X } from 'lucide-react'
import { t } from '../../utils/i18n'
import type { GameProps } from '../games'
import { chordLabel, noteLabel, onKeyDown } from '../keys'
import { openDeep, type Deep } from './deepsong'
import { LIVES, createRun, multiplierFor, rightForThree, scheduleOf, starsFor, type RunEvent } from './run'
import type { Step } from './phrases'
import type { Stage } from './stages'
import './echo.css'

// A breath before the whale sings, so its first note doesn't land on the last key
const LEAD_MS = 700
const REVEAL_MS = 1900
const FINISH_MS = 1400
const VELOCITY = 84
// The world draws at 30 fps: it drifts, nothing in it needs more
const FRAME_MS = 1000 / 30
const SPEECH_TOP = 96
const reducedMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
const play = (keys: number[], ms: number) => keys.forEach(k => (window as any).__pliagePlayNote?.(k, VELOCITY, ms, undefined, false)) // eslint-disable-line @typescript-eslint/no-explicit-any

const stepLabel = (step: Step) => (step.chord ? chordLabel(step.chord.name) : noteLabel(step.keys[0]))

export default function Echo({ stage, assist, paused, weak, hud, keys, hint, miss, finish }: GameProps<Stage>) {
  const [run] = useState(() => createRun({ stage, assist, rng: Math.random, weak, emit: e => handler.current(e) }))
  const [, draw] = useReducer((n: number) => n + 1, 0)
  const [sung, setSung] = useState(0)
  const [points, setPoints] = useState<number | null>(null)
  const host = useRef<HTMLDivElement>(null)
  const says = useRef<HTMLDivElement>(null)
  const [world, setWorld] = useState<Deep | null>(null)
  const [failed, setFailed] = useState(false)
  const sea = useRef<Deep | null>(null)
  sea.current = world
  const timers = useRef<number[]>([])
  const held = useRef(paused)
  held.current = paused
  const boss = stage.kind === 'boss'
  const endless = stage.kind === 'endless'
  const chords = endless

  const clear = () => { timers.current.forEach(clearTimeout); timers.current = [] }
  const after = (ms: number, then: () => void) => { timers.current.push(window.setTimeout(then, ms)) }

  // By ear: the phrase is never lit before it is answered, except Assist's first note
  function lit() {
    const { steps } = run.phrase
    if (run.state.phase === 'reveal') keys({ sun: steps.flatMap(s => s.keys) })
    else keys({ sun: run.state.phase === 'answer' && assist ? steps[0].keys : [] })
  }

  function sing() {
    clear()
    setSung(0)
    hint(t`Listen. The keys stay dark: this one is by ear.`)
    lit()
    const { notes, done } = scheduleOf(run.phrase, assist)
    notes.forEach((note, i) => after(LEAD_MS + note.at, () => { play(note.keys, note.ms); setSung(i + 1); sea.current?.ripple() }))
    after(LEAD_MS + done, () => {
      run.sung()
      hint(assist ? t`The first note is yours. No timer here.` : t`No timer here. A phrase counts as missed only once you finish it wrong.`)
      lit()
      draw()
    })
  }

  const syncHud = () => {
    const { score, combo, fails, played } = run.state
    hud({
      score, combo, multiplier: multiplierFor(combo), lives: LIVES - fails,
      detail: boss ? t`Part ${Math.min(run.state.right + 1, run.goal)} of ${run.goal}` : endless ? t`Phrase ${played + 1}` : `${t`Phrase ${Math.min(played + 1, run.goal)} of ${run.goal}`} · ${t`No timer`}`,
    })
  }

  function report(cleared: boolean) {
    const { score, right, played, noReplay, bestCombo } = run.state
    const stars = cleared ? starsFor(run.accuracy, assist) : 0
    const need = rightForThree(played)
    finish({
      cleared, stars, score,
      title: cleared ? (boss ? t`The ancient whale sang with you` : t`The ocean is singing`) : endless ? t`The song drifts away` : right ? t`The whale swam on, after ${right} phrases together` : t`The whale swam on`,
      goal: !cleared ? null : assist ? t`A clear with Assist on earns 1 star.` : stars === 3 ? null : t`Three stars needs ${need} right answers out of ${played}. You were ${need - right} short.`,
      stats: [{ label: t`Phrases right`, value: `${right} / ${played}` }, { label: t`Without a replay`, value: String(noReplay) }, { label: t`Top combo`, value: String(bestCombo) }],
    })
  }

  const handler = useRef<(e: RunEvent) => void>(() => undefined)
  handler.current = (e: RunEvent) => {
    switch (e.type) {
      case 'phrase':
        setPoints(null)
        sing()
        break
      case 'replay':
        sing()
        break
      case 'answered':
        setPoints(e.points)
        hint(e.right ? t`That's it: ${e.phrase.name}` : t`It went like this: ${e.phrase.name}`)
        if (!e.right) miss(e.phrase.id, e.phrase.name)
        lit()
        after(reducedMotion() ? REVEAL_MS / 2 : REVEAL_MS, () => run.next())
        break
      case 'end':
        keys({ sun: [] })
        after(reducedMotion() ? 0 : FINISH_MS, () => report(e.cleared))
        break
    }
    syncHud()
    draw()
  }

  useEffect(() => { keys({ labels: false }); syncHud() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let closed = false
    let opened: Deep | null = null
    openDeep(host.current!, boss, reducedMotion()).then(w => {
      if (closed) w.dispose()
      else { opened = w; setWorld(w) }
    }).catch(e => { console.error('[Pliage Arcade] world failed to load:', e); setFailed(true) })
    return () => { closed = true; opened?.dispose() }
  }, [boss])

  useEffect(() => {
    if (!world) return
    let raf = 0
    let last = performance.now()
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      if (now - last < FRAME_MS) return
      world.frame(Math.min(0.1, (now - last) / 1000), held.current)
      last = now - (now - last) % FRAME_MS
      const at = world.speechAt()
      if (says.current) says.current.style.transform = `translate(${at.x}px, ${Math.max(SPEECH_TOP, at.y)}px) translate(-50%, 0)`
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [world]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => onKeyDown((key, stamp, down) => { if (!held.current) run.noteOn(key, stamp, down) }), [run])

  // Pause hushes the whale: the phrase starts over, at no cost, when play resumes
  useEffect(() => {
    if (paused) return
    if (run.state.phase === 'singing') sing()
    else if (run.state.phase === 'reveal') after(REVEAL_MS, () => run.next())
    return clear
  }, [paused]) // eslint-disable-line react-hooks/exhaustive-deps

  const { phase, cleared } = run.state
  const { phrase, marks } = run
  const near = cleared ? 1 : run.near
  const right = marks.every(m => m === 'right')
  const total = phrase.steps.length
  const done = marks.length
  const answering = phase === 'answer'
  const revealed = phase === 'reveal' || phase === 'over'

  useEffect(() => { world?.near(near) }, [world, near])

  const slot = (step: Step, i: number) => {
    const mark = marks[i]
    if (revealed || (assist && i === 0)) return <span key={i} className="ee-slot" data-state={mark ?? 'right'}>{stepLabel(step)}</span>
    if (mark) return <span key={i} className="ee-slot" data-state={mark}>{mark === 'right' ? <Check size={22} strokeWidth={2.6} aria-hidden /> : <X size={22} strokeWidth={2.6} aria-hidden />}</span>
    if (answering && i === done) return <span key={i} className="ee-slot" data-state="now">?</span>
    return <span key={i} className="ee-slot" data-state={phase === 'singing' && i < sung ? 'sung' : undefined} />
  }

  return (
    <>
      <div className="ee"><div ref={host} className="ac-stage" /></div>
      <div ref={says} className="ee-says"><span>{phase === 'singing' ? t`Singing` : answering ? t`Waiting for you` : right ? t`Closer now` : t`Drifting off`}</span></div>

      <section className="ee-panel" aria-label={t`The whale's phrase`}>
        <div className="ee-panel-head">
          <span>{phase === 'singing' ? (run.replayed ? t`Listen again` : boss ? t`The ancient whale is singing` : t`The whale is singing`) : revealed ? phrase.name : t`Your turn: sing it back`}</span>
          <span>{revealed ? (right && points !== null ? `+${points}` : t`Missed`) : chords ? t`${done} of ${total} chords` : t`${done} of ${total} notes`}</span>
        </div>
        <div className="ee-slots" role="img" aria-label={t`${done} of ${total} played`} style={{ '--slots': total } as React.CSSProperties}>
          {phrase.steps.map(slot)}
        </div>
        <div className="ee-panel-foot">
          <button className="ee-replay" disabled={!answering || paused} onClick={run.replay}><RotateCcw size={18} strokeWidth={2} aria-hidden />{t`Hear it again`}</button>
          {!revealed && <span>{run.replayed ? t`The bonus has gone. Take your time.` : t`Answer without a replay for the bonus`}</span>}
        </div>
      </section>
      {failed && <div role="alert" className="lib-alert ac-paused">{t`Deep Song couldn't load its art.`}</div>}
    </>
  )
}
