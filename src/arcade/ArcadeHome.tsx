// ── The Arcade: Home, then a world, Meet it, a run, and how it went ───────────
// Stays light on purpose: three.js and the art load only when a run starts.
import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowLeft, ChevronLeft, ChevronRight, Settings } from 'lucide-react'
import { useStore } from '../store'
import { t } from '../utils/i18n'
import { NewVersionDot } from '../components/Settings/NewVersionDot'
import PliageLogo from '../components/PliageLogo'
import PliageMark from '../components/PliageMark'
import { pageOnTop } from '../components/Home/HomeMenu'
import { GAMES, STARS_PER_WORLD, ratedStages, stageOrder, type DrillStep, type GameDef, type GameResult, type StageDef } from './games'
import { onPianoTap } from './keys'
import { EMPTY, afterMisses, afterRun, isOpen, levelOf, loadProgress, offersAssist, saveRun, weakConcept, weakItems, xpFor, NEW_PLAYER, type Saved, type StageRecord } from './progress'
import type { Slipped } from './RunHost'
import { Drill, KeyboardPill, MeetIt, NeedKeyboard, Results, RunOver, WorldPage, stageNumber, type Outcome } from './screens'
import './arcade.css'

const RunHost = lazy(() => import('./RunHost'))

const BOARD_WIDTH = 1280
const BOARD_HEIGHT = 800
const PHONE_WIDTH = 760
const MIN_ZOOM = 0.7

type Screen =
  | { at: 'home' }
  | { at: 'world'; def: GameDef }
  | { at: 'meet'; def: GameDef; stage: StageDef }
  | { at: 'run'; def: GameDef; stage: StageDef; assist: boolean; attempt: number }
  | { at: 'results'; def: GameDef; stage: StageDef; outcome: Outcome }
  | { at: 'over'; def: GameDef; stage: StageDef; outcome: Outcome; assist: boolean }
  | { at: 'drill'; def: GameDef; stage: StageDef; outcome: Outcome; assist: boolean; steps: DrillStep[] }

// The boards are 1280 by 800. Bigger windows zoom them whole; a phone reflows.
function useBoardZoom() {
  const [zoom, setZoom] = useState(1)
  useLayoutEffect(() => {
    const fit = () => {
      const { innerWidth: w, innerHeight: h } = window
      setZoom(w < PHONE_WIDTH ? 1 : Math.max(MIN_ZOOM, Math.min(w / BOARD_WIDTH, h / BOARD_HEIGHT)))
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])
  return zoom
}

export default function ArcadeHome({ onBack }: { onBack: () => void }) {
  const connected = useStore(s => s.midiDeviceConnected)
  const [saved, setSaved] = useState<Saved>({ worlds: {}, player: NEW_PLAYER })
  const [screen, setScreen] = useState<Screen>({ at: 'home' })
  const zoom = useBoardZoom()
  const played = useRef(false)

  useEffect(() => { void loadProgress().then(setSaved) }, [])
  // shortcut: a game without three.js still loads it here on the way out; add a flag to GameDef if that ever shows
  useEffect(() => () => { if (played.current) void import('./engine/stage').then(m => m.releaseRenderer()) }, [])

  const recordOf = (def: GameDef, stage: StageDef): StageRecord | undefined => saved.worlds[def.id]?.[stage.id]
  const toWorld = useCallback((def: GameDef) => setScreen({ at: 'world', def }), [])
  const meet = useCallback((def: GameDef, stage: StageDef) => setScreen({ at: 'meet', def, stage }), [])
  const play = (def: GameDef, stage: StageDef, assist: boolean) => {
    played.current = true
    setScreen({ at: 'run', def, stage, assist, attempt: Date.now() })
  }

  function finished(def: GameDef, stage: StageDef, assist: boolean, result: GameResult, slipped: Slipped) {
    const before = recordOf(def, stage) ?? EMPTY
    const record = afterRun(before, result)
    const xp = xpFor(result, before.best > 0 && result.score > before.best)
    const counts = Object.fromEntries([...slipped].map(([id, { count }]) => [id, count]))
    const player = { xp: saved.player.xp + xp, misses: afterMisses(saved.player.misses, stage.concept, counts) }
    void saveRun(def.id, stage.id, record, player)
    setSaved(s => ({ worlds: { ...s.worlds, [def.id]: { ...s.worlds[def.id], [stage.id]: record } }, player }))
    const list = [...slipped].map(([id, s]) => ({ id, ...s })).sort((a, b) => b.count - a.count)
    const outcome: Outcome = { result, record, before, xp, player, slipped: list }
    if (result.cleared || stage.kind === 'endless') setScreen({ at: 'results', def, stage, outcome })
    else setScreen({ at: 'over', def, stage, outcome, assist: assist || offersAssist(record) })
  }

  const content = () => {
    switch (screen.at) {
      case 'home': return <HomeBoard saved={saved} onBack={onBack} onWorld={toWorld} onMeet={meet} />
      case 'world': {
        const { def } = screen
        return <WorldPage def={def} world={saved.worlds[def.id] ?? {}} connected={connected} onStage={stage => meet(def, stage)} onBack={() => setScreen({ at: 'home' })} />
      }
      case 'meet': {
        const { def, stage } = screen
        return <MeetIt def={def} stage={stage} connected={connected} assist={stage.kind !== 'endless' && offersAssist(recordOf(def, stage))} onStart={assist => play(def, stage, assist)} onBack={() => toWorld(def)} />
      }
      case 'run': {
        const { def, stage, assist, attempt } = screen
        return (
          <Suspense fallback={<div className="ac-game" />}>
            <RunHost key={attempt} def={def} stage={stage} assist={assist} weak={weakItems(saved.player.misses, stage.concept)} onFinish={(result, slipped) => finished(def, stage, assist, result, slipped)} onLeave={() => toWorld(def)} />
          </Suspense>
        )
      }
      case 'results': {
        const { def, stage, outcome } = screen
        const order = stageOrder(def)
        const after = def.stages[order.indexOf(stage.id) + 1]
        const next = after && isOpen(order, saved.worlds[def.id] ?? {}, after.id) ? after : null
        return <Results def={def} stage={stage} outcome={outcome} next={next} onNext={() => next && meet(def, next)} onRetry={() => play(def, stage, false)} onStages={() => toWorld(def)} />
      }
      case 'over': {
        const { def, stage, outcome, assist } = screen
        const steps = def.drill?.(outcome.slipped.map(s => s.id), stage) ?? []
        return (
          <RunOver
            def={def} stage={stage} outcome={outcome} assist={assist} drill={steps}
            onAssist={on => setScreen({ ...screen, assist: on })} onRetry={() => play(def, stage, assist)} onStages={() => toWorld(def)}
            onDrill={() => setScreen({ at: 'drill', def, stage, outcome, assist, steps })}
          />
        )
      }
      case 'drill': {
        const { def, stage, outcome, assist, steps } = screen
        return <Drill def={def} steps={steps} onDone={() => setScreen({ at: 'over', def, stage, outcome, assist })} />
      }
    }
  }

  return <div className="ac-root" style={{ zoom, '--z': zoom } as React.CSSProperties}>{content()}</div>
}

function HomeBoard({ saved, onBack, onWorld, onMeet }: { saved: Saved; onBack: () => void; onWorld: (def: GameDef) => void; onMeet: (def: GameDef, stage: StageDef) => void }) {
  const connected = useStore(s => s.midiDeviceConnected)
  const [selected, setSelected] = useState(0)
  const [moved, setMoved] = useState(false)
  const row = useRef<HTMLDivElement>(null)
  const { level, into, of } = levelOf(saved.player.xp)
  const stars = GAMES.reduce((sum, def) => sum + ratedStages(def).reduce((n, s) => n + (saved.worlds[def.id]?.[s.id]?.stars ?? 0), 0), 0)

  // The weak spot needs a stage of that concept the player can actually open
  const stageFor = (concept: string) => {
    for (const def of GAMES) {
      const stage = def.stages.find(s => s.concept === concept && isOpen(stageOrder(def), saved.worlds[def.id] ?? {}, s.id))
      if (def.Game && stage) return { def, stage }
    }
    return null
  }
  const concept = weakConcept(saved.player.misses, c => !!stageFor(c))
  const weak = concept ? stageFor(concept) : null

  const move = (by: number) => {
    setMoved(true)
    setSelected(i => {
      const next = Math.max(0, Math.min(GAMES.length - 1, i + by))
      row.current?.children[next]?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
      return next
    })
  }
  const open = (i: number) => { if (GAMES[i].Game) onWorld(GAMES[i]) }
  const latest = useRef({ move, open, selected, onBack })
  latest.current = { move, open, selected, onBack }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!pageOnTop()) return
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); latest.current.move(e.key === 'ArrowLeft' ? -1 : 1) }
      if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) latest.current.open(latest.current.selected)
      if (e.key === 'Escape') latest.current.onBack()
    }
    window.addEventListener('keydown', onKey)
    const off = onPianoTap(action => {
      if (!pageOnTop()) return
      if (action === 'select') latest.current.open(latest.current.selected)
      else latest.current.move(action === 'up' ? -1 : 1)
    })
    return () => { window.removeEventListener('keydown', onKey); off() }
  }, [])

  return (
    <div className="ac-page ac-home">
      <div className="ac-shapes" aria-hidden><i /><i /><i /></div>
      <header className="ac-top">
        <button className="ac-pill-btn" onClick={onBack}><ArrowLeft size={18} aria-hidden />{t`Back to menu`}</button>
        <span className="lib-logo"><span className="lib-logo-disc"><PliageMark height={20} tone="sun" /></span><PliageLogo height={26} tone="night" /></span>
        <span className="o-spacer" />
        <div className="ac-pill-box ac-level" role="img" aria-label={t`Level ${level}, ${into} of ${of} XP`}>
          <b>{t`Level ${level}`}</b>
          <span className="ac-meter"><span style={{ width: `${into / of * 100}%` }} /></span>
          <span className="ac-soft">{`${into} / ${of} XP`}</span>
        </div>
        <KeyboardPill />
        <button className="ac-round" aria-label={t`Settings`} onClick={() => useStore.getState().openSettingsWindow()}><Settings size={20} aria-hidden /><NewVersionDot /></button>
      </header>

      <div className="ac-hero">
        <div>
          <h1>{t`Arcade`}</h1>
          <p>{t`Short games for your hands and ears. Every note comes from real music.`}</p>
        </div>
        {!connected ? <NeedKeyboard /> : weak && (
          <button className="ac-weak" onClick={() => onMeet(weak.def, weak.stage)}>
            <span>
              <span className="ac-eyebrow">{t`Your weak spot`}</span>
              <span className="ac-weak-text">{t`${weak.stage.conceptName} slipped in your recent runs. ${weak.def.game}, ${weak.stage.kind === 'stage' ? t`Stage ${stageNumber(weak.def, weak.stage)}` : weak.stage.name} trains them.`}</span>
            </span>
            <span className="ac-row-play ac-play-sun">{t`Play`}</span>
          </button>
        )}
      </div>

      <div className="ac-row-head">
        <h2>{t`Seven worlds · ${stars} of ${GAMES.length * STARS_PER_WORLD} stars`}</h2>
        <div>
          <button className="ac-arrow" aria-label={t`Previous worlds`} onClick={() => move(-1)}><ChevronLeft size={18} aria-hidden /></button>
          <button className="ac-arrow" aria-label={t`More worlds`} onClick={() => move(1)}><ChevronRight size={18} aria-hidden /></button>
        </div>
      </div>

      <div className="ac-carousel" ref={row}>
        {GAMES.map((def, i) => <WorldCard key={def.id} def={def} saved={saved} selected={i === selected && (connected || moved)} onOpen={() => { setSelected(i); open(i) }} />)}
      </div>

      <div className="ac-hints">
        <kbd>←</kbd><kbd>→</kbd>{t`Choose`}
        <kbd>Enter</kbd>{t`Open`}
        {connected && <><kbd>C4</kbd>{t`or`}<kbd>D4</kbd>{t`Choose on the piano`}<kbd>E4</kbd>{t`Open`}</>}
      </div>
    </div>
  )
}

function WorldCard({ def, saved, selected, onOpen }: { def: GameDef; saved: Saved; selected: boolean; onOpen: () => void }) {
  const world = saved.worlds[def.id] ?? {}
  const order = stageOrder(def)
  const rated = ratedStages(def)
  const names = ['1', '2', '3', t`Boss`]
  const cells = names.map((name, i) => {
    const stage = rated[i]
    const open = !!stage && isOpen(order, world, stage.id)
    return { name, open, count: stage ? world[stage.id]?.stars ?? 0 : 0 }
  })
  const best = Math.max(0, ...Object.values(world).map(r => r.best))
  const played = Object.keys(world).length > 0
  const next = rated.find(s => isOpen(order, world, s.id) && !world[s.id]?.stars)
  const total = cells.reduce((n, c) => n + c.count, 0)
  const badge = !def.Game ? t`Coming soon` : !played ? t`New` : next ? (next.kind === 'stage' ? t`Stage ${stageNumber(def, next)} open` : t`${next.name} open`) : ''
  return (
    <button className="ac-card-world" aria-label={`${def.world}, ${def.game}${def.Game ? '' : `, ${t`Coming soon`}`}`} aria-disabled={!def.Game} data-selected={selected || undefined} data-soon={!def.Game || undefined} onClick={onOpen}>
      <span className="ac-card-art">
        <img src={def.art} alt="" loading="lazy" />
        <span className="ac-card-game">{def.game}</span>
        {badge && <span className="ac-card-badge" data-new={badge === t`New` || undefined}>{badge}</span>}
      </span>
      <span className="ac-card-body">
        <span className="ac-card-world-name">{def.world}</span>
        <span className="ac-soft">{t`Trains ${def.skill}`}</span>
        <span className="ac-card-cells" role="img" aria-label={t`${total} of ${STARS_PER_WORLD} stars`}>
          {cells.map(c => (
            <span key={c.name} data-full={c.count === 3 || undefined} data-locked={!c.open || undefined}>
              <b>{c.name}</b>
              <span>{c.open ? '★'.repeat(c.count) + '☆'.repeat(3 - c.count) : t`Locked`}</span>
            </span>
          ))}
        </span>
        <span className="ac-card-best"><span className="ac-soft">{t`Best`}</span><b>{best ? best.toLocaleString() : '—'}</b></span>
      </span>
    </button>
  )
}
