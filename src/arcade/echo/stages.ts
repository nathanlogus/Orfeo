// ── Deep Song: the stages, what each teaches, and the one dial: phrase length ──
import { t } from '../../utils/i18n'
import type { MeetCard, StageDef } from '../games'
import { chordOf, fits } from '../library/chords'

export type StageId = 'intervals' | 'phrases' | 'leaps' | 'boss' | 'endless'

export interface Stage extends StageDef {
  id: StageId
  items: string[]         // library ids, the first in the first key opens every run
  keys: string[]          // a run stays in one of these
  phrases: number         // how many to answer; Infinity: Endless. The boss: its parts
  dial: { start: number; every: number; top: number }   // notes in a phrase; one more each `every` phrases
  beatMs: number          // a beat when sung in even notes; 0 when the riff's own tempo sets it
  rhythm: boolean         // sing the riff's own rhythm
}

// The ancient whale's phrase, cut into parts at its barlines
export const BOSS_RIFF = 'or-jz-swing'
export const BOSS_PARTS = 3

const single = (label: string, key: number): MeetCard => ({ label, keys: [key], root: key % 12 })
const pair = (label: string, low: number, high: number): MeetCard => ({ label, keys: [low, high], root: low % 12 })
const holds = (keys: number[]) => (held: number[]) => held.length === keys.length && keys.every(k => held.some(h => h % 12 === k % 12))
const C4 = 60, D4 = 62, E4 = 64, F4 = 65, G4 = 67, A4 = 69, C5 = 72

export const STAGES: Stage[] = [
  {
    id: 'intervals', kind: 'stage', name: t`Two-note intervals`, sub: t`How far apart two notes feel`, concept: 'intervals', conceptName: t`Intervals`,
    meet: {
      text: t`An interval is the distance between two notes. The whale sings two: listen to how far apart they feel, then play them back. Any octave counts.`,
      hear: t`Hear all three`, cards: [pair(t`Major third`, C4, E4), pair(t`Perfect fifth`, C4, G4), pair(t`Octave`, C4, C5)],
      hearSteps: [[C4], [E4], [C4], [G4], [C4], [C5]],
      tryIt: { prompt: t`Try one now: hold C and G, a perfect fifth`, keys: [C4, G4], fits: holds([C4, G4]) },
    },
    items: ['sc-major', 'sc-aeolian'], keys: ['C', 'F', 'G'], phrases: 8, dial: { start: 2, every: 1, top: 2 }, beatMs: 800, rhythm: false,
  },
  {
    id: 'phrases', kind: 'stage', name: t`Short phrases`, sub: t`Three to five notes in one key`, concept: 'short-phrases', conceptName: t`Short phrases`,
    meet: {
      text: t`A whole run stays in one key, so every phrase comes from the same few notes. Sing each one back in your head before you play it.`,
      hear: t`Hear a phrase`, cards: [single(t`First`, E4), single(t`Second`, D4), single(t`Third`, C4)],
      hearSteps: [[E4], [D4], [C4], [D4]],
      tryIt: { prompt: t`Try one now: play E, where that phrase begins`, keys: [E4], fits: holds([E4]) },
    },
    items: ['sc-major', 'sc-major-pentatonic', 'or-pop-steps', 'or-pop-penta', 'or-sl-sway', 'or-bd-fall', 'or-bd-home', 'or-rb-sigh', 'or-bs-steps'],
    keys: ['C', 'G', 'F', 'D'], phrases: 8, dial: { start: 3, every: 3, top: 5 }, beatMs: 620, rhythm: false,
  },
  {
    id: 'leaps', kind: 'stage', name: t`Leaps and rhythm`, sub: t`Longer lines that jump and swing`, concept: 'leaps', conceptName: t`Leaps and rhythm`,
    meet: {
      text: t`Longer phrases jump instead of stepping, and their notes are no longer even. Only pitch and order count: the rhythm is there to help you remember.`,
      hear: t`Hear a leap`, cards: [pair(t`Step`, C4, D4), pair(t`Leap`, C4, G4)],
      hearSteps: [[C4], [E4], [G4], [E4], [A4], [F4], [C5]],
      tryIt: { prompt: t`Try one now: hold C and G, the leap`, keys: [C4, G4], fits: holds([C4, G4]) },
    },
    items: ['or-pop-thirds', 'or-jz-climb', 'or-jz-swing', 'or-pop-offbeat', 'or-hh-loop', 'or-rb-nine', 'or-al-drift', 'sl-rock-fill-e'],
    keys: ['C', 'G', 'F', 'D'], phrases: 8, dial: { start: 5, every: 3, top: 8 }, beatMs: 0, rhythm: true,
  },
  {
    id: 'boss', kind: 'boss', name: t`Boss`, sub: t`An ancient whale sings one long phrase in parts`, concept: 'whole-phrase', conceptName: t`One long phrase`,
    meet: {
      text: t`The ancient whale sings one long phrase, a part at a time. A part you miss comes round again; answer them all and the deep lights up.`,
      hear: t`Hear how it opens`, cards: [single(t`It starts`, C5), single(t`It falls`, F4), single(t`It rests`, G4)],
      hearSteps: [[C5], [A4], [F4], [A4], [G4]],
      tryIt: { prompt: t`Try one now: play C, the first note`, keys: [C5], fits: holds([C5]) },
    },
    items: [BOSS_RIFF], keys: ['F'], phrases: BOSS_PARTS, dial: { start: 8, every: 1, top: 8 }, beatMs: 0, rhythm: true,
  },
  {
    id: 'endless', kind: 'endless', name: t`Endless`, sub: t`Whole chords by ear, longer and longer`, concept: 'chords-by-ear', conceptName: t`Chords by ear`,
    meet: {
      text: t`Now the whales sing in chords. Play each one back, any way up. The phrases keep growing until three of them get away.`,
      hear: t`Hear the loop`,
      cards: ['I', 'vi', 'IV', 'V'].map(n => { const c = chordOf(n, 'C'); return { label: n, keys: c.keys, root: c.pcs[0] } }),
      tryIt: { prompt: t`Try one now: play any C chord, any way up`, keys: chordOf('I', 'C').keys, fits: held => fits(chordOf('I', 'C'), held) },
    },
    items: ['xp-pop', 'xp-doo-wop', 'jz-251', 'jz-1625', 'bl-quick-four', 'pp-hopeful', 'xp-sentimental', 'rk-mixo'],
    keys: ['C', 'G', 'F', 'Bb', 'D'], phrases: Infinity, dial: { start: 2, every: 3, top: 8 }, beatMs: 1100, rhythm: false,
  },
]

export const stageById = (id: StageId) => STAGES.find(s => s.id === id)!

export const lengthAt = ({ dial }: Stage, played: number) => Math.min(dial.top, dial.start + Math.floor(played / dial.every))
