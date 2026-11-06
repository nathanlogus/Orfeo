// ── Chord Rush: a run on screen. The rules live in run.ts ─────────────────────
import { useEffect, useRef, useState } from 'react'
import { Flame, X } from 'lucide-react'
import { useStore } from '../../store'
import { t } from '../../utils/i18n'
import { gameClock } from '../clock'
import { chordLabel, onKeyDown } from '../keys'
import { afterRun, offersAssist, saveRecord, type StageRecord } from '../progress'
import { ArcadeKeys, NeedKeyboard, ResultCard, type RunSummary } from '../screens'
import { openHollow, type Hollow } from './hollow'
import { LIVES, createRun, starsFor, type Run, type RunEvent, type Wave } from './run'
import type { Stage } from './stages'

const WORLD = 'hollow'
const BOSS = -1
const BOSS_FIRST = 0.04
const BOSS_LAST = 0.82
const POINTS_MS = 650
const reducedMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

interface Hud { score: number; combo: number; lives: number; wave: Wave | null; waveNo: number; lit: number[]; chord: number; wrong: number }
const START: Hud = { score: 0, combo: 0, lives: LIVES, wave: null, waveNo: 0, lit: [], chord: 0, wrong: 0 }

function tagFor(layer: HTMLElement, name: string): HTMLElement {
  const tag = document.createElement('span')
  tag.className = 'ac-tag'
  tag.textContent = chordLabel(name)
  layer.appendChild(tag)
  return tag
}

export default function ChordRush({ stage, record, startAssist, onRecord, onBack }: {
  stage: Stage; record: StageRecord | undefined; startAssist: boolean; onRecord: (r: StageRecord) => void; onBack: () => void
}) {
  const connected = useStore(s => s.midiDeviceConnected)
  const host = useRef<HTMLDivElement>(null)
  const layer = useRef<HTMLDivElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const [world, setWorld] = useState<Hollow | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState({ n: 0, assist: startAssist })
  const [hud, setHud] = useState(START)
  const [summary, setSummary] = useState<RunSummary | null>(null)
  const saved = useRef(record)
  const boss = stage.id === 'boss'

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
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !summary) onBack() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onBack, summary])

  useEffect(() => {
    if (!world) return
    const { assist } = attempt
    const clock = gameClock(performance.now())
    const tags = new Map<number, HTMLElement>()
    const dropTag = (id: number) => { tags.get(id)?.remove(); tags.delete(id) }
    let run: Run | null = null
    let total = 0, done = 0

    const sync = (patch: Partial<Hud> = {}) => setHud(h => ({
      ...h, ...patch,
      score: run?.state.score ?? 0, combo: run?.state.combo ?? 0, lives: LIVES - (run?.state.landed ?? 0),
      lit: run?.foes[0]?.target.keys ?? [],
    }))

    function finish(cleared: boolean) {
      const { score, bestCombo } = run!.state
      const stars = cleared ? starsFor(run!.accuracy, assist) : 0
      const next = afterRun(saved.current, { cleared, stars, score })
      saved.current = next
      void saveRecord(WORLD, stage.id, next)
      onRecord(next)
      setSummary({ cleared, stars, score, best: next.best, accuracy: run!.accuracy, bestCombo, assist })
    }

    const emit = (e: RunEvent) => {
      switch (e.type) {
        case 'wave':
          done = 0
          total = e.wave.chords.length
          sync({ wave: e.wave, waveNo: e.index, chord: 0 })
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
          if (boss) sync({ chord: done })
          else {
            world.fold(e.foe.id, performance.now())
            const tag = tags.get(e.foe.id)
            tags.delete(e.foe.id)
            if (tag) {
              tag.textContent = `+${e.points}`
              tag.dataset.state = 'points'
              setTimeout(() => tag.remove(), POINTS_MS)
            }
            sync()
          }
          break
        }
        case 'land':
          done++
          if (!boss) { world.remove(e.foe.id); dropTag(e.foe.id) }
          world.lives(LIVES - run!.state.landed)
          sync({ chord: done })
          break
        case 'wrong':
          sync({ wrong: e.foe.id + 1 })
          if (!boss) {
            const tag = tags.get(e.foe.id)
            if (tag) { tag.dataset.state = 'wrong'; setTimeout(() => { delete tag.dataset.state }, 300) }
          }
          break
        case 'end':
          if (e.cleared && boss) world.fold(BOSS, performance.now())
          finish(e.cleared)
          break
      }
    }

    setSummary(null)
    setHud(START)
    world.lives(LIVES)
    if (boss) world.spawnBoss(BOSS)
    run = createRun({ stage, assist, rng: Math.random, emit, start: 0 })
    sync()
    const off = onKeyDown((key, stamp, held) => run!.noteOn(key, clock.at(stamp), held))

    let raf = 0
    let last = performance.now()
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      const live = useStore.getState().midiDeviceConnected
      const game = live ? clock.tick(now) : clock.hold(now)
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
      off()
      for (const id of [...world.actors.keys()]) world.remove(id)
      for (const id of [...tags.keys()]) dropTag(id)
    }
  }, [world, attempt]) // eslint-disable-line react-hooks/exhaustive-deps

  const multiplier = Math.min(3, 1 + Math.floor(hud.combo / 4) * 0.5)
  return (
    <div className="ac-game">
      <div ref={host} className="ac-stage" />
      <div ref={layer} className="ac-tags" aria-hidden />
      {boss && hud.wave && (
        <div ref={body} className="ac-body">
          {hud.wave.chords.map((chord, i) => (
            <span key={i} className="ac-panel" data-state={i < hud.chord ? 'done' : i === hud.chord ? 'now' : undefined}>{chordLabel(chord.name)}</span>
          ))}
        </div>
      )}

      <header className="ac-hud">
        <button className="o-icon-btn" aria-label={t`Leave the run`} onClick={onBack}><X size={18} /></button>
        <span className="ac-hud-score">{hud.score.toLocaleString()}</span>
        <span className="ac-hud-combo" data-on={hud.combo > 1 || undefined}><Flame size={16} aria-hidden />{`${hud.combo}`}{multiplier > 1 && <em>{`×${multiplier}`}</em>}</span>
        <span className="ac-hud-wave">{hud.wave && `${t`Wave`} ${hud.waveNo} · ${hud.wave.name} · ${t`in`} ${hud.wave.key}`}{attempt.assist && ` · ${t`Assist`}`}</span>
        <span className="ac-hud-lives" role="img" aria-label={t`${hud.lives} lanterns lit`}>
          {Array.from({ length: LIVES }, (_, i) => <i key={i} data-lit={i < hud.lives || undefined} />)}
        </span>
      </header>

      {failed && <div role="alert" className="lib-alert ac-paused">{t`Monster Hollow couldn't load its art.`}</div>}
      {!connected && !summary && <div className="ac-paused"><NeedKeyboard /></div>}

      <ArcadeKeys lit={hud.lit} />
      {summary && (
        <ResultCard
          summary={summary} concept={stage.concept} endless={stage.waves === Infinity} assistOffered={offersAssist(saved.current)}
          onRetry={assist => setAttempt(a => ({ n: a.n + 1, assist }))} onBack={onBack}
        />
      )}
    </div>
  )
}
