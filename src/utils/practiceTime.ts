import { useStore } from '../store'

export type PracticeDays = Record<string, { seconds: number; sessions: number }>
export const practiceDayKey = (date = new Date()) => {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
const DAY = () => practiceDayKey()
let last = Date.now()
let busy = false
const active = () => useStore.getState().playbackState === 'playing' && !useStore.getState().homeOpen
async function tick() {
  const now = Date.now(), elapsed = Math.min(30, Math.max(0, (now - last) / 1000)); last = now
  if (!active() || elapsed < 1 || busy || !window.electronAPI?.getPrefs) return
  busy = true
  try {
    const p = await window.electronAPI.getPrefs(), days: PracticeDays = p.practiceDays ?? {}, day = DAY()
    const before = days[day] ?? { seconds: 0, sessions: 0 }
    days[day] = { seconds: before.seconds + Math.round(elapsed), sessions: before.sessions + (before.seconds === 0 ? 1 : 0) }
    await window.electronAPI.setPrefs({ practiceDays: days })
    window.dispatchEvent(new Event('pliage-practice-days'))
  } catch {} finally { busy = false }
}
if (typeof window !== 'undefined') window.setInterval(() => { void tick() }, 10_000)

export function practiceStreak(days: PracticeDays, today = DAY()) {
  let date = new Date(`${today}T12:00:00`)
  if (!days[today]?.seconds) date.setDate(date.getDate() - 1)
  let count = 0
  while (days[practiceDayKey(date)]?.seconds) { count++; date.setDate(date.getDate() - 1) }
  return count
}
