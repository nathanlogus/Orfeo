// ── One run of Pocket: no rendering, no clock of its own ──────────────────────
// All times are milliseconds of game time, as the player hears it. The screen
// hands in key presses by their own timestamps and asks for clicks ahead of time;
// the rules never look at a frame.
import { BEATS_PER_BAR } from '../../jam/band'
import { anyKey, createJudge, type TimedNote, type Verdict } from '../judge'
import { dialAt, type Rhythm, type Stage } from './stages'

export const LIVES = 3
export const DRIFT_RANGE_MS = 150      // the meter's end, each way
const STEADY_MS = 45                   // the steady zone, each way
const ASSIST_STEADY_MS = 75
const GOOD_MS = 130
const WINDOW_SHARE = 0.45              // of the shortest gap, so two notes never share a window
const FOLLOW = 0.3                     // how far each note pulls the drift
const STRAIN_BEATS = 8                 // beats outside the steady zone that cost a life
const RECOVERY = 0.5
const GESTURE_MS = 45                  // keys this close are one strike: a chord is one hit
const BASE_SCORE = 20
const CLOSE_SCORE = 80
const COMBO_STEP = 8
const MAX_MULTIPLIER = 4
const NEAR_CLEAN = 0.85
const GOOD = 0.6
const STEPS_PER_BEAT = 4
const STEPS_PER_BAR = BEATS_PER_BAR * STEPS_PER_BEAT

export interface Click { at: number; accent: boolean }

export interface Section {
  cycle: number
  rhythm: Rhythm
  bpm: number
  onBars: number
  offBars: number
  start: number
  end: number
  barMs: number
  good: number            // this groove's window, each way
  notes: TimedNote[]
  judge: ReturnType<typeof createJudge>
}

export type RunEvent =
  | { type: 'section'; section: Section }
  | { type: 'hit'; offset: number; points: number; close: number }
  | { type: 'stray' }
  | { type: 'miss'; section: Section }
  | { type: 'lost'; lives: number }
  | { type: 'end'; cleared: boolean }

interface Options { stage: Stage; assist: boolean; emit: (e: RunEvent) => void; start: number; weak?: string[] }

export const multiplierFor = (combo: number) => Math.min(MAX_MULTIPLIER, 1 + Math.floor(combo / COMBO_STEP))
export const starsFor = (share: number, assist: boolean) => (assist ? 1 : share >= NEAR_CLEAN ? 3 : share >= GOOD ? 2 : 1)
export const pocketForThree = (played: number) => Math.ceil(Number((played * NEAR_CLEAN).toFixed(6)))

// The closest two hits in a bar, wrapping into the next bar
const shortestGap = (hits: number[]) => Math.min(...hits.map((h, i) => (hits[i + 1] ?? hits[0] + STEPS_PER_BAR) - h))

export function createRun({ stage, assist, emit, start, weak = [] }: Options) {
  const rank = (r: Rhythm) => { const i = weak.indexOf(r.id); return i < 0 ? weak.length : i }
  const order = stage.rhythms.map((r, i) => ({ r, i })).sort((a, b) => rank(a.r) - rank(b.r) || a.i - b.i).map(x => x.r)
  const steadyMs = assist ? ASSIST_STEADY_MS : STEADY_MS
  const state = { score: 0, combo: 0, bestCombo: 0, played: 0, pocket: 0, lives: LIVES, drift: 0, strain: 0, longestSilence: 0, over: false, cleared: false }
  let live: Section[] = []     // the groove playing, and any whose last notes are still open
  let clicks: Click[] = []
  let last: Section | null = null
  let cycles = 0
  let lastTick = start
  let lastStrike = -Infinity

  function addSection() {
    const rhythm = order[cycles % order.length]
    const bpm = stage.bpm ?? rhythm.bpm
    const beatMs = 60_000 / bpm
    const barMs = beatMs * BEATS_PER_BAR
    const stepMs = beatMs / STEPS_PER_BEAT
    const offBars = dialAt(stage, cycles, assist)
    const begin = last?.end ?? start
    const bars = stage.onBars + offBars
    // The first bar of a run or of a new tempo is only for listening
    const grace = !last || last.bpm !== bpm ? 1 : 0
    const hits = [...rhythm.line].flatMap((c, i) => (c === 'x' ? [i] : []))
    const notes: TimedNote[] = []
    for (let bar = grace; bar < bars; bar++) for (const hit of hits) notes.push({ at: begin + bar * barMs + hit * stepMs, accepts: anyKey })
    for (let bar = 0; bar < stage.onBars; bar++) for (let beat = 0; beat < BEATS_PER_BAR; beat++) clicks.push({ at: begin + bar * barMs + beat * beatMs, accent: beat === 0 })
    const good = Math.min(GOOD_MS, shortestGap(hits) * stepMs * WINDOW_SHARE)
    const section: Section = { cycle: cycles, rhythm, bpm, onBars: stage.onBars, offBars, start: begin, end: begin + bars * barMs, barMs, good, notes, judge: createJudge(notes, { perfect: steadyMs, good }) }
    cycles++
    live.push(section)
    last = section
    emit({ type: 'section', section })
  }
  const more = () => cycles < stage.cycles

  const steer = (offset: number) => { state.drift += (offset - state.drift) * FOLLOW }

  function end(cleared: boolean) {
    state.over = true
    state.cleared = cleared
    emit({ type: 'end', cleared })
  }

  function hit(section: Section, { grade, offset }: Verdict) {
    const close = 1 - Math.min(1, Math.abs(offset) / section.good)
    const points = Math.round((BASE_SCORE + CLOSE_SCORE * close) * multiplierFor(state.combo))
    state.score += points
    state.played++
    if (grade === 'perfect') state.pocket++
    state.combo++
    state.bestCombo = Math.max(state.bestCombo, state.combo)
    steer(offset)
    emit({ type: 'hit', offset, points, close })
  }

  // A key away from any note reads as early or late against the nearest, within a beat
  function stray(at: number) {
    let near = Infinity, good = GOOD_MS
    for (const s of live) for (const n of s.notes) if (Math.abs(at - n.at) < Math.abs(near)) { near = at - n.at; good = s.good }
    if (Math.abs(near) * BEATS_PER_BAR > last!.barMs) return
    state.combo = 0
    steer(Math.sign(near) * Math.min(Math.abs(near), good))
    emit({ type: 'stray' })
  }

  addSection()

  return {
    state,
    steadyMs,
    get accuracy() { return state.played ? state.pocket / state.played : 0 },

    noteOn(key: number, at: number) {
      if (state.over || at - lastStrike < GESTURE_MS) return
      lastStrike = at
      for (const s of live) {
        const verdict = s.judge.press(key, at)
        if (verdict) return hit(s, verdict)
      }
      stray(at)
    },

    // Clicks to put on the audio clock now, up to this game time
    clicksUntil(horizon: number): Click[] {
      while (last!.end <= horizon && more()) addSection()
      const due = clicks.filter(c => c.at < horizon)
      clicks = clicks.filter(c => c.at >= horizon)
      return due
    },

    tick(now: number) {
      if (state.over) return
      for (const s of live) {
        for (let closed = s.judge.tick(now).length; closed > 0; closed--) {
          state.played++
          state.combo = 0
          steer(s.good)      // a note that never came is as late as a note can be
          emit({ type: 'miss', section: s })
        }
      }
      const limit = last!.barMs / BEATS_PER_BAR * STRAIN_BEATS
      const passed = Math.max(0, now - lastTick) / limit
      lastTick = now
      state.strain = Math.abs(state.drift) > steadyMs ? state.strain + passed : Math.max(0, state.strain - RECOVERY * passed)
      if (state.strain >= 1) {
        state.lives--
        state.strain = 0
        state.drift = 0
        emit({ type: 'lost', lives: state.lives })
        if (state.lives <= 0) return end(false)
      }
      for (const s of live.filter(s => now >= s.end + s.good)) state.longestSilence = Math.max(state.longestSilence, s.offBars)
      live = live.filter(s => now < s.end + s.good)
      if (!live.length) {
        if (more()) addSection()
        else end(true)
      }
    },

    // Where the music is: which bar of which section, and how far through that bar
    phaseAt(now: number) {
      const section = live.find(s => now < s.end) ?? last!
      const into = Math.max(0, now - section.start)
      return { section, bar: Math.min(section.onBars + section.offBars - 1, Math.floor(into / section.barMs)), through: (into % section.barMs) / section.barMs }
    },
  }
}

export type Run = ReturnType<typeof createRun>
