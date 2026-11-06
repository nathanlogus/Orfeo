// ── A shared judge for notes due at a moment ──────────────────────────────────
// For games that lay notes out in time: Sight Line, Pocket, Split, Scale Climb, Echo.
// All times are game time from gameClock(): pass clock.at(stamp) for a key, so a
// press is judged by when it left the keyboard and never by when a frame drew it.
//
//   Sight Line, Split  timed notes:  { at, accepts: exactly(64) }
//   Pocket             any key:      { at, accepts: anyKey }, and read `offset` for drift
//   Scale Climb, Echo  untimed, in order: good: Infinity, then a wrong key grades 'wrong'
//
// press() returns null for a key with nothing due. 'wrong' leaves the note open:
// whether that costs anything is the game's rule. tick() closes notes gone past
// their window as 'miss'.
export interface TimedNote { at: number; accepts: (key: number) => boolean }
export type Grade = 'perfect' | 'good' | 'wrong' | 'miss'
export interface Verdict { index: number; grade: Grade; offset: number }   // offset: ms, negative is early

const PERFECT_MS = 50
const GOOD_MS = 130

export const anyKey = () => true
export const exactly = (key: number) => (k: number) => k === key
export const anyOctave = (key: number) => (k: number) => k % 12 === key % 12

export function createJudge(notes: TimedNote[], { perfect = PERFECT_MS, good = GOOD_MS } = {}) {
  const open = new Set(notes.map((_, i) => i))
  return {
    press(key: number, at: number): Verdict | null {
      const due = [...open].filter(i => Math.abs(notes[i].at - at) <= good || good === Infinity)
      if (!due.length) return null
      const index = due.find(i => notes[i].accepts(key))
      if (index === undefined) return { index: due[0], grade: 'wrong', offset: at - notes[due[0]].at }
      open.delete(index)
      const offset = at - notes[index].at
      return { index, grade: good === Infinity || Math.abs(offset) <= perfect ? 'perfect' : 'good', offset }
    },
    tick(now: number): Verdict[] {
      const late = [...open].filter(i => now - notes[i].at > good)
      for (const i of late) open.delete(i)
      return late.map(index => ({ index, grade: 'miss', offset: now - notes[index].at }))
    },
    get left() { return open.size },
  }
}
