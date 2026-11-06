// ── One run on screen: the Arcade's frame around a game ───────────────────────
// The HUD, keyboard, hint and Pause live here, so every game gets them the same.
import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useStore } from '../store'
import { t } from '../utils/i18n'
import type { GameDef, GameProps, GameResult, StageDef } from './games'
import { ArcadeHud, ArcadeKeys, HUD_START, KEYS_START } from './hud'
import { NeedKeyboard, stageLabel } from './screens'

export type Slipped = Map<string, { label: string; count: number }>

export default function RunHost({ def, stage, assist, weak, onFinish, onLeave }: {
  def: GameDef; stage: StageDef; assist: boolean; weak: string[]; onFinish: (result: GameResult, slipped: Slipped) => void; onLeave: () => void
}) {
  const connected = useStore(s => s.midiDeviceConnected)
  const [hud, setHud] = useState(HUD_START)
  const [keys, setKeys] = useState(KEYS_START)
  const [hint, setHint] = useState<ReactNode>(null)
  const [pausing, setPausing] = useState(false)
  const slipped = useRef<Slipped>(new Map())
  const finish = useRef(onFinish)
  finish.current = onFinish
  const paused = pausing || !connected
  const Game = def.Game!

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onLeave()
      if (e.key === ' ' && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); setPausing(p => !p) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onLeave])

  // Stable, so the game only ever re-renders for `paused`
  const calls = useMemo<Pick<GameProps, 'hud' | 'keys' | 'hint' | 'miss' | 'finish'>>(() => ({
    hud: patch => setHud(h => ({ ...h, ...patch })),
    keys: patch => setKeys(k => ({ ...k, ...patch })),
    hint: setHint,
    miss: (id, label = id) => { slipped.current.set(id, { label, count: (slipped.current.get(id)?.count ?? 0) + 1 }) },
    finish: result => finish.current(result, slipped.current),
  }), [])
  const game = useMemo(() => <Game stage={stage} assist={assist} paused={paused} weak={weak} {...calls} />, [Game, stage, assist, paused, weak, calls])

  return (
    <div className="ac-game">
      <div className="ac-slot"><Suspense fallback={null}>{game}</Suspense></div>
      <ArcadeHud label={stageLabel(def, stage)} state={{ ...hud, detail: assist ? `${hud.detail} · ${t`Assist`}` : hud.detail }} onLeave={onLeave} onPause={() => setPausing(p => !p)} />
      {hint && <div className="ac-hint-row"><span className="ac-pill">{hint}</span></div>}
      <ArcadeKeys {...keys} />
      {!connected && <div className="ac-paused"><NeedKeyboard /></div>}
      {connected && pausing && (
        <div className="ac-veil">
          <div className="ac-sheet ac-paused-sheet" role="dialog" aria-label={t`Paused`}>
            <h2>{t`Paused`}</h2>
            <button className="ac-go" onClick={() => setPausing(false)}>{t`Resume`} <kbd>Space</kbd></button>
          </div>
        </div>
      )}
    </div>
  )
}
