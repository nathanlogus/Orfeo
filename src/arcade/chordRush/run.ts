// ── One run of Chord Rush: no rendering, no clock of its own ──────────────────
// The screen hands in key presses with their own timestamps and asks it to move
// time along, so what counts as played is decided by MIDI events, not frames.
import { progression } from '../library'
import { chordsOf, fits, type Target } from '../library/chords'
import { EARLIER_SHARE, MISSED_SHARE } from '../../lessons/drill'
import { BOSS_WAVES, SPACING, STAGES, dialAt, type Stage } from './stages'

export const LIVES = 3
const WAVE_GAP_MS = 1800
// Keys struck this close together are one try at a chord. Older held keys may
// just be the last chord being let go.
const GESTURE_MS = 150
// A chord landing waits this long for a key already on its way in
const LAND_GRACE_MS = 120
const BASE_SCORE = 100
const SPEED_SCORE = 100
const COMBO_STEP = 4
const COMBO_BONUS = 0.5
const MAX_MULTIPLIER = 3
const RECENT_MISSES = 8
const GOOD = 0.8
const NEAR_CLEAN = 0.95

export interface Wave { itemId: string; name: string; key: string; chords: Target[] }

export interface Foe {
  id: number
  target: Target
  spawnAt: number
  landAt: number
  live: boolean
  frontSince: number
  dirty: boolean          // a wrong try was made at it
}

export type RunEvent =
  | { type: 'wave'; wave: Wave; index: number }
  | { type: 'spawn'; foe: Foe }
  | { type: 'fold'; foe: Foe; points: number }
  | { type: 'land'; foe: Foe }
  | { type: 'wrong'; foe: Foe }
  | { type: 'end'; cleared: boolean }

interface Options { stage: Stage; assist: boolean; rng: () => number; emit: (e: RunEvent) => void; start: number }

// Everything a wave could be: each listed item in each key
const waveOf = (itemId: string, key: string): Wave => {
  const item = progression(itemId)
  return { itemId, name: item.name, key, chords: chordsOf(item, key) }
}
const poolOf = (stage: Stage) => stage.items.flatMap(id => stage.keys.map(key => waveOf(id, key)))

const pick = <T,>(list: T[], rng: () => number) => list[Math.floor(rng() * list.length)]

// The next wave, shared out like a lesson's drill. A wave stays a whole
// progression, so a recent miss comes back as a wave that holds that chord.
export function nextWave(pool: Wave[], earlier: Wave[], missed: string[], last: Wave | null, rng: () => number): Wave {
  const fresh = (list: Wave[]) => list.filter(w => w !== last)
  const roll = rng()
  const repeats = fresh(pool).filter(w => w.chords.some(c => missed.includes(c.name)))
  if (repeats.length && roll < MISSED_SHARE) return pick(repeats, rng)
  if (earlier.length && roll >= 1 - EARLIER_SHARE) return pick(earlier, rng)
  return pick(fresh(pool), rng)
}

export const starsFor = (accuracy: number, assist: boolean) => (assist ? 1 : accuracy >= NEAR_CLEAN ? 3 : accuracy >= GOOD ? 2 : 1)

export function createRun({ stage, assist, rng, emit, start }: Options) {
  const boss = stage.id === 'boss'
  const pool = boss ? [] : poolOf(stage)
  const earlier = STAGES.slice(0, STAGES.indexOf(stage)).filter(s => s.id !== 'boss').flatMap(poolOf)
  const struck = new Map<number, number>()
  const missed: string[] = []
  const state = { score: 0, combo: 0, bestCombo: 0, landed: 0, clean: 0, played: 0, waves: 0, dial: dialAt(stage, 0, assist), over: false, cleared: false }
  let foes: Foe[] = []       // walking now, front first
  let queue: Target[] = []   // this wave, still to come
  let wave: Wave | null = null
  let nextFoeId = 0
  let nextAt = start

  function beginWave(now: number) {
    if (state.waves >= stage.waves) return end(true)
    if (boss) wave = waveOf(BOSS_WAVES[state.waves][0], BOSS_WAVES[state.waves][1])
    else wave = state.waves === 0 ? pool[0] : nextWave(pool, earlier, missed, wave, rng)
    state.dial = dialAt(stage, state.waves, assist)
    queue = [...wave.chords]
    state.waves++
    nextAt = now + WAVE_GAP_MS
    emit({ type: 'wave', wave, index: state.waves })
  }

  function end(cleared: boolean) {
    state.over = true
    state.cleared = cleared
    emit({ type: 'end', cleared })
  }

  function spawn(now: number) {
    const foe: Foe = { id: nextFoeId++, target: queue.shift()!, spawnAt: now, landAt: now + state.dial, live: true, frontSince: now, dirty: false }
    foes.push(foe)
    // The boss shows one chord at a time: the next enters when this one is done
    nextAt = boss ? Infinity : now + state.dial * SPACING
    emit({ type: 'spawn', foe })
  }

  const miss = (name: string) => { missed.push(name); missed.splice(0, missed.length - RECENT_MISSES) }

  function retire(foe: Foe, now: number) {
    foe.live = false
    foes = foes.filter(f => f !== foe)
    state.played++
    if (foes[0]) foes[0].frontSince = now
    else if (queue.length) nextAt = now
  }

  function fold(foe: Foe, at: number) {
    const left = Math.min(1, Math.max(0, (foe.landAt - at) / (foe.landAt - foe.frontSince)))
    const clean = !foe.dirty
    const multiplier = clean ? Math.min(MAX_MULTIPLIER, 1 + Math.floor(state.combo / COMBO_STEP) * COMBO_BONUS) : 1
    const points = Math.round((BASE_SCORE + SPEED_SCORE * left) * multiplier)
    state.score += points
    if (clean) {
      state.clean++
      state.combo++
      state.bestCombo = Math.max(state.bestCombo, state.combo)
      const i = missed.indexOf(foe.target.name)
      if (i >= 0) missed.splice(i, 1)
    }
    retire(foe, at)
    emit({ type: 'fold', foe, points })
  }

  function land(foe: Foe, now: number) {
    state.landed++
    state.combo = 0
    miss(foe.target.name)
    retire(foe, now)
    emit({ type: 'land', foe })
    if (state.landed >= LIVES) end(false)
  }

  beginWave(start)

  return {
    state,
    get foes() { return foes },
    get wave() { return wave },
    get accuracy() { return state.played ? state.clean / state.played : 0 },

    noteOn(key: number, at: number, held: Iterable<number>) {
      struck.set(key, at)
      const foe = foes[0]
      if (state.over || !foe) return
      const down = [...held]
      const fresh = down.filter(k => at - (struck.get(k) ?? -Infinity) <= GESTURE_MS)
      if (fits(foe.target, fresh) || fits(foe.target, down)) return fold(foe, at)
      const stray = fresh.some(k => !foe.target.pcs.includes(k % 12))
      if (!foe.dirty && stray && fresh.length >= foe.target.pcs.length) {
        foe.dirty = true
        state.combo = 0
        miss(foe.target.name)
        emit({ type: 'wrong', foe })
      }
    },

    tick(now: number) {
      if (state.over) return
      while (foes[0] && now >= foes[0].landAt + LAND_GRACE_MS && !state.over) land(foes[0], now)
      if (state.over) return
      if (queue.length && now >= nextAt) spawn(now)
      else if (!queue.length && !foes.length) beginWave(now)
    },
  }
}

export type Run = ReturnType<typeof createRun>
