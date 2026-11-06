// ── Licks to try over the jam: library lines, moved into the jam's key ───────
import { Note } from 'tonal'
import { RIFFS } from '../arcade/library/riffs'
import { scalePitchClasses, type JamStyle } from './band'

export interface LickNote { midi: number; at: number; beats: number }
export interface JamLick { id: string; name: string; concept: string; notes: LickNote[] }

const RIGHT_HAND = [60, 83] // above the left hand's split, within the screen's keyboard
const MIN_NOTES = 4
const MAX_NOTES = 16
const IN_SCALE = 0.75 // a line may leave the scale for a passing or blue note

// A single line of alphaTex; null for chords, or anything else it can't follow
export function lineOf(tex: string): LickNote[] | null {
  const line = tex.slice(tex.indexOf('\\clef')).split('\n').slice(1).join(' ')
  const notes: LickNote[] = []
  let at = 0, beats = 1
  for (const token of line.split(/\s+/).filter(Boolean)) {
    if (token === '|') continue
    const length = token.match(/^:(\d+)$/)
    if (length) { beats = 4 / Number(length[1]); continue }
    const beat = token.match(/^(r|[A-G][#b]?\d)(?:\.(\d+))?$/)
    if (!beat) return null
    if (beat[2]) beats = 4 / Number(beat[2])
    if (beat[1] !== 'r') notes.push({ midi: Note.midi(beat[1])!, at, beats })
    at += beats
  }
  return notes
}

function moved(notes: LickNote[], up: number): LickNote[] | null {
  const pitches = notes.map(n => n.midi + up)
  const octaves = Math.ceil((RIGHT_HAND[0] - Math.min(...pitches)) / 12)
  const shift = up + octaves * 12
  return Math.max(...pitches) + octaves * 12 > RIGHT_HAND[1] ? null : notes.map(n => ({ ...n, midi: n.midi + shift }))
}

export function licksFor(style: JamStyle, keyPc: number, count = 3): JamLick[] {
  const scale = scalePitchClasses(style, keyPc)
  const fits = RIFFS.filter(r => r.genre === style).flatMap(riff => {
    const line = lineOf(riff.tex)
    if (!line || line.length < MIN_NOTES || line.length > MAX_NOTES) return []
    const notes = moved(line, ((keyPc - Note.chroma(riff.key)! + 18) % 12) - 6)
    if (!notes) return []
    const share = notes.filter(n => scale.has(n.midi % 12)).length / notes.length
    return share < IN_SCALE ? [] : [{ riff, notes, share }]
  })
  fits.sort((a, b) => a.riff.difficulty - b.riff.difficulty || b.share - a.share || a.riff.id.localeCompare(b.riff.id))
  return fits.slice(0, count).map(({ riff, notes }) => ({ id: riff.id, name: riff.name, concept: riff.concept, notes }))
}
