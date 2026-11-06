// ── The three rooms, as data: what stands where, and what glows or drifts ─────
import type { Placement } from '../../arcade/engine/stage'
import type { Room } from './roomChoice'

export type MoteKind = 'glow' | 'neon' | 'sway' | 'dust' | 'haze' | 'steam' | 'drop' | 'beam' | 'spark' | 'meter'

// Anything soft and lit: lamp halos and dust alike share one draw call. w and h are how far it roams
export interface Mote { kind: MoteKind; x: number; y: number; z: number; size: number; color: string; strength: number; seed: number; w: number; h: number }

export interface RoomSpec {
  stage: Placement[]    // paper, lit by the room
  lit: Placement[]      // lamps and glass: their own light, one draw call
  signal: Placement[]   // neon and tally lights: same, and they can flicker on their own
  buzz: number          // how far the signal dips when it flickers; 0 never does
  swing?: { x: number; y: number; z: number }  // one lamp hangs loose from here
  motes: Mote[]
  ambient: { sky: string; ground: string; intensity: number }
  key: { color: string; intensity: number; from: [number, number, number] }
}

const WALL_Z = -3

const mote = (kind: MoteKind, x: number, y: number, z: number, size: number, color: string, strength: number, w = 0, h = 0, seed = x * 1.7 + y * 3.1): Mote =>
  ({ kind, x, y, z, size, color, strength, seed, w, h })
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
    { model: 'rug_rectangle_stripes_A', x: -1.6, z: -0.2, size: 2.2 },
    { model: 'couch_pillows', x: -1.6, z: -1.9, size: 1.7 },
    { model: 'lamp_standing', x: -5.1, z: -2, size: 1.7 },
    { model: 'guitar_A', x: 1.2, z: -2.9, y: 2.9, size: 1.3 },
    { model: 'amp', x: -9.4, z: -1.6, turn: 0.25 },
    { model: 'mic_stand', x: -7.4, z: -0.6, turn: Math.PI },
    { model: 'mic_stand', x: 8, z: -0.4, turn: 0.15 },
    { model: 'cabinet_small', x: 10.4, z: -1.6, size: 1.7 },
    { model: 'lamp_table', x: 10.4, z: -1.6, y: 1.7, size: 1.2 },
    { model: 'amp', x: 3.2, z: -1.4, turn: -0.3 },
    { model: 'cactus_medium_A', x: 1.6, z: -2, size: 1.5 },
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
    halo(8.8, 4.6, -2.4, 2.2, '#ff4a4a', 0.32),
    ...sparks(12, 7, 2.1, -1.6, '#b8fff0'),
    halo(7, 2.9, -2, 10, '#59d8c8', 0.26),
    halo(-5.1, 3.8, -1, 7, '#ffcf8a', 0.55),
    halo(10.4, 2.4, -0.9, 5, '#ffcf8a', 0.5),
    ...dust(26, '#ffe6bc', 0.34),
  ],
  ambient: { sky: '#b8bce0', ground: '#3a3048', intensity: 1.5 },
  key: { color: '#ffe2c0', intensity: 1.5, from: [-5, 12, 12] },
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
    { model: 'jar_A_medium', x: 5, z: -2.2, y: 2.5, size: 1.5 },
    { model: 'jar_B_medium', x: 6, z: -2.3, y: 2.5, size: 1.5 },
    { model: 'jar_C_small', x: 7, z: -2.1, y: 2.5, size: 1.5 },
    { model: 'cactus_small_A', x: 9.2, z: -2.1, y: 2.5, size: 1.5 },
    { model: 'shelf_A_big', x: 9, z: -3, y: 4.6, size: 1.4 },
    { model: 'book_set', x: 8.6, z: -2.65, y: 5, size: 1.3 },
    { model: 'pictureframe_medium', x: 5, z: -3, y: 4.2, size: 1.3 },
    ...[[-6.4, -1], [1.6, -1.2]].flatMap(([x, z]) => [
      { model: 'table_round_A_small', x, z, size: 1.7 },
      { model: 'chair_A', x: x - 2, z: z + 0.2, turn: 1.4, size: 1.8 },
      { model: 'chair_B', x: x + 2, z: z + 0.1, turn: -1.5, size: 1.8 },
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
    halo(CAFE_LAMP[0], CAFE_LAMP[1] - 0.6, CAFE_LAMP[2] + 1.1, 8, '#ffbe78', 0.62),
    mote('sway', CAFE_SWING.x, CAFE_SWING.y - 0.6, CAFE_SWING.z + 1.1, 8, '#ffbe78', 0.62),
    pool(CAFE_LAMP[0], CAFE_LAMP[2], 8, '#ffbe78', 0.2),
    pool(CAFE_SWING.x, CAFE_SWING.z, 8, '#ffbe78', 0.2, 'sway'),
    ...sparks(10, CAFE_LAMP[0], CAFE_LAMP[1] - 1, CAFE_LAMP[2] + 1.2, '#ffe0b0'),
    ...([[-8.2, 2.7, '#ffd080'], [-7.1, 2.1, '#ff8a70'], [-5.2, 2.4, '#ffd080'], [-4.1, 3.1, '#80c0ff']] as const).map(([x, y, color]) => halo(x, y, -2.75, 0.9, color, 0.7)),
    ...scatter(26, (a, b, c, i) => mote('drop', WINDOW_LEFT + a * (WINDOW_RIGHT - WINDOW_LEFT), WINDOW_LOW + WINDOW_HEIGHT - 0.5, -2.72, 0.09 + c * 0.05, '#bcd4ff', 0.5 + b * 0.3, 0, WINDOW_HEIGHT - 0.8, i * 1.3)),
    ...scatter(7, (_a, _b, _c, i) => mote('steam', -6.6, 2.3, -0.8, 0.34, '#ffefdc', 0.16, 0.18, 1.6, i / 7)),
    ...dust(14, '#ffd8a0', 0.28),
  ],
  ambient: { sky: '#ffc8a0', ground: '#3a2028', intensity: 1.1 },
  key: { color: '#ffd2a0', intensity: 1.3, from: [3, 12, 12] },
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
    ...bottles(3.07, [[3.2, 'bottle_A_brown'], [4.2, 'bottle_A_green'], [5.2, 'bottle_B_brown'], [6.4, 'bottle_C_green'], [7.6, 'bottle_A_brown'], [8.6, 'bottle_B_brown'], [9.8, 'bottle_A_green']]),
    ...bottles(4.57, [[3.6, 'bottle_B_brown'], [5, 'bottle_A_brown'], [6.2, 'bottle_A_green'], [8, 'bottle_C_green'], [9.2, 'bottle_A_green']]),
    { model: 'bottle_A_green', x: 2, z: -1.6, y: 2.4, size: 1.1 },
    { model: 'barrel_large', x: -10.2, z: -1.8, size: 1.3 },
    { model: 'barrel_small', x: -4.2, z: -2, size: 1.5 },
    { model: 'keg', x: -8.4, z: -0.4, size: 0.95, turn: 0.4 },
    { model: 'table_small', x: -1.4, z: -0.6, size: 1.6 },
    { model: 'bottle_A_brown', x: -1.4, z: -0.6, y: 1.6, size: 1.1 },
    { model: 'bar_stool', x: 0.2, z: -0.4, size: 0.8 },
    { model: 'bar_stool', x: -3, z: -0.2, size: 0.8 },
    { model: 'guitar_B', x: -0.6, z: -2.9, y: 2.9, size: 1.3 },
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
    mote('neon', -6.9, SIGN_Y + 0.1, -2.4, 7, '#ff5fa2', 0.3),
    mote('neon', -6.6, SIGN_Y, -2.5, 10, '#56d8ff', 0.16),
    halo(BAR_LAMP, 4.2, 0.4, 7, '#ffb060', 0.55),
    mote('sway', BAR_SWING.x, 4.2, 0.4, 7, '#ffb060', 0.55),
    pool(BAR_LAMP, -0.4, 7, '#ffb060', 0.14),
    pool(BAR_SWING.x, -0.4, 7, '#ffb060', 0.14, 'sway'),
    beam(-1, 11, 0, 2.4, 13, 0.18, '#ff8ab8', 0.08),
    ...sparks(12, -6.6, SIGN_Y - 1.2, -2.2, '#ffa8d0'),
    ...scatter(10, (a, b, c, i) => mote('haze', -9 + a * 18, 2.5 + b * 5.5, 0.5 + c * 2, 7 + c * 5, '#c88a70', 0.045, 16, 0.6, i * 1.9)),
    ...dust(12, '#ffcfa0', 0.24),
  ],
  ambient: { sky: '#d8a090', ground: '#301820', intensity: 1.05 },
  key: { color: '#ffb890', intensity: 1.3, from: [6, 12, 11] },
}

export const ROOM_SPECS: Record<Room, RoomSpec> = { studio: STUDIO, cafe: CAFE, roadhouse: ROADHOUSE }
