// ── The library: scales, progressions and riffs, each tagged the same way ─────
import { PROGRESSION_ITEMS } from './progressions'
import { RIFFS } from './riffs'
import type { Difficulty, Genre, LibraryItem, ProgressionItem, ScaleItem } from './types'

// The Scale Explorer's twelve, in the names tonal knows them by
const SCALE_TAGS: [string, string, Genre, string, Difficulty][] = [
  ['Major', 'major', 'pop', 'major scale', 1],
  ['Natural Minor', 'aeolian', 'pop', 'minor scale', 1],
  ['Harmonic Minor', 'harmonic minor', 'jazz', 'raised seventh', 3],
  ['Melodic Minor', 'melodic minor', 'jazz', 'raised sixth and seventh', 3],
  ['Major Pentatonic', 'major pentatonic', 'pop', 'pentatonic', 1],
  ['Minor Pentatonic', 'minor pentatonic', 'rock', 'pentatonic', 1],
  ['Major Blues', 'major blues', 'blues', 'blue note', 2],
  ['Minor Blues', 'minor blues', 'blues', 'blue note', 1],
  ['Dorian', 'dorian', 'jazz', 'mode', 2],
  ['Phrygian', 'phrygian', 'rock', 'mode', 3],
  ['Lydian', 'lydian', 'jazz', 'mode', 3],
  ['Mixolydian', 'mixolydian', 'rock', 'mode', 2],
]

const SCALE_ITEMS: ScaleItem[] = SCALE_TAGS.map(([name, tonal, genre, concept, difficulty]) => ({
  id: `sc-${tonal.replace(/ /g, '-')}`, kind: 'scale', name, tonal, genre, concept, difficulty, key: 'C', source: 'Pliage Scale Explorer', license: 'GPL-3.0',
}))

export const LIBRARY: LibraryItem[] = [...SCALE_ITEMS, ...PROGRESSION_ITEMS, ...RIFFS]

export function progression(id: string): ProgressionItem {
  const item = LIBRARY.find(i => i.id === id)
  if (item?.kind !== 'progression') throw new Error(`Not a progression: ${id}`)
  return item
}
