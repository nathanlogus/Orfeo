// ── Drills: the prompts a lesson's Check asks, and what counts as an answer ──
import type { Check, Clef, Lesson } from './course'

export type Prompt =
  | { kind: 'keys'; note: string; exact: boolean }
  | { kind: 'note'; name: string; clef: Clef; key?: string }
  | { kind: 'pair'; left: string; right: string }
  | { kind: 'shape'; names: string[]; clef: Clef }
  | { kind: 'choice'; columns: string[][]; clef: Clef; question: string; options: string[]; answer: string }
  | { kind: 'scan'; tex: string; question: string; options: string[]; answer: string }
  | { kind: 'tap'; beats: number; tokens: string[]; fade: boolean }

const LETTERS = 'CDEFGAB'
const SEMITONES = [0, 2, 4, 5, 7, 9, 11]
// How far a Drill reaches back, and how often a recent miss comes up again
const EARLIER_SHARE = 0.3
const MISSED_SHARE = 0.4
const SHAPE_LENGTH = 4

const ACCIDENTAL: Record<string, number> = { '#': 1, b: -1, '': 0 }

export function noteParts(name: string) {
  const m = name.match(/^([A-G])([#b]?)(\d)$/)
  if (!m) throw new Error(`Not a note: ${name}`)
  return { letter: m[1], accidental: m[2], octave: Number(m[3]) }
}

export function midiOf(name: string): number {
  const { letter, accidental, octave } = noteParts(name)
  return (octave + 1) * 12 + SEMITONES[LETTERS.indexOf(letter)] + ACCIDENTAL[accidental]
}

// White keys from C0 up, so a distance between notes is a count of staff steps
export function staffStep(name: string): number {
  const { letter, octave } = noteParts(name)
  return octave * 7 + LETTERS.indexOf(letter)
}

export const noteLabel = (name: string) => {
  const { letter, accidental } = noteParts(name)
  return letter + accidental.replace('#', '♯').replace('b', '♭')
}

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
export const noteOfKey = (key: number) => `${SHARP_NAMES[key % 12]}${Math.floor(key / 12) - 1}`

// A wrong key against the note that was asked for, in staff steps: "one step lower"
export function missedNote(want: string, key: number) {
  const played = noteOfKey(key)
  const semitones = midiOf(want) - key
  const steps = staffStep(want) - staffStep(played)
  const octave = semitones % 12 === 0
  return {
    played: noteLabel(played), want: noteLabel(want),
    amount: octave ? 'octaves' as const : steps ? 'steps' as const : 'half' as const,
    count: octave ? Math.abs(semitones) / 12 : Math.abs(steps) || 1,
    lower: semitones < 0,
  }
}

const pick = <T,>(list: T[], rng: () => number): T => list[Math.floor(rng() * list.length)]

export function promptCount(check: Check): number {
  if (check.kind === 'tap') return 5
  if (check.kind === 'scan') return 6
  if (check.kind === 'shapes') return 8
  return check.kind === 'notes' ? 20 : 12
}

// Notes from earlier lessons that can share this one's drill: same staff, same key
export function earlierNotes(lessons: Lesson[], lesson: Lesson): string[] {
  const check = lesson.check
  if (check?.kind !== 'notes') return []
  const before = lessons.slice(0, lessons.findIndex(l => l.id === lesson.id))
  const notes = before.flatMap(l => (l.check?.kind === 'notes' && l.check.clef === check.clef && l.check.key === check.key ? l.check.notes : []))
  return [...new Set(notes)].filter(n => !check.notes.includes(n))
}

const INTERVAL_NAMES: Record<number, string> = { 2: 'Step', 3: 'Skip', 4: 'Fourth', 5: 'Fifth' }

function intervalPrompt(check: Extract<Check, { kind: 'intervals' }>, rng: () => number): Prompt {
  const moves = check.notes.flatMap(a => check.notes.filter(b => check.sizes.includes(Math.abs(staffStep(a) - staffStep(b)) + 1)).map(b => [a, b]))
  const [a, b] = pick(moves, rng)
  const name = (size: number, up: boolean) => `${INTERVAL_NAMES[size]} ${up ? 'up' : 'down'}`
  return {
    kind: 'choice', clef: check.clef, columns: [[a], [b]], question: 'What move is this?',
    options: check.sizes.flatMap(size => [name(size, true), name(size, false)]),
    answer: name(Math.abs(staffStep(a) - staffStep(b)) + 1, staffStep(b) > staffStep(a)),
  }
}

const WHITE = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5', 'D5', 'E5', 'F5', 'G5']

function chunkPrompt(rng: () => number): Prompt {
  const at = Math.floor(rng() * (WHITE.length - 5))
  const answer = pick(['Scale', 'Chord', 'Broken chord'], rng)
  const triad = [WHITE[at], WHITE[at + 2], WHITE[at + 4]]
  const columns = answer === 'Scale' ? WHITE.slice(at, at + 5).map(n => [n]) : answer === 'Chord' ? [triad] : triad.map(n => [n])
  return { kind: 'choice', clef: 'treble', columns, question: 'What shape is this?', options: ['Scale', 'Chord', 'Broken chord'], answer }
}

const SIGNATURES: Record<string, string> = { G: 'One sharp', D: 'Two sharps', F: 'One flat', Bb: 'Two flats' }
const NO_SIGNATURE = 'No sharps or flats'

function scanPrompt(exercises: string[], index: number, rng: () => number): Prompt {
  // Titles like "Ode to Joy in D" would give the answer away
  const tex = pick(exercises, rng).replace(/\\title "[^"]*"/, '')
  if (index % 2) {
    const beats = tex.match(/\\ts \((\d)/)?.[1] ?? '4'
    return { kind: 'scan', tex, question: 'How many beats fill a bar?', options: ['3', '4'], answer: beats }
  }
  const key = tex.match(/\\ks (\w+)/)?.[1] ?? ''
  return { kind: 'scan', tex, question: 'How many sharps or flats?', options: [NO_SIGNATURE, ...Object.values(SIGNATURES)], answer: SIGNATURES[key] ?? NO_SIGNATURE }
}

export interface DrillContext { index: number; earlier: string[]; missed: string[]; exercises: string[]; rng: () => number }

export function nextPrompt(check: Check, { index, earlier, missed, exercises, rng }: DrillContext): Prompt {
  switch (check.kind) {
    case 'keys': {
      const exact = index % 3 === 2
      return { kind: 'keys', note: check.note, exact }
    }
    case 'notes': {
      const roll = rng()
      const fromMissed = missed.length && roll < MISSED_SHARE
      const fromEarlier = earlier.length && roll >= 1 - EARLIER_SHARE
      const name = pick(fromMissed ? missed : fromEarlier ? earlier : check.notes, rng)
      return { kind: 'note', name, clef: check.clef, key: check.key }
    }
    case 'pairs': return { kind: 'pair', left: pick(check.left, rng), right: pick(check.right, rng) }
    case 'shapes': return { kind: 'shape', clef: check.clef, names: Array.from({ length: SHAPE_LENGTH }, () => pick(check.notes, rng)) }
    case 'intervals': return intervalPrompt(check, rng)
    case 'chunks': return chunkPrompt(rng)
    case 'scan': return scanPrompt(exercises, index, rng)
    case 'tap': return { kind: 'tap', beats: check.beats, fade: check.fade, tokens: check.patterns[index % check.patterns.length] }
  }
}

// ── Rhythm tokens: q h w e, d for dotted, r for a rest, ~ ties into the next ──
const LENGTHS: Record<string, number> = { e: 0.5, q: 1, h: 2, w: 4 }

export function tokenBeats(token: string): number {
  const dotted = token.startsWith('d')
  const base = LENGTHS[token.replace(/^d/, '')[0]]
  return base * (dotted ? 1.5 : 1)
}

const isRest = (token: string) => token.endsWith('r')

// The beats a pattern is tapped on, and its length. A tied note isn't struck again.
export function tapBeats(tokens: string[]): { onsets: number[]; length: number } {
  const onsets: number[] = []
  let at = 0
  for (const token of tokens) {
    token.split('~').forEach((part, i) => {
      if (i === 0 && !isRest(part)) onsets.push(at)
      at += tokenBeats(part)
    })
  }
  return { onsets, length: at }
}
