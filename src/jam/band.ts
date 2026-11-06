// ── The band: what each player does on each sixteenth ────────────────────────
// Pure. Drums come from the curated grooves; bass and comping only ever use the
// current chord, voiced by the Explorers' genre chords and voice leading.

import { Chord, Note, Scale } from 'tonal'
import { detectChordStructured } from '../utils/chordDetection'
import { progressionSteps, PROGRESSIONS, type Progression, type SeqStep } from '../utils/explorerShared'
import { intervalsToSemis, nextVoicing } from '../utils/voiceLeading'
import type { Genre } from '../utils/genreVoicing'
import { GROOVES, GROOVE_BEATS, GROOVE_TICKS_PER_BEAT } from './grooves'
import type { BandLevel } from './reaction'
import { DRUM_CH, type JamPlayer } from './roster'
import type { JamNote } from './scheduler'

export type JamStyle = 'blues' | 'jazz' | 'pop' | 'rock'
export type JamFeel = 'tight' | 'relaxed'
export interface JamChord { rootPc: number; semis: number[]; raw: string }

const STEPS_PER_BEAT = 4
const STEPS_PER_BAR = 16
export const BEATS_PER_BAR = STEPS_PER_BAR / STEPS_PER_BEAT
const TICKS_PER_STEP = GROOVE_TICKS_PER_BEAT / STEPS_PER_BEAT
const GROOVE_STEPS = GROOVE_BEATS * STEPS_PER_BEAT

export const stepSeconds = (bpm: number) => 60 / bpm / STEPS_PER_BEAT

// Patterns: one line a bar for calm, steady, building, one character a sixteenth.
// Bass: R root, 3 5 6 7 chord tones, 8 octave, A a semitone under the next root.
// Comping: x strikes the chord. A note rings to the next character that isn't a dot.
// Stabs: x is one short hit, so a calm band's horns lay out.
interface Style {
  genre: Genre
  bpm: number
  swing: number // a swung offbeat eighth's place in the beat; 0.5 is straight
  scale: string
  progression: Progression
  bass: [string, string, string]
  comp: [string, string, string]
  stab: [string, string, string]
}

export const STYLES: Record<JamStyle, Style> = {
  blues: {
    genre: 'roadhouse', bpm: 96, swing: 0.66, scale: 'blues',
    progression: { name: '12-bar', labels: ['I','I','I','I','IV','IV','I','I','V','IV','I','V'], offsets: [0,0,0,0,5,5,0,0,7,5,0,7] },
    bass: ['R.......5.......', 'R...3...5...6...', 'R.3.5.6.7.6.5.3.'],
    comp: ['x...............', 'x.....x...x.....', 'x.....x.x.....x.'],
    stab: ['................', '........x..x....', '..x...x...x..x..'],
  },
  jazz: {
    genre: 'coltrane', bpm: 116, swing: 0.62, scale: 'major',
    progression: { name: 'ii V I vi', labels: ['ii','V','I','vi'], offsets: [2,7,0,9] },
    bass: ['R.......5.......', 'R...3...5...A...', 'R...3..58...A...'],
    comp: ['x...............', 'x.....x.........', 'x.....x...x...x.'],
    stab: ['................', '......x.........', '...x..x.....x...'],
  },
  pop: {
    genre: 'classic', bpm: 100, swing: 0.5, scale: 'major',
    progression: PROGRESSIONS[0],
    bass: ['R.......R.......', 'R.....R.R.......', 'R.R.R.R.R.R.5.5.'],
    comp: ['x...............', 'x.....x.x.....x.', 'x.x.x.x.x.x.x.x.'],
    stab: ['................', 'x...............', 'x.....x...x.....'],
  },
  rock: {
    genre: 'classic', bpm: 104, swing: 0.5, scale: 'minor pentatonic',
    progression: { name: 'I bVII IV I', labels: ['I','bVII','IV','I'], offsets: [0,10,5,0] },
    bass: ['R.......R.......', 'R.R.R.R.R.R.R.R.', 'R.R.R.R.8.8.5.5.'],
    comp: ['x...............', 'x.......x.......', 'x..x..x.x..x..x.'],
    stab: ['................', 'x.......x.......', 'x..x..x.x..x..x.'],
  },
}

const COMP_RANGE = { min: 48, max: 79 }
const COMP_NOTES = 4
const UPPER_NOTES = 3 // pads and stabs take the top of the voicing
const STAB_SEC = 0.16
const STAB_FLOOR = 60
const LAID_BACK = 0.12 // of a sixteenth, behind the drums
const LOOSE_SEC = 0.003
const BASS_MIN = 31
const BASS_MAX = 55

export const noteName = (pc: number) => Note.pitchClass(Note.fromMidi(60 + pc))
const pcOf = (n: number) => ((n % 12) + 12) % 12

const toChord = (s: SeqStep): JamChord => ({ rootPc: s.rootPc, semis: s.semis, raw: `${noteName(s.rootPc)}${s.suffix}` })

export const progressionChords = (style: JamStyle, keyPc: number) =>
  progressionSteps(STYLES[style].progression, keyPc, STYLES[style].genre).map(toChord)

export const tonicChord = (style: JamStyle, keyPc: number) =>
  toChord(progressionSteps({ name: 'I', labels: ['I'], offsets: [0] }, keyPc, STYLES[style].genre)[0])

export const scaleNotes = (scale: string, keyPc: number): string[] => Scale.get(`${noteName(keyPc)} ${scale}`).notes

export const scalePitchClasses = (scale: string, keyPc: number): Set<number> =>
  new Set(scaleNotes(scale, keyPc).map(n => Note.chroma(n) as number))

// ── The left hand: the chord in the low register, 3+ different notes ─────────
export function lowChord(held: Set<number>, split: number): JamChord | null {
  const low = new Set([...held].filter(m => m < split))
  if (new Set([...low].map(pcOf)).size < 3) return null
  const found = detectChordStructured(low)
  if (!found) return null
  return { rootPc: found.rootPitchClass, semis: intervalsToSemis(Chord.get(found.rawRootName).intervals), raw: found.rawRootName }
}

const sameChord = (a: JamChord, b: JamChord) => a.rootPc === b.rootPc && a.semis.join() === b.semis.join()

// Bass has the root: a dense chord loses its fifth, then its root, not its colour
function compTones(semis: number[]): number[] {
  let tones = semis
  if (tones.length > COMP_NOTES) tones = tones.filter(s => s !== 7)
  if (tones.length > COMP_NOTES) tones = tones.filter(s => s !== 0)
  return tones.slice(0, COMP_NOTES + 1)
}

const toneIn = (semis: number[], wanted: number[], fallback: number) => semis.map(s => s % 12).find(s => wanted.includes(s)) ?? fallback

function bassPc(ch: string, chord: JamChord, nextRootPc: number): number {
  const { rootPc: r, semis } = chord
  switch (ch) {
    case '3': return r + toneIn(semis, [3, 4], 4)
    case '5': return r + toneIn(semis, [7, 6, 8], 7)
    case '6': return r + toneIn(semis, [9], 9)
    case '7': return r + toneIn(semis, [10, 11, 9], 10)
    case 'A': return nextRootPc - 1
    default: return r
  }
}

// Nearest octave to the last bass note, inside the bass's range
function nearestBass(pc: number, last: number, up: boolean): number {
  let best = -1, bestDist = Infinity
  for (let m = BASS_MIN; m <= BASS_MAX; m++) {
    if (pcOf(m) !== pcOf(pc)) continue
    const d = Math.abs(m - last) - (up && m > last ? 1 : 0)
    if (d < bestDist) { bestDist = d; best = m }
  }
  return best
}

// Sixteenths until the next character in the line, or the bar's end
function stepsToNext(line: string, s: number): number {
  for (let i = s + 1; i < line.length; i++) if (line[i] !== '.') return i - s
  return line.length - s
}

// An offbeat eighth, moved to the style's swung place
function swungAt(s: number, at: number, stepSec: number, swing: number): number {
  return s % STEPS_PER_BEAT === 2 ? at + (swing * STEPS_PER_BEAT - 2) * stepSec : at
}

const clampVel = (v: number) => Math.max(1, Math.min(127, Math.round(v)))

export interface BandIO {
  settings(): { style: JamStyle; keyPc: number; leftHand: boolean; players: JamPlayer[]; feel: JamFeel }
  listening(): { loud: number; level: BandLevel }
  play(n: JamNote): void
  releaseAt(chs: number[], at: number): void
  chordChanged(chord: JamChord, at: number): void
  beat(index: number, at: number): void
}

export function createBand(io: BandIO) {
  const first = io.settings()
  let chord = tonicChord(first.style, first.keyPc)
  let pending: JamChord | null = null
  let voicing: number[] | null = null
  let lastBass = 43
  let barLevel: BandLevel = 1
  let grooveLevel: BandLevel = 1

  function voice() {
    voicing = nextVoicing(voicing, chord.rootPc, compTones(chord.semis), 'smooth', COMP_RANGE)
  }
  voice()

  function plan(step: number, at: number, stepSec: number) {
    const { style, keyPc, leftHand, players, feel } = io.settings()
    const def = STYLES[style]
    const s = step % STEPS_PER_BAR
    const bar = Math.floor(step / STEPS_PER_BAR)
    const { loud, level } = io.listening()
    const beatStart = s % STEPS_PER_BEAT === 0

    if (s === 0) barLevel = level
    if (step % GROOVE_STEPS === 0) grooveLevel = level

    if (beatStart) io.beat(s / STEPS_PER_BEAT, at)

    let wanted: JamChord | null = null
    if (!leftHand && s === 0) wanted = progressionChords(style, keyPc)[bar % def.progression.labels.length]
    if (leftHand && beatStart && pending) { wanted = pending; pending = null }

    const changed = !!wanted && !sameChord(wanted, chord)
    if (changed && wanted) {
      chord = wanted
      voice()
      io.releaseAt(players.filter(p => p.role !== 'drums').map(p => p.ch), at)
      io.chordChanged(chord, at)
    }

    // Relaxed sits behind the drums, a touch unevenly; the same step lands the same way
    const played = (when: number) => (feel === 'relaxed' ? when + LAID_BACK * stepSec + (((step * 7) % 5) - 2) * LOOSE_SEC : when)

    if (players.some(p => p.role === 'drums')) {
      const groove = GROOVES[style][grooveLevel]
      const from = (step % GROOVE_STEPS) * TICKS_PER_STEP
      for (let i = 0; i < groove.length; i += 3) {
        const offset = groove[i] - from
        if (offset < 0 || offset >= TICKS_PER_STEP) continue
        io.play({ ch: DRUM_CH, note: groove[i + 1], vel: clampVel(groove[i + 2] * (0.65 + 0.5 * loud)), at: at + offset / TICKS_PER_STEP * stepSec, dur: 0.08 })
      }
    }

    const bassists = players.filter(p => p.role === 'bass')
    if (bassists.length) {
      const line = def.bass[barLevel]
      const ch = changed ? 'R' : line[s]
      if (ch !== '.') {
        const lastBeat = s >= STEPS_PER_BAR - STEPS_PER_BEAT
        const nextRoot = !leftHand && lastBeat ? progressionChords(style, keyPc)[(bar + 1) % def.progression.labels.length].rootPc : chord.rootPc
        lastBass = nearestBass(bassPc(ch, chord, nextRoot), lastBass, ch !== 'R')
        const when = swungAt(s, at, stepSec, def.swing)
        for (const p of bassists) io.play({ ch: p.ch, note: lastBass, vel: clampVel(62 + 45 * loud), at: played(when), dur: at + stepsToNext(line, s) * stepSec * 0.92 - when })
      }
    }

    if (!voicing) return
    const upper = voicing.slice(-UPPER_NOTES)
    for (const p of players) {
      if (p.role === 'comp') {
        const line = def.comp[barLevel]
        if (!changed && line[s] === '.') continue
        const when = swungAt(s, at, stepSec, def.swing)
        const dur = at + stepsToNext(line, s) * stepSec * 0.92 - when
        for (const note of voicing) io.play({ ch: p.ch, note, vel: clampVel(44 + 40 * loud), at: played(when), dur })
      }
      if (p.role === 'pad' && (changed || s === 0)) {
        for (const note of upper) io.play({ ch: p.ch, note, vel: clampVel(34 + 30 * loud), at: played(at), dur: (STEPS_PER_BAR - s) * stepSec * 0.98 })
      }
      if (p.role === 'stab' && def.stab[barLevel][s] !== '.') {
        const lift = Math.min(...upper) < STAB_FLOOR ? 12 : 0
        const when = swungAt(s, at, stepSec, def.swing)
        for (const note of upper) io.play({ ch: p.ch, note: note + lift, vel: clampVel(58 + 45 * loud), at: played(when), dur: STAB_SEC })
      }
    }
  }

  return {
    plan,
    /** The chord to move to on the next beat (left hand leads) */
    follow(next: JamChord) { pending = sameChord(next, chord) ? null : next },
    get chord() { return chord },
    get pending() { return pending },
  }
}
