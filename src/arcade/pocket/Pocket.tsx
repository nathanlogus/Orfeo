// ── Pocket: a run on screen. The rules live in run.ts ─────────────────────────
import { useEffect, useRef, useState } from 'react'
import { metronomeContext, scheduleMetronomeClick } from '../../hooks/useMetronome'
import { latencyOffsetSec } from '../../store/midiSettings'
import { t } from '../../utils/i18n'
import { gameClock } from '../clock'
import type { GameProps } from '../games'
import { onKeyDown } from '../keys'
import { DRIFT_RANGE_MS, LIVES, createRun, multiplierFor, pocketForThree, starsFor, type Run, type RunEvent, type Section } from './run'
import type { Stage } from './stages'
import { openStation, type Station } from './station'
import './pocket.css'

const LEAD_MS = 900                // before the first click
const LOOKAHEAD_MS = 150           // clicks go on the audio clock this far ahead
const RESYNC_SEC = 0.03            // a stall or a pause moved the game against the audio clock
const FINISH_MS = 900
const IN_THE_POCKET = 0.1          // of the meter, either side of the centre
const reducedMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// When a click scheduled for now is really heard, as the count-in works it out
function latencyMs(): number {
  const ctx = metronomeContext()
  return Math.max(0, (ctx.outputLatency || ctx.baseLatency || 0) + latencyOffsetSec()) * 1000
}

interface Shown { section: Section | null; bar: number; state: 'steady' | 'slipping' | 'lost'; say: 'pocket' | 'early' | 'late' | 'rushing' | 'dragging' }

const bars = (n: number) => (n === 1 ? t`1 bar` : t`${n} bars`)

export default function Pocket({ stage, assist, paused, weak, hud, keys, hint, miss, finish }: GameProps<Stage>) {
  const host = useRef<HTMLDivElement>(null)
  const marker = useRef<HTMLDivElement>(null)
  const cursor = useRef<HTMLElement>(null)
  const [world, setWorld] = useState<Station | null>(null)
  const [failed, setFailed] = useState(false)
  const [shown, setShown] = useState<Shown>({ section: null, bar: 0, state: 'steady', say: 'pocket' })
  const [zone, setZone] = useState(0)
  const held = useRef(paused)
  held.current = paused
  const endless = stage.kind === 'endless'

  useEffect(() => {
    let closed = false
    let opened: Station | null = null
    openStation(host.current!, reducedMotion()).then(w => {
      if (closed) w.dispose()
      else { opened = w; setWorld(w) }
    }).catch(e => { console.error('[Pliage Arcade] world failed to load:', e); setFailed(true) })
    return () => { closed = true; opened?.dispose() }
  }, [])

  useEffect(() => {
    if (!world) return
    const clock = gameClock(performance.now())
    const ctx = metronomeContext()
    let anchor = ctx.currentTime - clock.at(performance.now()) / 1000     // audio time of game time 0
    let run: Run | null = null
    let leaving = 0
    let sounding: OscillatorNode[] = []

    const sync = () => {
      const { score, combo, lives } = run!.state
      hud({ score, combo, multiplier: multiplierFor(combo), lives })
    }

    function report(cleared: boolean) {
      const { score, bestCombo, pocket, played, longestSilence } = run!.state
      const stars = cleared ? starsFor(run!.accuracy, assist) : 0
      const need = pocketForThree(played)
      finish({
        cleared, stars, score,
        title: cleared ? (stage.kind === 'boss' ? t`The storm has passed` : t`The rings held`) : endless ? t`The station drifted off` : t`The rings left their orbit`,
        goal: !cleared ? null : assist ? t`A clear with Assist on earns 1 star.` : stars === 3 ? null : t`Three stars needs ${need} notes in the pocket out of ${played}. You were ${need - pocket} short.`,
        stats: [{ label: t`In the pocket`, value: `${pocket} / ${played}` }, { label: t`Longest silence`, value: bars(longestSilence) }, { label: t`Top combo`, value: String(bestCombo) }],
      })
    }

    const emit = (e: RunEvent) => {
      switch (e.type) {
        case 'section':
          hud({ detail: t`${e.section.bpm} BPM` })
          setShown(s => ({ ...s, section: e.section }))
          break
        case 'miss':
          miss(e.section.rhythm.id, e.section.rhythm.name)
          sync()
          break
        case 'hit':
          world.hit(e.close)
          sync()
          break
        case 'stray':
          sync()
          break
        case 'lost':
          world.lost()
          sync()
          break
        case 'end':
          leaving = window.setTimeout(() => report(e.cleared), reducedMotion() ? 0 : FINISH_MS)
          break
      }
    }

    run = createRun({ stage, assist, emit, start: LEAD_MS, weak })
    setZone(run.steadyMs / DRIFT_RANGE_MS)
    hud({ lives: LIVES })
    hint(stage.ask)
    const off = onKeyDown((key, stamp) => { if (!held.current) run!.noteOn(key, clock.at(stamp) - latencyMs()) })

    let raf = 0
    let last = performance.now()
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      const game = held.current ? clock.hold(now) : clock.tick(now)
      const heard = game - latencyMs()
      if (!held.current) {
        const drifted = ctx.currentTime - clock.at(performance.now()) / 1000
        if (Math.abs(drifted - anchor) > RESYNC_SEC) anchor = drifted
        for (const c of run!.clicksUntil(game + LOOKAHEAD_MS)) sounding.push(scheduleMetronomeClick(anchor + c.at / 1000, c.accent))
        sounding = sounding.slice(-2)
        run!.tick(heard)
      }
      const { section, bar, through } = run!.phaseAt(heard)
      const { drift, strain } = run!.state
      const silent = bar >= section.onBars
      const lean = Math.max(-1, Math.min(1, drift / DRIFT_RANGE_MS))
      if (marker.current) marker.current.style.left = `${50 + 50 * lean}%`
      if (cursor.current) {
        cursor.current.hidden = silent      // a cursor in the silence would be a click you can see
        cursor.current.style.left = `${through * 100}%`
      }
      const inZone = Math.abs(drift) <= run!.steadyMs
      const state = inZone ? 'steady' : strain > 0.5 ? 'lost' : 'slipping'
      const say = Math.abs(lean) < IN_THE_POCKET ? 'pocket' : inZone ? (drift < 0 ? 'early' : 'late') : drift < 0 ? 'rushing' : 'dragging'
      setShown(s => (s.bar === bar && s.state === state && s.say === say && s.section === section ? s : { ...s, section, bar, state, say }))
      const beat = silent ? 0 : Math.pow(1 - (through * 4) % 1, 3)
      world.fly(lean, strain, beat, dt)
      world.render(now)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(leaving)
      off()
      sounding.forEach(o => o.stop(0))
      hint(null)
    }
  }, [world]) // eslint-disable-line react-hooks/exhaustive-deps

  const { section, bar, state, say } = shown
  const on = section?.onBars ?? stage.onBars
  const off = section?.offBars ?? stage.dial.start
  const silent = bar >= on
  const line = section?.rhythm.line ?? stage.rhythms[0].line
  const steadyLine = /^((x\.\.\.)+|(x\.)+)$/.test(line)
  const heading = { steady: t`Rings steady`, slipping: t`Rings slipping`, lost: t`Out of orbit` }[state]
  const words = { pocket: t`In the pocket`, early: t`You're drifting a little early`, late: t`You're drifting a little late`, rushing: t`You're rushing`, dragging: t`You're dragging` }[say]
  return (
    <>
      <div ref={host} className="ac-stage po-stage" />
      {stage.kind === 'boss' && <div className="po-storm" data-on={silent || undefined} aria-hidden />}
      <div className="po-click">
        <span className="po-title">{t`The click`}</span>
        <div className="po-bars" role="img" aria-label={t`The click plays ${bars(on)}, then goes silent for ${bars(off)}`} style={{ '--bars': on + off } as React.CSSProperties}>
          {Array.from({ length: on + off }, (_, i) => <span key={i} data-silent={i >= on || undefined} data-now={i === bar || undefined} />)}
        </div>
        {!steadyLine && (
          <div className="po-steps" role="img" aria-label={section ? t`The pattern: ${section.rhythm.name}` : undefined}>
            {[...line].map((c, i) => <span key={i} data-hit={c === 'x' || undefined} data-beat={i % 4 === 0 || undefined} />)}
            <i ref={cursor} />
          </div>
        )}
        <span className="po-note">{`${t`${bars(on)} on, ${bars(off)} silent.`} ${silent ? t`You're in the silent stretch: hold the groove.` : t`The click is on: lock in.`}`}</span>
      </div>
      <section className="po-drift" aria-label={t`Drift`}>
        <div className="po-drift-head"><b>{heading}</b><span>{words}</span></div>
        <div className="po-track" role="img" aria-label={t`Drift: ${words}`}>
          <i className="po-line" />
          <i className="po-zone" style={{ left: `${50 - 50 * zone}%`, width: `${100 * zone}%` }} />
          <i className="po-centre" />
          <i ref={marker} className="po-marker" />
        </div>
        <div className="po-ends"><span>{t`Rushing`}</span><span>{t`In the pocket`}</span><span>{t`Dragging`}</span></div>
      </section>
      {failed && <div role="alert" className="lib-alert ac-paused">{t`Orbit Station couldn't start its picture.`}</div>}
    </>
  )
}
