// ── Monster Hollow: the stages, what each teaches, and the one dial ───────────
import { t } from '../../utils/i18n'

export type StageId = 'triads' | 'sevenths' | 'inversions' | 'boss' | 'endless'

const ALL_KEYS = ['C', 'G', 'F', 'D', 'Bb', 'A', 'Eb', 'E', 'Ab', 'B', 'Db', 'Gb']

export interface Stage {
  id: StageId
  title: string
  concept: string         // what results name, for Find it
  meet: string            // what the Meet it card says
  example: string[]       // the numerals it plays, in C
  items: string[]         // library ids; the first, in the first key, opens every run
  keys: string[]
  waves: number           // Infinity: Endless
  dial: { start: number; step: number; floor: number }   // ms before a chord lands
}

// Boss waves play in this order, on one giant monster
export const BOSS_WAVES = [['bl-12-sevenths', 'F'], ['jz-1625', 'Bb'], ['bl-12-sevenths', 'G']] as const

export const STAGES: Stage[] = [
  {
    id: 'triads', title: t`Lantern Path`, concept: t`Major and minor triads`,
    meet: t`A triad is three notes, each a third apart. Lower the middle note by one key and major turns minor.`,
    example: ['I', 'vi'],
    items: ['xp-pop', 'xp-doo-wop', 'xp-rock-blues', 'pp-hopeful', 'pp-tender', 'xp-sentimental', 'xp-minor-pop', 'rk-joyful', 'bl-12-triads'],
    keys: ['C', 'G', 'F'], waves: 5, dial: { start: 7000, step: 500, floor: 3500 },
  },
  {
    id: 'sevenths', title: t`Crooked Bridge`, concept: t`Seventh chords`,
    meet: t`Stack one more third on a triad and you have a seventh chord. It leans towards the next chord, which is why blues and jazz live on them.`,
    example: ['ii7', 'V7', 'Imaj7'],
    items: ['jz-251', 'bl-shuffle', 'jz-walking', 'bl-12-sevenths', 'jz-ii-iii', 'bl-quick-four'],
    keys: ['C', 'F', 'G', 'Bb', 'D'], waves: 5, dial: { start: 7500, step: 500, floor: 4000 },
  },
  {
    id: 'inversions', title: t`Moonlit Stair`, concept: t`Inversions`,
    meet: t`An inversion is the same chord with a different note at the bottom. G/B means a G chord with B as its lowest note, so the bass can walk.`,
    example: ['I', 'V^1', 'vi'],
    items: ['in-climb', 'in-walk-down', 'in-rock', 'in-blues', 'in-jazz', 'in-minor'],
    keys: ALL_KEYS, waves: 6, dial: { start: 8000, step: 500, floor: 4500 },
  },
  {
    id: 'boss', title: t`The Hollow King`, concept: t`A whole progression, in order`,
    meet: t`The king wears a progression across his body. Play it from start to end: each chord you land folds one panel of him flat.`,
    example: ['I7', 'IV7', 'V7'],
    items: BOSS_WAVES.map(([id]) => id), keys: ['F'], waves: BOSS_WAVES.length, dial: { start: 6500, step: 750, floor: 4000 },
  },
  {
    id: 'endless', title: t`Endless Night`, concept: t`Everything so far, faster`,
    meet: t`Every wave you've met, and the night only speeds up. Three chords landing ends it.`,
    example: ['I', 'vi', 'IV', 'V'],
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
