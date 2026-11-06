// ── Monster Hollow: the stages, what each teaches, and the one dial ───────────
import { t } from '../../utils/i18n'
import type { MeetCard, StageDef } from '../games'
import { chordOf, fits } from '../library/chords'

export type StageId = 'triads' | 'sevenths' | 'inversions' | 'boss' | 'endless'

const ALL_KEYS = ['C', 'G', 'F', 'D', 'Bb', 'A', 'Eb', 'E', 'Ab', 'B', 'Db', 'Gb']

export interface Stage extends StageDef {
  id: StageId
  items: string[]         // library ids; the first, in the first key, opens every run
  keys: string[]
  waves: number           // Infinity: Endless
  dial: { start: number; step: number; floor: number }   // ms before a chord lands
}

// Boss waves play in this order, on one giant monster
export const BOSS_WAVES = [['bl-12-sevenths', 'F'], ['jz-1625', 'Bb'], ['bl-12-sevenths', 'G']] as const

// A chord for Meet it, with its root marked wherever an inversion put it
const card = (label: string, numeral: string, tonic: string): MeetCard => {
  const { keys } = chordOf(numeral, tonic)
  return { label, keys, root: chordOf(numeral.split('^')[0], tonic).pcs[0] }
}
const tryChord = (prompt: string, numeral: string, tonic: string) => {
  const target = chordOf(numeral, tonic)
  return { prompt, keys: target.keys, fits: (held: number[]) => fits(target, held) }
}
const ANY_C = t`Try one now: play any C chord, any way up`

export const STAGES: Stage[] = [
  {
    id: 'triads', kind: 'stage', name: t`Triads`, sub: t`Major and minor, in C, F and G`, concept: 'triads', conceptName: t`Major and minor triads`,
    meet: {
      text: t`A triad is three notes, each a third apart. Lower the middle note by one key and major turns minor.`,
      hear: t`Hear both`, cards: [card(t`Major`, 'I', 'C'), card(t`Minor`, 'i', 'C')], tryIt: tryChord(ANY_C, 'I', 'C'),
    },
    items: ['xp-pop', 'xp-doo-wop', 'xp-rock-blues', 'pp-hopeful', 'pp-tender', 'xp-sentimental', 'xp-minor-pop', 'rk-joyful', 'bl-12-triads'],
    keys: ['C', 'G', 'F'], waves: 5, dial: { start: 7000, step: 500, floor: 3500 },
  },
  {
    id: 'sevenths', kind: 'stage', name: t`Seventh chords`, sub: t`Dominant, major and minor sevenths`, concept: 'sevenths', conceptName: t`Seventh chords`,
    meet: {
      text: t`Stack one more third on a triad and you have a seventh chord. It leans towards the next chord, which is why blues and jazz live on them.`,
      hear: t`Hear all three`,
      cards: [card(t`Minor seventh`, 'ii7', 'C'), card(t`Dominant seventh`, 'V7', 'C'), card(t`Major seventh`, 'Imaj7', 'C')],
      tryIt: tryChord(t`Try one now: play G7, any way up`, 'V7', 'C'),
    },
    items: ['jz-251', 'bl-shuffle', 'jz-walking', 'bl-12-sevenths', 'jz-ii-iii', 'bl-quick-four'],
    keys: ['C', 'F', 'G', 'Bb', 'D'], waves: 5, dial: { start: 7500, step: 500, floor: 4000 },
  },
  {
    id: 'inversions', kind: 'stage', name: t`Inversions`, sub: t`The same chords, restacked, in all 12 keys`, concept: 'inversions', conceptName: t`Inversions`,
    meet: {
      text: t`An inversion is the same chord with a different note at the bottom. G/B means a G chord with B as its lowest note, so the bass can walk.`,
      hear: t`Hear all three`,
      cards: [card(t`Root position`, 'I', 'C'), card(t`First inversion`, 'I^1', 'C'), card(t`Second inversion`, 'I^2', 'C')],
      tryIt: tryChord(ANY_C, 'I', 'C'),
    },
    items: ['in-climb', 'in-walk-down', 'in-rock', 'in-blues', 'in-jazz', 'in-minor'],
    keys: ALL_KEYS, waves: 6, dial: { start: 8000, step: 500, floor: 4500 },
  },
  {
    id: 'boss', kind: 'boss', name: t`Boss`, sub: t`A giant monster wears a whole progression. Play it in order.`, concept: 'progressions', conceptName: t`Whole progressions`,
    meet: {
      text: t`The king wears a progression across his body. Play it from start to end: each chord you land folds one panel of him flat.`,
      hear: t`Hear all three`, cards: [card('I7', 'I7', 'F'), card('IV7', 'IV7', 'F'), card('V7', 'V7', 'F')], tryIt: tryChord(t`Try one now: play F7, any way up`, 'I7', 'F'),
    },
    items: BOSS_WAVES.map(([id]) => id), keys: ['F'], waves: BOSS_WAVES.length, dial: { start: 6500, step: 750, floor: 4000 },
  },
  {
    id: 'endless', kind: 'endless', name: t`Endless`, sub: t`Every stage mixed, faster waves, no finish line`, concept: 'mixed', conceptName: t`Everything so far`,
    meet: {
      text: t`Every wave you've met, and the night only speeds up. Three chords landing ends it.`,
      hear: t`Hear the loop`, cards: [card('I', 'I', 'C'), card('vi', 'vi', 'C'), card('IV', 'IV', 'C'), card('V', 'V', 'C')], tryIt: tryChord(ANY_C, 'I', 'C'),
    },
    items: ['xp-pop', 'jz-251', 'bl-12-sevenths', 'in-climb', 'jz-1625', 'in-walk-down', 'bl-quick-four', 'rk-mixo', 'rk-modal', 'jz-251-minor'],
    keys: ALL_KEYS, waves: Infinity, dial: { start: 5000, step: 250, floor: 1800 },
  },
]

export const stageById = (id: StageId) => STAGES.find(s => s.id === id)!

const ASSIST_SLOWDOWN = 1.5
// Monsters enter this share of the dial apart, so the dial alone sets the pace
export const SPACING = 0.42

export function dialAt(stage: Stage, step: number, assist: boolean): number {
  const { start, step: drop, floor } = stage.dial
  return Math.max(floor, start - drop * step) * (assist ? ASSIST_SLOWDOWN : 1)
}
