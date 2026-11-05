// ── Piano fingering ───────────────────────────────────────────────────────
// Suggests a finger (1 thumb … 5 little) for every note one hand plays, by the
// cheapest path through the song: neighbouring fingers sit about a whole tone
// apart, the thumb passes under and fingers pass over it, and thumbs avoid
// black keys. A suggestion from the notes alone: it knows nothing of phrasing.
// shortcut: each step only looks at the one before it, a real hand model comes
// if players find the suggestions awkward.

export type FingerHand = 'L' | 'R'

const WHOLE_TONE = 2
const CHORD_FINGER_GAP = 1.8  // a triad's thirds, 1-3-5 ahead of 1-3-4
const COMFORTABLE_CHORD = 12
const CROSSING = 3
const BAD_CROSSING = 30
const REPEATED_FINGER = 6
const THUMB_ON_BLACK = 3
const LITTLE_ON_BLACK = 1
const LEAP = 12              // beyond this the whole hand moves
const LEAP_COST = 4

const isBlack = (pitch: number) => [1, 3, 6, 8, 10].includes(((pitch % 12) + 12) % 12)

// Every way to put n fingers on a chord, lowest finger on the lowest note
function placements(n: number): number[][] {
  const out: number[][] = []
  const grow = (from: number, picked: number[]) => {
    if (picked.length === n) { out.push(picked); return }
    for (let f = from; f <= 5; f++) grow(f + 1, [...picked, f])
  }
  grow(1, [])
  return out
}

function keyCost(pitch: number, finger: number): number {
  if (!isBlack(pitch)) return 0
  return finger === 1 ? THUMB_ON_BLACK : finger === 5 ? LITTLE_ON_BLACK : 0
}

// `pitch` runs up the hand, thumb to little finger, for either hand
function moveCost(fromPitch: number, fromFinger: number, toPitch: number, toFinger: number): number {
  const move = toPitch - fromPitch, reach = toFinger - fromFinger
  if (Math.abs(move) > LEAP) return LEAP_COST
  if (reach === 0) return move === 0 ? 0 : REPEATED_FINGER + Math.abs(move)
  if (move * reach > 0) return Math.abs(Math.abs(move) - WHOLE_TONE * Math.abs(reach))
  const thumbUnder = move > 0 && toFinger === 1 && fromFinger <= 4
  const fingerOver = move < 0 && fromFinger === 1 && toFinger <= 4
  if (!thumbUnder && !fingerOver) return BAD_CROSSING
  return CROSSING + Math.abs(Math.abs(move) - WHOLE_TONE) + (fromFinger === 4 || toFinger === 4 ? 1 : 0)
}

function shapeCost(pitches: number[], fingers: number[]): number {
  let cost = 0
  for (let i = 1; i < pitches.length; i++) {
    cost += Math.abs(pitches[i] - pitches[i - 1] - CHORD_FINGER_GAP * (fingers[i] - fingers[i - 1]))
  }
  return cost + Math.max(0, pitches[pitches.length - 1] - pitches[0] - COMFORTABLE_CHORD)
}

// `events` are what one hand strikes together, in time order. The answer lines
// up with them note for note. A chord of more than five notes stays empty.
// `printed` holds fingers already decided, 0 for free, and the rest plan around them.
export function fingerEvents(hand: FingerHand, events: number[][], printed: number[][] = []): number[][] {
  const up = hand === 'R' ? 1 : -1
  const playable = events.flatMap((pitches, index) => {
    if (pitches.length === 0 || pitches.length > 5) return []
    return [{ index, order: pitches.map((_, i) => i).sort((a, b) => (pitches[a] - pitches[b]) * up) }]
  })
  const hits = playable.map(({ index, order }) => order.map(i => events[index][i] * up))

  const steps = hits.map((notes, s) => {
    const { index, order } = playable[s]
    const all = placements(notes.length)
    const kept = all.filter(fingers => order.every((noteIndex, i) => !printed[index]?.[noteIndex] || printed[index][noteIndex] === fingers[i]))
    return (kept.length ? kept : all).map(fingers => ({ fingers, best: Infinity, from: -1 }))
  })
  steps.forEach((options, s) => options.forEach(option => {
    const notes = hits[s]
    const own = shapeCost(notes, option.fingers) + notes.reduce((sum, p, i) => sum + keyCost(p * up, option.fingers[i]), 0)
    if (s === 0) { option.best = own; return }
    const before = hits[s - 1]
    steps[s - 1].forEach((prev, p) => {
      const last = before.length - 1, top = notes.length - 1
      const moves = moveCost(before[0], prev.fingers[0], notes[0], option.fingers[0])
        + moveCost(before[last], prev.fingers[last], notes[top], option.fingers[top])
      // A chord is a hand shape: the whole hand moves to it, finger by finger means nothing
      const cost = prev.best + own + (last > 0 || top > 0 ? Math.min(moves, LEAP_COST) : moves)
      if (cost < option.best) { option.best = cost; option.from = p }
    })
  }))

  const out: number[][] = events.map(() => [])
  let at = steps.length ? steps[steps.length - 1].reduce((b, o, i, all) => (o.best < all[b].best ? i : b), 0) : -1
  for (let s = steps.length - 1; s >= 0; s--) {
    const { fingers, from } = steps[s][at]
    const { index, order } = playable[s]
    order.forEach((noteIndex, i) => { out[index][noteIndex] = fingers[i] })
    at = from
  }
  return out
}
