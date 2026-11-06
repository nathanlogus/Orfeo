// ── Arcade progress: stars and bests per stage, kept in prefs like practiceProgress ──
// arcadeProgress holds the stages, as it always has. arcadePlayer holds what spans
// worlds: XP, and the misses per concept behind the weak spot and adaptive prompts.
// A world's figure is earned by its boss, so its boss record is what says so.
export interface StageRecord { stars: number; best: number; fails: number }
export type WorldProgress = Record<string, StageRecord>
export type ArcadeProgress = Record<string, WorldProgress>

// concept -> item -> slips still outstanding
export type Misses = Record<string, Record<string, number>>
export interface Player { xp: number; misses: Misses }
export interface Saved { worlds: ArcadeProgress; player: Player }

export const EMPTY: StageRecord = { stars: 0, best: 0, fails: 0 }
export const NEW_PLAYER: Player = { xp: 0, misses: {} }
const FAILS_BEFORE_ASSIST = 2
const XP_PER_LEVEL = 500
const XP_PLAYED = 10
const XP_PER_STAR = 30
const XP_NEW_BEST = 20
const ITEMS_KEPT = 8

export interface RunResult { cleared: boolean; stars: number; score: number }

export function afterRun(record: StageRecord = EMPTY, { cleared, stars, score }: RunResult): StageRecord {
  return {
    stars: Math.max(record.stars, cleared ? stars : 0),
    best: Math.max(record.best, score),
    fails: cleared ? 0 : record.fails + 1,
  }
}

export const offersAssist = (record: StageRecord = EMPTY) => record.fails >= FAILS_BEFORE_ASSIST

// One star opens whatever comes next. A star further on, from a Placement run,
// opens everything before it too.
export function isOpen(order: string[], world: WorldProgress, id: string): boolean {
  const i = order.indexOf(id)
  return i === 0 || order.slice(i - 1).some(stage => (world[stage]?.stars ?? 0) >= 1)
}

export const levelOf = (xp: number) => ({ level: 1 + Math.floor(xp / XP_PER_LEVEL), into: xp % XP_PER_LEVEL, of: XP_PER_LEVEL })

export const xpFor = ({ cleared, stars }: RunResult, newBest: boolean) => XP_PLAYED + (cleared ? stars * XP_PER_STAR : 0) + (newBest ? XP_NEW_BEST : 0)

// This run's slips add up; anything in the concept it didn't slip on heals by one,
// so a weak spot fades once it's played clean.
export function afterMisses(misses: Misses, concept: string, slipped: Record<string, number>): Misses {
  const items: Record<string, number> = {}
  for (const [item, count] of Object.entries(misses[concept] ?? {})) if (count > 1 && !slipped[item]) items[item] = count - 1
  for (const [item, count] of Object.entries(slipped)) items[item] = (misses[concept]?.[item] ?? 0) + count
  const kept = Object.entries(items).sort((a, b) => b[1] - a[1]).slice(0, ITEMS_KEPT)
  const { [concept]: _, ...rest } = misses
  return kept.length ? { ...rest, [concept]: Object.fromEntries(kept) } : rest
}

export const weakItems = (misses: Misses, concept: string) => Object.entries(misses[concept] ?? {}).sort((a, b) => b[1] - a[1]).map(([item]) => item)

// The concept with the most slips outstanding, or nothing to say
export function weakConcept(misses: Misses, playable: (concept: string) => boolean): string | null {
  const total = (concept: string) => Object.values(misses[concept]).reduce((sum, n) => sum + n, 0)
  return Object.keys(misses).filter(playable).sort((a, b) => total(b) - total(a))[0] ?? null
}

export async function loadProgress(): Promise<Saved> {
  const { arcadeProgress, arcadePlayer } = await window.electronAPI.getPrefs()
  return { worlds: arcadeProgress ?? {}, player: { ...NEW_PLAYER, ...arcadePlayer } }
}

export async function saveRun(worldId: string, stageId: string, record: StageRecord, player: Player): Promise<void> {
  const { arcadeProgress } = await window.electronAPI.getPrefs()
  await window.electronAPI.setPrefs({
    arcadeProgress: { ...arcadeProgress, [worldId]: { ...arcadeProgress?.[worldId], [stageId]: record } },
    arcadePlayer: player,
  })
}
