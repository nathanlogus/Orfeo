// ── Drills: the prompts a lesson's Check asks, and what counts as an answer ──
import type { Check, Clef, Lesson, TouchStyle } from './course'

export type Prompt =
  | { kind: 'keys'; note: string; exact: boolean }
  | { kind: 'note'; name: string; clef: Clef; key?: string }
  | { kind: 'chord'; notes: string[]; clef: Clef; name?: string }
  | { kind: 'shape'; names: string[]; clef: Clef }
  | { kind: 'choice'; columns: string[][]; clef: Clef; question: string; options: string[]; answer: string }
  | { kind: 'scan'; tex: string; question: string; options: string[]; answer: string }
  | { kind: 'tap'; beats: number; tokens: string[]; fade: boolean }
  | { kind: 'touch'; style: TouchStyle; notes: string[]; clef: Clef }
  | { kind: 'quiz'; question: string; hear?: string[][]; options: string[]; answer: string }

const LETTERS = 'CDEFGAB'
const SEMITONES = [0, 2, 4, 5, 7, 9, 11]
// How far a Drill reaches back, and how often a recent miss comes up again
export const EARLIER_SHARE = 0.3
export const MISSED_SHARE = 0.4
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
  if (check.kind === 'shapes' || check.kind === 'touch') return 8
  if (check.kind === 'quiz') return check.questions.length
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

const INTERVAL_NAMES: Record<number, string> = { 2: 'Step', 3: 'Skip', 4: 'Fourth', 5: 'Fifth', 6: 'Sixth', 7: 'Seventh', 8: 'Octave' }

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
    case 'pairs': return { kind: 'chord', clef: 'grand', notes: [pick(check.left, rng), pick(check.right, rng)] }
    case 'chords': return { kind: 'chord', clef: check.clef, ...check.chords[index % check.chords.length] }
    case 'shapes': return { kind: 'shape', clef: check.clef, names: Array.from({ length: SHAPE_LENGTH }, () => pick(check.notes, rng)) }
    case 'intervals': return intervalPrompt(check, rng)
    case 'chunks': return chunkPrompt(rng)
    case 'scan': return scanPrompt(exercises, index, rng)
    case 'tap': return { kind: 'tap', beats: check.beats, fade: check.fade, tokens: check.patterns[index % check.patterns.length] }
    case 'touch': return { kind: 'touch', clef: check.clef, notes: check.notes, style: check.styles[index % check.styles.length] }
    case 'quiz': {
      const { text, hear, answer, wrong } = check.questions[index]
      const options = [...wrong]
      options.splice(Math.floor(rng() * (wrong.length + 1)), 0, answer)
      return { kind: 'quiz', question: text, hear, options, answer }
    }
  }
}

// What one key press means for a chord prompt. Named chords go by note name, so
// any octave or inversion counts; a chord on the staff wants the keys it shows.
export function chordPress(prompt: Extract<Prompt, { kind: 'chord' }>, key: number, held: Set<number>): 'wrong' | 'more' | 'done' {
  const want = prompt.notes.map(midiOf)
  const same = (a: number, b: number) => (prompt.name ? a % 12 === b % 12 : a === b)
  if (!want.some(w => same(w, key))) return 'wrong'
  return want.every(w => [...held].some(k => same(w, k))) ? 'done' : 'more'
}

// ── Touch: how a phrase was played, from what the keyboard reports ───────────
// Each note in the order played. on and off are in milliseconds; pedal counts the
// sustain pedal's moves since the note before, either way, as some pedals send
// up for down.
export interface Struck { vel: number; on: number; off?: number; pedal: number }

// Margins are wide on purpose: keyboards differ, and a miss here should mean the
// touch really wasn't there
const CONTRAST = 12
const EVEN_VEL = 18
const EVEN_TIME = 0.4
const LEGATO_GAP_MS = 40
const STACCATO_HOLD = 0.7

const share = (flags: boolean[]) => (flags.length ? flags.filter(Boolean).length / flags.length : 1)
const median = (list: number[]) => [...list].sort((a, b) => a - b)[Math.floor(list.length / 2)]
const meanVel = (notes: Struck[]) => notes.reduce((sum, n) => sum + n.vel, 0) / notes.length

// Score out of 1, and whether the app could tell at all. Keyboards with one fixed
// touch and setups with no pedal can't be judged, so those pass on the notes alone.
// soft and loud compare with the phrase before, since keyboards differ in level.
export function touchScore(style: TouchStyle, notes: Struck[], before: Struck[] | null, pedalSeen: boolean): { value: number; seen: boolean } {
  const pairs = notes.slice(1).map((b, i) => [notes[i], b])
  if (style === 'soft' || style === 'loud') {
    if (!before?.length) return { value: 1, seen: true }
    if (new Set([...before, ...notes].map(n => n.vel)).size === 1) return { value: 1, seen: false }
    const rise = meanVel(notes) - meanVel(before)
    return { value: (style === 'loud' ? rise : -rise) >= CONTRAST ? 1 : 0, seen: true }
  }
  if (style === 'even') {
    const vel = median(notes.map(n => n.vel))
    const gaps = pairs.map(([a, b]) => b.on - a.on)
    const gap = median(gaps)
    return { value: Math.min(share(notes.map(n => Math.abs(n.vel - vel) <= EVEN_VEL)), share(gaps.map(g => Math.abs(g - gap) <= gap * EVEN_TIME))), seen: true }
  }
  if (style === 'legato') {
    return { value: share(pairs.map(([a, b], i) => {
      const after = notes[i + 2]
      return a.off === undefined ? !after : a.off >= b.on - LEGATO_GAP_MS && (!after || a.off <= after.on)
    })), seen: true }
  }
  if (style === 'staccato') return { value: share(pairs.map(([a, b]) => a.off !== undefined && a.off - a.on <= (b.on - a.on) * STACCATO_HOLD)), seen: true }
  if (!pedalSeen) return { value: 1, seen: false }
  // The first change only has to press it. Every one after lifts and presses.
  return { value: share(notes.slice(1).map((n, i) => n.pedal >= (i ? 2 : 1))), seen: true }
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
