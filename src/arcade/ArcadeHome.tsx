// ── The Arcade: worlds, then stages, then a run ───────────────────────────────
// Stays light on purpose: three.js and the art load only when a run starts.
import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { ChevronLeft, Lock, Play } from 'lucide-react'
import { useStore } from '../store'
import { t } from '../utils/i18n'
import { EMPTY, isOpen, loadProgress, offersAssist, type ArcadeProgress, type StageRecord } from './progress'
import { MeetCard, NeedKeyboard, Stars } from './screens'
import { STAGES, stageById, type StageId } from './chordRush/stages'
import './arcade.css'

const ChordRush = lazy(() => import('./chordRush/ChordRush'))

const STARS_PER_STAGE = 3
const WORLD = 'hollow'
const ORDER = STAGES.map(s => s.id as string)
const RATED = STAGES.filter(s => s.waves !== Infinity)

type Screen = { at: 'worlds' } | { at: 'stages' } | { at: 'meet'; stage: StageId } | { at: 'run'; stage: StageId; assist: boolean }

export default function ArcadeHome() {
  const connected = useStore(s => s.midiDeviceConnected)
  const [progress, setProgress] = useState<ArcadeProgress>({})
  const [screen, setScreen] = useState<Screen>({ at: 'worlds' })
  const played = useRef(false)
  const world = progress[WORLD] ?? {}
  const stars = RATED.reduce((sum, s) => sum + (world[s.id]?.stars ?? 0), 0)
  const best = Math.max(0, ...Object.values(world).map(r => r.best))

  useEffect(() => { void loadProgress().then(setProgress) }, [])
  useEffect(() => () => { if (played.current) void import('./engine/stage').then(m => m.releaseRenderer()) }, [])

  const saveRecord = (id: StageId, record: StageRecord) => setProgress(p => ({ ...p, [WORLD]: { ...p[WORLD], [id]: record } }))
  const toStages = () => setScreen({ at: 'stages' })

  if (screen.at === 'run') {
    played.current = true
    return (
      <Suspense fallback={<div className="ac-game" />}>
        <ChordRush stage={stageById(screen.stage)} record={world[screen.stage]} startAssist={screen.assist} onRecord={r => saveRecord(screen.stage, r)} onBack={toStages} />
      </Suspense>
    )
  }

  if (screen.at === 'meet') {
    const stage = stageById(screen.stage)
    return (
      <div className="ac-home">
        <MeetCard
          title={stage.title} text={stage.meet} numerals={stage.example} connected={connected}
          assist={stage.waves !== Infinity && offersAssist(world[stage.id])}
          onStart={assist => setScreen({ at: 'run', stage: stage.id, assist })} onBack={toStages}
        />
      </div>
    )
  }

  if (screen.at === 'stages') {
    return (
      <div className="ac-home">
        <div className="ac-head">
          <button className="o-icon-btn" aria-label={t`Back to the Arcade`} onClick={() => setScreen({ at: 'worlds' })}><ChevronLeft size={20} /></button>
          <h1 className="ac-title">{t`Monster Hollow`}</h1>
        </div>
        <p className="ac-text">{t`Paper monsters creep towards the village, each wearing a chord. You're the lamplighter: play the chord and it folds flat. Three chords landing puts the lanterns out.`}</p>
        {!connected && <NeedKeyboard />}
        <div className="ac-stages">
          {STAGES.map((stage, i) => {
            const open = isOpen(ORDER, world, stage.id)
            const record = world[stage.id] ?? EMPTY
            return (
              <button key={stage.id} className="ac-stage-row" disabled={!open} onClick={() => setScreen({ at: 'meet', stage: stage.id })}>
                <span className="learn-row-dot">{open ? <Play size={15} aria-hidden /> : <Lock size={15} aria-hidden />}</span>
                <span className="learn-row-id">{stage.waves === Infinity ? '∞' : stage.id === 'boss' ? t`Boss` : i + 1}</span>
                <span className="learn-row-text">
                  <span className="learn-row-title">{stage.title}</span>
                  <span className="learn-row-goal">{stage.concept}</span>
                </span>
                {stage.waves !== Infinity && <Stars count={record.stars} />}
                <span className="learn-row-state">{record.best ? `${t`Best`} ${record.best.toLocaleString()}` : ''}</span>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="ac-home">
      <h1 className="ac-title">{t`Arcade`}</h1>
      {!connected && <NeedKeyboard />}
      <div className="ac-worlds">
        <button className="ac-world" onClick={toStages}>
          <span className="ac-world-art" aria-hidden />
          <span className="ac-world-text">
            <span className="lib-tag">{t`Chord Rush`}</span>
            <span className="ac-world-title">{t`Monster Hollow`}</span>
            <span className="ac-world-skill">{t`Skill: chords on sight`}</span>
            <span className="ac-world-score">
              <Stars count={stars} of={RATED.length * STARS_PER_STAGE} />
              <span>{best ? `${t`Best`} ${best.toLocaleString()}` : t`Not played yet`}</span>
            </span>
          </span>
        </button>
      </div>
    </div>
  )
}
