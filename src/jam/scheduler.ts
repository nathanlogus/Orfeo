// ── Jam's lookahead scheduler ────────────────────────────────────────────────
// Reads the time from the engine's own clock (`JamOutput.now`), never from
// counting timers: a late tick only means the next notes are planned later,
// not that they play later. Note-ons go out as soon as they are planned, at most
// LOOKAHEAD_SEC ahead. A note-off stays here until it is that close too, so a
// chord change or a re-struck note can still move it, and whatever hasn't gone
// out when the band stops is sent at once: no note is ever left without its off.

export interface JamOutput {
  /** Seconds on the clock `send` is timed against */
  now(): number
  send(bytes: number[], when: number): void
  /** Hand over or drop whatever is still held back: nothing more is coming */
  flush(): void
}

export interface JamNote { ch: number; note: number; vel: number; at: number; dur: number }

export const LOOKAHEAD_SEC = 0.12
export const TICK_MS = 25
const LATE_RESYNC_SEC = 0.25 // a stall longer than this skips ahead instead of playing a burst
const OFF_BEFORE_ON_SEC = 0.002

export type Plan = (step: number, at: number, stepSec: number) => void

export function createScheduler(out: JamOutput, stepSec: () => number, plan: Plan) {
  let step = 0
  let nextAt = 0
  let lateSteps = 0
  let lastOn = -Infinity
  const offs: { at: number; ch: number; note: number }[] = []

  const sendOff = (o: { at: number; ch: number; note: number }, at = o.at) => out.send([0x80 | o.ch, o.note, 0], at)

  function tick() {
    const now = out.now()
    while (now - nextAt > LATE_RESYNC_SEC) { nextAt += stepSec(); step++; lateSteps++ }
    const horizon = now + LOOKAHEAD_SEC
    while (nextAt < horizon) {
      const len = stepSec()
      plan(step, nextAt, len)
      nextAt += len
      step++
    }
    for (let i = offs.length - 1; i >= 0; i--) {
      if (offs[i].at < horizon) { sendOff(offs[i]); offs.splice(i, 1) }
    }
  }

  return {
    tick,
    start(at: number) { step = 0; nextAt = at; tick() },
    /** Called from `plan`: strikes a note. A note still ringing at that pitch ends first. */
    play(n: JamNote) {
      for (let i = offs.length - 1; i >= 0; i--) {
        if (offs[i].ch === n.ch && offs[i].note === n.note) { sendOff(offs[i], n.at - OFF_BEFORE_ON_SEC); offs.splice(i, 1) }
      }
      out.send([0x90 | n.ch, n.note, n.vel], n.at)
      lastOn = Math.max(lastOn, n.at)
      offs.push({ at: n.at + n.dur, ch: n.ch, note: n.note })
    },
    /** Anything on these channels still ringing at `at` ends there (a chord change mid-note) */
    releaseAt(chs: number[], at: number) {
      for (const o of offs) if (chs.includes(o.ch) && o.at > at) o.at = at
    },
    /** Stop: every note the engine could still hold gets its off, after the last
     *  note-on it may have queued. Returns that time. */
    stop(chs: number[]): number {
      const after = Math.max(out.now(), lastOn + OFF_BEFORE_ON_SEC)
      for (const o of offs) sendOff(o, after)
      offs.length = 0
      for (const ch of chs) out.send([0xb0 | ch, 123, 0], after)
      return after
    },
    lateSteps: () => lateSteps,
  }
}
