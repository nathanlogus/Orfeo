// ── Split: a run on screen. The rules live in run.ts ──────────────────────────
// The lanes are plain DOM, moved by transform; festival.ts is the three.js world.
import { useEffect, useRef, useState } from 'react'
import { t } from '../../utils/i18n'
import { cleanForThree, multiplierFor, starsFor } from '../chordRush/run'
import { gameClock } from '../clock'
import type { GameProps } from '../games'
import { noteLabel, onKeyDown } from '../keys'
import { openFestival, type Festival } from './festival'
import { LIVES, SHOWN_BEATS, createRun, slipId, type Run, type RunEvent, type Shot } from './run'
import { HANDS, SPLIT, type Hand, type Stage } from './stages'
import './split.css'

const FINISH_MS = 900         // the last kite gets to climb or crash before the page changes
const BONUS_MS = 900
const TRAIL_BEATS = 1         // a played note leaves the lane this long after it ends
const reducedMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

const emptyFeels = { left: '', right: '' }

export default function Split({ stage, assist, paused, weak, hud, keys, miss, finish }: GameProps<Stage>) {
  const host = useRef<HTMLDivElement>(null)
  const bonus = useRef<HTMLSpanElement>(null)
  const strips = { left: useRef<HTMLDivElement>(null), right: useRef<HTMLDivElement>(null) }
  const tracks = { left: useRef<HTMLDivElement>(null), right: useRef<HTMLDivElement>(null) }
  const runRef = useRef<Run | null>(null)
  const [world, setWorld] = useState<Festival | null>(null)
  const [failed, setFailed] = useState(false)
  const [feels, setFeels] = useState(emptyFeels)
  const [swapped, setSwapped] = useState(false)
  const [resting, setResting] = useState<Hand | null>(null)
  const held = useRef(paused)
  held.current = paused
  const storm = stage.kind === 'boss'

  useEffect(() => {
    let closed = false
    let opened: Festival | null = null
    openFestival(host.current!, { storm, reduced: reducedMotion() }).then(w => {
      if (closed) w.dispose()
      else { opened = w; setWorld(w) }
    }).catch(e => { console.error('[Pliage Arcade] world failed to load:', e); setFailed(true) })
    return () => { closed = true; opened?.dispose() }
  }, [storm])

  useEffect(() => {
    if (!world) return
    const clock = gameClock(performance.now())
    const calm = reducedMotion()
    let ppb = 0
    const notes = new Map<number, HTMLElement>()
    const open = { left: [] as Shot[], right: [] as Shot[] }
    const trail = { left: [] as { el: HTMLElement; until: number }[], right: [] as { el: HTMLElement; until: number }[] }
    let run: Run | null = null
    let shown = { lives: LIVES, detail: '' }
    let leaving = 0
    let fell: Hand | null = null

    const measure = () => {
      for (const hand of HANDS) {
        ppb = strips[hand].current!.clientWidth / SHOWN_BEATS
        tracks[hand].current!.style.setProperty('--ppb', `${ppb}px`)
      }
    }
    const fitting = new ResizeObserver(measure)
    fitting.observe(host.current!)
    measure()

    const place = (shot: Shot) => {
      const el = document.createElement('span')
      el.className = 'sp-note'
      el.textContent = noteLabel(shot.key)
      el.style.left = `calc(var(--ppb) * ${shot.beat})`
      el.style.width = `calc(var(--ppb) * ${shot.beats} - var(--gap))`
      tracks[shot.hand].current!.appendChild(el)
      notes.set(shot.id, el)
      open[shot.hand].push(shot)
    }

    // The note each hand plays next: coloured on its lane, lit on the keyboard
    const front = () => {
      for (const hand of HANDS) {
        const next = open[hand][0]
        if (next) notes.get(next.id)!.dataset.state = 'now'
        const names = open[hand].slice(0, SHOWN_BEATS).map(s => noteLabel(s.key)).join(', ')
        strips[hand].current!.setAttribute('aria-label', hand === 'left' ? t`Left hand pattern: ${names}` : t`Right hand pattern: ${names}`)
      }
      keys({ sun: HANDS.filter(h => h !== run?.resting).flatMap(h => open[h].slice(0, 1).map(s => s.key)) })
    }

    const settle = (shot: Shot, state: string) => {
      open[shot.hand] = open[shot.hand].filter(s => s !== shot)
      const el = notes.get(shot.id)!
      el.dataset.state = state
      trail[shot.hand].push({ el, until: shot.beat + shot.beats + TRAIL_BEATS })
      notes.delete(shot.id)
    }

    const detailFor = (lag: Record<Hand, number>) => {
      if (lag.left > 0 && lag.right > 0) return t`Both kites falling`
      if (lag.left > 0) return t`Blue kite falling`
      if (lag.right > 0) return t`Pink kite falling`
      if (run?.resting) return run.resting === 'left' ? t`Left hand resting` : t`Right hand resting`
      return t`Both kites up`
    }

    const score = () => {
      const { score, combo } = run!.state
      hud({ score, combo, multiplier: multiplierFor(combo) })
    }

    function report(cleared: boolean) {
      const { score: points, bestCombo, clean, played, together, bars } = run!.state
      const stars = cleared ? starsFor(run!.accuracy, assist) : 0
      const need = cleanForThree(played)
      const title = cleared ? (storm ? t`The storm blew over` : t`Both kites stayed up`)
        : fell === 'left' ? t`The blue kite came down` : t`The pink kite came down`
      finish({
        cleared, stars, score: points, title,
        goal: !cleared ? null : assist ? t`A clear with Assist on earns 1 star.` : stars === 3 ? null : t`Three stars needs ${need} clean notes out of ${played}. You were ${need - clean} short.`,
        stats: [
          { label: t`Clean notes`, value: `${clean} / ${played}` },
          { label: t`Bars together`, value: `${together} / ${bars}` },
          { label: t`Top combo`, value: String(bestCombo) },
        ],
      })
    }

    const emit = (e: RunEvent) => {
      switch (e.type) {
        case 'phrase': {
          e.phrase.shots.forEach(place)
          const { piece, swapped: traded } = e.phrase
          // A traded part keeps its feel: the words follow the notes across the split
          setFeels(traded ? { left: piece.right.feel, right: piece.left.feel } : { left: piece.left.feel, right: piece.right.feel })
          setSwapped(traded)
          front()
          break
        }
        case 'hit':
          settle(e.shot, 'done')
          world.hit(e.shot.hand, e.grade === 'perfect' ? 'perfect' : 'good', performance.now())
          score()
          front()
          break
        case 'wrong':
          notes.get(e.shot.id)!.dataset.wrong = 'true'
          world.slip(e.shot.hand)
          miss(slipId(e.shot), slipLabel(e.shot))
          score()
          break
        case 'miss':
          settle(e.shot, 'missed')
          world.slip(e.shot.hand)
          if (!e.shot.dirty) miss(slipId(e.shot), slipLabel(e.shot))
          score()
          front()
          break
        case 'skip':
          settle(e.shot, 'missed')
          front()
          break
        case 'bar':
          score()
          if (e.together) world.together(performance.now())
          if (e.together && bonus.current && !calm) {
            bonus.current.textContent = t`Together +${e.points}`
            bonus.current.animate([{ opacity: 1, transform: 'translate(-50%, 0)' }, { opacity: 0, transform: 'translate(-50%, -28px)' }], BONUS_MS)
          }
          break
        case 'end':
          fell = e.fell
          if (e.fell) world.crash(e.fell, performance.now())
          else world.climb(performance.now())
          leaving = window.setTimeout(() => report(e.cleared), calm ? 0 : FINISH_MS)
          break
      }
    }

    run = runRef.current = createRun({ stage, assist, emit, start: 0, weak })
    keys({ labels: false, split: SPLIT })
    const off = onKeyDown((key, stamp) => { if (!held.current) run!.noteOn(key, clock.at(stamp)) })

    let raf = 0
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const game = held.current ? clock.hold(now) : clock.tick(now)
      run!.tick(game)
      const lag = { left: run!.lag('left', game), right: run!.lag('right', game) }

      const beat = run!.beatAt(game)
      for (const hand of HANDS) {
        tracks[hand].current!.style.transform = `translate3d(${-beat * ppb}px, 0, 0)`
        while (trail[hand][0]?.until < beat) trail[hand].shift()!.el.remove()
      }
      world.draw(now, lag)

      const lives = Math.max(0, LIVES - Math.floor(Math.max(lag.left, lag.right) * LIVES))
      const detail = detailFor(lag)
      if (lives !== shown.lives || detail !== shown.detail) {
        shown = { lives, detail }
        hud({ lives, detail })
      }
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(leaving)
      off()
      fitting.disconnect()
      runRef.current = null
    }
  }, [world]) // eslint-disable-line react-hooks/exhaustive-deps

  const rest = (hand: Hand) => {
    const next = resting === hand ? null : hand
    runRef.current?.rest(next)
    setResting(next)
  }

  const lane = (hand: Hand) => (
    <section className="sp-lane" data-hand={hand} data-resting={resting === hand || undefined} aria-label={hand === 'left' ? t`Left hand lane` : t`Right hand lane`}>
      <header>
        <b><i aria-hidden />{hand === 'left' ? t`Left hand · blue kite` : t`Right hand · pink kite`}</b>
        <span>{feels[hand]}</span>
        {assist && (
          <button aria-pressed={resting === hand} onClick={e => { rest(hand); e.currentTarget.blur() }}>
            {resting === hand ? t`Bring back` : t`Rest this hand`}
          </button>
        )}
      </header>
      <div ref={strips[hand]} className="sp-strip" role="img">
        <div className="sp-clip"><div ref={tracks[hand]} className="sp-track" /></div>
        <div className="sp-line" />
      </div>
    </section>
  )

  return (
    <>
      <div ref={host} className="ac-stage sp-scene" data-storm={storm || undefined} />
      {storm && <div className="sp-weather" aria-hidden><i className="sp-rain" /><i className="sp-flash" /></div>}
      <div className="sp-lanes">{lane('left')}{lane('right')}</div>
      <span ref={bonus} className="sp-bonus" aria-hidden />
      <span className="sp-split">{swapped ? t`Hands swapped: left plays the tune` : t`Split at middle C`}</span>
      {failed && <div role="alert" className="lib-alert ac-paused">{t`Kite Festival couldn't load its art.`}</div>}
    </>
  )
}

function slipLabel(shot: Shot) {
  const { name } = shot.piece
  return shot.hand === 'left' ? t`${name}, left hand` : t`${name}, right hand`
}
