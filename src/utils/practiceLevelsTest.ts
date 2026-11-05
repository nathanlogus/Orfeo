import { buildLevels, noteKey, type LevelNote } from './practiceLevels'

export function runPracticeLevelsTest(): number {
  let failures = 0
  const eq = (name: string, got: unknown, want: unknown) => {
    const a = JSON.stringify(got), b = JSON.stringify(want)
    if (a !== b) { console.error(`FAIL ${name}: got ${a}, want ${b}`); failures++ }
  }
  const n = (midi: number, time: number, hand?: 'L' | 'R'): LevelNote => ({ midi, time, hand, trackIndex: 0 })
  const bars = [0, 2, 4], beats = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]
  const level = (m: Map<string, number>, note: LevelNote) => m.get(noteKey(note.trackIndex, note.midi, note.time))

  // A bar of both hands
  const onBeat = n(76, 0, 'R'), offBeat = n(74, 0.25, 'R')
  const inner1 = n(72, 0, 'R'), inner2 = n(67, 0, 'R'), inner3 = n(64, 0, 'R')
  const bass = n(36, 0, 'L'), lhInner = n(48, 0, 'L'), lhExtra = n(52, 0, 'L'), lhOff = n(43, 0.5, 'L')
  const m = buildLevels([onBeat, offBeat, inner1, inner2, inner3, bass, lhInner, lhExtra, lhOff], bars, beats)
  eq('melody on the beat', level(m, onBeat), 1)
  eq('melody off the beat', level(m, offBeat), 2)
  eq('bass on a strong beat', level(m, bass), 3)
  eq('bass on a weak beat', level(m, lhOff), 4)
  eq('right hand keeps three notes', [level(m, inner1), level(m, inner2), level(m, inner3)], [4, 4, 5])
  eq('left hand keeps two notes', [level(m, lhInner), level(m, lhExtra)], [4, 5])

  // Every note gets a level, and each level includes the one below
  eq('every note has a level', m.size, 9)
  const count = (l: number) => [...m.values()].filter(v => v <= l).length
  eq('levels only ever add notes', [1, 2, 3, 4, 5].map(count), [1, 2, 3, 7, 9])

  // An offbeat melody still leaves level 1 something to play in each bar
  const sync1 = n(72, 0.25, 'R'), sync2 = n(74, 0.75, 'R')
  const syncopated = buildLevels([sync1, sync2], bars, beats)
  eq('first note of an offbeat bar', [level(syncopated, sync1), level(syncopated, sync2)], [1, 2])

  // Without hand data the split falls at middle C
  const hi = n(72, 0), lo = n(40, 0)
  const noHands = buildLevels([hi, lo], bars, beats)
  eq('split at middle C', [level(noHands, hi), level(noHands, lo)], [1, 3])

  // Music low enough for the left hand alone is still melody
  const alone = n(50, 0, 'L')
  eq('one hand is the melody', level(buildLevels([alone], bars, beats), alone), 1)

  // Grace-spaced notes count as one chord, and an empty song is fine
  const a = n(72, 0, 'R'), b = n(76, 0.02, 'R')
  const rolled = buildLevels([a, b], bars, beats)
  eq('rolled chord keeps its top note', [level(rolled, b), level(rolled, a)], [1, 4])
  eq('no notes', buildLevels([], [], []).size, 0)
  return failures
}
