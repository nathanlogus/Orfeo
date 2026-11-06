// ── Who can sit in: four band slots, filled from a roster or a preset band ───
// Each instrument has a role, which decides what it plays (see band.ts).
import { t } from '../utils/i18n'
import type { JamStyle } from './band'

export type JamRole = 'drums' | 'bass' | 'comp' | 'pad' | 'stab'
export interface JamInstrument { id: string; name: () => string; family: () => string; role: JamRole; program: number }
export interface JamPlayer { role: JamRole; ch: number }

export const DRUM_CH = 9
export const SLOT_COUNT = 4
const SLOT_CHANNELS = [10, 11, 12, 13] // 14 and 15 stay the preview and live channels
export const BAND_CHANNELS = [DRUM_CH, ...SLOT_CHANNELS]

const family = (name: () => string, role: JamRole, list: [string, () => string, number][]): JamInstrument[] =>
  list.map(([id, label, program]) => ({ id, name: label, family: name, role, program }))

export const ROSTER: JamInstrument[] = [
  ...family(() => t`Drums`, 'drums', [['drums', () => t`Drum kit`, 0]]),
  ...family(() => t`Bass`, 'bass', [
    ['upright-bass', () => t`Upright bass`, 32], ['finger-bass', () => t`Finger bass`, 33], ['pick-bass', () => t`Pick bass`, 34],
    ['fretless-bass', () => t`Fretless bass`, 35], ['synth-bass', () => t`Synth bass`, 38],
  ]),
  ...family(() => t`Keys`, 'comp', [
    ['grand-piano', () => t`Grand piano`, 0], ['electric-piano', () => t`Electric piano`, 4], ['clavinet', () => t`Clavinet`, 7],
    ['organ', () => t`Organ`, 16], ['vibraphone', () => t`Vibraphone`, 11],
  ]),
  ...family(() => t`Guitar`, 'comp', [
    ['nylon-guitar', () => t`Nylon guitar`, 24], ['steel-guitar', () => t`Steel guitar`, 25], ['jazz-guitar', () => t`Jazz guitar`, 26],
    ['clean-guitar', () => t`Clean guitar`, 27], ['overdriven-guitar', () => t`Overdriven guitar`, 29], ['distortion-guitar', () => t`Distortion guitar`, 30],
  ]),
  ...family(() => t`Brass`, 'stab', [
    ['trumpet', () => t`Trumpet`, 56], ['trombone', () => t`Trombone`, 57], ['muted-trumpet', () => t`Muted trumpet`, 59], ['horn-section', () => t`Horn section`, 61],
  ]),
  ...family(() => t`Saxophone`, 'stab', [['alto-sax', () => t`Alto sax`, 65], ['tenor-sax', () => t`Tenor sax`, 66]]),
  ...family(() => t`Strings and pads`, 'pad', [
    ['strings', () => t`Strings`, 48], ['choir', () => t`Choir`, 52], ['warm-pad', () => t`Warm pad`, 89], ['rock-organ', () => t`Rock organ`, 18],
  ]),
]

export const instrument = (id: string | null) => ROSTER.find(i => i.id === id) ?? null

export type JamSlots = (string | null)[]

export const PRESETS: { id: string; name: () => string; slots: JamSlots }[] = [
  { id: 'roadhouse', name: () => t`Roadhouse band`, slots: ['drums', 'finger-bass', 'organ', 'overdriven-guitar'] },
  { id: 'jazz-quartet', name: () => t`Jazz quartet`, slots: ['drums', 'upright-bass', 'jazz-guitar', 'tenor-sax'] },
  { id: 'pop-band', name: () => t`Pop band`, slots: ['drums', 'finger-bass', 'electric-piano', 'strings'] },
  { id: 'rock-band', name: () => t`Rock band`, slots: ['drums', 'pick-bass', 'overdriven-guitar', 'distortion-guitar'] },
  { id: 'soul-horns', name: () => t`Soul horns`, slots: ['drums', 'finger-bass', 'clavinet', 'horn-section'] },
  { id: 'big-band', name: () => t`Big band`, slots: ['drums', 'upright-bass', 'trombone', 'trumpet'] },
  { id: 'unplugged', name: () => t`Unplugged`, slots: ['upright-bass', 'nylon-guitar', 'strings', null] },
  { id: 'smooth-rnb', name: () => t`Smooth R&B`, slots: ['drums', 'finger-bass', 'electric-piano', 'warm-pad'] },
  { id: 'soul-revue', name: () => t`Soul revue`, slots: ['drums', 'finger-bass', 'organ', 'horn-section'] },
  { id: 'funk-unit', name: () => t`Funk unit`, slots: ['drums', 'finger-bass', 'clavinet', 'clean-guitar'] },
  { id: 'bossa-trio', name: () => t`Bossa trio`, slots: ['drums', 'upright-bass', 'nylon-guitar', 'alto-sax'] },
  { id: 'beat-makers', name: () => t`Beat makers`, slots: ['drums', 'synth-bass', 'electric-piano', 'warm-pad'] },
  { id: 'indie-band', name: () => t`Indie band`, slots: ['drums', 'pick-bass', 'clean-guitar', 'distortion-guitar'] },
  { id: 'ballad-band', name: () => t`Ballad band`, slots: ['drums', 'upright-bass', 'grand-piano', 'strings'] },
  { id: 'rhythm-section', name: () => t`Rhythm section`, slots: ['drums', 'finger-bass', null, null] },
]

export const STYLE_PRESET: Record<JamStyle, string> = { blues: 'roadhouse', jazz: 'jazz-quartet', pop: 'pop-band', rock: 'rock-band', rnb: 'smooth-rnb', soul: 'soul-revue', funk: 'funk-unit', bossa: 'bossa-trio', hiphop: 'beat-makers', alternative: 'indie-band', ballad: 'ballad-band' }
export const presetSlots = (id: string): JamSlots => [...(PRESETS.find(p => p.id === id)?.slots ?? PRESETS[0].slots)]

export function playersOf(slots: JamSlots): JamPlayer[] {
  return slots.flatMap((id, i) => {
    const role = instrument(id)?.role
    return role ? [{ role, ch: role === 'drums' ? DRUM_CH : SLOT_CHANNELS[i] }] : []
  })
}

// One kit: channel 9 has room for one drummer
export function withSlot(slots: JamSlots, index: number, id: string | null): JamSlots {
  return slots.map((old, i) => (i === index ? id : id === 'drums' ? (old === 'drums' ? null : old) : old))
}

export const slotChannel = (index: number) => SLOT_CHANNELS[index]
