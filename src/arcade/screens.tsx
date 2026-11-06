// ── Shared Arcade screens: a world, Meet it, Results, Run over and the drill ──
import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Crown, Lock, Play, Volume2 } from 'lucide-react'
import { useStore } from '../store'
import { t } from '../utils/i18n'
import { ringChord } from '../utils/explorerShared'
import { chordLabel, noteLabel, onKeyDown, onPianoTap, spelledLabels } from './keys'
import { findInLibrary, type LibraryMatch } from './findInLibrary'
import { stageOrder, type DrillStep, type GameDef, type GameResult, type StageDef } from './games'
import { ArcadeKeys, KEYS_START } from './hud'
import { EMPTY, isOpen, levelOf, type Player, type StageRecord, type WorldProgress } from './progress'
import type { MenuAction } from '../utils/homeMenu'

const HEAR_STEP_MS = 900
const DRILL_MS = 120_000
const STAR_PATH = 'M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z'

export const stageNumber = (def: GameDef, stage: StageDef) => def.stages.filter(s => s.kind === 'stage').indexOf(stage) + 1
export const stageLabel = (def: GameDef, stage: StageDef) => (stage.kind === 'stage' ? `${t`Stage ${stageNumber(def, stage)}`} · ${stage.name}` : stage.name)
const list = (names: string[]) => (names.length < 2 ? names.join() : `${names.slice(0, -1).join(', ')} ${t`and`} ${names[names.length - 1]}`)

export const Back = ({ children, onClick }: { children: string; onClick: () => void }) => (
  <button className="ac-pill-btn" onClick={onClick}><ArrowLeft size={18} aria-hidden />{children}</button>
)

export function KeyboardPill() {
  const connected = useStore(s => s.midiDeviceConnected)
  const name = useStore(s => s.midiDeviceName)
  return <div className="ac-pill-box"><span className="ac-dot" data-on={connected || undefined} aria-hidden /><span className="ac-clip">{connected ? name || t`MIDI keyboard` : t`No keyboard`}</span></div>
}

export function NeedKeyboard() {
  return (
    <div role="alert" className="ac-nokeys">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="2" y="6" width="20" height="12" rx="2" /><path d="M6 6v7M10 6v7M14 6v7M18 6v7" /><path d="M3 3l18 18" stroke="#a3127f" /></svg>
      <div>
        <b>{t`Connect a keyboard to play`}</b>
        <span>{t`Arcade listens to a MIDI keyboard. Look around now; play once one is plugged in.`}</span>
      </div>
      <button className="ac-small-btn" onClick={() => useStore.getState().openSettingsWindow('midi')}>{t`Keyboard settings`}</button>
    </div>
  )
}

// A press of Space or C4 is the screen's main action; the hint on the button says so
function useStartKeys(go: () => void, onEscape: () => void, more?: (action: MenuAction) => void) {
  const latest = useRef({ go, onEscape, more })
  latest.current = { go, onEscape, more }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('[aria-modal="true"]')) return
      if (e.key === 'Escape') latest.current.onEscape()
      if (e.key === ' ' && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); latest.current.go() }
    }
    window.addEventListener('keydown', onKey)
    const off = onPianoTap(action => {
      if (document.querySelector('[aria-modal="true"]')) return
      if (action === 'up') latest.current.go()
      else latest.current.more?.(action)
    })
    return () => { window.removeEventListener('keydown', onKey); off() }
  }, [])
}

// ── A world: the scene on the left, its stages on the right ──────────────────
export function WorldPage({ def, world, connected, onStage, onBack }: {
  def: GameDef; world: WorldProgress; connected: boolean; onStage: (stage: StageDef) => void; onBack: () => void
}) {
  const order = stageOrder(def)
  const open = (s: StageDef) => isOpen(order, world, s.id)
  const current = def.stages.find(s => open(s) && s.kind !== 'endless' && !world[s.id]?.stars)
  const boss = def.stages.find(s => s.kind === 'boss')
  const earned = !!boss && (world[boss.id]?.stars ?? 0) >= 1
  const placement = def.stages.filter(s => s.kind === 'stage').at(-1)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('[aria-modal="true"]')) return
      if (e.key === 'Escape') onBack()
      if (e.key === 'Enter' && current && !(e.target instanceof HTMLButtonElement)) onStage(current)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [current, onBack, onStage])

  const lockReason = (s: StageDef, i: number) => {
    if (s.kind === 'endless') return t`Beat the boss to open`
    const before = def.stages[i - 1]
    return before.kind === 'stage' ? t`Clear Stage ${stageNumber(def, before)} to open` : t`Clear ${before.name} to open`
  }

  return (
    <div className="ac-page ac-world">
      <header className="ac-top">
        <Back onClick={onBack}>{t`Arcade`}</Back>
        <span className="o-spacer" />
        <KeyboardPill />
      </header>
      <div className="ac-world-grid">
        <section className="ac-scene" aria-label={def.world}>
          <img src={def.scene} alt={def.sceneAlt} />
          <div>
            <span className="ac-tag-sun">{`${def.game} · ${t`trains ${def.skill}`}`}</span>
            <h1>{def.world}</h1>
            <p>{def.description}</p>
          </div>
        </section>
        <section className="ac-stages" aria-label={t`Stages`}>
          {def.stages.map((stage, i) => {
            const record = world[stage.id] ?? EMPTY
            const mark = stage.kind === 'stage' ? stageNumber(def, stage) : stage.kind === 'boss' ? <Crown size={20} aria-hidden /> : '∞'
            if (!open(stage)) {
              return (
                <div key={stage.id} className="ac-row" data-state="locked">
                  <span className="ac-row-mark">{stage.kind === 'endless' ? '∞' : <Lock size={18} aria-label={t`Locked`} />}</span>
                  <span className="ac-row-text"><b>{stage.name}</b><span>{stage.sub}</span></span>
                  <span className="ac-row-why">{lockReason(stage, i)}</span>
                </div>
              )
            }
            const now = stage === current
            return (
              <button key={stage.id} className="ac-row" data-state={now ? 'now' : undefined} onClick={() => onStage(stage)}>
                <span className="ac-row-mark">{mark}</span>
                <span className="ac-row-text"><b>{stage.name}</b><span>{stage.sub}</span></span>
                {now
                  ? <span className="ac-row-play"><Play size={14} fill="currentColor" aria-hidden />{t`Play`}</span>
                  : <span className="ac-row-score">
                    {stage.kind !== 'endless' && <TextStars count={record.stars} />}
                    {record.best > 0 && <span>{t`Best ${record.best.toLocaleString()}`}</span>}
                  </span>}
              </button>
            )
          })}
          <div className="ac-extras">
            {def.figure && (
              <div className="ac-extra">
                <img src={def.figure.art} alt="" width={34} height={42} data-earned={earned || undefined} />
                <span><b>{def.figure.name}</b><br /><span>{earned ? t`This figure is on your shelf.` : t`Beat the boss to put this figure on your shelf.`}</span></span>
              </div>
            )}
            {placement && !open(placement) && (
              <button className="ac-extra ac-placement" disabled={!connected} onClick={() => onStage(placement)}>
                <b>{t`Placement run`}</b><span>{t`Know your chords? Skip ahead.`}</span>
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

export const TextStars = ({ count }: { count: number }) => (
  <span className="ac-text-stars" role="img" aria-label={t`${count} of 3 stars`}>{'★'.repeat(count) + '☆'.repeat(3 - count)}</span>
)

// ── Meet it: hear the idea, try one, go ──────────────────────────────────────
export function MeetIt({ def, stage, connected, assist, onStart, onBack }: {
  def: GameDef; stage: StageDef; connected: boolean; assist: boolean; onStart: (assist: boolean) => void; onBack: () => void
}) {
  const { text, hear, cards, hearSteps, tryIt } = stage.meet
  const [plays, setPlays] = useState(0)
  const [step, setStep] = useState(-1)
  const [fit, setFit] = useState(false)
  const start = () => { if (connected) onStart(false) }
  useStartKeys(start, onBack)

  useEffect(() => {
    if (!plays) return
    const steps = hearSteps ?? cards.map(c => c.keys)
    const timers = steps.map((keys, i) => setTimeout(() => { setStep(i); ringChord(keys) }, i * HEAR_STEP_MS))
    timers.push(setTimeout(() => setStep(-1), steps.length * HEAR_STEP_MS))
    return () => timers.forEach(clearTimeout)
  }, [plays]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => onKeyDown((_key, _stamp, held) => { if (tryIt.fits([...held])) setFit(true) }), [tryIt])

  const lit = step >= 0 ? (hearSteps ?? cards.map(c => c.keys))[step] : tryIt.keys
  return (
    <div className="ac-over ac-meet" style={{ '--scene': `url(${def.scene})` } as React.CSSProperties}>
      <div className="ac-scroll">
        <div className="ac-sheet" role="dialog" aria-labelledby="ac-meet-title">
          <div className="ac-sheet-tags">
            <span className="ac-tag-sun">{stage.kind === 'stage' ? t`Stage ${stageNumber(def, stage)} · Meet it` : t`${stage.name} · Meet it`}</span>
            <span className="ac-soft">{def.world}</span>
          </div>
          <h1 id="ac-meet-title">{stage.name}</h1>
          <p className="ac-meet-text">{text}</p>
          <div className="ac-stacks" style={{ '--cards': cards.length } as React.CSSProperties}>
            {cards.map((card, i) => (
              <div key={card.label} className="ac-stack" data-on={i === step || undefined}>
                <div>{[...card.keys].reverse().map(key => <span key={key} data-root={key % 12 === card.root || undefined}>{card.names ? spelledLabels(card.keys, card.names)[card.keys.indexOf(key)] : noteLabel(key)}</span>)}</div>
                <b>{card.label}</b>
              </div>
            ))}
          </div>
          {!connected && <NeedKeyboard />}
          <div className="ac-actions">
            <button className="ac-hear" onClick={() => setPlays(p => p + 1)}><Volume2 size={20} aria-hidden />{hear}</button>
            <span className="o-spacer" />
            {assist && <button className="ac-link" disabled={!connected} onClick={() => onStart(true)}>{t`Play with Assist`}</button>}
            <button className="ac-link" onClick={onBack}>{t`Back to stages`}</button>
            <button className="ac-go" disabled={!connected} onClick={start}>{t`Play`} <kbd>{t`Space or C4`}</kbd></button>
          </div>
        </div>
      </div>
      <div className="ac-hint-row"><span className="ac-pill" data-ok={fit || undefined}>{fit ? t`That's it. Press Play when you're ready.` : tryIt.prompt}</span></div>
      <ArcadeKeys {...KEYS_START} sun={lit} />
    </div>
  )
}

const BigStars = ({ count }: { count: number }) => (
  <div className="ac-big-stars" role="img" aria-label={t`${count} of 3 stars`}>
    {[0, 1, 2].map(i => <svg key={i} viewBox="0 0 24 24" aria-hidden data-on={i < count || undefined}><path d={STAR_PATH} /></svg>)}
  </div>
)

// Looks once per Results, and only shows a song it really found
function FindIt({ probes }: { probes: NonNullable<GameResult['probes']> }) {
  const [match, setMatch] = useState<LibraryMatch | null>(null)
  useEffect(() => {
    let cancelled = false
    void findInLibrary(probes, () => cancelled).then(found => { if (!cancelled) setMatch(found) })
    return () => { cancelled = true }
  }, [probes])
  if (!match) return null
  const shared = list(match.shared.map(chordLabel))
  return (
    <div className="ac-card">
      <span className="ac-eyebrow">{t`Find it in your library`}</span>
      <span className="ac-find-title ac-clip">{match.title}</span>
      <span>{t`Its harmony leans on ${shared}, two of the chords you just played.`}</span>
      <button className="ac-small-btn" onClick={() => useStore.getState().openSong(match.path)}>{t`Open in Practice`}</button>
    </div>
  )
}

export interface Outcome { result: GameResult; record: StageRecord; before: StageRecord; xp: number; player: Player; slipped: { label: string; count: number; id: string }[] }

// ── Results: a clear, or the end of an Endless run ───────────────────────────
export function Results({ def, stage, outcome, next, onNext, onRetry, onStages }: {
  def: GameDef; stage: StageDef; outcome: Outcome; next: StageDef | null; onNext: () => void; onRetry: () => void; onStages: () => void
}) {
  const { result, before, xp, player, slipped } = outcome
  const { level, into, of } = levelOf(player.xp)
  const newBest = before.best > 0 && result.score > before.best
  const worst = slipped.slice(0, 2).map(s => s.label)
  const retry = result.stars === 3 || stage.kind === 'endless' ? t`Play again` : t`Go for 3 stars`
  useStartKeys(onRetry, onStages)
  return (
    <div className="ac-over" style={{ '--scene': `url(${def.scene})` } as React.CSSProperties}>
      <div className="ac-scroll">
        <div className="ac-sheet ac-results" role="dialog" aria-labelledby="ac-res-title">
          <div className="ac-results-left">
            <div className="ac-sheet-tags">
              <span className="ac-tag">{stageLabel(def, stage)}</span>
              {newBest && <span className="ac-tag-sun">{t`New best`}</span>}
            </div>
            {stage.kind !== 'endless' && <BigStars count={result.stars} />}
            <div className="ac-results-title">
              <h1 id="ac-res-title">{result.title}</h1>
              {result.goal && <p className="ac-soft">{result.goal}</p>}
            </div>
            <dl className="ac-stats">
              <div><dt>{t`Score`}</dt><dd>{result.score.toLocaleString()}</dd></div>
              {before.best > 0 && <div><dt>{t`Best before`}</dt><dd>{before.best.toLocaleString()}</dd></div>}
              {result.stats.map(s => <div key={s.label}><dt>{s.label}</dt><dd>{s.value}</dd></div>)}
            </dl>
          </div>
          <div className="ac-results-right">
            {result.probes && <FindIt probes={result.probes} />}
            {worst.length > 0 && (
              <div className="ac-slipped">
                <span>{t`Slipped most:`} <b>{list(worst)}</b></span>
                <span className="ac-soft">{t`The next run will send these a little more often.`}</span>
              </div>
            )}
            <div className="ac-xp" role="img" aria-label={t`Plus ${xp} XP, level ${level}, ${into} of ${of}`}>
              <b>{`+${xp} XP`}</b>
              <span className="ac-meter"><span style={{ width: `${into / of * 100}%` }} /></span>
              <span className="ac-soft">{t`Level ${level}`}</span>
            </div>
            <span className="o-spacer" />
            {next && <button className="ac-go ac-go-wide" onClick={onNext}>{t`Next: ${next.name}`}<ArrowRight size={22} aria-hidden /></button>}
            <div className="ac-actions">
              <button className="ac-hear ac-grow" onClick={onRetry}>{retry} <kbd>Space</kbd></button>
              <button className="ac-small-btn" onClick={onStages}>{t`Stages`}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Run over: what slipped, Assist, and the way back ─────────────────────────
export function RunOver({ def, stage, outcome, assist, drill, onAssist, onRetry, onDrill, onStages }: {
  def: GameDef; stage: StageDef; outcome: Outcome; assist: boolean; drill: DrillStep[]
  onAssist: (on: boolean) => void; onRetry: () => void; onDrill: () => void; onStages: () => void
}) {
  const { result, record, slipped } = outcome
  const named = list(drill.map(s => chordLabel(s.label)))
  useStartKeys(onRetry, onStages)
  return (
    <div className="ac-over ac-dark" style={{ '--scene': `url(${def.scene})` } as React.CSSProperties}>
      <div className="ac-scroll">
        <div className="ac-sheet ac-runover" role="dialog" aria-labelledby="ac-over-title">
          <div className="ac-sheet-tags">
            <span className="ac-tag">{stageLabel(def, stage)}</span>
            {record.fails > 1 && <span className="ac-soft">{t`${record.fails} tries in a row`}</span>}
          </div>
          <div className="ac-runover-head">
            <h1 id="ac-over-title">{result.title}</h1>
            {slipped.length > 0 && (
              <p>{t`What slipped: `}{slipped.slice(0, 3).map((s, i) => <span key={s.id}>{i > 0 && ', '}<b>{s.label}</b>{` ${s.count === 1 ? t`once` : t`${s.count} times`}`}</span>)}.</p>
            )}
          </div>
          <div className="ac-runover-grid">
            <div className="ac-option">
              <div className="ac-option-head">
                <span>{t`Assist`}</span>
                <button role="switch" aria-checked={assist} aria-label={t`Assist`} className="ac-switch" onClick={() => onAssist(!assist)}><span /></button>
              </div>
              <span className="ac-soft">{`${def.assist} ${t`A clear with Assist on earns 1 star and opens the next stage.`}`}</span>
            </div>
            {drill.length > 0 && (
              <button className="ac-option ac-option-btn" onClick={onDrill}>
                <span className="ac-option-head"><span>{t`Two-minute drill`}</span></span>
                <span className="ac-soft">{t`${named} only, as slow as you like. Then come back.`}</span>
              </button>
            )}
          </div>
          <div className="ac-actions">
            <button className="ac-link" onClick={onStages}>{t`Stages`}</button>
            <span className="o-spacer" />
            <button className="ac-go" onClick={onRetry}>{assist ? t`Try again with Assist` : t`Try again`} <kbd>{t`Space or C4`}</kbd></button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── The drill: only what slipped, no clock on the chord, two minutes at most ──
export function Drill({ def, steps, onDone }: { def: GameDef; steps: DrillStep[]; onDone: () => void }) {
  const [index, setIndex] = useState(0)
  const [played, setPlayed] = useState(0)
  const [left, setLeft] = useState(DRILL_MS)
  const step = steps[index % steps.length]
  useEffect(() => onKeyDown((_key, _stamp, held) => {
    if (!step.fits([...held])) return
    setPlayed(p => p + 1)
    setIndex(i => i + 1)
  }), [step])
  useEffect(() => {
    const until = performance.now() + DRILL_MS
    const timer = setInterval(() => {
      const rest = until - performance.now()
      setLeft(rest)
      if (rest <= 0) onDone()
    }, 1000)
    return () => clearInterval(timer)
  }, [onDone])
  useStartKeys(() => undefined, onDone)
  const seconds = Math.max(0, Math.ceil(left / 1000))
  return (
    <div className="ac-over ac-dark" style={{ '--scene': `url(${def.scene})` } as React.CSSProperties}>
      <div className="ac-scroll">
        <div className="ac-sheet ac-drill">
          <div className="ac-sheet-tags">
            <span className="ac-tag-sun">{t`Two-minute drill`}</span>
            <span className="ac-soft">{`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`}</span>
            <span className="ac-soft">{t`${played} played`}</span>
          </div>
          <h1>{chordLabel(step.label)}</h1>
          <div className="ac-actions"><span className="o-spacer" /><button className="ac-small-btn" onClick={onDone}>{t`Back`}</button></div>
        </div>
      </div>
      <ArcadeKeys {...KEYS_START} sun={step.keys} />
    </div>
  )
}
