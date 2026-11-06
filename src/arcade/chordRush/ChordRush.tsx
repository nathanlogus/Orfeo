// ── Chord Rush: a run on screen. The rules live in run.ts ─────────────────────
// The worked example of a game: see the top of ../games.ts for the contract.
import { useEffect, useRef, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { t } from '../../utils/i18n'
import { gameClock } from '../clock'
import type { GameProps } from '../games'
import { chordLabel, onKeyDown, spelledLabels } from '../keys'
import type { Target } from '../library/chords'
import { openHollow, type Hollow } from './hollow'
import { LIVES, cleanForThree, createRun, multiplierFor, starsFor, type Run, type RunEvent, type Wave } from './run'
import type { Stage } from './stages'

const BOSS = -1
const BOSS_FIRST = 0.04
const BOSS_LAST = 0.82
const POINTS_MS = 650
// The last monster gets to fold before the page changes
const FINISH_MS = 900
const WAVE_CHIPS = 6
const reducedMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

interface Shown { wave: Wave | null; chord: number }

function tagFor(layer: HTMLElement, name: string): HTMLElement {
  const tag = document.createElement('span')
  tag.className = 'ac-tag-chord'
  tag.textContent = chordLabel(name)
  layer.appendChild(tag)
  return tag
}

// "Dm is D, F and A. Any octave, any way up."
function hintFor(target: Target) {
  const notes = spelledLabels(target.keys, target.notes)
  const all = `${notes.slice(0, -1).join(', ')} ${t`and`} ${notes[notes.length - 1]}`
  return <><b>{chordLabel(target.name)}</b> {target.bass === null ? t`is ${all}. Any octave, any way up.` : t`is ${all}, with ${notes[0]} at the bottom.`}</>
}

export default function ChordRush({ stage, assist, paused, weak, hud, keys, hint, miss, finish }: GameProps<Stage>) {
  const host = useRef<HTMLDivElement>(null)
  const layer = useRef<HTMLDivElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const [world, setWorld] = useState<Hollow | null>(null)
  const [failed, setFailed] = useState(false)
  const [shown, setShown] = useState<Shown>({ wave: null, chord: 0 })
  const held = useRef(paused)
  held.current = paused
  const boss = stage.kind === 'boss'
  const endless = stage.kind === 'endless'

  useEffect(() => {
    let closed = false
    let opened: Hollow | null = null
    openHollow(host.current!, reducedMotion()).then(w => {
      if (closed) w.dispose()
      else { opened = w; setWorld(w) }
    }).catch(e => { console.error('[Pliage Arcade] world failed to load:', e); setFailed(true) })
    return () => { closed = true; opened?.dispose() }
  }, [])

  useEffect(() => {
    if (!world) return
    const clock = gameClock(performance.now())
    const tags = new Map<number, HTMLElement>()
    const dropTag = (id: number) => { tags.get(id)?.remove(); tags.delete(id) }
    const heard = new Map<string, Target>()
    let run: Run | null = null
    let total = 0, done = 0, waves = 0
    let front: Target | undefined
    let leaving = 0

    const sync = (patch: Partial<Shown> = {}) => {
      setShown(s => ({ ...s, ...patch }))
      if (!run) return    // the first wave is announced from inside createRun
      const { score, combo, landed } = run.state
      hud({ score, combo, multiplier: multiplierFor(combo), lives: LIVES - landed })
      const next = run.foes[0]?.target
      if (next !== front) {
        front = next
        keys({ sun: next?.keys ?? [], names: next && spelledLabels(next.keys, next.notes) })
        hint(next ? hintFor(next) : null)
      }
    }

    function report(cleared: boolean) {
      const { score, bestCombo, clean, played, landed } = run!.state
      const stars = cleared ? starsFor(run!.accuracy, assist) : 0
      const need = cleanForThree(played)
      const folded = played - landed
      finish({
        cleared, stars, score,
        title: cleared ? t`The village sleeps` : endless ? t`The night is over` : folded ? t`The lanterns went out, but you folded ${folded} monsters` : t`The lanterns went out`,
        goal: !cleared ? null : assist ? t`A clear with Assist on earns 1 star.` : stars === 3 ? null : t`Three stars needs ${need} clean chords out of ${played}. You were ${need - clean} short.`,
        stats: [{ label: t`Clean chords`, value: `${clean} / ${played}` }, { label: t`Top combo`, value: String(bestCombo) }],
        probes: [...heard.values()].map(c => ({ name: c.name, pcs: c.pcs })),
      })
    }

    const emit = (e: RunEvent) => {
      switch (e.type) {
        case 'wave':
          done = 0
          waves = e.index
          total = e.wave.chords.length
          for (const chord of e.wave.chords) heard.set(chord.name, chord)
          hud({ detail: endless ? t`Wave ${waves}` : t`Wave ${waves} of ${stage.waves}` })
          sync({ wave: e.wave, chord: 0 })
          break
        case 'spawn':
          if (!boss) {
            world.spawn(e.foe.target, e.foe.id)
            tags.set(e.foe.id, tagFor(layer.current!, e.foe.target.name))
          }
          sync()
          break
        case 'fold': {
          done++
          if (!boss) {
            world.fold(e.foe.id, performance.now())
            const tag = tags.get(e.foe.id)
            tags.delete(e.foe.id)
            if (tag) {
              tag.textContent = `+${e.points}`
              tag.dataset.state = 'points'
              setTimeout(() => tag.remove(), POINTS_MS)
            }
          }
          sync({ chord: done })
          break
        }
        case 'land':
          done++
          if (!boss) { world.remove(e.foe.id); dropTag(e.foe.id) }
          if (!e.foe.dirty) miss(e.foe.target.name, chordLabel(e.foe.target.name))
          world.lives(LIVES - run!.state.landed)
          sync({ chord: done })
          break
        case 'wrong':
          miss(e.foe.target.name, chordLabel(e.foe.target.name))
          sync()
          if (!boss) {
            const tag = tags.get(e.foe.id)
            if (tag) { tag.dataset.state = 'wrong'; setTimeout(() => { delete tag.dataset.state }, 300) }
          }
          break
        case 'end':
          if (e.cleared && boss) world.fold(BOSS, performance.now())
          leaving = window.setTimeout(() => report(e.cleared), reducedMotion() ? 0 : FINISH_MS)
          break
      }
    }

    world.lives(LIVES)
    if (boss) world.spawnBoss(BOSS)
    run = createRun({ stage, assist, rng: Math.random, emit, start: 0, weak })
    sync()
    const off = onKeyDown((key, stamp, down) => { if (!held.current) run!.noteOn(key, clock.at(stamp), down) })

    let raf = 0
    let last = performance.now()
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      const game = held.current ? clock.hold(now) : clock.tick(now)
      run!.tick(game)
      if (boss) {
        const foe = run!.foes[0]
        const within = foe ? Math.min(1, (game - foe.spawnAt) / (foe.landAt - foe.spawnAt)) : 0
        world.walk(BOSS, BOSS_FIRST + (BOSS_LAST - BOSS_FIRST) * ((done + within) / Math.max(1, total)), dt)
        const at = world.labelAt(BOSS)
        if (at && body.current) body.current.style.transform = `translate(${at.x}px, ${at.y}px) translate(-50%, 45%)`
      }
      else {
        for (const foe of run!.foes) {
          world.walk(foe.id, Math.min(1, (game - foe.spawnAt) / (foe.landAt - foe.spawnAt)), dt)
          const at = world.labelAt(foe.id)
          const tag = tags.get(foe.id)
          if (at && tag) {
            tag.style.transform = `translate(${at.x}px, ${at.y}px) translate(-50%, -100%)`
            tag.dataset.front = String(foe === run!.foes[0])
          }
        }
      }
      world.drift(now)
      world.render()
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(leaving)
      off()
      for (const id of [...world.actors.keys()]) world.remove(id)
      for (const id of [...tags.keys()]) dropTag(id)
    }
  }, [world]) // eslint-disable-line react-hooks/exhaustive-deps

  const { wave, chord } = shown
  const chips = wave?.chords.slice(chord, chord + WAVE_CHIPS) ?? []
  return (
    <>
      <div ref={host} className="ac-stage" />
      <div ref={layer} className="ac-tags" aria-hidden />
      {boss && wave && (
        <div ref={body} className="ac-body">
          {wave.chords.map((c, i) => (
            <span key={i} className="ac-panel" data-state={i < chord ? 'done' : i === chord ? 'now' : undefined}>{chordLabel(c.name)}</span>
          ))}
        </div>
      )}
      {!boss && wave && (
        <div className="ac-wave" aria-label={t`This wave: ${wave.name} in ${wave.key}`}>
          <span>{t`${wave.name} in ${wave.key}`}</span>
          {chips.map((c, i) => (
            <span key={chord + i} className="ac-wave-step">
              {i > 0 && <ArrowRight size={14} strokeWidth={2.4} aria-hidden />}
              <b data-now={i === 0 || undefined}>{chordLabel(c.name)}</b>
            </span>
          ))}
        </div>
      )}
      {failed && <div role="alert" className="lib-alert ac-paused">{t`Monster Hollow couldn't load its art.`}</div>}
    </>
  )
}
