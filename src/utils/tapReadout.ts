import { fitTaps } from './tapTempoFit'

// What the Tap Tempo panel reads out while you tap: the tempo so far, and the
// file's own tempo to compare it with.

// The file's tempo at a moment of the song; 0 if it has no tempo map
export function fileBpmAt(tempoMap: { time: number; bpm: number }[], time: number): number {
  let bpm = tempoMap[0]?.bpm ?? 0
  for (const e of tempoMap) { if (e.time <= time + 1e-6) bpm = e.bpm; else break }
  return bpm
}

// null until the taps are enough to fit a steady beat. perBeats: tapping once a
// bar, so one gap is that many beats.
export function tappedBpm(taps: number[], perBeats = 1): number | null {
  const fit = fitTaps(taps, perBeats > 1 ? { minBpm: 20 / perBeats } : {})
  return fit ? (60 / fit.period) * perBeats : null
}
