// ── A numeral in a key becomes a chord to play ───────────────────────────────
import { Chord, Interval, Note } from 'tonal'
import type { ProgressionItem } from './types'

export interface Target {
  numeral: string
  name: string            // "G/B", in standard spelling; localizeChord() shows it
  pcs: number[]           // every pitch class it takes, in voicing order
  bass: number | null     // the pitch class that has to be lowest, for an inversion
  keys: number[]          // the voicing lit on the keyboard
}

const NUMERAL = /^(b|#)?(iii|ii|iv|vii|vi|v|i)(.*?)(?:\^(\d))?$/i
const DEGREES = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii']
const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11]
const MINOR_STEPS = [0, 2, 3, 5, 7, 8, 10]
// Lit voicings start between G3 and F#4: mid-keyboard, and always on the board
const LOWEST_KEY = 55
const OCTAVE = 12

// tonal's spelling of what a numeral writes after the degree
function quality(written: string, upper: boolean): string {
  if (written === '°') return 'dim'
  if (written === '°7') return 'dim7'
  if (written === 'ø7') return 'm7b5'
  if (written === '') return upper ? '' : 'm'
  if (written === '7') return upper ? '7' : 'm7'
  return written
}

const rise = (from: number, to: number) => { let key = to; while (key <= from) key += OCTAVE; return key }

export function chordOf(numeral: string, tonic: string, minor = false): Target {
  const m = numeral.match(NUMERAL)
  if (!m) throw new Error(`Not a numeral: ${numeral}`)
  const [, accidental, roman, written, inversion] = m
  const degree = DEGREES.indexOf(roman.toLowerCase())
  const steps = (minor ? MINOR_STEPS : MAJOR_STEPS)[degree] + (accidental === 'b' ? -1 : accidental === '#' ? 1 : 0)
  const root = Note.simplify(Note.transpose(tonic, Interval.fromSemitones(steps)))
  const symbol = root + quality(written, roman === roman.toUpperCase())
  const notes = Chord.get(symbol).notes
  if (!notes.length) throw new Error(`No such chord: ${symbol} from ${numeral}`)
  const turn = Number(inversion ?? 0)
  const stack = [...notes.slice(turn), ...notes.slice(0, turn)]
  const pcs = stack.map(n => Note.chroma(n) as number)
  const keys: number[] = [LOWEST_KEY + (pcs[0] - LOWEST_KEY % OCTAVE + OCTAVE) % OCTAVE]
  for (const pc of pcs.slice(1)) keys.push(rise(keys[keys.length - 1], pc + OCTAVE))
  return { numeral, name: turn ? `${symbol}/${Note.simplify(stack[0])}` : symbol, pcs, bass: turn ? pcs[0] : null, keys }
}

// minor items are stored on their relative major, so 'C' asks for A minor
export function tonicOf(item: ProgressionItem, key: string): string {
  return item.minor ? Note.simplify(Note.transpose(key, '-3m')) : key
}

export const chordsOf = (item: ProgressionItem, key = item.key): Target[] =>
  item.numerals.map(n => chordOf(n, tonicOf(item, key), item.minor))

// Exactly the chord's notes, in any octave and doubled at will
export function fits(target: Target, keys: number[]): boolean {
  if (!keys.length) return false
  const played = new Set(keys.map(k => k % OCTAVE))
  if (played.size !== target.pcs.length || !target.pcs.every(pc => played.has(pc))) return false
  return target.bass === null || Math.min(...keys) % OCTAVE === target.bass
}
