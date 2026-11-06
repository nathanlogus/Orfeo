// ── Practice scoring: how a phrase went, and what that means for its level ───
// A phrase is four bars. MIDI gives the exact key, so a step counts when each of
// its notes was pressed close enough to its time; extra keys cost nothing.

export const BARS_PER_PHRASE = 4
export const FULL_LEVEL = 5
export const LEVEL_UP = 0.9
const LEVEL_DOWN = 0.6
const WINS_TO_LEVEL_UP = 2

// Memory: how far a phrase's notes have faded, an index into this
export const MEMORY_FADE = [1, 0.6, 0.25, 0]
export const MEMORY_GONE = MEMORY_FADE.length - 1

// `waited`: played while Wait held the song. `slow`: played under 100% tempo.
export interface Press { midi: number; time: number; waited?: boolean; slow?: boolean }
export interface ScoredStep { time: number; notes: { midi: number }[] }
export interface PhraseProgress { level: number; wins: number; best: number; memory?: number }

export function phraseStarts(barTimes: number[]): number[] {
  return barTimes.length ? barTimes.filter((_, i) => i % BARS_PER_PHRASE === 0) : [0]
}

export function phraseOf(starts: number[], time: number): number {
  let lo = 0, hi = starts.length
  while (lo < hi) { const mid = (lo + hi) >> 1; if (starts[mid] <= time) lo = mid + 1; else hi = mid }
  return Math.max(0, lo - 1)
}

const noteHit = (midi: number, time: number, presses: Press[], windowSec: number) =>
  presses.some(p => p.midi === midi && Math.abs(p.time - time) <= windowSec)

// Share of steps played, 0..1. Null when there was nothing to play.
export function accuracy(steps: ScoredStep[], presses: Press[], windowSec: number): number | null {
  if (!steps.length) return null
  const hit = steps.filter(s => s.notes.every(n => noteHit(n.midi, s.time, presses, windowSec)))
  return hit.length / steps.length
}

// A press lands on a note the same way accuracy() counts it
export function pressHits(steps: ScoredStep[], press: Press, windowSec: number): boolean {
  return steps.some(s => Math.abs(press.time - s.time) <= windowSec && s.notes.some(n => n.midi === press.midi))
}

// Notes of the steps in (from, to] that nothing landed on. Steps are time-ordered.
export function missedNotes(steps: ScoredStep[], from: number, to: number, presses: Press[], windowSec: number): number[] {
  let lo = 0, hi = steps.length
  while (lo < hi) { const mid = (lo + hi) >> 1; if (steps[mid].time <= from) lo = mid + 1; else hi = mid }
  const missed: number[] = []
  for (let i = lo; i < steps.length && steps[i].time <= to; i++) {
    for (const n of steps[i].notes) if (!noteHit(n.midi, steps[i].time, presses, windowSec)) missed.push(n.midi)
  }
  return missed
}

// `auto` moves the level; a level you chose stays. Only a run at full speed can
// raise the best result, which is what mastery counts.
export function afterPhrase(p: PhraseProgress, played: number, level: number, auto: boolean, fullSpeed = true): PhraseProgress {
  const best = fullSpeed ? Math.max(p.best, (level / FULL_LEVEL) * played) : p.best
  if (!auto) return { ...p, best }
  if (played < LEVEL_DOWN) return { ...p, level: Math.max(1, p.level - 1), wins: 0, best }
  if (played < LEVEL_UP) return { ...p, wins: 0, best }
  return p.wins + 1 >= WINS_TO_LEVEL_UP
    ? { level: Math.min(FULL_LEVEL, p.level + 1), wins: 0, best }
    : { ...p, wins: p.wins + 1, best }
}

// One step further for a clean counted run at the full level; a rough run, of
// any kind, brings the notes back
export function afterMemoryRun(step: number, played: number, level: number, counted: boolean): number {
  if (played < LEVEL_DOWN) return 0
  return counted && level >= FULL_LEVEL && played >= LEVEL_UP ? Math.min(MEMORY_GONE, step + 1) : step
}

// Each phrase's fade, null for a phrase with nothing to play
export function memoryMap(starts: number[], steps: ScoredStep[], progress: PhraseProgress[]): (number | null)[] {
  const withNotes = new Set(steps.map(s => phraseOf(starts, s.time)))
  return starts.map((_, i) => (withNotes.has(i) ? progress[i]?.memory ?? 0 : null))
}

// Level and accuracy together, across the whole song: 100 means every phrase
// played cleanly at the full level
export function mastery(phrases: PhraseProgress[], phraseCount: number): number {
  if (!phraseCount) return 0
  return Math.round((phrases.reduce((sum, p) => sum + p.best, 0) / phraseCount) * 100)
}
