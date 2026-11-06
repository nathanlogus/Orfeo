// ── The Arcade's music library: every prompt in every game is one of these ────
export type Genre = 'blues' | 'jazz' | 'pop' | 'rock' | 'rnb' | 'soul' | 'funk' | 'bossa' | 'hiphop' | 'alternative' | 'ballad'
export type Difficulty = 1 | 2 | 3

interface Item {
  id: string
  name: string
  genre: Genre
  concept: string
  difficulty: Difficulty
  key: string
  source: string
  license: string
}

export interface ScaleItem extends Item { kind: 'scale'; tonal: string }

// numerals: uppercase major, lowercase minor, then any quality (V7, iiø7, Imaj7).
// ^1, ^2, ^3 asks for that inversion. minor: key is the relative major's, so a
// set of three major keys holds their minors too.
export interface ProgressionItem extends Item { kind: 'progression'; numerals: string[]; minor?: boolean }

export interface Riff extends Item { kind: 'riff'; tex: string }

export type LibraryItem = ScaleItem | ProgressionItem | Riff
