// ── Scale Climb: a run on screen. The rules live in run.ts ────────────────────
// The climb itself is drawn in summit.ts; the ladder and evenness panels are DOM.
import { useEffect, useRef, useState } from 'react'
import { t } from '../../utils/i18n'
import { ringChord } from '../../utils/explorerShared'
import { gameClock } from '../clock'
import type { GameProps } from '../games'
import { chordLabel, onKeyDown, spelledLabels } from '../keys'
import { openSummit, type Summit } from './summit'
import { THREE_STAR_ACCURACY, THREE_STAR_EVENNESS, createRun, multiplierFor, starsFor, type Gap, type Run, type RunEvent } from './run'
import type { Climb, Stage } from './stages'
import './scaleClimb.css'

const LADDER_RUNGS = 8
const BAR_HEIGHT = 30
const BAR_MIN = 14
const BAR_MAX = 44
const STRAINING = 0.66
const POINTS_MS = 650
const FINISH_MS = 900
const reducedMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
const percent = (share: number) => Math.round(share * 100)

interface Shown { climb: Climb; pos: number; gaps: Gap[] }

function hintFor(climb: Climb, pos: number, octaves: number) {
  const [tonic] = spelledLabels([climb.keys[0]], [climb.tonic])
  if (pos > climb.top) return t`Back down to ${tonic} without stopping`
  return octaves === 2 ? t`Two octaves up to ${tonic}, then back down without stopping` : t`Up to ${tonic}, then back down without stopping`
}

const octavesOf = (climb: Climb) => Math.round(climb.top / 7)

// The route's notes as a ladder, high to low, keeping the next note in view
function Ladder({ climb, pos }: { climb: Climb; pos: number }) {
  const labels = spelledLabels(climb.keys, climb.notes)
  const rungs = [...new Set(climb.keys)].sort((a, b) => b - a)
  const next = climb.keys[pos] as number | undefined
  const down = pos > climb.top
  const at = next === undefined ? rungs.length - 1 : rungs.indexOf(next)
  const from = Math.max(0, Math.min(rungs.length - LADDER_RUNGS, at - Math.floor(LADDER_RUNGS / 2)))
  return (
    <section className="sc-ladder" aria-label={t`The scale as a ladder`}>
      <span className="sc-ladder-title">{chordLabel(climb.tonic)}{climb.name.slice(climb.tonic.length)}</span>
      {rungs.slice(from, from + LADDER_RUNGS).map(key => {
        const state = key === next ? 'next' : next === undefined || (down ? key > next : key < next) ? 'done' : 'ahead'
        const end = down ? key === rungs[rungs.length - 1] : key === rungs[0]
        return (
          <span key={key} className="sc-rung" data-state={state}>
            {labels[climb.keys.indexOf(key)]}
            {state === 'next' ? <small>{t`next`}</small> : end && state === 'ahead' && <small>{down ? t`end` : t`top`}</small>}
          </span>
        )
      })}
    </section>
  )
}

function Evenness({ gaps, slip }: { gaps: Gap[]; slip: number }) {
  const off = [...gaps].reverse().find(g => !g.even)
  const [from, to] = off ? [off.from, off.to] : ['', '']
  const words = gaps.map(g => (g.even ? t`even` : g.ms > g.ref ? t`a little long` : t`a little short`)).join(', ')
  return (
    <section className="sc-even" aria-label={t`Evenness`}>
      <span className="sc-even-title">{t`Even steps climb faster`}</span>
      <div className="sc-bars" role="img" aria-label={gaps.length ? t`Your last ${gaps.length} steps, gaps between notes: ${words}` : t`No steps yet`}>
        {gaps.map((g, i) => <span key={i} data-off={!g.even || undefined} style={{ height: Math.max(BAR_MIN, Math.min(BAR_MAX, BAR_HEIGHT * g.ms / g.ref)) }} />)}
      </div>
      <span className="sc-even-text">
        {off && (off.ms > off.ref ? t`${from} to ${to} took a little longer.` : t`${from} to ${to} came a little quick.`)}{off && ' '}
        {slip === 1 ? t`A wrong note slips you back one step.` : t`A wrong note slips you back ${slip} steps.`}
      </span>
    </section>
  )
}

export default function ScaleClimb({ stage, assist, paused, weak, hud, keys, hint, miss, finish }: GameProps<Stage>) {
  const host = useRef<HTMLDivElement>(null)
  const points = useRef<HTMLSpanElement>(null)
  const [world, setWorld] = useState<Summit | null>(null)
  const [failed, setFailed] = useState(false)
  const [shown, setShown] = useState<Shown>({ climb: stage.scales[0], pos: 0, gaps: [] })
  const held = useRef(paused)
  held.current = paused
  const endless = stage.kind === 'endless'
  const boss = stage.kind === 'boss'

  useEffect(() => {
    let closed = false
    let opened: Summit | null = null
    openSummit(host.current!, reducedMotion()).then(w => {
      if (closed) w.dispose()
      else { opened = w; setWorld(w) }
    }).catch(e => { console.error('[Pliage Arcade] world failed to load:', e); setFailed(true) })
    return () => { closed = true; opened?.dispose() }
  }, [])

  useEffect(() => {
    if (!world) return
    const clock = gameClock(performance.now())
    let run: Run | null = null
    let leaving = 0
    let shownHint = ''
    let lit = -1
    let strained = false

    const sync = () => {
      if (!run) return
      const { score, combo, lives } = run.state
      hud({ score, combo, multiplier: multiplierFor(combo), lives })
      setShown({ climb: run.climb, pos: run.pos, gaps: run.gaps })
      if (run.resting) return
      const next = run.climb.keys[run.pos]
      if (next !== lit && assist) {
        lit = next
        keys({ sun: [next], names: spelledLabels([next], [run.climb.notes[run.pos]]) })
      }
      const words = hintFor(run.climb, run.pos, octavesOf(run.climb))
      if (words !== shownHint) hint(shownHint = words)
    }

    function report(cleared: boolean) {
      const { score, bestCombo, climbs } = run!.state
      const accuracy = run!.accuracy, evenness = run!.evenness
      const stars = cleared ? starsFor(accuracy, evenness, assist) : 0
      const a = percent(accuracy), e = percent(evenness)
      finish({
        cleared, stars, score,
        title: cleared ? t`You reached the summit` : endless ? (climbs === 1 ? t`The mountain won, after 1 climb` : t`The mountain won, after ${climbs} climbs`) : climbs ? t`You fell, but you topped out ${climbs} of ${run!.total}` : t`You fell before the top`,
        goal: !cleared ? null : assist ? t`A clear with Assist on earns 1 star.` : stars === 3 ? null : t`Three stars needs ${THREE_STAR_ACCURACY}% accuracy and ${THREE_STAR_EVENNESS}% even steps. You had ${a}% and ${e}%.`,
        stats: [
          { label: t`Accuracy`, value: `${a}%` },
          { label: t`Even steps`, value: `${e}%` },
          { label: t`Top combo`, value: String(bestCombo) },
        ],
      })
    }

    const emit = (e: RunEvent) => {
      switch (e.type) {
        case 'climb':
          hud({ detail: endless ? t`Climb ${e.index}: ${e.climb.name}` : boss ? t`Key ${e.index} of ${e.total}: ${e.climb.name}` : t`Climb ${e.index} of ${e.total}` })
          world.start(e.climb.keys.length)
          lit = -1
          if (!assist) keys({ sun: [] })
          sync()
          break
        case 'step':
          if (e.top) world.top()
          else world.step(run!.pos, e.even)
          if (points.current) {
            const { x, y } = world.handsAt()
            points.current.textContent = `+${e.points}`
            points.current.style.left = `${x}px`
            points.current.style.top = `${y}px`
            if (!reducedMotion()) points.current.animate([{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(-34px)' }], POINTS_MS)
          }
          sync()
          break
        case 'slip':
          miss(e.climb.id, e.climb.name)
          world.slip(run!.pos, stage.slip)
          sync()
          break
        case 'fall':
          world.fall()
          sync()
          break
        case 'riff': {
          const { name } = e.riff
          hint(shownHint = t`Your scale in real music: ${name}`)
          keys({ sun: [], names: undefined })
          sync()
          break
        }
        case 'ring':
          ringChord([e.key])
          keys({ sun: [e.key], names: undefined })
          break
        case 'end':
          leaving = window.setTimeout(() => report(e.cleared), reducedMotion() ? 0 : FINISH_MS)
          break
      }
    }

    run = createRun({ stage, assist, emit, weak })
    sync()
    const off = onKeyDown((key, stamp) => { if (!held.current) run!.noteOn(key, clock.at(stamp)) })

    let raf = 0
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const game = held.current ? clock.hold(now) : clock.tick(now)
      run!.tick(game)
      const straining = run!.strain(game) > STRAINING
      if (straining !== strained) world.strain(strained = straining)
      world.frame(now)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(leaving)
      off()
    }
  }, [world]) // eslint-disable-line react-hooks/exhaustive-deps

  const { climb, pos, gaps } = shown
  return (
    <>
      <div ref={host} className="ac-stage" />
      <div className="ac-tags" aria-hidden><span ref={points} className="sc-points" /></div>
      <Ladder climb={climb} pos={pos} />
      <Evenness gaps={gaps} slip={stage.slip} />
      {failed && <div role="alert" className="lib-alert ac-paused">{t`The Summit couldn't load its art.`}</div>}
    </>
  )
}
