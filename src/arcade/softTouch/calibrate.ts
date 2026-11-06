// ── Your keyboard's touch: how soft and how loud it really goes ───────────────
// Velocities mean different things on different keyboards, so every window is
// judged on this player's own range, measured once per keyboard and kept in prefs.
export interface Touch { soft: number; loud: number }

export const HITS = 5
// All ten notes this close together: nothing on this keyboard is listening to touch
const FIXED_SPREAD = 2
const MIN_RANGE = 20
// Your softest and loudest land inside the meter, so a window at either end can hold them
const FLOOR = 0.15
const RANGE = 0.7

const median = (hits: number[]) => [...hits].sort((a, b) => a - b)[Math.floor(hits.length / 2)]

export function readTouch(softHits: number[], loudHits: number[]): Touch | 'fixed' | 'close' {
  const all = [...softHits, ...loudHits]
  if (Math.max(...all) - Math.min(...all) <= FIXED_SPREAD) return 'fixed'
  const soft = median(softHits), loud = median(loudHits)
  return loud - soft < MIN_RANGE ? 'close' : { soft, loud }
}

// A velocity as a height on the meter, 0 to 1
export const levelOf = (velocity: number, { soft, loud }: Touch) =>
  Math.max(0, Math.min(1, FLOOR + RANGE * (velocity - soft) / (loud - soft)))

export async function loadTouch(device: string): Promise<Touch | null> {
  const { arcadeTouch } = await window.electronAPI.getPrefs()
  return arcadeTouch?.[device] ?? null
}

export async function saveTouch(device: string, touch: Touch): Promise<void> {
  const { arcadeTouch } = await window.electronAPI.getPrefs()
  await window.electronAPI.setPrefs({ arcadeTouch: { ...arcadeTouch, [device]: touch } })
}
