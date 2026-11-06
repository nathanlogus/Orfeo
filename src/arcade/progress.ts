// ── Arcade progress: stars and bests per stage, kept in prefs like practiceProgress ──
export interface StageRecord { stars: number; best: number; fails: number }
export type WorldProgress = Record<string, StageRecord>
export type ArcadeProgress = Record<string, WorldProgress>

export const EMPTY: StageRecord = { stars: 0, best: 0, fails: 0 }
const FAILS_BEFORE_ASSIST = 2

export interface RunResult { cleared: boolean; stars: number; score: number }

export function afterRun(record: StageRecord = EMPTY, { cleared, stars, score }: RunResult): StageRecord {
  return {
    stars: Math.max(record.stars, cleared ? stars : 0),
    best: Math.max(record.best, score),
    fails: cleared ? 0 : record.fails + 1,
  }
}

export const offersAssist = (record: StageRecord = EMPTY) => record.fails >= FAILS_BEFORE_ASSIST

// One star opens whatever comes next
export function isOpen(order: string[], world: WorldProgress, id: string): boolean {
  const i = order.indexOf(id)
  return i === 0 || (world[order[i - 1]]?.stars ?? 0) >= 1
}

export const loadProgress = async (): Promise<ArcadeProgress> => (await window.electronAPI.getPrefs()).arcadeProgress ?? {}

export async function saveRecord(worldId: string, stageId: string, record: StageRecord): Promise<void> {
  const { arcadeProgress } = await window.electronAPI.getPrefs()
  await window.electronAPI.setPrefs({ arcadeProgress: { ...arcadeProgress, [worldId]: { ...arcadeProgress?.[worldId], [stageId]: record } } })
}
