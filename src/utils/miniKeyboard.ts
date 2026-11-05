// ── The Explorers' mini keyboard ─────────────────────────────────────────────
// Full-screen Explorers cover the real keyboard, so they carry a small one that
// lights the same notes. It starts on the C at or below the lowest note and
// shows two octaves, more if the chord reaches further.

const BLACK_PCS = new Set([1, 3, 6, 8, 10])
const DEFAULT_LOW = 48 // C3, where the Explorers' roots start

export interface MiniKey { midi: number; x: number }

export function miniKeyboardRange(notes: number[]): { low: number; high: number } {
  if (notes.length === 0) return { low: DEFAULT_LOW, high: DEFAULT_LOW + 24 }
  const low = Math.floor(Math.min(...notes) / 12) * 12
  return { low, high: Math.max(low + 24, (Math.floor(Math.max(...notes) / 12) + 1) * 12) }
}

// x: a black key's centre, as a percentage of the width; a white key's slot index
export function miniKeyboardLayout(notes: number[]): { whites: MiniKey[]; blacks: MiniKey[] } {
  const { low, high } = miniKeyboardRange(notes)
  const whites: MiniKey[] = []
  const pending: number[] = []
  for (let m = low; m < high; m++) {
    if (BLACK_PCS.has(m % 12)) pending.push(m, whites.length)
    else whites.push({ midi: m, x: whites.length })
  }
  const blacks: MiniKey[] = []
  for (let i = 0; i < pending.length; i += 2) blacks.push({ midi: pending[i], x: pending[i + 1] * 100 / whites.length })
  return { whites, blacks }
}
