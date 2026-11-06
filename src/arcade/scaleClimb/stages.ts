// ── The Summit: the stages, what each teaches, and the dials ──────────────────
// Scales come from the library's list and tonal, in a fixed learning order.
import { Interval, Note, Scale } from 'tonal'
import { t } from '../../utils/i18n'
import type { DrillStep, MeetCard, MeetIt, StageDef } from '../games'
import { LIBRARY } from '../library'

export type StageId = 'c-major' | 'major-keys' | 'minor-scales' | 'boss' | 'endless'
export type ScaleType = 'major' | 'minor' | 'harmonic minor'

// The library's item for each, which holds the name tonal knows it by
const ITEMS: Record<ScaleType, string> = { major: 'sc-major', minor: 'sc-aeolian', 'harmonic minor': 'sc-harmonic-minor' }

const named: Record<ScaleType, (tonic: string) => string> = {
  major: tonic => t`${tonic} major`,
  minor: tonic => t`${tonic} natural minor`,
  'harmonic minor': tonic => t`${tonic} harmonic minor`,
}

export interface Climb {
  id: string              // "Bb major": the item missed and drilled
  name: string
  tonic: string
  type: ScaleType
  keys: number[]          // the whole route: up, then back down
  notes: string[]         // the route, spelled as this scale spells it
  top: number             // where in the route the top note falls
}

export function climbOf(tonic: string, type: ScaleType, octaves = 1): Climb {
  const item = LIBRARY.find(i => i.id === ITEMS[type])
  if (item?.kind !== 'scale') throw new Error(`Not a scale: ${ITEMS[type]}`)
  const { notes, intervals } = Scale.get(`${tonic} ${item.tonal}`)
  // Two octaves start one lower, so every key fits on the Arcade's three-octave keyboard
  const low = Note.midi(`${tonic}${octaves === 2 ? 3 : 4}`)!
  const upKeys: number[] = [], upNotes: string[] = []
  for (let o = 0; o < octaves; o++) intervals.forEach((iv, i) => { upKeys.push(low + 12 * o + Interval.semitones(iv)!); upNotes.push(notes[i]) })
  upKeys.push(low + 12 * octaves)
  upNotes.push(tonic)
  const back = <T,>(up: T[]) => [...up, ...up.slice(0, -1).reverse()]
  return { id: `${tonic} ${type}`, name: named[type](tonic), tonic, type, keys: back(upKeys), notes: back(upNotes), top: upKeys.length - 1 }
}

export interface Stage extends StageDef {
  id: StageId
  scales: Climb[]         // in order; a stage with fewer than `climbs` goes round again
  climbs: number          // Infinity: Endless
  nonstop: boolean        // no rest between scales, and the riff waits for the end
  pace: { start: number; step: number; floor: number }   // ms per note the mountain expects
  slip: number            // steps lost to a slip
}

const MAJORS = ['C', 'G', 'F', 'D', 'Bb', 'A', 'Eb', 'E', 'Ab', 'B', 'Db', 'Gb']
const MINORS = ['A', 'E', 'D', 'G', 'C', 'B', 'F', 'F#', 'C#', 'Bb', 'Eb', 'G#']
const majors = (tonics: string[]) => tonics.map(tonic => climbOf(tonic, 'major'))
const BOSS_KEYS = ['C', 'G', 'F', 'D', 'Bb']

// A scale's two four-note halves: eight rows would push Play off the sheet
const halves = (climb: Climb): MeetCard[] => {
  const half = (from: number, label: string) => ({ label, keys: climb.keys.slice(from, from + 4), names: climb.notes.slice(from, from + 4), root: climb.keys[0] % 12 })
  const { name } = climb
  return [half(0, t`${name}, lower half`), half(4, t`${name}, upper half`)]
}

// Hear walks up the first scale, one note at a time
function meet(text: string, hear: string, cards: Climb[]): MeetIt {
  const first = cards[0]
  const pc = first.keys[0] % 12
  return {
    text, hear, cards: cards.flatMap(halves),
    hearSteps: first.keys.slice(0, first.top + 1).map(key => [key]),
    tryIt: { prompt: t`Try one now: find the first note, ${first.tonic}`, keys: [first.keys[0]], fits: held => held.some(k => k % 12 === pc) },
  }
}

const C_MAJOR = climbOf('C', 'major')

export const STAGES: Stage[] = [
  {
    id: 'c-major', kind: 'stage', name: t`C major, one octave`, sub: t`The first scale, white keys only, up and back down`, concept: 'c-major', conceptName: t`C major`,
    meet: meet(
      t`A major scale is seven notes, then the first again. Right hand: 1 2 3 on C, D, E, tuck your thumb under to F, then 1 2 3 4 5 up to C. Coming down, cross 3 back over the thumb.`,
      t`Hear it`, [C_MAJOR],
    ),
    scales: [C_MAJOR], climbs: 6, nonstop: false, pace: { start: 1300, step: 100, floor: 800 }, slip: 1,
  },
  {
    id: 'major-keys', kind: 'stage', name: t`Other major keys`, sub: t`The same pattern from G, F, D, Bb, A and Eb`, concept: 'major-keys', conceptName: t`Major keys`,
    meet: meet(
      t`Every major scale has the same steps; only the black keys change. G, D and A finger like C. F goes 1 2 3 4, thumb on C, then 1 2 3 4. In Bb and Eb, put your thumb on C and F.`,
      t`Hear G major`, majors(['G', 'F']),
    ),
    scales: majors(['G', 'F', 'D', 'Bb', 'A', 'Eb']), climbs: 6, nonstop: false, pace: { start: 1200, step: 80, floor: 800 }, slip: 1,
  },
  {
    id: 'minor-scales', kind: 'stage', name: t`Minor scales, two octaves`, sub: t`Natural and harmonic minor, up and back down`, concept: 'minor-scales', conceptName: t`Minor scales`,
    meet: meet(
      t`Natural minor is A to A on the white keys. Harmonic minor raises the seventh. Right hand: 1 2 3, tuck, 1 2 3 4, tuck, 1 2 3, tuck, 1 2 3 4 5; only the last note gets the 5.`,
      t`Hear A natural minor`, [climbOf('A', 'minor'), climbOf('A', 'harmonic minor')],
    ),
    scales: [climbOf('A', 'minor', 2), climbOf('E', 'minor', 2), climbOf('D', 'minor', 2), climbOf('A', 'harmonic minor', 2), climbOf('E', 'harmonic minor', 2)],
    climbs: 5, nonstop: false, pace: { start: 1000, step: 60, floor: 700 }, slip: 1,
  },
  {
    id: 'boss', kind: 'boss', name: t`Boss`, sub: t`Five keys in a row, without stopping`, concept: 'key-changes', conceptName: t`Changing keys`,
    meet: meet(
      t`Five scales, one after another, with no rest between them. Keep each key's fingering, and start the next scale on your next note. Your grip keeps running, and a slip costs two steps.`,
      t`Hear C major`, majors(['C', 'G']),
    ),
    scales: majors(BOSS_KEYS), climbs: BOSS_KEYS.length, nonstop: true, pace: { start: 900, step: 50, floor: 700 }, slip: 2,
  },
  {
    id: 'endless', kind: 'endless', name: t`Endless`, sub: t`A new key each climb, and the mountain speeds up`, concept: 'all-keys', conceptName: t`All the keys`,
    meet: meet(
      t`Every major key, then every natural minor, and the pace keeps rising. A slip costs two steps. Lost? Tuck the thumb under and keep it off the black keys.`,
      t`Hear C major`, [C_MAJOR, climbOf('A', 'minor')],
    ),
    scales: [...majors(MAJORS), ...MINORS.map(tonic => climbOf(tonic, 'minor'))], climbs: Infinity, nonstop: false, pace: { start: 1000, step: 40, floor: 450 }, slip: 2,
  },
]

export const stageById = (id: StageId) => STAGES.find(s => s.id === id)!

const ASSIST_SLOWDOWN = 1.5

export function paceAt(stage: Stage, climb: number, assist: boolean): number {
  const { start, step, floor } = stage.pace
  return Math.max(floor, start - step * climb) * (assist ? ASSIST_SLOWDOWN : 1)
}

// The Two-minute drill: each scale that slipped, up once, one note at a time
export function drillSteps(items: string[]): DrillStep[] {
  const scales = new Map(STAGES.flatMap(s => s.scales).map(c => [c.id, c]))
  return items.flatMap(id => {
    const climb = scales.get(id)
    return climb ? climb.keys.slice(0, climb.top + 1).map((key, i) => ({ label: climb.notes[i], keys: [key], fits: (held: number[]) => held.some(k => k % 12 === key % 12) })) : []
  })
}
