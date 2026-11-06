// ── One run of Soft Touch: no rendering, no clock of its own ──────────────────
// When a note counts comes from its own timestamp through createJudge; whether it
// counts comes from how hard it was played, as a height on the calibrated meter.
import { anyKey, createJudge } from '../judge'
import { LEVELS, beatAt, isLoud, widthAt, type Mark, type Phrase, type Stage } from './stages'

export const LIVES = 3
// The first slip stirs the guard, the second wakes the house
export const SLIPS_PER_LIFE = 2
const LEAD_MS = 2600
const ROOM_GAP_MS = 2000
const GOOD_SHARE = 0.45    // of a beat, so two notes' windows never touch
const MAX_GOOD_MS = 400
const BASE_SCORE = 100
const CENTRE_SCORE = 100
const COMBO_STEP = 4
const COMBO_BONUS = 0.5
const MAX_MULTIPLIER = 3
const RECENT_MISSES = 8
const WEAK_SHARE = 0.5
const GOOD = 0.8
const NEAR_CLEAN = 0.95

export type Act = 'door' | 'noise' | null
export interface Step { at: number; key: number; mark: Mark; level: number; act: Act }

export type Slip = 'loud' | 'soft' | 'late'

export type RunEvent =
  | { type: 'room'; index: number; first: number }     // first: when its first note falls due
  | { type: 'inside'; step: Step; level: number; points: number }
  | { type: 'slip'; step: Step; level: number | null; slip: Slip; alarm: boolean }
  | { type: 'end'; cleared: boolean }

// weak: markings this player has slipped on, sent more often from the first room
interface Options { stage: Stage; assist: boolean; rng: () => number; emit: (e: RunEvent) => void; start: number; weak?: string[] }

export const multiplierFor = (combo: number) => Math.min(MAX_MULTIPLIER, 1 + Math.floor(combo / COMBO_STEP) * COMBO_BONUS)
export const starsFor = (accuracy: number, assist: boolean) => (assist ? 1 : accuracy >= NEAR_CLEAN ? 3 : accuracy >= GOOD ? 2 : 1)
export const bossStars = (tries: number, assist: boolean) => (assist ? 1 : Math.max(1, LIVES + 1 - tries))
export const cleanForThree = (played: number) => Math.ceil(Number((played * NEAR_CLEAN).toFixed(6)))

// Each loud note does something: a noise, and the phrase's last one opens the door
export function stepsOf(phrase: Phrase, first: number, beat: number): Step[] {
  const loud = phrase.notes.filter(n => isLoud(n.mark))
  return phrase.notes.map(n => ({
    at: first + n.beat * beat, key: n.key, mark: n.mark, level: LEVELS[n.mark],
    act: !isLoud(n.mark) ? null : n === loud[loud.length - 1] ? 'door' : 'noise',
  }))
}

export function nextPhrase(pool: Phrase[], missed: string[], last: Phrase | null, rng: () => number): Phrase {
  const fresh = pool.length > 1 ? pool.filter(p => p !== last) : pool
  const repeats = fresh.filter(p => p.notes.some(n => missed.includes(n.mark)))
  const from = repeats.length && rng() < WEAK_SHARE ? repeats : fresh
  return from[Math.floor(rng() * from.length)]
}

export function createRun({ stage, assist, rng, emit, start, weak = [] }: Options) {
  const boss = stage.kind === 'boss'
  const missed = weak.slice(0, RECENT_MISSES)
  const state = { score: 0, combo: 0, bestCombo: 0, clean: 0, played: 0, slips: 0, lives: LIVES, rooms: 0, tries: 0, width: 0, over: false, cleared: false }
  let phrase: Phrase | null = null
  let steps: Step[] = []
  let done = 0
  let judge = createJudge([])
  let roomAt = Infinity    // a room is waiting to begin, once the last one has emptied

  function beginRoom(now: number) {
    if (boss) state.tries++
    else if (state.rooms >= stage.rooms) return end(true)
    else state.rooms++
    const index = boss ? state.tries : state.rooms
    state.width = widthAt(stage, index - 1, assist)
    const beat = beatAt(stage, index - 1)
    phrase = boss || state.rooms === 1 ? stage.phrases[0] : nextPhrase(stage.phrases, missed, phrase, rng)
    const first = now + LEAD_MS
    steps = stepsOf(phrase, first, beat)
    done = 0
    const good = Math.min(beat * GOOD_SHARE, MAX_GOOD_MS)
    judge = createJudge(steps.map(s => ({ at: s.at, accepts: anyKey })), { perfect: good / 2, good })
    roomAt = Infinity
    emit({ type: 'room', index, first })
  }

  function end(cleared: boolean) {
    state.over = true
    state.cleared = cleared
    roomAt = Infinity
    emit({ type: 'end', cleared })
  }

  function slip(step: Step, level: number | null, kind: Slip, now: number) {
    state.played++
    done++
    state.slips++
    state.combo = 0
    missed.push(step.mark)
    missed.splice(0, missed.length - RECENT_MISSES)
    const alarm = boss || state.slips % SLIPS_PER_LIFE === 0
    if (alarm) state.lives--
    emit({ type: 'slip', step, level, slip: kind, alarm })
    if (!state.lives) return end(false)
    // One slip and the vault's dial spins back: the phrase starts again
    if (boss) { judge = createJudge([]); roomAt = now + ROOM_GAP_MS }
  }

  function inside(step: Step, level: number) {
    const closeness = 1 - Math.abs(level - step.level) / (state.width / 2)
    const points = Math.round((BASE_SCORE + CENTRE_SCORE * closeness) * multiplierFor(state.combo))
    state.score += points
    state.played++
    state.clean++
    state.combo++
    state.bestCombo = Math.max(state.bestCombo, state.combo)
    done++
    const i = missed.indexOf(step.mark)
    if (i >= 0) missed.splice(i, 1)
    emit({ type: 'inside', step, level, points })
  }

  beginRoom(start)

  return {
    state,
    get accuracy() { return state.played ? state.clean / state.played : 0 },
    get done() { return done },
    get total() { return steps.length },
    // Still to play in this room, the next one first
    get coming() { return steps.slice(done) },

    // level: how hard, from levelOf(). Between notes a key counts for nothing.
    noteOn(key: number, at: number, level: number) {
      if (state.over) return
      const verdict = judge.press(key, at)
      if (!verdict) return
      const step = steps[verdict.index]
      const off = level - step.level
      if (Math.abs(off) <= state.width / 2) inside(step, level)
      else slip(step, level, off > 0 ? 'loud' : 'soft', at)
    },

    tick(now: number) {
      if (state.over) return
      for (const { index } of judge.tick(now)) {
        slip(steps[index], null, 'late', now)
        if (state.over || roomAt !== Infinity) return
      }
      if (roomAt === Infinity && !judge.left) {
        if (boss) return end(true)
        roomAt = now + ROOM_GAP_MS
      }
      if (now >= roomAt) beginRoom(now)
    },
  }
}

export type Run = ReturnType<typeof createRun>
