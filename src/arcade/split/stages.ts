// ── Kite Festival: the stages, the music each hand plays, and the one dial ────
import { t } from '../../utils/i18n'
import type { MeetIt, StageDef } from '../games'
import { LIBRARY } from '../library'

// Middle C: keys below it fly the blue kite, the rest fly the pink one
export const SPLIT = 60
export type Hand = 'left' | 'right'
export const HANDS: Hand[] = ['left', 'right']

export type StageId = 'same' | 'different' | 'leaps' | 'boss' | 'endless'

export interface Note { key: number; beat: number; beats: number }
export interface Line { feel: string; notes: Note[] }   // feel: "Boogie bass", shown on the lane
export interface Piece { id: string; name: string; beats: number; left: Line; right: Line }

export interface Stage extends StageDef {
  id: StageId
  pieces: Piece[]         // played in this order, round and round
  phrases: number         // pieces to get through; Infinity: Endless
  swap?: boolean          // every other phrase, each hand takes the other's part
  dial: { start: number; step: number; floor: number }   // note speed: ms per beat, by phrase
}

const PITCH: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
const keyOf = (name: string) => {
  const [, letter, accidental, octave] = /^([A-G])([b#]?)(\d)$/.exec(name)!
  return (Number(octave) + 1) * 12 + PITCH[letter] + (accidental === 'b' ? -1 : accidental === '#' ? 1 : 0)
}

// One line of the library's notation: ":4 E4 D4 G4.2 | r.2". A duration sticks until
// the next one. Only here, ":6" is a quarter-note triplet, three in the time of two.
export function parseLine(line: string): Note[] {
  const notes: Note[] = []
  let beat = 0
  let length = 4
  for (const [, set, name, inline] of line.matchAll(/:(\d+)|(r|[A-G][b#]?\d)(?:\.(\d+))?/g)) {
    if (set) { length = Number(set); continue }
    if (inline) length = Number(inline)
    const beats = 4 / length
    if (name !== 'r') notes.push({ key: keyOf(name), beat: Math.round(beat * 1000) / 1000, beats })
    beat += beats
  }
  return notes
}

const lastBeat = (notes: Note[]) => Math.round(Math.max(...notes.map(n => n.beat + n.beats)))

const piece = (id: string, name: string, leftFeel: string, left: string, rightFeel: string, right: string): Piece => {
  const [l, r] = [parseLine(left), parseLine(right)]
  return { id, name, beats: lastBeat(r), left: { feel: leftFeel, notes: l }, right: { feel: rightFeel, notes: r } }
}

// A tune from the library, as written there
const tune = (id: string) => {
  const item = LIBRARY.find(i => i.id === id)
  if (item?.kind !== 'riff') throw new Error(`Not a riff: ${id}`)
  return item.tex.split('\n').at(-1)!
}

const QUARTERS = t`Quarter notes`
const HALVES = t`Half notes`
const EIGHTHS = t`Eighth notes`
const SAME = t`In step`

// ── The music. Left hands written for Pliage, under library tunes and originals ──
const HOOK = piece('hook', t`Five-finger hook`, SAME, ':4 C3 G3 A3 G3 | C3 C3 E3.2 | :4 F3 G3 G3 A3 | G3.1', SAME, tune('or-pop-steps'))
const SKIP = piece('skip', t`Pentatonic skip`, SAME, ':4 C3 G3 C3 E3 | F3 C3 C3.2 | :4 G3 C3 E3 C3 | C3.1', SAME, tune('or-pop-penta'))
const SWAY = piece('sway', t`Easy sway`, SAME, ':4 C3 E3 F3 E3 | A3.2 F3.2', SAME, tune('or-sl-sway'))

const STRING = piece('string', t`Kite string`, HALVES, ':2 C3 G3 | C3 G3 | F3 C3 | G3 C3', QUARTERS, ':4 E4 F4 G4 E4 | D4 C4 D4 E4 | F4 G4 A4 F4 | E4 D4 C4.2')
const ALBERTI = piece('alberti', t`Alberti hook`, t`Alberti`, ':8 C3 G3 E3 G3 C3 G3 E3 G3 | C3 G3 E3 G3 C3 G3 E3 G3 | C3 A3 F3 A3 D3 G3 B3 G3 | D3 G3 B3 G3 D3 G3 B3 G3', t`Quarters and longer`, tune('or-pop-steps'))
const FALLING = piece('falling', t`Falling line`, t`Alberti`, ':8 C3 G3 E3 G3 D3 G3 B3 G3 | C3 A3 F3 A3 C3 G3 E3 G3', t`Halves, then quarters`, tune('or-bd-fall'))
const BOOGIE = piece('boogie', t`Harbour boogie`, t`Boogie bass`, ':8 C3 E3 G3 A3 Bb3 A3 G3 E3 | C3 E3 G3 A3 Bb3 A3 G3 E3 | C3 F3 A3 Bb3 A3 F3 C3 F3 | C3 E3 G3 A3 Bb3 A3 G3 E3', HALVES, ':2 G4 Bb4 | A4 G4 | A4 F4 | G4.1')

const HARBOUR = piece('harbour', t`Over the harbour`, t`Leaping halves`, ':2 C3 G3 | D3 B3 | C3 A3 | D3 B3', t`Leaping quarters`, ':4 C4 C5 G4 E5 | D4 B4 G4 D5 | C4 A4 F4 C5 | G4 D5 B4.2')
const GULLS = piece('gulls', t`Gull's swoop`, t`Wide quarters`, ':4 C3 G3 E3 G3 | D3 B3 G3 B3 | C3 A3 E3 A3 | E3 B3 G3 B3', t`Octave leaps`, ':2 E4 E5 | D4 D5 | C4 C5 | G4 G5')
const THIRDS = piece('thirds', t`Lifting thirds`, t`Wide quarters`, ':4 C3 G3 C3 G3 | F3 C3 A3.2 | :4 D3 B3 D3 B3 | C3.1', SAME, tune('or-pop-thirds'))

const THREE_TWO = t`Three against two`
const FRONT = piece('front', t`Storm front`, QUARTERS, ':4 C3 G3 C3 G3 | D3 G3 D3 G3 | C3 A3 C3 A3 | D3 G3 C3.2', THREE_TWO, ':6 E4 G4 C5 E4 G4 C5 | D4 G4 B4 D4 G4 B4 | C4 F4 A4 C4 F4 A4 | D4 G4 B4 C5.2')
const SURGE = piece('surge', t`Storm surge`, QUARTERS, ':4 A3 E3 A3 E3 | G3 D3 G3 D3 | F3 C3 F3 C3 | E3 B3 E3 B3', THREE_TWO, ':6 A4 C5 E5 A4 C5 E5 | G4 B4 D5 G4 B4 D5 | F4 A4 C5 F4 A4 C5 | E4 G4 B4 E4 G4 B4')

// Meet it shows a piece's first bar: each hand's notes, then both together, step by step
function meet(text: string, hear: string, shown: Piece, prompt: string): MeetIt {
  const bar = (line: Line) => line.notes.filter(n => n.beat < 4)
  const stack = (line: Line, label: string) => ({ label, keys: [...new Set(bar(line).map(n => n.key))].sort((a, b) => a - b), root: line.notes[0].key % 12 })
  const both = [...bar(shown.left), ...bar(shown.right)]
  const first = [shown.left.notes[0].key, shown.right.notes[0].key]
  return {
    text, hear,
    cards: [stack(shown.left, t`Left hand`), stack(shown.right, t`Right hand`)],
    hearSteps: [...new Set(both.map(n => n.beat))].sort((a, b) => a - b).map(beat => both.filter(n => n.beat === beat).map(n => n.key)),
    tryIt: { prompt, keys: first, fits: held => first.every(k => held.includes(k)) },
  }
}

const TRY_BOTH = t`Try one now: play both lit keys together`

export const STAGES: Stage[] = [
  {
    id: 'same', kind: 'stage', name: t`Same rhythm`, sub: t`Both hands move together`, concept: 'same-rhythm', conceptName: t`Hands in step`,
    meet: meet(t`Your left hand flies the blue kite, your right the pink one. Everything below middle C is left, everything from it up is right. Here both hands strike together.`, t`Hear them together`, HOOK, TRY_BOTH),
    pieces: [HOOK, SKIP, SWAY], phrases: 4, dial: { start: 820, step: 30, floor: 700 },
  },
  {
    id: 'different', kind: 'stage', name: t`Different rhythms`, sub: t`Half notes, Alberti and boogie under a tune`, concept: 'different-rhythms', conceptName: t`Different rhythms`,
    meet: meet(t`One hand holds a slow pattern while the other moves on top. Follow each lane on its own: the left hand keeps the pattern, the right hand sings.`, t`Hear both parts`, STRING, TRY_BOTH),
    pieces: [STRING, ALBERTI, BOOGIE, FALLING], phrases: 5, dial: { start: 780, step: 25, floor: 660 },
  },
  {
    id: 'leaps', kind: 'stage', name: t`Wider leaps`, sub: t`Fifths, sixths and octaves in both hands`, concept: 'leaps', conceptName: t`Wider leaps`,
    meet: meet(t`Now the hands jump. Look ahead on the lane and move before the note arrives, so your fingers are there early. A leap is only late if you start it late.`, t`Hear the leaps`, GULLS, TRY_BOTH),
    pieces: [HARBOUR, GULLS, THIRDS], phrases: 5, dial: { start: 760, step: 25, floor: 640 },
  },
  {
    id: 'boss', kind: 'boss', name: t`Boss`, sub: t`A storm front blows in: three notes against two`, concept: 'three-against-two', conceptName: t`Three against two`,
    meet: meet(t`The storm plays three against two. Your right hand fits three even notes into the time your left hand plays two. They land together on the first note, then pull apart.`, t`Hear three against two`, FRONT, TRY_BOTH),
    pieces: [FRONT, SURGE], phrases: 3, dial: { start: 900, step: 40, floor: 800 },
  },
  {
    id: 'endless', kind: 'endless', name: t`Endless`, sub: t`The patterns swap hands, and the wind keeps rising`, concept: 'mixed', conceptName: t`Everything so far`,
    meet: meet(t`Every other phrase the hands trade parts: the left takes the tune and the right takes the bass. Keep reading the lanes and let the hands trade with them.`, t`Hear the pattern`, STRING, TRY_BOTH),
    pieces: [HOOK, STRING, SKIP, BOOGIE, ALBERTI], phrases: Infinity, swap: true, dial: { start: 760, step: 15, floor: 420 },
  },
]

export const stageById = (id: StageId) => STAGES.find(s => s.id === id)!

const ASSIST_SLOWDOWN = 1.5
export const assisted = (ms: number, assist: boolean) => ms * (assist ? ASSIST_SLOWDOWN : 1)

export function dialAt(stage: Stage, phrase: number, assist: boolean): number {
  const { start, step, floor } = stage.dial
  return assisted(Math.max(floor, start - step * phrase), assist)
}
