import type { Unit } from './course'
import { afterPass, afterRun, isOpen, nextLesson, playScore, tapMarks, tapScore } from './progress'
import { earlierNotes, midiOf, missedNote, noteOfKey, staffStep, tapBeats } from './drill'

const lesson = (id: string) => ({ id, title: id, goal: 'g' })
const UNITS: Unit[] = [
  { n: 1, title: 'a', lessons: [lesson('1.1'), lesson('1.2'), lesson('1.3')] },
  { n: 2, title: 'b', lessons: [lesson('2.1'), lesson('2.2')] },
]

export function runProgressTest(): number {
  let failures = 0
  const eq = (name: string, got: unknown, want: unknown) => {
    const a = JSON.stringify(got), b = JSON.stringify(want)
    if (a !== b) { console.error(`FAIL ${name}: got ${a}, want ${b}`); failures++ }
  }

  eq('on time', tapMarks([1, 2], [1.1, 1.9], 0.16), ['on-time', 'on-time'])
  eq('close, either way', tapMarks([1, 2], [0.75, 2.3], 0.16), ['early', 'late'])
  eq('too far is a miss, and an extra tap', tapMarks([1], [2], 0.16), ['missed', 'extra'])
  eq('a late tap leaves the next beat its own', tapMarks([1, 1.4], [1.3], 0.16), ['missed', 'on-time'])
  eq('not due yet', tapMarks([1, 2], [1], 0.16, 1.2), ['on-time', null])
  eq('due and gone', tapMarks([1, 2], [1], 0.16, 2.5), ['on-time', 'missed'])
  eq('only on-time taps score', tapScore([1, 2], [1, 2.3], 0.16), 0.5)
  eq('extra taps cost', tapScore([1, 2], [1, 2, 3, 4], 0.16), 0.5)
  eq('a clean run counts', afterRun([], 92, true), [92])
  eq('two clean runs', afterRun([92], 95, true), [92, 95])
  eq('the last two', afterRun([92, 95], 97, true), [95, 97])
  eq('a miss starts over', afterRun([92], 70, false), [])

  eq('the key as a note', [noteOfKey(60), noteOfKey(61), noteOfKey(71)], ['C4', 'C#4', 'B4'])
  eq('one step lower', missedNote('E4', 65), { played: 'F', want: 'E', amount: 'steps', count: 1, lower: true })
  eq('two steps higher', missedNote('E4', 60), { played: 'C', want: 'E', amount: 'steps', count: 2, lower: false })
  eq('sharp of the same letter', missedNote('F4', 66), { played: 'F♯', want: 'F', amount: 'half', count: 1, lower: true })
  eq('the right note, an octave off', missedNote('C4', 72), { played: 'C', want: 'C', amount: 'octaves', count: 1, lower: true })
  eq('a flat stays a flat', missedNote('Bb4', 69).want, 'B♭')

  eq('first lesson open', isOpen(UNITS, [], '1.1'), true)
  eq('second waits for the first', isOpen(UNITS, [], '1.2'), false)
  eq('second opens after the first', isOpen(UNITS, ['1.1'], '1.2'), true)
  eq('last lesson of a unit is the way to skip it', isOpen(UNITS, [], '1.3'), true)
  eq('next unit waits', isOpen(UNITS, ['1.1', '1.2'], '2.1'), false)
  eq('skip passes the whole unit', afterPass(UNITS, [], '1.3'), ['1.1', '1.2', '1.3'])
  eq('and opens the next', isOpen(UNITS, afterPass(UNITS, [], '1.3'), '2.1'), true)
  eq('a pass is kept once', afterPass(UNITS, ['1.1'], '1.1'), ['1.1'])
  eq('next is the first not passed', nextLesson(UNITS, ['1.1'])?.id, '1.2')
  eq('nothing left', nextLesson(UNITS, ['1.1', '1.2', '1.3', '2.1', '2.2']), null)

  const steps = [{ time: 1, notes: [{ midi: 60 }] }, { time: 2, notes: [{ midi: 62 }] }]
  eq('clean play', playScore(steps, [{ midi: 60, time: 1 }, { midi: 62, time: 2 }], 0.25), 1)
  eq('nothing played', playScore(steps, [], 0.25), 0)
  const mashing = [60, 61, 62, 63].flatMap(midi => [{ midi, time: 1 }, { midi, time: 2 }])
  eq('every key at once is not a pass', playScore(steps, mashing, 0.25) < 0.9, true)
  eq('no steps', playScore([], [{ midi: 60, time: 1 }], 0.25), 0)

  eq('taps on time', tapScore([0, 1, 2], [0.05, 0.95, 2], 0.15), 1)
  eq('one tap can\'t answer two beats', tapScore([0, 0.1], [0.05], 0.15), 0.5)
  eq('extra taps cost', tapScore([0, 1], [0, 0.5, 1, 1.5], 0.15), 0.5)

  eq('rests are not tapped', tapBeats(['q', 'qr', 'q', 'qr']), { onsets: [0, 2], length: 4 })
  eq('dotted', tapBeats(['dq', 'e', 'h']), { onsets: [0, 1.5, 2], length: 4 })
  eq('ties are struck once', tapBeats(['h~q', 'q']), { onsets: [0, 3], length: 4 })

  eq('notes', [midiOf('C4'), midiOf('F#4'), midiOf('Bb4'), midiOf('C2')], [60, 66, 70, 36])
  eq('staff steps ignore accidentals', staffStep('C#4') - staffStep('C4'), 0)

  const a = { ...lesson('a'), check: { kind: 'notes' as const, clef: 'treble' as const, notes: ['C4'] } }
  const b = { ...lesson('b'), check: { kind: 'notes' as const, clef: 'bass' as const, notes: ['C3'] } }
  const c = { ...lesson('c'), check: { kind: 'notes' as const, clef: 'treble' as const, notes: ['D4'] } }
  eq('earlier notes keep to the staff', earlierNotes([a, b, c], c), ['C4'])
  return failures
}
