// ── What the whales sing: library scales, riffs and progressions, never random ─
import { Interval, Note, Scale } from 'tonal'
import { t } from '../../utils/i18n'
import { lineOf, type LickNote } from '../../jam/licks'
import { LIBRARY, progression } from '../library'
import { chordsOf, type Target } from '../library/chords'
import type { Riff, ScaleItem } from '../library/types'
import { BOSS_PARTS, lengthAt, type Stage } from './stages'

export interface Step {
  keys: number[]          // the note, or the voicing a chord is sung in
  at: number              // beats from the start
  beats: number
  chord?: Target          // sung as a chord: any way up counts
}

export interface Phrase { id: string; name: string; steps: Step[]; beatMs: number }

const MIDDLE_C = 60
const OCTAVE = 12
const BAR = 4
// The whales never hurry, whatever tempo the riff was written at
const SLOWEST_BEAT_MS = 60000 / 88
const LEAP = 5

const INTERVALS = () => [t`Unison`, t`Minor second`, t`Major second`, t`Minor third`, t`Major third`, t`Perfect fourth`, t`Tritone`, t`Perfect fifth`, t`Minor sixth`, t`Major sixth`, t`Minor seventh`, t`Major seventh`, t`Octave`]

const even = (keys: number[]): Step[] => keys.map((k, i) => ({ keys: [k], at: i, beats: 1 }))
const shiftTo = (key: string, from: string) => ((Note.chroma(key)! - Note.chroma(from)! + 18) % OCTAVE) - 6

function degrees(key: string, item: ScaleItem): number[] {
  const tonic = MIDDLE_C + Note.chroma(key)!
  return Scale.get(`C ${item.tonal}`).intervals.map(i => tonic + Interval.semitones(i)!)
}

const scaleItem = (id: string) => LIBRARY.find((i): i is ScaleItem => i.id === id && i.kind === 'scale')
const riffItem = (id: string) => LIBRARY.find((i): i is Riff => i.id === id && i.kind === 'riff')

// Two notes from one scale, off the tonic: up first, then the same one coming down
function intervalsOf(stage: Stage, key: string): Phrase[] {
  const seen = new Map<number, Phrase[]>()
  for (const item of stage.items.map(scaleItem)) {
    const steps = degrees(key, item!)
    const [tonic] = steps
    for (const top of [...steps.slice(1), tonic + OCTAVE]) {
      const size = top - tonic
      if (seen.has(size)) continue
      seen.set(size, [[tonic, top], [top, tonic]].map(keys => ({ id: `interval-${size}`, name: INTERVALS()[size], steps: even(keys), beatMs: stage.beatMs })))
    }
  }
  // Wide and plain first: a fifth is the friendliest opening
  return [...seen.keys()].sort((a, b) => Math.abs(a - 7) - Math.abs(b - 7)).flatMap(size => seen.get(size)!)
}

// Up and down a scale, n notes long
function fragmentsOf(id: string, key: string, n: number, beatMs: number): Phrase[] {
  const item = scaleItem(id)!
  const one = degrees(key, item)
  const ladder = [...one, ...one.map(k => k + OCTAVE)].slice(0, n)
  return [ladder, [...ladder].reverse()].map(keys => ({ id, name: item.name, steps: even(keys), beatMs }))
}

const leaps = (notes: LickNote[]) => notes.some((n, i) => i > 0 && Math.abs(n.midi - notes[i - 1].midi) >= LEAP)
const rhythmic = (notes: LickNote[]) => new Set(notes.map(n => n.beats)).size > 1

// A riff's own notes from each barline, n long, moved into the key
function windowsOf(id: string, key: string, n: number, stage: Stage): Phrase[] {
  const riff = riffItem(id)!
  const line = lineOf(riff.tex)!
  const up = shiftTo(key, riff.key)
  const tempo = Number(riff.tex.match(/\\tempo (\d+)/)![1])
  const starts = line.flatMap((note, i) => (i === 0 || Math.floor(note.at / BAR) !== Math.floor(line[i - 1].at / BAR) ? [i] : []))
  return starts.flatMap(start => {
    const notes = line.slice(start, start + n)
    if (notes.length < n) return []
    if (stage.rhythm && !(leaps(notes) && rhythmic(notes))) return []
    const steps = stage.rhythm
      ? notes.map(note => ({ keys: [note.midi + up], at: note.at - notes[0].at, beats: note.beats }))
      : even(notes.map(note => note.midi + up))
    return [{ id, name: riff.name, steps, beatMs: stage.rhythm ? Math.max(SLOWEST_BEAT_MS, 60000 / tempo) : stage.beatMs }]
  })
}

function chordsIn(stage: Stage, key: string, n: number): Phrase[] {
  return stage.items.map(id => {
    const item = progression(id)
    const chords = chordsOf(item, key)
    return {
      id: `${id}-${key}`, name: `${item.name}, ${key}`, beatMs: stage.beatMs,
      steps: Array.from({ length: n }, (_, i) => ({ keys: chords[i % chords.length].keys, at: i, beats: 1, chord: chords[i % chords.length] })),
    }
  })
}

// The ancient whale's whole phrase, cut at its barlines; a short last bar stays with the one before
export function bossParts(stage: Stage): Phrase[] {
  const riff = riffItem(stage.items[0])!
  const line = lineOf(riff.tex)!
  const bars = Array.from({ length: BOSS_PARTS }, (_, i) => line.filter(n => (i === BOSS_PARTS - 1 ? Math.floor(n.at / BAR) >= i : Math.floor(n.at / BAR) === i)))
  const beatMs = Math.max(SLOWEST_BEAT_MS, 60000 / Number(riff.tex.match(/\\tempo (\d+)/)![1]))
  return bars.map((notes, i) => ({
    id: `${riff.id}-${i + 1}`, name: t`Part ${i + 1}`, beatMs,
    steps: notes.map(n => ({ keys: [n.midi], at: n.at - notes[0].at, beats: n.beats })),
  }))
}

// Everything this stage could sing next, at this point in a run. The first opens every run.
export function poolAt(stage: Stage, played: number, key: string): Phrase[] {
  const n = lengthAt(stage, played)
  if (stage.id === 'intervals') return intervalsOf(stage, key)
  if (stage.id === 'endless') return chordsIn(stage, key, n)
  if (stage.id === 'boss') return bossParts(stage)
  return stage.items.flatMap(id => (id.startsWith('sc-') ? fragmentsOf(id, key, n, stage.beatMs) : windowsOf(id, key, n, stage)))
}
