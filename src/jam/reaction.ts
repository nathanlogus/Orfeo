// ── How the band listens ─────────────────────────────────────────────────────
// Only how hard and how much the player is playing, smoothed over seconds so the
// band leans rather than jumps. It never judges what was played.

const RATE_TAU_SEC = 2    // the note count fades over this long
const LOUD_TAU_SEC = 1.5  // the band's volume follows over this long
const BUSY_TAU_SEC = 1.5
const VEL_WEIGHT = 0.15   // each note's share of the running touch
const RESTING_LOUD = 0.35 // where the volume settles when the player leaves space
const FULL_RATE = 7       // notes a second that count as fully busy
const SPARSE_RATE = 0.8   // below this the player's touch counts for less and less

export type BandLevel = 0 | 1 | 2 // calm, steady, building

// Moving up takes more than staying up, so the band doesn't flicker on a boundary
const UP = [0.18, 0.55]
const DOWN = [0.08, 0.4]

const easeTo = (from: number, to: number, dt: number, tau: number) => from + (to - from) * (1 - Math.exp(-dt / tau))

export function createReaction() {
  let rate = 1.7
  let touch = 0.5
  let loud = 0.5
  let busy = 0.25
  let level: BandLevel = 1
  return {
    noteOn(velocity01: number) {
      rate += 1 / RATE_TAU_SEC // the fading sum of one note per second settles at 1
      touch += (velocity01 - touch) * VEL_WEIGHT
    },
    advance(dt: number) {
      rate *= Math.exp(-dt / RATE_TAU_SEC)
      const playing = Math.min(1, rate / SPARSE_RATE)
      loud = easeTo(loud, touch * playing + RESTING_LOUD * (1 - playing), dt, LOUD_TAU_SEC)
      busy = easeTo(busy, Math.min(1, rate / FULL_RATE), dt, BUSY_TAU_SEC)
      if (level < 2 && busy > UP[level]) level = (level + 1) as BandLevel
      else if (level > 0 && busy < DOWN[level - 1]) level = (level - 1) as BandLevel
    },
    get loud() { return loud },
    get busy() { return busy },
    get level() { return level },
  }
}
