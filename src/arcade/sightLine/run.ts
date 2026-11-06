// ── One run of Sight Line: no rendering, no clock of its own ──────────────────
// The trail is a series of lines, each at its own speed. The screen hands in key
// presses with their own timestamps and asks it to move time along.
import { midiOf } from '../../lessons/drill'
import type { DrillStep } from '../games'
import { createJudge, exactly, type Verdict } from '../judge'
import { engrave, inKey, musicOf, type Head, type LineRef, type Music } from './lines'
import { bpmAt, type Stage } from './stages'

export const LIVES = 3
export const AHEAD_FULL = 5
const LEAD_BEATS = 5
// A note can be read this long before it reaches the coach, at slow speeds most of a
// beat, and caught this long after. createJudge's window is even on both sides, so
// its centre sits ahead of the coach.
const EARLY_MS = 440
const EARLY_BEATS = 0.75
const LATE_MS = 160
const ON_TIME_MS = 60
const BASE_SCORE = 100
const AHEAD_SCORE = 40
const COMBO_STEP = 5
const MAX_MULTIPLIER = 4
const GOOD = 0.8
const NEAR_CLEAN = 0.95

export interface Fork {
  id: number
  heads: Head[]
  beat: number              // along the whole run's trail
  at: number                // when it reaches the coach
  left: number              // keys still to play
  dirty: boolean            // a wrong key was tried at it
  done: boolean
}

export interface Line {
  index: number
  key: string               // its signature
  bpm: number
  at: number                // when its stretch of trail starts
  startBeat: number
  pad: number               // open trail before its first note
  length: number
  forks: Fork[]
}

interface Judged { judge: ReturnType<typeof createJudge>; owners: Fork[] }

export type RunEvent =
  | { type: 'line'; line: Line }                 // coming up: draw it
  | { type: 'enter'; line: Line }                // the coach is on it: speed and signature
  | { type: 'hit'; fork: Fork; points: number }
  | { type: 'wrong'; fork: Fork }
  | { type: 'miss'; fork: Fork }
  | { type: 'end'; cleared: boolean }

// weak: notes this player has slipped on before; lines holding them come round sooner
interface Options { stage: Stage; assist: boolean; rng: () => number; emit: (e: RunEvent) => void; start: number; weak?: string[] }

export const starsFor = (accuracy: number, assist: boolean) => (assist ? 1 : accuracy >= NEAR_CLEAN ? 3 : accuracy >= GOOD ? 2 : 1)
export const cleanForThree = (played: number) => Math.ceil(Number((played * NEAR_CLEAN).toFixed(6)))
export const multiplierFor = (combo: number) => Math.min(MAX_MULTIPLIER, 1 + Math.floor(combo / COMBO_STEP))

export function lineOrder(lines: LineRef[], weak: string[]): LineRef[] {
  const holds = (line: LineRef) => musicOf(line).events.filter(e => e.names.some(n => weak.includes(n))).length
  return [lines[0], ...lines.slice(1).map((line, i) => ({ line, i, n: holds(line) })).sort((a, b) => b.n - a.n || a.i - b.i).map(x => x.line)]
}

// The Two-minute drill: the notes that slipped
export const drillSteps = (items: string[]): DrillStep[] => items.map(name => ({ label: name, keys: [midiOf(name)], fits: held => held.includes(midiOf(name)) }))

export function createRun({ stage, assist, rng, emit, start, weak = [] }: Options) {
  const endless = stage.kind === 'endless'
  const order = lineOrder(stage.lines, weak)
  const state = {
    score: 0, combo: 0, bestCombo: 0, ahead: 0, bestAhead: 0, clean: 0, played: 0, misses: 0,
    lines: 0, bpm: 0, topBpm: 0, over: false, cleared: false,
  }
  const judged: Judged[] = []
  const lines: Line[] = []   // the one the coach is on, and the one after
  let nextFork = 0
  let lastRef: LineRef | null = null

  function musicAt(index: number): { music: Music; key: string } | null {
    if (!endless) return index < order.length ? { music: musicOf(order[index]), key: stage.keys[0] } : null
    // Only the choice of line is left to chance: the notes are all written
    const fresh = order.filter(l => l !== lastRef)
    lastRef = fresh[Math.floor(rng() * fresh.length)]
    const key = stage.keys[index % stage.keys.length]
    return { music: inKey(musicOf(lastRef), key), key }
  }

  function addLine(at: number, startBeat: number) {
    const index = state.lines++
    const next = musicAt(index)
    if (!next) return
    const { music, key } = next
    const bpm = bpmAt(stage, index, assist)
    const ms = 60_000 / bpm
    const pad = index === 0 ? LEAD_BEATS : stage.rest
    const heads = engrave(music, stage.clefs, key)
    const forks = music.events.map((e, i): Fork => ({
      id: nextFork++, heads: heads[i], beat: startBeat + pad + e.beat, at: at + (pad + e.beat) * ms, left: e.names.length, dirty: false, done: false,
    }))
    const line: Line = { index, key, bpm, at, startBeat, pad, length: pad + music.beats, forks }
    const owners = forks.flatMap(fork => fork.heads.map(() => fork))
    const early = Math.max(EARLY_MS, ms * EARLY_BEATS)
    const notes = forks.flatMap(fork => fork.heads.map(h => ({ at: fork.at - (early - LATE_MS) / 2, accepts: exactly(midiOf(h.name)) })))
    judged.push({ judge: createJudge(notes, { perfect: ON_TIME_MS, good: (early + LATE_MS) / 2 }), owners })
    lines.push(line)
    emit({ type: 'line', line })
  }

  const addAfter = (line: Line) => addLine(line.at + line.length * 60_000 / line.bpm, line.startBeat + line.length)

  function enter(line: Line) {
    state.bpm = line.bpm
    state.topBpm = Math.max(state.topBpm, line.bpm)
    emit({ type: 'enter', line })
  }

  function end(cleared: boolean) {
    state.over = true
    state.cleared = cleared
    emit({ type: 'end', cleared })
  }

  function hit(fork: Fork, at: number) {
    fork.done = true
    state.played++
    const clean = !fork.dirty
    // Read ahead: the key came as the note reached the coach or sooner, not in answer to it
    state.ahead = clean && at - fork.at <= ON_TIME_MS ? state.ahead + 1 : 0
    state.bestAhead = Math.max(state.bestAhead, state.ahead)
    const points = clean ? (BASE_SCORE + AHEAD_SCORE * Math.min(AHEAD_FULL, state.ahead)) * multiplierFor(state.combo) : BASE_SCORE
    state.score += points
    if (clean) {
      state.clean++
      state.combo++
      state.bestCombo = Math.max(state.bestCombo, state.combo)
    }
    emit({ type: 'hit', fork, points })
  }

  function lost(fork: Fork) {
    fork.done = true
    state.played++
    state.misses++
    state.combo = 0
    state.ahead = 0
    emit({ type: 'miss', fork })
    if (state.misses >= LIVES) end(false)
  }

  addLine(start, 0)
  enter(lines[0])
  addAfter(lines[0])

  return {
    state,
    get accuracy() { return state.played ? state.clean / state.played : 0 },
    // The next fork the coach comes to
    get target(): Fork | undefined { return lines.flatMap(l => l.forks).find(f => !f.done) },

    // How far along the trail the coach is, in beats
    position(now: number) {
      const line = lines[1] && now >= lines[1].at ? lines[1] : lines[0]
      return line.startBeat + (now - line.at) * line.bpm / 60_000
    },

    noteOn(key: number, at: number) {
      if (state.over) return
      let wrong: Fork | null = null
      for (const { judge, owners } of judged) {
        const verdict: Verdict | null = judge.press(key, at)
        if (!verdict) continue
        const fork = owners[verdict.index]
        if (verdict.grade !== 'wrong') {
          if (--fork.left === 0) hit(fork, at)
          return
        }
        wrong ??= fork
      }
      if (!wrong) return
      state.combo = 0
      state.ahead = 0
      if (!wrong.dirty) {
        wrong.dirty = true
        emit({ type: 'wrong', fork: wrong })
      }
    },

    tick(now: number) {
      if (state.over) return
      for (const entry of [...judged]) {
        for (const { index } of entry.judge.tick(now)) {
          if (!entry.owners[index].done) lost(entry.owners[index])
          if (state.over) return
        }
        if (!entry.judge.left) judged.splice(judged.indexOf(entry), 1)
      }
      if (lines[1] && now >= lines[1].at) {
        lines.shift()
        enter(lines[0])
        addAfter(lines[0])
      }
      if (!judged.length) end(true)
    },
  }
}

export type Run = ReturnType<typeof createRun>
