// ── How it went: the summary shown when a song ends, built from the phrases
// played since the last one. A phrase nobody played isn't in it. ─────────────
import { BARS_PER_PHRASE, FULL_LEVEL, LEVEL_UP, mastery, type PhraseProgress } from './practiceScore'
import { t } from './i18n'

export interface PhraseRun {
  phrase: number
  steps: number             // notes and chords there were to play
  played: number            // 0..1
  levelBefore: number
  levelAfter: number
  wins: number
  auto: boolean
  partway: boolean          // End came mid-phrase: shown, never scored
  uncounted?: 'wait' | 'slow'   // Wait: nothing moved. Slower: the level can, mastery can't.
  unseen?: boolean          // clean, with none of its notes showing
}

export interface BarRange { label: string; shortLabel: string; time: number; end: number }

export interface ResultRow {
  bars: string
  percent: number
  note: string
  tag: string
  moved: boolean            // up a level: the tag turns lime
}

export interface PracticeResult {
  song: string
  level: number             // 0 = automatic
  tempoPercent: number
  percent: number
  title: string
  notCounted: string | null // why this run didn't count in full
  rows: ResultRow[]
  map: { state: 'learned' | 'started' | 'none'; played: boolean }[]
  mastery: number
  masteryBefore: number
  again: BarRange
  next: BarRange | null
}

export function barRange(firstPhrase: number, lastPhrase: number, starts: number[], barCount: number, duration: number): BarRange {
  const from = firstPhrase * BARS_PER_PHRASE + 1
  const to = Math.max(from, Math.min((lastPhrase + 1) * BARS_PER_PHRASE, barCount))
  const shortLabel = from === to ? `${from}` : `${from}–${to}`
  return {
    label: from === to ? t`Bar ${from}` : t`Bars ${shortLabel}`, shortLabel,
    time: starts[firstPhrase] ?? 0, end: starts[lastPhrase + 1] ?? duration,
  }
}

function rowOf(run: PhraseRun, starts: number[], barCount: number, duration: number): ResultRow {
  const bars = barRange(run.phrase, run.phrase, starts, barCount, duration).label
  const percent = Math.round(run.played * 100)
  const slow = run.uncounted === 'slow' ? ` · ${t`under 100% tempo, so mastery stays`}` : ''
  const row = (note: string, tag: string, moved = false) => ({ bars, percent, note: note + slow, tag, moved })
  if (run.partway) return row(t`You stopped partway, so its level stays`, t`Not finished`)
  if (run.uncounted === 'wait') return row(t`Wait held the song for you, so this doesn't count`, t`Not counted`)
  if (!run.auto) return row(t`You chose this level`, t`Level ${run.levelAfter}`)
  if (run.levelAfter > run.levelBefore) return row(t`Over 90% twice in a row`, t`Moves up to level ${run.levelAfter}`, true)
  if (run.levelAfter < run.levelBefore) return row(t`Under 60% this time`, t`Moves down to level ${run.levelAfter}`)
  const stays = t`Stays on level ${run.levelAfter}`
  if (run.levelAfter >= FULL_LEVEL) return row(t`This phrase is at the top level`, stays)
  return row(run.wins > 0 ? t`Once more over 90% to move up` : t`Reach 90% twice to move up`, stays)
}

export interface ResultInput {
  song: string
  level: number
  tempoPercent: number
  runs: PhraseRun[]
  progress: PhraseProgress[]
  starts: number[]          // phrase start times
  barCount: number
  duration: number
  masteryBefore: number
}

// Null when no keys were played: listening has no result
export function buildPracticeResult({ song, level, tempoPercent, runs, progress, starts, barCount, duration, masteryBefore }: ResultInput): PracticeResult | null {
  if (!runs.length) return null
  const sorted = [...runs].sort((a, b) => a.phrase - b.phrase)
  const first = sorted[0].phrase, last = sorted[sorted.length - 1].phrase
  const steps = sorted.reduce((sum, r) => sum + r.steps, 0)
  const percent = steps ? Math.round(sorted.reduce((sum, r) => sum + r.played * r.steps, 0) / steps * 100) : 0
  const again = barRange(first, last, starts, barCount, duration)
  const nextFirst = last + 1
  const unbroken = last - first + 1 === sorted.length
  const ending = sorted.some(r => r.partway) ? t`so far` : t`played through`
  const played = new Set(sorted.map(r => r.phrase))
  return {
    song, level, tempoPercent, percent,
    title: `${unbroken ? again.label : t`${sorted.length} phrases`}, ${ending}.`,
    notCounted: sorted.some(r => r.uncounted === 'wait') ? t`Notes played while Wait held the song don't count towards levels or mastery.`
      : sorted.some(r => r.uncounted === 'slow') ? t`Levels can move at any tempo, but mastery only counts runs at 100%.` : null,
    rows: sorted.map(r => rowOf(r, starts, barCount, duration)),
    map: starts.map((_, i) => {
      const best = progress[i]?.best ?? 0
      return { state: best >= LEVEL_UP ? 'learned' : best > 0 ? 'started' : 'none', played: played.has(i) }
    }),
    mastery: mastery(progress.filter(Boolean), starts.length),
    masteryBefore,
    again,
    next: nextFirst < starts.length ? barRange(nextFirst, Math.min(nextFirst + last - first, starts.length - 1), starts, barCount, duration) : null,
  }
}
