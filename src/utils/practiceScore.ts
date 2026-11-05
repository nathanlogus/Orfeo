// ── Practice scoring: how a phrase went, and what that means for its level ───
// A phrase is four bars. MIDI gives the exact key, so a step counts when each of
// its notes was pressed close enough to its time; extra keys cost nothing.

export const BARS_PER_PHRASE = 4
export const FULL_LEVEL = 5
const LEVEL_UP = 0.9
const LEVEL_DOWN = 0.6
const WINS_TO_LEVEL_UP = 2

export interface Press { midi: number; time: number }
export interface ScoredStep { time: number; notes: { midi: number }[] }
export interface PhraseProgress { level: number; wins: number; best: number }

export function phraseStarts(barTimes: number[]): number[] {
  return barTimes.length ? barTimes.filter((_, i) => i % BARS_PER_PHRASE === 0) : [0]
}

export function phraseOf(starts: number[], time: number): number {
  let lo = 0, hi = starts.length
  while (lo < hi) { const mid = (lo + hi) >> 1; if (starts[mid] <= time) lo = mid + 1; else hi = mid }
  return Math.max(0, lo - 1)
}

// Share of steps played, 0..1. Null when there was nothing to play.
export function accuracy(steps: ScoredStep[], presses: Press[], windowSec: number): number | null {
  if (!steps.length) return null
  const hit = steps.filter(s => s.notes.every(n => presses.some(p => p.midi === n.midi && Math.abs(p.time - s.time) <= windowSec)))
  return hit.length / steps.length
}

// `auto` moves the level; a level you chose stays, and only the best result counts
export function afterPhrase(p: PhraseProgress, played: number, level: number, auto: boolean): PhraseProgress {
  const best = Math.max(p.best, (level / FULL_LEVEL) * played)
  if (!auto) return { ...p, best }
  if (played < LEVEL_DOWN) return { level: Math.max(1, p.level - 1), wins: 0, best }
  if (played < LEVEL_UP) return { ...p, wins: 0, best }
  return p.wins + 1 >= WINS_TO_LEVEL_UP
    ? { level: Math.min(FULL_LEVEL, p.level + 1), wins: 0, best }
    : { ...p, wins: p.wins + 1, best }
}

// Level and accuracy together, across the whole song: 100 means every phrase
// played cleanly at the full level
export function mastery(phrases: PhraseProgress[], phraseCount: number): number {
  if (!phraseCount) return 0
  return Math.round((phrases.reduce((sum, p) => sum + p.best, 0) / phraseCount) * 100)
}
