// ── Bossa nova drums, written for Pliage ─────────────────────────────────────
// The Groove MIDI Dataset has too little real bossa, so this is the documented
// groove itself: a 3-2 cross-stick line over a soft surdo-style kick and even
// hi-hat eighths. In the grooves' format: flat [tick, GM drum note, velocity, …].
import { GROOVE_BEATS, GROOVE_TICKS_PER_BEAT } from './grooves'

const TICKS_PER_STEP = GROOVE_TICKS_PER_BEAT / 4
const STEPS = GROOVE_BEATS * 4
const KICK = 36
const SIDE_STICK = 37
const HAT = 42
const RIDE = 51
const CROSS_STICK = [0, 6, 12, 20, 26]
const SURDO = [0, 6, 8, 14, 16, 22, 24, 30]

function groove(kick: number[], kickVel: number, stickVel: number, cymbal: number, cymbalVel: number): number[] {
  const hits: number[][] = []
  for (let s = 0; s < STEPS; s += 2) hits.push([s, cymbal, s % 4 === 0 ? cymbalVel + 12 : cymbalVel])
  for (const s of kick) hits.push([s, KICK, kickVel])
  for (const s of CROSS_STICK) hits.push([s, SIDE_STICK, stickVel])
  return hits.sort((a, b) => a[0] - b[0]).flatMap(([s, note, vel]) => [s * TICKS_PER_STEP, note, vel])
}

export const BOSSA_GROOVE = [
  groove([0, 8, 16, 24], 44, 56, HAT, 30),
  groove(SURDO, 52, 70, HAT, 38),
  groove(SURDO, 62, 84, RIDE, 46),
]
