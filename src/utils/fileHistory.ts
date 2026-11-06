// ── File info: which saved version made each history entry. Every _PLIAGE_vN
// file carries the history of the one it came from, so an entry belongs to the
// lowest version that holds it. shortcut: with an earlier version deleted its
// entries show under the next one that survives; nothing records the difference. ──
export interface HistoryEvent { type: string; timestamp: number; summary: string }
export interface TaggedEvent extends HistoryEvent { version: number | null }

const key = (e: HistoryEvent) => `${e.timestamp}:${e.type}:${e.summary}`

export function tagHistory(log: HistoryEvent[], chain: { version: number; log: HistoryEvent[] }[]): TaggedEvent[] {
  const first = new Map<string, number>()
  for (const v of [...chain].sort((a, b) => a.version - b.version)) {
    for (const e of v.log) if (!first.has(key(e))) first.set(key(e), v.version)
  }
  return log.map(e => ({ ...e, version: first.get(key(e)) ?? null }))
}

export const versionLabel = (version: number) => (version === 0 ? 'Original' : `v${version}`)
