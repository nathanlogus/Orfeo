// ── One run of Scale Climb: no rendering, no clock of its own ─────────────────
// The screen hands in key presses with their own timestamps and asks it to move
// time along, so every step and every gap comes from MIDI events, not frames.
import { Note } from 'tonal'
import { scalePitchClasses } from '../../jam/band'
import { licksFor } from '../../jam/licks'
import { anyOctave, createJudge } from '../judge'
import { paceAt, type Climb, type Stage } from './stages'

export const LIVES = 3
// Three slips on one climb is a fall: back to the bottom, one life gone
export const FALL_SLIPS = 3
// You can hang on one hold for this many beats of the pace
export const GRIP_BEATS = 3
// A slip waits this long for a key already on its way in
const GRIP_GRACE_MS = 120
// A step is even when its gap is this close to your recent gaps
const EVEN_SHARE = 0.3
const EVEN_FLOOR_MS = 60
const EVEN_GAPS = 4
const STEP_SCORE = 50
const EVEN_SCORE = 50
const TOP_SCORE = 200
const COMBO_STEP = 4
const MAX_MULTIPLIER = 3
const NEAR_CLEAN = 0.95
const GOOD = 0.8
const EVEN_FOR_THREE = 0.8
const EVEN_FOR_TWO = 0.6
export const RIFF_BEAT_MS = 500
const RIFF_BEATS = 8
const RIFF_STYLE = { major: 'pop', minor: 'alternative', 'harmonic minor': 'alternative' } as const

export interface Gap { from: string; to: string; ms: number; ref: number; even: boolean }
export interface RiffNote { key: number; at: number }
export interface Riff { name: string; notes: RiffNote[]; ms: number }

export type RunEvent =
  | { type: 'climb'; climb: Climb; index: number; total: number }
  | { type: 'step'; points: number; even: boolean; top: boolean }
  | { type: 'slip'; climb: Climb }
  | { type: 'fall' }
  | { type: 'riff'; riff: Riff; climb: Climb }
  | { type: 'ring'; key: number }
  | { type: 'end'; cleared: boolean }

// weak: scales this player has slipped on; the worst earns one more climb at the end
interface Options { stage: Stage; assist: boolean; emit: (e: RunEvent) => void; weak?: string[] }

const median = (list: number[]) => [...list].sort((a, b) => a - b)[Math.floor(list.length / 2)]

export const multiplierFor = (combo: number) => Math.min(MAX_MULTIPLIER, 1 + Math.floor(combo / COMBO_STEP))
export const starsFor = (accuracy: number, evenness: number, assist: boolean) => (assist ? 1 : accuracy >= NEAR_CLEAN && evenness >= EVEN_FOR_THREE ? 3 : accuracy >= GOOD && evenness >= EVEN_FOR_TWO ? 2 : 1)
export const THREE_STAR_ACCURACY = Math.round(NEAR_CLEAN * 100)
export const THREE_STAR_EVENNESS = Math.round(EVEN_FOR_THREE * 100)

// A short library line that stays inside this scale, moved to its key. The climb's
// place in the run picks it, so a run always hears the same riffs in the same order.
export function riffFor(climb: Climb, index: number): Riff {
  const pc = Note.chroma(climb.tonic)!
  const scale = scalePitchClasses(climb.type, pc)
  const length = (notes: { at: number; beats: number }[]) => Math.max(...notes.map(n => n.at + n.beats))
  const fits = licksFor(RIFF_STYLE[climb.type], climb.type, pc, Infinity).filter(l => l.notes.every(n => scale.has(n.midi % 12)) && length(l.notes) <= RIFF_BEATS)
  const lick = fits[index % fits.length]
  return { name: lick.name, notes: lick.notes.map(n => ({ key: n.midi, at: n.at * RIFF_BEAT_MS })), ms: length(lick.notes) * RIFF_BEAT_MS }
}

export function createRun({ stage, assist, emit, weak = [] }: Options) {
  const again = stage.kind === 'stage' && stage.scales.length > 1 ? stage.scales.find(s => s.id === weak.find(id => stage.scales.some(c => c.id === id))) : undefined
  const total = stage.climbs + (again ? 1 : 0)
  const state = { score: 0, combo: 0, bestCombo: 0, lives: LIVES, right: 0, slips: 0, gaps: 0, even: 0, climbs: 0, over: false, cleared: false }
  let index = -1           // the climb under way
  let climb = stage.scales[0]
  let pos = 0              // notes of this route done
  let slips = 0            // on this climb
  let grip = Infinity
  let last: number | null = null   // the last good step; null: resting, the grip isn't running
  let gaps: number[] = []
  let shown: Gap[] = []
  let riff: { notes: RiffNote[]; startAt: number; endAt: number; next: number } | null = null

  // One note due at a time, so a later note of the scale can't count as this one
  const armed = () => createJudge([{ at: 0, accepts: anyOctave(climb.keys[pos]) }], { good: Infinity })
  let judge = armed()

  function begin(keepGoing: boolean) {
    index++
    climb = index >= stage.climbs && again ? again : stage.scales[index % stage.scales.length]
    pos = 0
    slips = 0
    grip = paceAt(stage, index, assist) * GRIP_BEATS
    if (!keepGoing) { last = null; gaps = [] }
    judge = armed()
    emit({ type: 'climb', climb, index: index + 1, total })
  }

  function end(cleared: boolean) {
    state.over = true
    state.cleared = cleared
    emit({ type: 'end', cleared })
  }

  const more = () => index + 1 < total

  function top(at: number) {
    state.climbs++
    state.score += TOP_SCORE
    if (stage.nonstop && more()) return begin(true)
    const line = riffFor(climb, state.climbs - 1)
    riff = { notes: line.notes, startAt: at + RIFF_BEAT_MS, endAt: at + RIFF_BEAT_MS * 2 + line.ms, next: 0 }
    emit({ type: 'riff', riff: line, climb })
  }

  function step(at: number) {
    const ms = last === null ? null : at - last
    const ref = gaps.length ? median(gaps.slice(-EVEN_GAPS)) : ms
    const even = ms === null || Math.abs(ms - ref!) <= Math.max(EVEN_FLOOR_MS, ref! * EVEN_SHARE)
    if (ms !== null) {
      state.gaps++
      if (even) state.even++
      gaps.push(ms)
      shown = [...shown, { from: climb.notes[Math.max(0, pos - 1)], to: climb.notes[pos], ms, ref: ref!, even }].slice(-EVEN_GAPS)
    }
    state.combo = even ? state.combo + 1 : 0
    state.bestCombo = Math.max(state.bestCombo, state.combo)
    const points = (STEP_SCORE + (even ? EVEN_SCORE : 0)) * multiplierFor(state.combo)
    state.score += points
    state.right++
    pos++
    last = at
    const done = pos === climb.keys.length
    emit({ type: 'step', points, even, top: done })
    if (done) top(at)
    else judge = armed()
  }

  function slip(at: number) {
    state.slips++
    state.combo = 0
    slips++
    pos = Math.max(0, pos - stage.slip)
    gaps = []
    if (last !== null) last = at
    if (slips >= FALL_SLIPS) {
      pos = 0
      slips = 0
      last = null
      state.lives--
    }
    judge = armed()
    emit({ type: 'slip', climb })
    if (!slips) emit({ type: 'fall' })
    if (state.lives <= 0) end(false)
  }

  begin(false)

  return {
    state,
    total,
    get climb() { return climb },
    get pos() { return pos },
    get gaps() { return shown },
    get resting() { return riff !== null },
    get accuracy() { return state.right + state.slips ? state.right / (state.right + state.slips) : 0 },
    get evenness() { return state.gaps ? state.even / state.gaps : 0 },
    // How much of this hold's grip has gone, 0 to 1
    strain(now: number) { return last === null || riff ? 0 : Math.min(1, (now - last) / grip) },

    noteOn(key: number, at: number) {
      if (state.over || riff) return
      const verdict = judge.press(key, at)
      if (verdict?.grade === 'wrong') slip(at)
      else if (verdict) step(at)
    },

    tick(now: number) {
      if (state.over) return
      if (riff) {
        while (riff.next < riff.notes.length && now >= riff.startAt + riff.notes[riff.next].at) emit({ type: 'ring', key: riff.notes[riff.next++].key })
        if (now < riff.endAt) return
        riff = null
        if (more()) begin(false)
        else end(true)
      }
      else if (last !== null && now - last >= grip + GRIP_GRACE_MS) slip(now)
    },
  }
}

export type Run = ReturnType<typeof createRun>
