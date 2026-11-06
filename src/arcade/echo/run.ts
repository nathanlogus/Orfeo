// ── One run of Echo: no rendering, no clock ───────────────────────────────────
// There is no timer here. The whale sings, the screen says when it has finished,
// and each key is judged by its pitch and its place in the phrase.
import { fits } from '../library/chords'
import { MISSED_SHARE } from '../../lessons/drill'
import { bossParts, poolAt, type Phrase, type Step } from './phrases'
import type { Stage } from './stages'

export const LIVES = 3
const NOTE_SCORE = 50
const NO_REPLAY_BONUS = 150
const COMBO_STEP = 3
const COMBO_BONUS = 0.5
const MAX_MULTIPLIER = 3
const GOOD = 0.8
const NEAR_CLEAN = 0.95
// Keys struck this close together are one try at a chord
const GESTURE_MS = 150
// Assist sings each phrase this much longer
const ASSIST_STRETCH = 1.4
const NOTE_LENGTH = 0.92
const LONGEST_RING_MS = 1600
// How close Endless's whale comes: halfway after this many right answers
const ENDLESS_HALFWAY = 6

export type Phase = 'singing' | 'answer' | 'reveal' | 'over'
export type Mark = 'right' | 'wrong'

export type RunEvent =
  | { type: 'phrase'; phrase: Phrase }
  | { type: 'replay' }
  | { type: 'note'; index: number; right: boolean }
  | { type: 'answered'; phrase: Phrase; right: boolean; points: number }
  | { type: 'end'; cleared: boolean }

interface Options { stage: Stage; assist: boolean; rng: () => number; emit: (e: RunEvent) => void; weak?: string[] }

export const starsFor = (accuracy: number, assist: boolean) => (assist ? 1 : accuracy >= NEAR_CLEAN ? 3 : accuracy >= GOOD ? 2 : 1)
export const rightForThree = (played: number) => Math.ceil(Number((played * NEAR_CLEAN).toFixed(6)))
export const multiplierFor = (combo: number) => Math.min(MAX_MULTIPLIER, 1 + Math.floor(combo / COMBO_STEP) * COMBO_BONUS)

// When each note of a phrase sounds, in ms from the first. `done` is when the whale has finished.
export function scheduleOf({ steps, beatMs }: Phrase, assist: boolean) {
  const beat = beatMs * (assist ? ASSIST_STRETCH : 1)
  const notes = steps.map(s => ({ keys: s.keys, at: s.at * beat, ms: Math.min(LONGEST_RING_MS, s.beats * beat * NOTE_LENGTH) }))
  const last = notes[notes.length - 1]
  return { notes, done: last.at + last.ms }
}

const pick = <T,>(list: T[], rng: () => number) => list[Math.floor(rng() * list.length)]

// The next phrase. Weak ones come back more often, and nothing comes twice running.
function nextPhrase(pool: Phrase[], weak: string[], last: Phrase | null, rng: () => number): Phrase {
  const fresh = pool.filter(p => !last || p.id !== last.id || p.steps[0].keys[0] !== last.steps[0].keys[0])
  const repeats = fresh.filter(p => weak.includes(p.id))
  return pick(repeats.length && rng() < MISSED_SHARE ? repeats : fresh.length ? fresh : pool, rng)
}

export function createRun({ stage, assist, rng, emit, weak = [] }: Options) {
  const boss = stage.kind === 'boss'
  const key = pick(stage.keys, rng)
  const parts = boss ? bossParts(stage) : []
  const goal = boss ? parts.length : stage.phrases
  const state = { score: 0, combo: 0, bestCombo: 0, fails: 0, right: 0, played: 0, noReplay: 0, phase: 'singing' as Phase, cleared: false }
  let phrase = boss ? parts[0] : poolAt(stage, 0, key)[0]
  let marks: Mark[] = []
  let replayed = false
  let settled = -Infinity
  const struck = new Map<number, number>()

  // Assist's first note is given, and already right
  const open = () => { marks = assist ? ['right'] : []; replayed = false; settled = -Infinity }
  open()

  const given = () => (assist ? 1 : 0)

  function answered() {
    const right = marks.every(m => m === 'right')
    const notes = marks.slice(given()).filter(m => m === 'right').length
    let points = notes * NOTE_SCORE
    state.played++
    state.phase = 'reveal'
    if (right) {
      points = Math.round((points + (replayed ? 0 : NO_REPLAY_BONUS)) * multiplierFor(state.combo))
      state.right++
      state.combo++
      state.bestCombo = Math.max(state.bestCombo, state.combo)
      if (!replayed) state.noReplay++
    }
    else {
      state.fails++
      state.combo = 0
    }
    state.score += points
    emit({ type: 'answered', phrase, right, points })
  }

  function mark(right: boolean, at: number) {
    marks = [...marks, right ? 'right' : 'wrong']
    settled = at
    emit({ type: 'note', index: marks.length - 1, right })
    if (marks.length === phrase.steps.length) answered()
  }

  function judgeChord(step: Step, at: number, held: Iterable<number>) {
    if (at - settled < GESTURE_MS) return    // the rest of the last try's keys
    const down = [...held]
    const fresh = down.filter(k => at - (struck.get(k) ?? -Infinity) <= GESTURE_MS)
    if (fits(step.chord!, fresh) || fits(step.chord!, down)) mark(true, at)
    else if (new Set(fresh.map(k => k % 12)).size >= step.chord!.pcs.length) mark(false, at)
  }

  return {
    state,
    goal,
    get phrase() { return phrase },
    get marks() { return marks },
    get replayed() { return replayed },
    get accuracy() { return state.played ? state.right / state.played : 0 },
    // 0 far away, 1 alongside: how near the whale is and how much ocean is lit
    get near() { return goal === Infinity ? state.right / (state.right + ENDLESS_HALFWAY) : Math.min(1, state.right / goal) },

    // The whale has finished singing
    sung() { if (state.phase === 'singing') state.phase = 'answer' },

    // Costs the bonus, nothing else: the notes already played stay played
    replay() {
      if (state.phase !== 'answer') return
      replayed = true
      state.phase = 'singing'
      emit({ type: 'replay' })
    },

    noteOn(key: number, at: number, held: Iterable<number>) {
      struck.set(key, at)
      if (state.phase !== 'answer') return
      const step = phrase.steps[marks.length]
      if (step.chord) judgeChord(step, at, held)
      else mark(key % 12 === step.keys[0] % 12, at)
    },

    // The screen has shown the answer: on to the next phrase, or the end
    next() {
      if (state.phase !== 'reveal') return
      const finished = boss ? state.right >= goal : state.played >= goal
      if (state.fails >= LIVES || finished) {
        state.phase = 'over'
        state.cleared = state.fails < LIVES
        emit({ type: 'end', cleared: state.cleared })
        return
      }
      phrase = boss ? parts[state.right] : nextPhrase(poolAt(stage, state.played, key), weak, phrase, rng)
      open()
      state.phase = 'singing'
      emit({ type: 'phrase', phrase })
    },
  }
}

export type Run = ReturnType<typeof createRun>
