// ── The Midnight Job: the stages, their marked phrases, and the one dial ──────
import { Note } from 'tonal'
import { t } from '../../utils/i18n'
import type { MeetCard, MeetIt, StageDef } from '../games'
import { LIBRARY } from '../library'

export type StageId = 'levels' | 'three' | 'crescendo' | 'boss' | 'endless'
export type Mark = 'pp' | 'p' | 'mp' | 'mf' | 'f' | 'ff'

// Where each marking sits on the meter, 0 to 1
export const LEVELS: Record<Mark, number> = { pp: 0.1, p: 0.26, mp: 0.42, mf: 0.58, f: 0.74, ff: 0.9 }
const LOUD = 0.7
export const isLoud = (mark: Mark) => LEVELS[mark] >= LOUD
export const MARK_WORDS: Record<Mark, string> = { pp: t`very soft`, p: t`soft`, mp: t`fairly soft`, mf: t`medium`, f: t`loud`, ff: t`very loud` }

export interface PhraseNote { beat: number; key: number; mark: Mark }
export interface Phrase { id: string; notes: PhraseNote[] }

export interface Stage extends StageDef {
  id: StageId
  phrases: Phrase[]       // the first opens every run
  rooms: number           // Infinity: Endless. The boss has one, and keeps trying it.
  words: boolean          // the chips say "soft"; otherwise they carry the marking
  width: { start: number; step: number; floor: number }   // the window, a share of the meter
  beat: { start: number; step: number; floor: number }    // ms: faster beats change the volume sooner
}

// Notes and rhythm of a one-line library riff. Durations stick until the next one.
// shortcut: reads single notes and rests only, enough for the riffs marked here; the test fails on anything else
export function riffNotes(id: string): { beat: number; key: number }[] {
  const riff = LIBRARY.find(i => i.id === id)
  if (riff?.kind !== 'riff') throw new Error(`Not a riff: ${id}`)
  const notes: { beat: number; key: number }[] = []
  let beat = 0, length = 1
  for (const token of riff.tex.split('\n').at(-1)!.split(/\s+/)) {
    if (token === '|') continue
    const duration = token.match(/^:(\d+)$/)
    if (duration) { length = 4 / Number(duration[1]); continue }
    const note = token.match(/^(r|[A-G][b#]?\d)(?:\.(\d+))?$/)
    if (!note) throw new Error(`${id}: can't read ${token}`)
    if (note[2]) length = 4 / Number(note[2])
    if (note[1] !== 'r') notes.push({ beat, key: Note.midi(note[1])! })
    beat += length
  }
  return notes
}

// A library riff, with one dynamic marked on each of its notes
function phrase(id: string, marks: string): Phrase {
  const list = marks.split(/[\s|]+/) as Mark[]
  const notes = riffNotes(id)
  if (list.length !== notes.length) throw new Error(`${id}: ${notes.length} notes, ${list.length} marks`)
  return { id, notes: notes.map((n, i) => ({ ...n, mark: list[i] })) }
}

const TWO = [
  phrase('or-sl-sway', 'p p f p | f p'),
  phrase('or-bd-home', 'p p p f | p p'),
  phrase('or-rb-sigh', 'f p p p | p'),
  phrase('or-pop-penta', 'p p f p | p p f | p p f p | p'),
  phrase('or-pop-steps', 'p p f p | p p f | p p f p | p'),
]
const THREE = [
  phrase('or-bd-lift', 'p mf ff mf | mf p'),
  phrase('or-pop-thirds', 'p mf ff mf | p mf ff | mf p mf p | ff'),
  phrase('or-pop-minor', 'mf ff mf p | p mf mf | p mf ff mf | p'),
  phrase('or-jz-climb', 'p p mf mf | ff mf p p | p mf ff mf | p'),
]
const SWELLS = [
  phrase('or-bd-lift', 'pp p mp mf | f ff'),
  phrase('or-bd-home', 'p mp mf f | f ff'),
  phrase('or-pop-penta', 'pp p p mp | mp mf mf | f f f ff | ff'),
  phrase('or-jz-climb', 'pp pp p p | mp mp mf mf | f f ff ff | ff'),
]
// The line climbs and comes home, and its volume does the same
const VAULT = phrase('or-bl-walk', 'pp p mp mf | f ff | f mf mp p | pp')

const STAR_KEY = 67   // the board's key; C4, D4 and E4 alone are Play, not a try
const card = (label: string, mark: Mark): MeetCard => ({ label: `${label} · ${mark}`, keys: [STAR_KEY], root: STAR_KEY % 12 })
const meet = (text: string, cards: MeetCard[], heard: Phrase): MeetIt => ({
  text, cards, hear: t`Hear the phrase`,
  hearSteps: heard.notes.map(n => [n.key]),
  tryIt: { prompt: t`Try one now: play the yellow key softly, then firmly`, keys: [STAR_KEY], fits: held => held.includes(STAR_KEY) },
})

export const STAGES: Stage[] = [
  {
    id: 'levels', kind: 'stage', name: t`Soft and loud`, sub: t`Tiptoe past the guard, then open the door`, concept: 'levels', conceptName: t`Soft and loud`,
    meet: meet(t`Any key will do: it's how hard you play that counts. Soft notes tiptoe past the guard. Loud ones open doors or make a noise somewhere else. Stay inside the yellow window on the meter.`, [card(t`Soft`, 'p'), card(t`Loud`, 'f')], TWO[0]),
    phrases: TWO, rooms: 4, words: true, width: { start: 0.3, step: 0.02, floor: 0.24 }, beat: { start: 1000, step: 40, floor: 850 },
  },
  {
    id: 'three', kind: 'stage', name: t`Three levels`, sub: t`Soft, medium and loud`, concept: 'three-levels', conceptName: t`Three levels of loudness`,
    meet: meet(t`Now there's a middle. Medium is harder than it sounds: it's the volume your hands drift through on the way somewhere else.`, [card(t`Soft`, 'p'), card(t`Medium`, 'mf'), card(t`Loud`, 'ff')], THREE[0]),
    phrases: THREE, rooms: 4, words: true, width: { start: 0.28, step: 0.02, floor: 0.2 }, beat: { start: 950, step: 50, floor: 800 },
  },
  {
    id: 'crescendo', kind: 'stage', name: t`Crescendos`, sub: t`Grow from a whisper, one step at a time`, concept: 'crescendo', conceptName: t`Gradual crescendos`,
    meet: meet(t`A crescendo grows evenly. Each note is a little louder than the last, so keep some volume back for the end.`, [card(t`Start`, 'pp'), card(t`Middle`, 'mf'), card(t`End`, 'ff')], SWELLS[0]),
    phrases: SWELLS, rooms: 4, words: false, width: { start: 0.28, step: 0.02, floor: 0.22 }, beat: { start: 900, step: 50, floor: 750 },
  },
  {
    id: 'boss', kind: 'boss', name: t`The vault`, sub: t`One phrase, its exact rise and fall`, concept: 'rise-and-fall', conceptName: t`Rise and fall`,
    meet: meet(t`The vault listens to one phrase. Rise to the top, fall back to a whisper, and every note must sit inside its window. One slip and the dial spins back. You have three tries.`, [card(t`Whisper`, 'pp'), card(t`Peak`, 'ff'), card(t`Whisper`, 'p')], VAULT),
    phrases: [VAULT], rooms: 1, words: false, width: { start: 0.26, step: 0, floor: 0.26 }, beat: { start: 850, step: 0, floor: 850 },
  },
  {
    id: 'endless', kind: 'endless', name: t`Endless`, sub: t`Narrower windows, faster rooms, no way out`, concept: 'mixed-dynamics', conceptName: t`Everything so far`,
    meet: meet(t`Every phrase you've met, and the windows only narrow. Keep moving until the alarm stops you.`, [card(t`Soft`, 'p'), card(t`Medium`, 'mf'), card(t`Loud`, 'ff')], SWELLS[1]),
    phrases: [...TWO, ...THREE, ...SWELLS, VAULT], rooms: Infinity, words: false, width: { start: 0.26, step: 0.015, floor: 0.12 }, beat: { start: 800, step: 40, floor: 480 },
  },
]

export const stageById = (id: StageId) => STAGES.find(s => s.id === id)!

const ASSIST_WIDER = 1.4

export const widthAt = (stage: Stage, room: number, assist: boolean) =>
  Math.max(stage.width.floor, stage.width.start - stage.width.step * room) * (assist ? ASSIST_WIDER : 1)

export const beatAt = (stage: Stage, room: number) => Math.max(stage.beat.floor, stage.beat.start - stage.beat.step * room)
