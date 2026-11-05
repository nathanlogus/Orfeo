import { GROUPS, SETTINGS, type GroupInfo, type SettingInfo } from './catalog'

export const MIN_CARD_WIDTH = 250
export const CARD_GAP = 14

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// Every word of the query must appear in the setting's name, description or
// keywords. Results come back grouped, in group order then setting order.
export function searchSettings(query: string): { group: GroupInfo; settings: SettingInfo[] }[] {
  const words = norm(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return []
  const hits = SETTINGS.filter(s => {
    const hay = norm(`${s.name} ${s.description} ${s.keywords ?? ''}`)
    return words.every(w => hay.includes(w))
  })
  return GROUPS
    .map(group => ({ group, settings: hits.filter(s => s.group === group.id) }))
    .filter(r => r.settings.length > 0)
}

// Up to `most` across (a two-setting group never gets three), fewer when the
// cards would get narrower than MIN_CARD_WIDTH; never 0 (width 0 = not measured yet).
export function gridColumns(count: number, width: number, most = 3): number {
  const wanted = count === 2 ? 2 : Math.min(most, Math.max(1, count))
  const fits = Math.floor((width + CARD_GAP) / (MIN_CARD_WIDTH + CARD_GAP))
  return Math.max(1, Math.min(wanted, fits))
}
