// ── Sight Line: a run on screen. The rules live in run.ts ─────────────────────
// The trail is one strip moved by one transform, in staff-gap units (--gap), and the
// paper diorama is drawn between the staff's paper and its notes: see frontier.ts.
import { useEffect, useRef, useState } from 'react'
import bravuraUrl from '@coderline/alphatab/font/Bravura.woff2?url'
import { t } from '../../utils/i18n'
import { gameClock } from '../clock'
import type { GameProps } from '../games'
import { onKeyDown } from '../keys'
import { openFrontier, type Frontier } from './frontier'
import { signature, signaturePos, type Clef } from './lines'
import { AHEAD_FULL, LIVES, cleanForThree, createRun, multiplierFor, starsFor, type Fork, type Line, type Run, type RunEvent } from './run'
import type { Stage } from './stages'
import './sightLine.css'

const FINISH_MS = 900
const reducedMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// In staff gaps. Board: 22px gap, 130px a beat, first line 60px down the band.
const BEAT = 5.9
const TOP = 2.73
const STAFF = 4
const GRAND = 8
const CLEF_X = 1.3
const SIGN_X = 3.9
const SIGN_STEP = 0.85
const RING = 2.45
const HEAD_BESIDE = 1.1

const FONT = 'SlBravura'
const fontFace = `@font-face { font-family: '${FONT}'; src: url('${bravuraUrl}') format('woff2'); }`
const CLEF: Record<Clef, { glyph: string; pos: number }> = { treble: { glyph: '', pos: 2 }, bass: { glyph: '', pos: 6 } }
const SIGN: Record<string, string> = { '#': '', b: '', n: '' }

const yOf = (staff: number, pos: number) => TOP + (staff ? GRAND : 0) + STAFF - pos / 2
const centreOf = (fork: Fork) => {
  const ys = fork.heads.map(h => yOf(h.staff, h.pos))
  return { y: (Math.min(...ys) + Math.max(...ys)) / 2, span: Math.max(...ys) - Math.min(...ys) }
}

function Glyph({ x, y, glyph }: { x: number; y: number; glyph: string }) {
  return <text x={x} y={y} fontSize={STAFF} fontFamily={FONT}>{glyph}</text>
}

function Signature({ keyName, clefs, x }: { keyName: string; clefs: Clef[]; x: number }) {
  return clefs.flatMap((clef, staff) => signature(keyName).map(({ sign }, i) => (
    <Glyph key={`${staff}${i}`} x={x + i * SIGN_STEP} y={yOf(staff, signaturePos(sign, clef)[i])} glyph={SIGN[sign]} />
  )))
}

function ForkMark({ fork, x }: { fork: Fork; x: number }) {
  return (
    <g data-fork={fork.id} role="img" aria-label={fork.heads.map(h => h.name).join(' ')}>
      {fork.heads.map(h => {
        const cx = x + (h.beside ? HEAD_BESIDE : 0)
        const y = yOf(h.staff, h.pos)
        return (
          <g key={h.name}>
            {h.ledgers.map(p => <line key={p} x1={cx - 1} x2={cx + 1} y1={yOf(h.staff, p)} y2={yOf(h.staff, p)} stroke="#000" strokeWidth={0.09} />)}
            {h.accidental && <Glyph x={x - 1.7} y={y} glyph={SIGN[h.accidental]} />}
            <ellipse cx={cx} cy={y} rx={0.59} ry={0.39} transform={`rotate(-22 ${cx} ${y})`} />
          </g>
        )
      })}
    </g>
  )
}

function LineMarks({ line, clefs, height, showKey }: { line: Line; clefs: Clef[]; height: number; showKey: boolean }) {
  const width = line.length * BEAT
  return (
    <svg className="sl-line" viewBox={`0 0 ${width} ${height}`} style={{ left: `calc(var(--gap) * ${line.startBeat * BEAT})`, width: `calc(var(--gap) * ${width})` }}>
      {showKey && <Signature keyName={line.key} clefs={clefs} x={BEAT * line.pad / 2 - 1} />}
      {line.forks.map(f => <ForkMark key={f.id} fork={f} x={(f.beat - line.startBeat) * BEAT} />)}
    </svg>
  )
}

export default function SightLine({ stage, assist, paused, weak, hud, keys, hint, miss, finish }: GameProps<Stage>) {
  const strip = useRef<HTMLDivElement>(null)
  const ring = useRef<HTMLDivElement>(null)
  const host = useRef<HTMLDivElement>(null)
  const band = useRef<HTMLElement>(null)
  const bar = useRef<HTMLDivElement>(null)
  const shade = useRef<HTMLDivElement>(null)
  const [world, setWorld] = useState<Frontier | null>(null)
  const [failed, setFailed] = useState(false)
  const [lines, setLines] = useState<Line[]>([])
  const [ahead, setAhead] = useState(0)
  const [keyName, setKeyName] = useState(stage.keys[0])
  const held = useRef(paused)
  held.current = paused
  const { clefs } = stage
  const grand = clefs.length > 1
  const boss = stage.kind === 'boss'
  const endless = stage.kind === 'endless'
  const height = TOP * 2 + STAFF + (grand ? GRAND : 0)
  const size = { height: `calc(var(--gap) * ${height})` }

  useEffect(() => {
    let closed = false
    let opened: Frontier | null = null
    openFrontier(host.current!, band.current!, bar.current!, shade.current!, height, reducedMotion(), boss).then(w => {
      if (closed) w.dispose()
      else { opened = w; setWorld(w) }
    }).catch(e => { console.error('[Pliage Arcade] world failed to load:', e); setFailed(true) })
    return () => { closed = true; opened?.dispose() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!world && !failed) return
    hint(t`Key names are hidden here: the staff is the only hint`)
    keys({ sun: [], labels: false, from: stage.from, octaves: stage.octaves })
    const clock = gameClock(performance.now())
    let gain = 0
    let run: Run | null = null
    let leaving = 0

    const mark = (fork: Fork, state: string) => strip.current?.querySelector(`[data-fork="${fork.id}"]`)?.setAttribute('data-state', state)

    // The ring goes to the next fork, and the coach to its trail
    let trailY: number | null = null
    const aim = () => {
      const fork = run?.target
      if (!fork || !ring.current) return
      const { y, span } = centreOf(fork)
      trailY = y + span / 2
      ring.current.style.transform = `translate3d(calc(var(--gap) * ${fork.beat * BEAT}), calc(var(--gap) * ${y}), 0)`
      ring.current.style.setProperty('--span', String(span))
    }

    const sync = () => {
      if (!run) return
      const { score, combo, misses, ahead: read } = run.state
      hud({ score, combo, multiplier: multiplierFor(combo), lives: LIVES - misses })
      setAhead(Math.min(AHEAD_FULL, read))
      aim()
    }

    function report(cleared: boolean) {
      const { score, bestCombo, clean, played, misses, bestAhead, topBpm } = run!.state
      const stars = cleared ? starsFor(run!.accuracy, assist) : 0
      const need = cleanForThree(played)
      finish({
        cleared, stars, score,
        title: cleared ? boss ? t`The outlaws lost the trail` : t`The coach rolled in` : endless ? t`The trail ends here` : clean ? t`The coach stopped, but you read ${clean} notes` : t`The coach stopped`,
        goal: !cleared ? null : assist ? t`A clear with Assist on earns 1 star.` : stars === 3 ? null : t`Three stars needs ${need} clean notes out of ${played}. You were ${need - clean} short.`,
        stats: [
          { label: t`Clean notes`, value: `${clean} / ${played}` },
          { label: t`Missed at the line`, value: String(misses) },
          { label: t`Top combo`, value: String(bestCombo) },
          { label: t`Best read ahead`, value: String(bestAhead) },
          { label: t`Top speed`, value: t`${topBpm} bpm` },
        ],
      })
    }

    const emit = (e: RunEvent) => {
      switch (e.type) {
        case 'line': setLines(all => [...all.filter(l => l.index >= e.line.index - 2), e.line]); break
        case 'enter':
          hud({ detail: t`Hints off · ${e.line.bpm} bpm` })
          setKeyName(e.line.key)
          break
        case 'hit': mark(e.fork, 'hit'); sync(); break
        case 'wrong':
          miss(e.fork.heads[0].name)
          ring.current?.animate?.([{ background: 'var(--paint-pink)' }, { background: 'var(--paint-yellow)' }], 300)
          sync()
          break
        case 'miss':
          if (!e.fork.dirty) for (const h of e.fork.heads) miss(h.name)
          mark(e.fork, 'miss')
          world?.gain(++gain)
          sync()
          break
        case 'end':
          if (e.cleared && boss) world?.gain(-1)
          leaving = window.setTimeout(() => report(e.cleared), reducedMotion() ? 0 : FINISH_MS)
          break
      }
    }

    run = createRun({ stage, assist, rng: Math.random, emit, start: 0, weak })
    sync()
    const off = onKeyDown((key, stamp) => { if (!held.current) run!.noteOn(key, clock.at(stamp)) })

    let raf = 0
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const game = held.current ? clock.hold(now) : clock.tick(now)
      run!.tick(game)
      const beat = run!.position(game)
      if (strip.current) strip.current.style.transform = `translate3d(calc(var(--gap) * ${-beat * BEAT}), 0, 0)`
      world?.frame(now, beat, trailY)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(leaving)
      off()
      setLines([])
    }
  }, [world, failed]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="sl-world" data-grand={grand || undefined}>
      <style>{fontFace}</style>
      <section ref={band} className="sl-band" style={size} aria-label={t`The trail: notes to read`}>
        {clefs.map((_, staff) => [0, 1, 2, 3, 4].map(i => <div key={`${staff}${i}`} className="sl-rule" style={{ top: `calc(var(--gap) * ${TOP + (staff ? GRAND : 0) + i})` }} />))}
        <div ref={shade} className="sl-shade" aria-hidden />
        <div ref={bar} className="sl-bar" aria-hidden />
      </section>
      <div ref={host} className="ac-stage" />
      <div className="sl-band sl-over" style={size}>
        <svg className="sl-clefs" viewBox={`0 0 ${SIGN_X + SIGN_STEP * 7} ${height}`} style={{ width: `calc(var(--gap) * ${SIGN_X + SIGN_STEP * 7})` }} aria-hidden>
          {clefs.map((clef, staff) => <Glyph key={clef} x={CLEF_X} y={yOf(staff, CLEF[clef].pos)} glyph={CLEF[clef].glyph} />)}
          <Signature keyName={keyName} clefs={clefs} x={SIGN_X} />
        </svg>
        <div className="sl-trail">
          <div ref={strip} className="sl-strip">
            <div ref={ring} className="sl-ring"><span>{t`Read this one`}</span></div>
            {lines.map(l => <LineMarks key={l.index} line={l} clefs={clefs} height={height} showKey={endless && l.index > 0} />)}
          </div>
        </div>
      </div>
      {failed && <div role="alert" className="lib-alert ac-paused">{t`Frontier Express couldn't load its art.`}</div>}
      <div className="sl-card sl-tip">
        <b>{t`Each note is a fork in the trail`}</b>
        <span>{t`Play it before it reaches the coach. Reading ahead without stopping scores more.`}</span>
      </div>
      <div className="sl-card sl-ahead">
        <span>{t`Read ahead`}</span>
        <span role="img" aria-label={t`${ahead} notes read in a row`}>
          {Array.from({ length: AHEAD_FULL }, (_, i) => <i key={i} data-on={i < ahead || undefined} />)}
        </span>
      </div>
    </div>
  )
}
