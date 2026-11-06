// ── The Arcade's games: one registry entry per world ──────────────────────────
//
// HOW TO ADD A GAME. Create src/arcade/<game>/ and replace that world's
// `soon(...)` line below with one entry. Nothing else in the Arcade changes:
// Home, the World page, Meet it, the HUD, the keyboard, Results, Run over, stars,
// XP and the saved progress all come from the entry and what the game reports.
//
//   <game>/stages.ts   export const STAGES: StageDef[]   (three 'stage', one 'boss',
//                      one 'endless', in that order; extend StageDef for your dials)
//   <game>/<Game>.tsx  export default function(props: GameProps<YourStage>)
//
// Chord Rush is the worked example: chordRush/stages.ts, chordRush/ChordRush.tsx,
// and the `hollow` entry below. Keep rules in a plain file with no rendering and
// no clock of its own (chordRush/run.ts) so a *Test.ts can drive it.
//
// WHAT A GAME GETS (GameProps). The Arcade owns the screen around it: it draws the
// HUD, the keyboard, the hint pill and Pause, and mounts the game in the space
// above the keyboard. A fresh run is a fresh mount, so a game only ever plays once.
//   stage      the stage to play
//   assist     Assist is on: go easier, and report at most 1 star for a clear
//   paused     Pause is up or the keyboard is unplugged: hold the clock, ignore keys
//   weak       items this player slips on in this concept, worst first: send more
//   hud(patch) score, combo, multiplier, detail, lives. Call it as they change.
//   keys(patch) lit keys. Held keys light by themselves, at once: never draw those.
//   hint(text) the pill above the keyboard, or null
//   miss(id, label?) one slip of one item (a chord, a note). Results, Run over,
//              the weak spot, `weak` and the drill all read these.
//   finish(result) the run is over. Report it once, then stop.
//
// RULES.
//   Music comes from src/arcade/library, never from random notes.
//   Judge by the key's own timestamp, never by frames: onKeyDown() in keys.ts gives
//   (key, stamp, held, velocity), gameClock() in clock.ts turns the stamp into game
//   time, and createJudge() in judge.ts grades notes that are due at a moment.
//   Never invent a number: report only what the run really did.
//   Text is wrapped in t`...`. Art goes in public/arcade/art/.
//   A stage's `id` and an entry's `id` are the keys of saved progress: never rename.
import { lazy, type ComponentType, type LazyExoticComponent, type ReactNode } from 'react'
import { t } from '../utils/i18n'
import type { HudState, KeysState } from './hud'
import { drillSteps } from './chordRush/run'
import { STAGES as HOLLOW_STAGES } from './chordRush/stages'
import { STAGES as KITE_STAGES } from './split/stages'

const ART = './arcade/art'

// One column of Meet it: a chord or shape drawn as a stack
export interface MeetCard {
  label: string
  keys: number[]            // low to high; Hear plays them together
  root: number              // the pitch class to mark in the stack
}

export interface MeetIt {
  text: string
  hear: string              // the Hear button's words
  cards: MeetCard[]
  hearSteps?: number[][]    // what Hear plays instead of the cards, step by step: a scale, a phrase
  tryIt: {
    prompt: string          // "Try one now: play any C chord, any way up"
    keys: number[]          // lit and labelled on the keyboard
    fits: (held: number[]) => boolean
  }
}

export interface StageDef {
  id: string                // saved progress key
  kind: 'stage' | 'boss' | 'endless'
  name: string              // "Seventh chords"
  sub: string               // "Dominant, major and minor sevenths"
  concept: string           // id shared by stages that train the same thing; keys the saved misses
  conceptName: string       // reads after "… slipped": "Seventh chords"
  meet: MeetIt
}

export interface GameResult {
  cleared: boolean
  stars: number             // 0 to 3; 0 unless cleared; at most 1 with Assist
  score: number
  title: string             // the headline: "The village sleeps"
  goal: string | null       // what three stars needs, in this run's own numbers; null hides it
  stats: { label: string; value: string }[]   // shown after Score and Best before
  probes?: { name: string; pcs: number[] }[]  // chords played, for Find it in your library; omit to hide the card
}

export interface GameProps<S extends StageDef = StageDef> {
  stage: S
  assist: boolean
  paused: boolean
  weak: string[]
  hud: (patch: Partial<HudState>) => void
  keys: (patch: Partial<KeysState>) => void
  hint: (text: ReactNode | null) => void
  miss: (id: string, label?: string) => void
  finish: (result: GameResult) => void
}

// One step of the Two-minute drill
export interface DrillStep { label: string; keys: number[]; fits: (held: number[]) => boolean }

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each game has its own stage type
export interface GameDef<S extends StageDef = any> {
  id: string                // the world: saved progress key
  game: string              // "Chord Rush"
  world: string             // "Monster Hollow"
  skill: string             // reads after "Trains": "chord recall"
  description: string
  art: string               // the world card
  scene: string             // World page, and behind Meet it, Results and Run over
  sceneAlt: string
  assist: string            // what Assist does here, for Run over
  figure: { name: string; art: string } | null
  stages: S[]
  Game: LazyExoticComponent<ComponentType<GameProps<S>>> | null   // null: Coming soon
  drill?: (items: string[], stage: S) => DrillStep[]              // omit to hide the Two-minute drill
}

const soon = (id: string, game: string, world: string, skill: string, card: string): GameDef => ({
  id, game, world, skill, description: '', art: `${ART}/${card}`, scene: '', sceneAlt: '', assist: '', figure: null, stages: [], Game: null,
})

export const GAMES: GameDef[] = [
  {
    id: 'hollow',
    game: t`Chord Rush`,
    world: t`Monster Hollow`,
    skill: t`chord recall`,
    description: t`Friendly paper monsters creep toward the village. Each one wears a chord name: play it and the monster folds flat and drifts away. You are the lamplighter, and the lanterns are your lives.`,
    art: `${ART}/card-chord-rush.jpg`,
    scene: `${ART}/scene-monster-hollow.jpg`,
    sceneAlt: t`Monster Hollow: a graveyard path leading to a lantern-lit village at night`,
    assist: t`Monsters walk slower.`,
    figure: { name: t`The Lamplighter`, art: `${ART}/figure-lamplighter.svg` },
    stages: HOLLOW_STAGES,
    Game: lazy(() => import('./chordRush/ChordRush')),
    drill: drillSteps,
  },
  soon('frontier', t`Sight Line`, t`Frontier Express`, t`sight-reading`, 'card-sight-line.svg'),
  soon('orbit', t`Pocket`, t`Orbit Station`, t`timing`, 'card-pocket.jpg'),
  soon('midnight', t`Soft Touch`, t`The Midnight Job`, t`dynamic control`, 'card-soft-touch.jpg'),
  soon('deepsong', t`Echo`, t`Deep Song`, t`ear training`, 'card-echo.jpg'),
  {
    id: 'kites',
    game: t`Split`,
    world: t`Kite Festival`,
    skill: t`hand independence`,
    description: t`A paper kite festival over a seaside town. Your left hand flies the blue kite and your right hand the pink one, each on its own lane, split at middle C. Let either hand fall behind for too long and its kite comes down.`,
    art: `${ART}/card-split.jpg`,
    scene: `${ART}/scene-kite-festival.jpg`,
    sceneAlt: t`Kite Festival: paper kites over a seaside town with bunting`,
    assist: t`Notes slow down, and you can rest one hand at a time.`,
    figure: { name: t`The Kite Flyer`, art: `${ART}/figure-kite-flyer.svg` },
    stages: KITE_STAGES,
    Game: lazy(() => import('./split/Split')),
  },
  soon('summit', t`Scale Climb`, t`The Summit`, t`scales`, 'card-scale-climb.jpg'),
]

// Three stages and a boss, three stars each. Endless has a best, not stars.
export const ratedStages = (def: GameDef): StageDef[] => def.stages.filter(s => s.kind !== 'endless')
export const STARS_PER_WORLD = 12
export const stageOrder = (def: GameDef): string[] => def.stages.map(s => s.id)
