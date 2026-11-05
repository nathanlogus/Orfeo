// ── Practice levels: an easier version of any song, worked out from its notes ──
// A MIDI file holds one arrangement, so the levels are generated, per note. A
// note's level is the lowest one it appears at:
//   1  the melody, on the beats
//   2  the whole melody
//   3  plus the bass on the bar's strong beats
//   4  both hands, chords thinned to three notes in the right and two in the left
//   5  everything
// Only what you're asked to play changes: the song still sounds as it always did.

import { useStore } from '../store'
import { CHORD_GRACE_SEC } from './midiParser'
import { isShown } from './trackShown'
import { FULL_LEVEL } from './practiceScore'
import { AUTO_LEVEL, phraseLevelAt } from './practiceSession'

const ON_BEAT_SEC = 0.06
// Without a hand from handAssignment.ts, the split most piano music keeps to
const MIDDLE_C = 60

export interface LevelNote { midi: number; time: number; hand?: 'L' | 'R'; trackIndex: number }

export const noteKey = (trackIndex: number, midi: number, time: number) => `${trackIndex}:${midi}:${time}`

function nearAny(sorted: number[], t: number): boolean {
  let lo = 0, hi = sorted.length
  while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid] < t) lo = mid + 1; else hi = mid }
  return Math.abs((sorted[lo] ?? Infinity) - t) <= ON_BEAT_SEC || Math.abs((sorted[lo - 1] ?? Infinity) - t) <= ON_BEAT_SEC
}

function onsets(notes: LevelNote[]): LevelNote[][] {
  const groups: LevelNote[][] = []
  for (const n of [...notes].sort((a, b) => a.time - b.time)) {
    const last = groups[groups.length - 1]
    if (last && n.time - last[0].time <= CHORD_GRACE_SEC) last.push(n)
    else groups.push([n])
  }
  return groups
}

export function buildLevels(notes: LevelNote[], barTimes: number[], beatTimes: number[]): Map<string, number> {
  const levels = new Map<string, number>()
  const put = (n: LevelNote, level: number) => levels.set(noteKey(n.trackIndex, n.midi, n.time), level)
  const isLeft = (n: LevelNote) => (n.hand ? n.hand === 'L' : n.midi < MIDDLE_C)
  const left = notes.filter(isLeft)
  const right = notes.filter(n => !isLeft(n))
  // One hand's music is melody, whichever hand it is
  const melodyHand = right.length ? right : left
  const accompaniment = right.length ? left : []

  // The strong beats: each bar's first, and the one halfway through it
  const strong = barTimes.flatMap((t, i) => {
    const next = barTimes[i + 1]
    return next === undefined ? [t] : [t, (t + next) / 2]
  })

  const melodyBeat = new Set<number>()
  const barOf = (t: number) => {
    let lo = 0, hi = barTimes.length
    while (lo < hi) { const mid = (lo + hi) >> 1; if (barTimes[mid] <= t + ON_BEAT_SEC) lo = mid + 1; else hi = mid }
    return lo - 1
  }
  const firstInBar = new Map<number, LevelNote>()
  for (const group of onsets(melodyHand)) {
    const [top, ...rest] = group.sort((a, b) => b.midi - a.midi)
    const onBeat = nearAny(beatTimes, top.time)
    put(top, onBeat ? 1 : 2)
    const bar = barOf(top.time)
    if (onBeat) melodyBeat.add(bar)
    if (!firstInBar.has(bar)) firstInBar.set(bar, top)
    rest.forEach((n, i) => put(n, i < 2 ? 4 : FULL_LEVEL))
  }
  // Level 1 never leaves a bar empty: an offbeat melody still gets its first note
  for (const [bar, n] of firstInBar) if (!melodyBeat.has(bar)) put(n, 1)

  for (const group of onsets(accompaniment)) {
    const [low, ...rest] = group.sort((a, b) => a.midi - b.midi)
    put(low, nearAny(strong, low.time) ? 3 : 4)
    rest.forEach((n, i) => put(n, i < 1 ? 4 : FULL_LEVEL))
  }
  return levels
}

// ── The current song's levels, from what's on the roll ───────────────────────
let _cache: { midi: unknown; sig: string; levels: Map<string, number> } | null = null

function currentLevels(): Map<string, number> {
  const { midi, tracks } = useStore.getState()
  const sig = tracks.map(t => (t.muted ? 'm' : t.solo ? 's' : '.') + (t.visible ? 'v' : 'h')).join('')
  if (_cache && _cache.midi === midi && _cache.sig === sig) return _cache.levels
  const hasSolo = tracks.some(t => t.solo)
  const notes: LevelNote[] = []
  for (const track of midi?.tracks ?? []) {
    const ts = tracks.find(t => t.index === track.index)
    if (track.isDrum || !ts || !isShown(ts, hasSolo)) continue
    for (const n of track.notes) notes.push({ midi: n.midi, time: n.time, hand: n.hand, trackIndex: track.index })
  }
  const levels = buildLevels(notes, midi?._barTimes ?? [], midi?._beatTimes ?? [])
  _cache = { midi, sig, levels }
  return levels
}

export function inPracticeLevel(trackIndex: number, midi: number, time: number): boolean {
  const { practiceLevel } = useStore.getState()
  if (practiceLevel >= FULL_LEVEL) return true
  const level = practiceLevel === AUTO_LEVEL ? phraseLevelAt(time) : practiceLevel
  return (currentLevels().get(noteKey(trackIndex, midi, time)) ?? FULL_LEVEL) <= level
}
