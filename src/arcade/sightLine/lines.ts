// ── Sight Line's music: written lines, read into notes and laid on the staff ──
// No rendering and no clock: every line comes from the library or the course.
import { Key, Note } from 'tonal'
import { midiOf, noteParts, staffStep } from '../../lessons/drill'
import { RIFFS } from '../library/riffs'

export type Clef = 'treble' | 'bass'
export interface LineRef { id: string; down?: number }      // a riff or lesson; down: octaves, to sit on the bass staff

export interface Written { beat: number; names: string[] }  // beat: from the line's start
export interface Music { events: Written[]; beats: number; rests: number; bars: number[] }

export interface Head {
  name: string
  staff: number             // index into the stage's clefs
  pos: number               // half spaces up from that staff's bottom line
  accidental: '' | '#' | 'b' | 'n'
  ledgers: number[]         // positions of the short lines it needs
  beside: boolean           // a second above the last head: drawn beside it
}

const BOTTOM: Record<Clef, number> = { treble: staffStep('E4'), bass: staffStep('G2') }
const MIDDLE_C = 60
const FAR_KEY = 6           // semitones up from C past which a line moves down instead

// The course's own exercises, by lesson number. Copied, as courseData can't load outside Vite.
const treble = (body: string) => '\\staff \\clef G2\n' + body
const bass = (body: string) => '\\staff \\clef F4\n' + body
const WRITTEN: Record<string, string> = {
  '3.2': bass(':4 C3 D3 E3 F3 | G3.1 | :4 G3 F3 E3 D3 | C3.1 | :4 E3 F3 G3 F3 | E3 D3 C3.2'),
  '3.3': bass(':4 C3 D3 E3 C3 | C3 D3 E3 C3 | E3 F3 G3.2 | :4 E3 F3 G3.2'),
  '6.2': treble(':4 C4 D4 E4 F4 | r.1 | :4 G4 F4 E4 D4 | r.1 | C4.1') + bass('r.1 | :4 G3 F3 E3 D3 | r.1 | :4 C3 D3 E3 F3 | C3.1'),
  '6.4': treble(':4 C4 D4 E4 F4 | G4 F4 E4 D4 | E4 F4 G4 F4 | E4 D4 C4.2') + bass(':4 C3 D3 E3 F3 | G3 F3 E3 D3 | E3 F3 G3 F3 | E3 D3 C3.2'),
  '6.5': treble(':4 E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | E4 D4 D4.2 | :4 E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | D4 C4 C4.2') + bass(':1 C3 | G3 | C3 | G3 | C3 | G3 | C3 | :4 G3 C3 C3.2'),
}

// jam/licks' lineOf() plus chords and dots. A mark it can't follow is a bug in a stage.
function readStaff(body: string) {
  const events: Written[] = []
  const bars: number[] = []
  let at = 0, beats = 1, rests = 0
  for (const token of body.match(/\([^)]*\)\S*|\S+/g) ?? []) {
    if (token === '|') { bars.push(at); continue }
    const length = token.match(/^:(\d+)$/)
    if (length) { beats = 4 / Number(length[1]); continue }
    const beat = token.match(/^(?:\(([^)]*)\)|(r|[A-G][#b]?\d))(?:\.(\d+))?(\{d\})?$/)
    if (!beat) throw new Error(`Can't read ${token}`)
    if (beat[3]) beats = 4 / Number(beat[3])
    if (beat[2] === 'r') rests++
    else events.push({ beat: at, names: (beat[1] ?? beat[2]).split(/\s+/) })
    at += beat[4] ? beats * 1.5 : beats
  }
  return { events, bars, rests, beats: at }
}

// One staff, or two read as one trail: a rest in one hand is often the other's turn
export function readLine(tex: string): Music {
  const staves = tex.split('\\staff').slice(1).map(s => readStaff(s.replace(/^[^]*?\\clef \S+/, '')))
  const together = new Map<number, string[]>()
  for (const e of staves.flatMap(s => s.events)) together.set(e.beat, [...(together.get(e.beat) ?? []), ...e.names])
  const events = [...together].sort((a, b) => a[0] - b[0]).map(([beat, names]) => ({ beat, names: names.sort((a, b) => midiOf(a) - midiOf(b)) }))
  return { events, rests: Math.min(...staves.map(s => s.rests)), bars: staves[0].bars, beats: Math.max(...staves.map(s => s.beats)) }
}

const moved = (music: Music, interval: string): Music => ({ ...music, events: music.events.map(e => ({ ...e, names: e.names.map(n => Note.transpose(n, interval)) })) })

export function musicOf({ id, down = 0 }: LineRef): Music {
  const tex = RIFFS.find(r => r.id === id)?.tex ?? WRITTEN[id]
  if (!tex) throw new Error(`No such line: ${id}`)
  const music = readLine(tex)
  return down ? moved(music, `-${down * 7 + 1}P`) : music
}

// A line written in C, moved to this key, staying near the staff
export function inKey(music: Music, key: string): Music {
  const shifted = moved(music, Note.distance('C4', `${key}4`))
  return Note.midi(`${key}4`)! - MIDDLE_C > FAR_KEY ? moved(shifted, '-8P') : shifted
}

// The notes this major key alters, in the order a signature writes them
export function signature(key: string): { letter: string; sign: string }[] {
  const { keySignature, scale } = Key.majorKey(key)
  const order = keySignature[0] === '#' ? 'FCGDAEB' : 'BEADGCF'
  return scale.filter(n => n.length > 1).map(n => ({ letter: n[0], sign: n[1] })).sort((a, b) => order.indexOf(a.letter) - order.indexOf(b.letter))
}

// Each glyph of a signature, as a position on the staff
const SIGN_POS: Record<string, number[]> = { '#': [8, 5, 9, 6, 3, 7, 4], b: [4, 7, 3, 6, 2, 5, 1] }
const BASS_DROP = 2
export const signaturePos = (sign: string, clef: Clef) => SIGN_POS[sign].map(p => (clef === 'bass' ? p - BASS_DROP : p))

function ledgersOf(pos: number) {
  const out: number[] = []
  for (let p = -2; p >= pos; p -= 2) out.push(p)
  for (let p = 10; p <= pos; p += 2) out.push(p)
  return out
}

// Accidentals as a score writes them: the signature says, then the bar remembers
export function engrave(music: Music, clefs: Clef[], key = 'C'): Head[][] {
  const sig = new Map(signature(key).map(s => [s.letter, s.sign]))
  const bars = [...music.bars]
  let said = new Map<string, string>()
  return music.events.map(({ beat, names }) => {
    while (bars.length && bars[0] <= beat) { bars.shift(); said = new Map() }
    let last: Head | null = null
    return names.map(name => {
      const { letter, accidental, octave } = noteParts(name)
      const staff = clefs.length > 1 && midiOf(name) < MIDDLE_C ? 1 : 0
      const pos = staffStep(name) - BOTTOM[clefs[staff]]
      const showing = said.get(letter + octave) ?? sig.get(letter) ?? ''
      said.set(letter + octave, accidental)
      const beside: boolean = !!last && last.staff === staff && pos - last.pos === 1 && !last.beside
      const head: Head = { name, staff, pos, ledgers: ledgersOf(pos), beside, accidental: accidental === showing ? '' : accidental ? accidental as '#' | 'b' : 'n' }
      last = head
      return head
    })
  })
}
