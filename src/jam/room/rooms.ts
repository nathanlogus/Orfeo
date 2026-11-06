// ── The three rooms, as data: what stands where, and what glows or drifts ─────
import type { Placement } from '../../arcade/engine/stage'
import type { Room } from './roomChoice'

export type MoteKind = 'glow' | 'neon' | 'sway' | 'dust' | 'haze' | 'steam' | 'drop' | 'beam' | 'spark' | 'meter' | 'twinkle' | 'bulb' | 'fire' | 'ember' | 'wave' | 'star' | 'pump' | 'pass'

// Anything soft and lit: lamp halos and dust alike share one draw call. w and h are how far it roams
export interface Mote { kind: MoteKind; x: number; y: number; z: number; size: number; color: string; strength: number; seed: number; w: number; h: number; on?: string }

// Touching this spot does something: `does` names a poke, a toggle, or sparks. r is in pixels at 720 high
export interface Hotspot { x: number; y: number; z: number; r: number; does: string }

export interface RoomSpec {
  stage: Placement[]    // paper, lit by the room
  lit: Placement[]      // lamps and glass: their own light, one draw call
  signal: Placement[]   // neon and tally lights: same, and they can flicker on their own
  buzz: number          // how far the signal dips when it flickers; 0 never does
  dim?: number          // lamps, glass and backdrops under the room's light; 1 by default
  swing?: { x: number; y: number; z: number }  // one lamp hangs loose from here
  motes: Mote[]
  ambient: { sky: string; ground: string; intensity: number }
  key: { color: string; intensity: number; from: [number, number, number] }
  hot: Hotspot[]        // what the player can touch
  idle: string[]        // pokes that happen by themselves now and then
  actor?: { model: string; from: [number, number, number]; to: [number, number, number]; secs: number }  // crosses the room on the poke 'actor', drawn only then
  figures?: { model: string; at: [number, number][] }  // one draw call of people, moving on the beat
  spin?: { model: string; x: number; y: number; z: number }  // turns slowly
}

const WALL_Z = -3

const mote = (kind: MoteKind, x: number, y: number, z: number, size: number, color: string, strength: number, w = 0, h = 0, seed = x * 1.7 + y * 3.1): Mote =>
  ({ kind, x, y, z, size, color, strength, seed, w, h })
const on = (name: string, m: Mote): Mote => ({ ...m, on: name })
const halo = (x: number, y: number, z: number, size: number, color: string, strength: number) => mote('glow', x, y, z, size, color, strength)

// A fixed scatter, so a still frame is the same every time
function scatter(count: number, make: (a: number, b: number, c: number, i: number) => Mote): Mote[] {
  return Array.from({ length: count }, (_, i) => make((i * 0.618034) % 1, (i * 0.754877) % 1, (i * 0.56984) % 1, i))
}

const dust = (count: number, color: string, strength: number) => scatter(count, (a, b, c, i) =>
  mote('dust', -11 + a * 22, 0.8 + b * 8, -2 + c * 4, 0.1 + c * 0.1, color, strength, 0.9, 0.5, i * 2.1))

// Soft beams from the ceiling: `reach` long, sweeping `sweep` radians either way
const beam = (x: number, y: number, z: number, width: number, reach: number, sweep: number, color: string, strength: number) => mote('beam', x, y, z, width, color, strength, sweep, reach)

// A low flat glow on the floor, where lamp light lands
const pool = (x: number, z: number, size: number, color: string, strength: number, kind: MoteKind = 'glow') => mote(kind, x, 0.05, z, size, color, strength, 0, 0.22)

// Light motes that lift off from here when the band is at its strongest
const sparks = (count: number, x: number, y: number, z: number, color: string) => scatter(count, (a, b, c, i) =>
  mote('spark', x, y, z, 0.12 + c * 0.14, color, 0.8, 1.2 + a * 1.8, 1 + b * 1.8, i * 2.4))

const STUDIO: RoomSpec = {
  stage: [
    { model: 'wall', x: 0, z: WALL_Z },
    { model: 'floor', x: 0, z: WALL_Z },
    { model: 'booth_frame', x: 7, z: -2.6, y: 0.7, size: 0.8 },
    { model: 'booth_inside', x: 7, z: -2.75, y: 0.7, size: 0.8 },
    ...[-9.4, -7.1].flatMap(x => [3.9, 1.7].map(y => ({ model: 'foam', x, y, z: -2.92 }))),
    { model: 'rug_stripes', x: -1.6, z: -0.2, size: 2.2 },
    { model: 'sofa', x: -1.6, z: -1.9, size: 1.7 },
    { model: 'lamp_standing', x: -5.1, z: -2, size: 1.7 },
    { model: 'guitar', x: 1.2, z: -2.9, y: 2.9, size: 1.3 },
    { model: 'amp', x: -9.4, z: -1.6, turn: 0.25 },
    { model: 'mic_stand', x: -7.4, z: -0.6, turn: Math.PI },
    { model: 'mic_stand', x: 8, z: -0.4, turn: 0.15 },
    { model: 'cabinet', x: 10.4, z: -1.6, size: 1.7 },
    { model: 'lamp_table', x: 10.4, z: -1.6, y: 1.7, size: 1.2 },
    { model: 'amp', x: 3.2, z: -1.4, turn: -0.3 },
    { model: 'mixer', x: 7, z: -1.5, size: 0.9 },
    { model: 'plant', x: 1.6, z: -2, size: 1.5 },
  ],
  lit: [
    { model: 'booth_glass', x: 7, z: -2.9, y: 0.7, size: 0.8 },
  ],
  signal: [
    { model: 'booth_lights', x: 7, z: -2.6, y: 0.7, size: 0.8 },
    { model: 'tally', x: 8.8, z: -2.5, y: 4.6, size: 0.6 },
  ],
  buzz: 0,
  motes: [
    beam(-1.6, 11, 0, 2.6, 13, 0.16, '#a8d0ff', 0.1),
    beam(3.2, 11, 0.5, 2.2, 13, 0.14, '#ffd8a0', 0.09),
    pool(-5.1, -0.8, 7, '#ffcf8a', 0.16),
    mote('meter', 4.8, 1.95, -2.72, 0.26, '#8cf08c', 0.4, 0, 1.1, 1),
    mote('meter', 5.5, 1.95, -2.72, 0.26, '#8cf08c', 0.4, 0, 1.1, 2.4),
    mote('meter', 8.5, 1.95, -2.72, 0.26, '#ffc060', 0.4, 0, 1.1, 3.7),
    mote('meter', 9.2, 1.95, -2.72, 0.26, '#ffc060', 0.4, 0, 1.1, 5.2),
    on('tally', halo(8.8, 4.6, -2.4, 2.2, '#ff4a4a', 0.32)),
    ...sparks(12, 7, 2.1, -1.6, '#b8fff0'),
    halo(7, 2.9, -2, 10, '#59d8c8', 0.26),
    on('lamps', halo(-5.1, 3.8, -1, 7, '#ffcf8a', 0.55)),
    on('lamps', halo(10.4, 2.4, -0.9, 5, '#ffcf8a', 0.5)),
    mote('pump', -9.4, 1, -0.9, 3, '#ffe0c0', 0.3),
    mote('pump', 3.2, 1, -0.7, 3, '#ffe0c0', 0.3),
    ...dust(26, '#ffe6bc', 0.34),
  ],
  ambient: { sky: '#b8bce0', ground: '#3a3048', intensity: 1.5 },
  key: { color: '#ffe2c0', intensity: 1.5, from: [-5, 12, 12] },
  hot: [
    { x: -5.1, y: 3.9, z: -2, r: 70, does: 'lamps' },
    { x: 8.8, y: 4.6, z: -2.5, r: 45, does: 'tally' },
    { x: -9.4, y: 1.1, z: -1.6, r: 70, does: 'pump' },
    { x: 3.2, y: 1.1, z: -1.4, r: 70, does: 'pump' },
  ],
  actor: { model: 'engineer', from: [3.8, 0.8, -2.84], to: [10.2, 0.8, -2.84], secs: 12 },
  idle: ['actor'],
}

const WINDOW_LEFT = -9.1
const WINDOW_RIGHT = -3.4
const WINDOW_LOW = 0.5
const WINDOW_HEIGHT = 4.3
const CAFE_LAMP = [7.2, 4.8, -0.2]
const CAFE_SWING = { x: -1.8, y: 4.8, z: -0.8 }

const CAFE: RoomSpec = {
  stage: [
    { model: 'wall', x: 0, z: WALL_Z },
    { model: 'floor', x: 0, z: WALL_Z },
    { model: 'pane_frame', x: -6.25, z: -2.6, y: 0.4, size: 0.8 },
    { model: 'counter', x: 7.4, z: -2.2 },
    { model: 'jar', x: 5, z: -2.2, y: 2.5, size: 1.5 },
    { model: 'jar_wide', x: 6, z: -2.3, y: 2.5, size: 1.5 },
    { model: 'jar_small', x: 7, z: -2.1, y: 2.5, size: 1.5 },
    { model: 'plant_small', x: 9.2, z: -2.1, y: 2.5, size: 1.5 },
    { model: 'shelf', x: 9, z: -3, y: 4.6, size: 1.4 },
    { model: 'books', x: 8.6, z: -2.65, y: 5, size: 1.3 },
    { model: 'frame', x: 5, z: -3, y: 4.2, size: 1.3 },
    ...[[-6.4, -1], [1.6, -1.2]].flatMap(([x, z]) => [
      { model: 'cafe_table', x, z, size: 1.7 },
      { model: 'chair', x: x - 2, z: z + 0.2, turn: 1.4, size: 1.8 },
      { model: 'chair_alt', x: x + 2, z: z + 0.1, turn: -1.5, size: 1.8 },
    ]),
    { model: 'cup', x: -6.6, z: -0.8, y: 1.7, size: 1.6 },
    { model: 'menu', x: -5.8, z: -1.1, y: 1.7, size: 1.3 },
    { model: 'cup', x: 1.6, z: -1, y: 1.7, size: 1.6 },
  ],
  lit: [
    { model: 'pane_night', x: -6.25, z: -2.9, y: 0.4, size: 0.8 },
    { model: 'skyline', x: -6.25, z: -2.8, y: 0.4, size: 0.8 },
    { model: 'lamp_hanging', x: CAFE_LAMP[0], y: CAFE_LAMP[1], z: CAFE_LAMP[2] },
    { model: 'lamp_shine', x: CAFE_LAMP[0], y: CAFE_LAMP[1] - 0.42, z: CAFE_LAMP[2] },
  ],
  signal: [],
  buzz: 0,
  swing: CAFE_SWING,
  motes: [
    on('lamps', halo(CAFE_LAMP[0], CAFE_LAMP[1] - 0.6, CAFE_LAMP[2] + 1.1, 8, '#ffbe78', 0.62)),
    on('swing', mote('sway', CAFE_SWING.x, CAFE_SWING.y - 0.6, CAFE_SWING.z + 1.1, 8, '#ffbe78', 0.62)),
    pool(CAFE_LAMP[0], CAFE_LAMP[2], 8, '#ffbe78', 0.2),
    pool(CAFE_SWING.x, CAFE_SWING.z, 8, '#ffbe78', 0.2, 'sway'),
    ...sparks(10, CAFE_LAMP[0], CAFE_LAMP[1] - 1, CAFE_LAMP[2] + 1.2, '#ffe0b0'),
    ...([[-8.2, 2.7, '#ffd080'], [-7.1, 2.1, '#ff8a70'], [-5.2, 2.4, '#ffd080'], [-4.1, 3.1, '#80c0ff']] as const).map(([x, y, color]) => halo(x, y, -2.75, 0.9, color, 0.7)),
    ...scatter(26, (a, b, c, i) => mote('drop', WINDOW_LEFT + a * (WINDOW_RIGHT - WINDOW_LEFT), WINDOW_LOW + WINDOW_HEIGHT - 0.5, -2.72, 0.09 + c * 0.05, '#bcd4ff', 0.5 + b * 0.3, 0, WINDOW_HEIGHT - 0.8, i * 1.3)),
    ...scatter(7, (_a, _b, _c, i) => on('steam', mote('steam', -6.6, 2.3, -0.8, 0.34, '#ffefdc', 0.16, 0.18, 1.6, i / 7))),
    ...dust(14, '#ffd8a0', 0.28),
  ],
  ambient: { sky: '#ffc8a0', ground: '#3a2028', intensity: 0.95 },
  key: { color: '#ffd2a0', intensity: 1.05, from: [3, 12, 12] },
  hot: [
    { x: -6.6, y: 2, z: -0.8, r: 60, does: 'steam' },
    { x: CAFE_LAMP[0], y: CAFE_LAMP[1] - 0.2, z: CAFE_LAMP[2], r: 70, does: 'lamps' },
    { x: CAFE_SWING.x, y: CAFE_SWING.y - 0.2, z: CAFE_SWING.z, r: 70, does: 'swing' },
  ],
  actor: { model: 'cat', from: [3.4, 2.5, -2], to: [11.4, 2.5, -2], secs: 11 },
  idle: ['actor'],
}

const SIGN_Y = 3.5
const SIGN_SIZE = 0.85
const BAR_LAMP = 9.6
const BAR_SWING = { x: 5, y: 4.8, z: -0.8 }
const bottles = (y: number, row: [number, string][]) => row.map(([x, model]) => ({ model, x, z: -2.6, y, size: 1.3 }))

const ROADHOUSE: RoomSpec = {
  stage: [
    { model: 'wall', x: 0, z: WALL_Z },
    { model: 'floor', x: 0, z: WALL_Z },
    { model: 'sign_board', x: -6.6, z: -2.9, y: SIGN_Y, size: SIGN_SIZE },
    { model: 'bar', x: 6.8, z: -1.6, size: 0.85 },
    { model: 'back_shelf', x: 6.6, z: -2.6, y: 3 },
    ...[1.9, 3.8, 5.7, 7.6, 9.5].map(x => ({ model: 'bar_stool', x, z: -0.2 })),
    ...bottles(3.07, [[3.2, 'bottle_tall'], [4.2, 'bottle'], [5.2, 'bottle_wide'], [6.4, 'bottle_fat'], [7.6, 'bottle_tall'], [8.6, 'bottle_wide'], [9.8, 'bottle']]),
    ...bottles(4.57, [[3.6, 'bottle_wide'], [5, 'bottle_tall'], [6.2, 'bottle'], [8, 'bottle_fat'], [9.2, 'bottle']]),
    { model: 'bottle', x: 2, z: -1.6, y: 2.4, size: 1.1 },
    { model: 'barrel', x: -10.2, z: -1.8, size: 1.3 },
    { model: 'barrel_small', x: -4.2, z: -2, size: 1.5 },
    { model: 'keg', x: -8.4, z: -0.4, size: 0.95, turn: 0.4 },
    { model: 'stool_table', x: -1.4, z: -0.6, size: 1.6 },
    { model: 'bottle_tall', x: -1.4, z: -0.6, y: 1.6, size: 1.1 },
    { model: 'bar_stool', x: 0.2, z: -0.4, size: 0.8 },
    { model: 'bar_stool', x: -3, z: -0.2, size: 0.8 },
    { model: 'guitar_alt', x: -0.6, z: -2.9, y: 2.9, size: 1.3 },
  ],
  lit: [
    { model: 'lamp_hanging', x: BAR_LAMP, y: 4.8, z: -0.8 },
    { model: 'lamp_shine', x: BAR_LAMP, y: 4.38, z: -0.8 },
  ],
  signal: [
    { model: 'sign_pink', x: -6.6, z: -2.78, y: SIGN_Y, size: SIGN_SIZE },
    { model: 'sign_blue', x: -6.6, z: -2.78, y: SIGN_Y, size: SIGN_SIZE },
  ],
  buzz: 0.55,
  swing: BAR_SWING,
  motes: [
    on('neon', mote('neon', -6.9, SIGN_Y + 0.1, -2.4, 7, '#ff5fa2', 0.3)),
    on('neon', mote('neon', -6.6, SIGN_Y, -2.5, 10, '#56d8ff', 0.16)),
    on('lamps', halo(BAR_LAMP, 4.2, 0.4, 7, '#ffb060', 0.55)),
    on('swing', mote('sway', BAR_SWING.x, 4.2, 0.4, 7, '#ffb060', 0.55)),
    pool(BAR_LAMP, -0.4, 7, '#ffb060', 0.14),
    pool(BAR_SWING.x, -0.4, 7, '#ffb060', 0.14, 'sway'),
    beam(-1, 11, 0, 2.4, 13, 0.18, '#ff8ab8', 0.08),
    ...sparks(12, -6.6, SIGN_Y - 1.2, -2.2, '#ffa8d0'),
    ...scatter(10, (a, b, c, i) => mote('haze', -9 + a * 18, 2.5 + b * 5.5, 0.5 + c * 2, 7 + c * 5, '#c88a70', 0.045, 16, 0.6, i * 1.9)),
    ...dust(12, '#ffcfa0', 0.24),
  ],
  ambient: { sky: '#c88a80', ground: '#2a1420', intensity: 0.72 },
  key: { color: '#ffb890', intensity: 0.85, from: [6, 12, 11] },
  hot: [
    { x: -6.6, y: SIGN_Y, z: -2.9, r: 110, does: 'neon' },
    { x: BAR_SWING.x, y: BAR_SWING.y - 0.3, z: BAR_SWING.z, r: 60, does: 'swing' },
    { x: BAR_LAMP, y: 4.5, z: -0.8, r: 60, does: 'lamps' },
  ],
  actor: { model: 'cat', from: [0.6, 2.42, -1.6], to: [13, 2.42, -1.6], secs: 16 },
  idle: ['actor'],
}

const sagAt = (x: number) => 5.2 - Math.sin(Math.PI * Math.abs(x) / 11)

const ROOFTOP: RoomSpec = {
  stage: [
    { model: 'deck', x: 0, z: WALL_Z },
    { model: 'parapet', x: 0, z: WALL_Z },
    { model: 'poles', x: 0, z: -2.4 },
    { model: 'rug_oval', x: -3.4, z: -0.6, size: 1.6 },
    { model: 'sofa', x: -3.6, z: -1.7, size: 1.5 },
    { model: 'table_low', x: -3.6, z: 0.1, size: 1 },
    { model: 'lamp_standing', x: -7.6, z: -2, size: 1.4 },
    { model: 'chair_alt', x: 5.6, z: -1.1, size: 1.6, turn: -0.5 },
    { model: 'chair_alt', x: 8.6, z: -1.3, size: 1.6, turn: 0.5 },
    { model: 'plant', x: 7.1, z: -2.2, size: 1.5 },
    { model: 'plant', x: 1.4, z: -2.2, size: 1.5 },
  ],
  lit: [
    { model: 'sky', x: 0, z: -11 },
    { model: 'moon', x: 9.6, z: -10.4, y: 5.4 },
    { model: 'city_far', x: 0, z: -8 },
    { model: 'city_near', x: 0, z: -6 },
    { model: 'windows', x: 0, z: -5.74 },
    { model: 'wire', x: 0, z: -2.4 },
  ],
  signal: [{ model: 'billboard', x: -3.2, z: -5.7, y: 3.2 }],
  buzz: 0.5,
  motes: [
    halo(9.6, 5.4, -10.2, 6, '#cfd8ff', 0.3),
    mote('neon', -3.2, 3.2, -5.4, 4.5, '#ff5fa2', 0.22),
    on('lamps', halo(-7.6, 3.2, -1, 6, '#ffcf8a', 0.5)),
    pool(-5, -0.4, 8, '#ffcf8a', 0.12),
    ...Array.from({ length: 21 }, (_, i) => -10 + i).map(x => on('ripple', mote('bulb', x, sagAt(x) - 0.12, -2.3, 0.5, '#ffd9a0', 0.8))),
    ...scatter(26, (a, b, c, i) => mote('twinkle', -12 + a * 24, 1.8 + b * 2.4, -5.5, 0.22, c > 0.7 ? '#a8d0ff' : '#ffd890', 0.7, 0, 0, i * 1.7)),
    ...scatter(34, (a, b, _c, i) => mote('twinkle', -15 + a * 30, 5 + b * 5, -10.6, 0.18, '#dfe6ff', 0.7, 0, 0, i * 2.3)),
    on('streak', mote('pass', -14, 9, -10.2, 0.2, '#ffffff', 1.2, 22, -3.5, 1.3)),
    on('car', mote('pass', -18, 1.9, -7, 0.3, '#ffe6b0', 1, 36, 0, 7)),
    ...sparks(10, 0, 4.4, -2, '#ffe0a8'),
    ...dust(8, '#ffe6bc', 0.2),
  ],
  ambient: { sky: '#8a96e0', ground: '#2a2440', intensity: 1.15 },
  key: { color: '#d8dcff', intensity: 1.1, from: [5, 12, 12] },
  hot: [
    { x: 0, y: 4.4, z: -2.4, r: 90, does: 'ripple' },
    { x: 9.6, y: 5.4, z: -10.4, r: 70, does: 'streak' },
    { x: -7.6, y: 3.6, z: -2, r: 60, does: 'lamps' },
  ],
  idle: ['streak', 'car'],
}

const SHORE = '#ffe6c8'

const BEACH: RoomSpec = {
  dim: 0.8,
  stage: [
    { model: 'sand', x: 0, z: WALL_Z },
    { model: 'log', x: -5.8, z: 0, turn: 0.3 },
    { model: 'log', x: 1.4, z: -0.4, turn: -0.5 },
    { model: 'bonfire', x: -2.2, z: -0.8 },
    { model: 'rock_low', x: 8.6, z: -1.6 },
    { model: 'rock_low', x: -9.6, z: -1.2, size: 1.4 },
    { model: 'umbrella', x: 7, z: -1.6, size: 1.1 },
    { model: 'guitar', x: 2.8, z: -0.8, y: 1.6, size: 1.05, turn: 0.2 },
  ],
  lit: [
    { model: 'dusk', x: 0, z: -11 },
    { model: 'sun', x: -5.4, z: -10.4, y: 2.9 },
    { model: 'sea', x: 0, z: -6 },
    { model: 'palms', x: -9.6, z: -3.2 },
    { model: 'palms', x: 11, z: -3.6, size: 0.86 },
  ],
  signal: [{ model: 'coals', x: -2.2, z: -0.8 }],
  buzz: 0.25,
  motes: [
    halo(-5.4, 3.1, -10.2, 11, '#ffb060', 0.42),
    ...scatter(14, (a, b, _c, i) => on('swell', mote('wave', -13 + a * 26, 2.15 - b * 1.1, -5.6, 0.1, SHORE, 0.34, 4 + a * 3, 0.16, i * 0.37))),
    ...scatter(5, (_a, _b, _c, i) => mote('fire', -2.2 + (i - 2) * 0.14, 1 + (i % 3) * 0.28, -0.2, 1.3 - i * 0.12, i % 2 ? '#ff9a3a' : '#ffc860', 0.55, 0, 0, i * 1.3)),
    halo(-2.2, 1.5, 0, 9, '#ff9a4a', 0.34),
    pool(-2.2, 0.6, 12, '#ff9a4a', 0.2),
    ...scatter(16, (a, _b, c, i) => mote('ember', -2.2 + (a - 0.5) * 0.8, 1.2, -0.3, 0.1 + c * 0.08, '#ffb060', 0.9, 0.9, 4.2, i * 0.61)),
    ...sparks(14, -2.2, 1.6, 0, '#ffd090'),
    ...scatter(12, (a, b, _c, i) => mote('twinkle', -14 + a * 28, 6.4 + b * 3, -10.6, 0.16, '#fff0dc', 0.6, 0, 0, i * 3.1)),
  ],
  ambient: { sky: '#ffb890', ground: '#3a2440', intensity: 1.1 },
  key: { color: '#ffb080', intensity: 1.15, from: [8, 7, 12] },
  hot: [
    { x: -2.2, y: 1.2, z: -0.4, r: 80, does: 'sparks' },
    { x: 7, y: 1.5, z: -6, r: 150, does: 'swell' },
  ],
  actor: { model: 'gull', from: [-17, 5.6, -7], to: [17, 6.6, -7], secs: 15 },
  idle: ['actor'],
}

const STAGE_FRONT = 0.7
const FANS = Array.from({ length: 19 }, (_, i): [number, number] => [-11.4 + i * 1.27 + (i % 3) * 0.2, STAGE_FRONT + (i % 2) * 0.5 + (i % 3) * 0.1])
const CANS = [-8, -4.8, -1.6, 1.6, 4.8, 8]
const CAN_COLORS = ['#ff4f9a', '#4fb4ff', '#ffc04f', '#7fff9a', '#b47fff', '#ff7f4f']

const CONCERT: RoomSpec = {
  stage: [
    { model: 'curtain', x: 0, z: WALL_Z },
    { model: 'riser', x: 0, z: WALL_Z },
    { model: 'amp_stack', x: -8.6, z: -2.2, y: 1.1 },
    { model: 'amp_stack', x: -6.2, z: -2.2, y: 1.1 },
    { model: 'amp_stack', x: 6.2, z: -2.2, y: 1.1 },
    { model: 'amp_stack', x: 8.6, z: -2.2, y: 1.1 },
    { model: 'drums', x: 0, z: -2, y: 1.1 },
    { model: 'mic_stand', x: -3.4, z: -0.9, y: 1.1, size: 0.72, turn: Math.PI },
    { model: 'mic_stand', x: 3.4, z: -0.9, y: 1.1, size: 0.72 },
    { model: 'truss', x: 0, z: -1.5, y: 5.1 },
    { model: 'truss', x: 0, z: -1.5, y: 5.75 },
    { model: 'guitar', x: 4.8, z: -1.2, y: 2.5, size: 1.05 },
  ],
  lit: [{ model: 'logo_wall', x: 0, z: -2.9 }],
  signal: CANS.map(x => ({ model: 'can', x, z: -1.5, y: 4.95 })),
  buzz: 0,
  figures: { model: 'fan', at: FANS },
  motes: [
    ...CANS.map((x, i) => on('beams', beam(x, 4.8, -1, 1.5, 9.4, 0.26, CAN_COLORS[i], 0.2))),
    ...CANS.map((x, i) => halo(x, 4.85, -1.2, 1.7, CAN_COLORS[i], 0.6)),
    ...scatter(12, (a, b, c, i) => mote('haze', -9 + a * 18, 1.4 + b * 3, -1.5 + c * 2, 6 + c * 4, '#a890d0', 0.06, 16, 0.5, i * 1.9)),
    mote('pump', -8.6, 2.3, -1.5, 3.2, '#ffe0c0', 0.3),
    mote('pump', 8.6, 2.3, -1.5, 3.2, '#ffe0c0', 0.3),
    ...sparks(14, 0, 3.4, -0.6, '#ffffff'),
    ...dust(8, '#e0d0ff', 0.2),
  ],
  ambient: { sky: '#7a70c0', ground: '#201830', intensity: 0.95 },
  key: { color: '#c0c8ff', intensity: 0.95, from: [-3, 12, 12] },
  hot: [
    { x: -8.6, y: 2.2, z: -2.2, r: 80, does: 'pump' },
    { x: 8.6, y: 2.2, z: -2.2, r: 80, does: 'pump' },
    { x: -5, y: 5.3, z: -1.5, r: 120, does: 'beams' },
    { x: 5, y: 5.3, z: -1.5, r: 120, does: 'beams' },
    { x: 0, y: 2.6, z: -2, r: 70, does: 'sparks' },
  ],
  actor: { model: 'roadie', from: [-11, 1.1, -1.9], to: [11, 1.1, -1.9], secs: 13 },
  idle: ['actor'],
}

const PLANET = { x: 7.4, y: 2.9, z: -8 }
const PORTHOLE_LEFT = -10.5

const SPACE: RoomSpec = {
  stage: [
    { model: 'hull', x: 0, z: WALL_Z },
    { model: 'floor', x: 0, z: WALL_Z },
    { model: 'rug', x: -2.6, z: -0.2, size: 2 },
    { model: 'sofa', x: -2.6, z: -1.5, size: 1.6, turn: 0 },
    { model: 'desk', x: -9.4, z: -1.9 },
    { model: 'desk', x: 8.8, z: -1.9 },
    { model: 'crates', x: 5, z: -1.8, size: 1.1 },
    { model: 'cargo', x: 11, z: -0.9, size: 1 },
    { model: 'plant', x: 1.8, z: -1.9, size: 1.4 },
  ],
  lit: [
    { model: 'void', x: 0, z: -10 },
    { model: 'porthole', x: 0, z: -2.7 },
  ],
  signal: [
    { model: 'desk_lights', x: -9.4, z: -1.9 },
    { model: 'desk_lights', x: 8.8, z: -1.9 },
  ],
  buzz: 0.15,
  spin: { model: 'planet', ...PLANET },
  motes: [
    halo(PLANET.x, PLANET.y, PLANET.z - 1.5, 12, '#5a90ff', 0.26),
    ...scatter(46, (a, b, c, i) => mote('star', PORTHOLE_LEFT - 3 + a * 8, 0.6 + b * 6.4, -9.4, 0.12 + c * 0.14, c > 0.7 ? '#bcd4ff' : '#ffffff', 0.8, 28, 0, i * 0.73)),
    on('streak', mote('pass', -12, 6, -9, 0.2, '#e8f0ff', 1.3, 20, -3, 1.2)),
    halo(-9.4, 2.1, -1.2, 4, '#4fe3cf', 0.32),
    halo(8.8, 2.1, -1.2, 4, '#ff9a4f', 0.28),
    pool(-2.6, 0.4, 9, '#7a9aff', 0.12),
    ...sparks(12, -9.4, 2, -1.2, '#b8fff0'),
    ...dust(8, '#c8d8ff', 0.2),
  ],
  ambient: { sky: '#8aa0e8', ground: '#1a1a34', intensity: 1.15 },
  key: { color: '#b8c8ff', intensity: 1.15, from: [2, 12, 13] },
  hot: [
    { x: PLANET.x, y: PLANET.y, z: PLANET.z, r: 110, does: 'spin' },
    { x: -6.5, y: 3.6, z: -8, r: 90, does: 'streak' },
    { x: -9.4, y: 1.8, z: -1.9, r: 70, does: 'neon' },
  ],
  actor: { model: 'satellite', from: [-16, 4.8, -8.6], to: [16, 2.2, -8.6], secs: 26 },
  idle: ['actor', 'streak'],
}

export const ROOM_SPECS: Record<Room, RoomSpec> = { studio: STUDIO, cafe: CAFE, roadhouse: ROADHOUSE, rooftop: ROOFTOP, beach: BEACH, stage: CONCERT, space: SPACE }
