// ── Riffs: SundayLicks' lines, and simple originals where its shelves run short ──
// SundayLicks has no pop set and few beginner lines. These are written for Pliage
// and copy no song.
import { LICKS } from './licks'
import type { Difficulty, Genre, Riff } from './types'

function riff(id: string, name: string, genre: Genre, concept: string, difficulty: Difficulty, key: string, tempo: number, line: string): Riff {
  const tex = `\\title "${name}" \\tempo ${tempo} \\ts (4 4) \\hideDynamics\n\\track "Piano" { instrument 0 } \\staff { score } \\clef G2\n${line}`
  return { id, kind: 'riff', name, genre, concept, difficulty, key, source: 'Pliage', license: 'GPL-3.0', tex }
}

const ORIGINALS: Riff[] = [
  riff('or-pop-steps', 'Five-finger hook', 'pop', 'stepwise melody', 1, 'C', 92, ':4 E4 D4 C4 D4 | E4 E4 G4.2 | :4 F4 E4 D4 C4 | D4.1'),
  riff('or-pop-thirds', 'Lifting thirds', 'pop', 'chord tones', 1, 'C', 88, ':4 C4 E4 G4 E4 | A4 F4 C5.2 | :4 B4 G4 D4 G4 | C5.1'),
  riff('or-pop-offbeat', 'Off-beat answer', 'pop', 'syncopation', 2, 'G', 100, ':8 r G4 r B4 r D5 C5 B4 | :8 r A4 r C5 B4.4 A4.4 | :8 r G4 r B4 r E5 D5 C5 | B4.1'),
  riff('or-pop-minor', 'Rainy day line', 'pop', 'relative minor', 1, 'A', 84, ':4 A4 C5 B4 A4 | G4 E4.2 G4.4 | :4 F4 A4 G4 F4 | E4.1'),
  riff('or-pop-penta', 'Pentatonic skip', 'pop', 'major pentatonic', 1, 'C', 96, ':4 C4 D4 E4 G4 | A4 G4 E4.2 | :4 D4 E4 G4 E4 | C4.1'),
  riff('or-bl-call', 'Three-note call', 'blues', 'call and response', 1, 'A', 76, ':4 A4 C5 A4.2 | r.2 :4 E4 G4 | :4 A4 C5 D5.2 | :4 C5 A4 A4.2'),
  riff('or-bl-blue', 'Bend to the blue note', 'blues', 'blue note', 1, 'C', 72, ':8 G4 Bb4 C5.4 :4 Bb4 G4 | :8 F4 Gb4 G4.2 r.4 | :8 G4 Bb4 C5.4 :4 Eb5 C5 | C5.1'),
  riff('or-bl-walk', 'Slow walk up', 'blues', 'minor pentatonic', 1, 'E', 80, ':4 E4 G4 A4 B4 | D5.2 B4.2 | :4 A4 B4 A4 G4 | E4.1'),
  riff('or-jz-guide', 'Guide tone steps', 'jazz', 'guide tones', 1, 'C', 88, ':2 F4 C5 | F4 B4 | :1 E4 | E4'),
  riff('or-jz-climb', 'Chord tone climb', 'jazz', 'chord tones', 1, 'C', 96, ':4 D4 F4 A4 C5 | B4 G4 F4 D4 | :4 E4 G4 B4 G4 | C5.1'),
  riff('or-jz-swing', 'Easy swing line', 'jazz', 'chord tones', 2, 'F', 108, ':8 C5 A4 F4 A4 G4.2 | :8 C5 Bb4 G4 E4 F4.2 | :8 A4 C5 D5 C5 Bb4 G4 A4.4 | F4.1'),
  riff('or-rk-drive', 'Root and fifth drive', 'rock', 'power chords', 1, 'A', 112, ':4 (A3 E4) (A3 E4) (G3 D4).2 | :4 (D4 A4) (D4 A4) (E4 B4).2 | :4 (A3 E4) (A3 E4) (G3 D4).2 | (A3 E4).1'),
  riff('or-rk-stomp', 'Open fifth stomp', 'rock', 'power chords', 1, 'E', 104, '(E3 B3).4 r.8 (E3 B3).8 (D4 A4).4 (E3 B3).4 | (E3 B3).4 r.8 (E3 B3).8 (G3 D4).4 (A3 E4).4 | (E3 B3).1'),
  riff('or-rk-penta', 'Pentatonic climb', 'rock', 'minor pentatonic', 1, 'E', 100, ':8 E4 E4 G4 G4 A4 A4 B4 B4 | D5.2 B4.2 | :8 A4 A4 G4 G4 E4 E4 D4 D4 | E4.1'),
]

export const RIFFS: Riff[] = [...LICKS, ...ORIGINALS]
