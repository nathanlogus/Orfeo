// ── The home menu's choices: what to fix, what's in progress, the keys it hears ──
import { LEVEL_UP, type PhraseProgress } from './practiceScore'

export type MenuAction = 'up' | 'down' | 'select'

// White keys from middle C, so the hand finds them without looking
export const MENU_KEYS: { note: number; name: string; action: MenuAction }[] = [
  { note: 60, name: 'C4', action: 'up' },
  { note: 62, name: 'D4', action: 'down' },
  { note: 64, name: 'E4', action: 'select' },
]

// A key pressed alone and let go moves the menu. It waits for the release because
// a chord's notes arrive one by one: its first note must not count. `alone` is the
// key being tapped so far, carried from one change of the held keys to the next.
export function menuTap(alone: number | null, held: ReadonlySet<number>, before: ReadonlySet<number>): { alone: number | null; action: MenuAction | null } {
  if (held.size) return { alone: held.size === 1 && !before.size ? [...held][0] : null, action: null }
  return { alone: null, action: MENU_KEYS.find(k => k.note === alone)?.action ?? null }
}

// The played phrase furthest from learned. Untouched phrases hold 0 and are not
// weak, only unplayed; a learned one has nothing left to fix.
export function weakestPhrase(phrases: PhraseProgress[] = []): number | null {
  let weakest: number | null = null
  phrases.forEach((p, i) => {
    if (p?.best > 0 && p.best < LEVEL_UP && (weakest === null || p.best < phrases[weakest].best)) weakest = i
  })
  return weakest
}

export function songsInProgress<T extends { path: string }>(songs: T[], masteryOf: (path: string) => number, limit: number): T[] {
  return songs
    .filter(s => masteryOf(s.path) > 0 && masteryOf(s.path) < 100)
    .sort((a, b) => masteryOf(b.path) - masteryOf(a.path))
    .slice(0, limit)
}
