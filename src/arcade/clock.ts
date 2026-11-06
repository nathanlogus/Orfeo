// ── Game time: real time that a slow frame can only stretch, never skip ───────
// However long a frame took, the game moves on by at most one step. A stall or a
// hidden window slows the game down, so it can't run a chord out of time.
const MAX_STEP_MS = 100

export function gameClock(start: number) {
  let real = start
  let game = 0
  return {
    tick(now: number) {
      game += Math.min(MAX_STEP_MS, Math.max(0, now - real))
      real = now
      return game
    },
    // Paused: the world keeps drawing, the game doesn't move
    hold(now: number) { real = now; return game },
    // A key's timestamp, on the game's clock
    at: (stamp: number) => game + (stamp - real),
  }
}
