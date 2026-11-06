// ── Which room the band plays in. No three.js here: this runs on every Jam screen ──
import type { JamStyle } from '../band'
import type { BandLevel } from '../reaction'

export const ROOMS = ['studio', 'cafe', 'roadhouse', 'rooftop', 'beach', 'stage', 'space'] as const
export type Room = typeof ROOMS[number]
export type RoomChoice = Room | 'plain'
export type SceneChoice = RoomChoice | 'auto'   // auto: whatever suits the style

const STYLE_ROOM: Record<JamStyle, Room> = { blues: 'roadhouse', jazz: 'cafe', pop: 'studio', rock: 'stage', rnb: 'studio', soul: 'cafe', funk: 'roadhouse', bossa: 'beach', hiphop: 'rooftop', alternative: 'rooftop', ballad: 'cafe' }

export const SCENES: SceneChoice[] = ['auto', ...ROOMS, 'plain']

// What the prefs file says is only trusted once it names a real choice
export const sceneChoice = (saved: unknown): SceneChoice => (SCENES.includes(saved as SceneChoice) ? saved as SceneChoice : 'auto')

export function roomFor(saved: unknown, style: JamStyle): RoomChoice {
  const choice = sceneChoice(saved)
  return choice === 'auto' ? STYLE_ROOM[style] : choice
}

// The next scene along, round and round: direction is 1 or -1
export function stepScene(choice: SceneChoice, direction: number): SceneChoice {
  return SCENES[(SCENES.indexOf(choice) + direction + SCENES.length) % SCENES.length]
}

const MIN_MEMORY_GB = 3
const MIN_CORES = 3

// Chromium rounds deviceMemory, and not every platform reports it: unknown is not low
export const lowEnd = (memoryGb: number | undefined, cores: number | undefined) => (memoryGb ?? Infinity) < MIN_MEMORY_GB || (cores ?? Infinity) < MIN_CORES

const SLOW_FRAME_MS = 50

// Many frames at this pace mean the device can't afford a scene behind the band
export const tooSlow = (frames: number, ms: number) => ms / frames > SLOW_FRAME_MS

const LEVEL_LIFT = 0.07
const LOUD_LIFT = 0.16
const BEAT_LIFT = 0.1
const BEAT_FADE_SEC = 0.16

// How bright the room is right now. Kept small so it can't flash at any tempo
export function roomLight(sinceBeatSec: number, loud: number, level: BandLevel): number {
  return 0.9 + LEVEL_LIFT * level + LOUD_LIFT * loud + BEAT_LIFT * Math.exp(-sinceBeatSec / BEAT_FADE_SEC)
}
