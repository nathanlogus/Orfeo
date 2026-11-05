// ── Lesson progress: what's open, what's next, and how a play-through scored ──
import { accuracy, type Press, type ScoredStep } from '../utils/practiceScore'
import { allLessons, type Unit } from './course'

export const PASS = 0.9
export const CLEAN_RUNS = 2

const unitDone = (unit: Unit, passed: string[]) => unit.lessons.every(l => passed.includes(l.id))

// Units open in order. Inside one, lessons open in order, and its last lesson is
// always open: passing that skips the rest of the unit.
export function isOpen(units: Unit[], passed: string[], id: string): boolean {
  const u = units.findIndex(unit => unit.lessons.some(l => l.id === id))
  if (u < 0 || (u > 0 && !unitDone(units[u - 1], passed))) return false
  const { lessons } = units[u]
  const i = lessons.findIndex(l => l.id === id)
  return i === 0 || i === lessons.length - 1 || passed.includes(lessons[i - 1].id) || passed.includes(id)
}

export function afterPass(units: Unit[], passed: string[], id: string): string[] {
  const unit = units.find(u => u.lessons.some(l => l.id === id))
  const isLast = unit?.lessons[unit.lessons.length - 1].id === id
  return [...new Set([...passed, ...(isLast ? unit!.lessons.map(l => l.id) : [id])])]
}

export const nextLesson = (units: Unit[], passed: string[]) => allLessons(units).find(l => !passed.includes(l.id)) ?? null

// accuracy() lets extra keys go free, which would let a student press everything
// and pass, so here every press has to be one the music asked for.
export function playScore(steps: ScoredStep[], presses: Press[], windowSec: number): number {
  const played = accuracy(steps, presses, windowSec)
  if (played === null) return 0
  const wanted = presses.filter(p => steps.some(s => s.notes.some(n => n.midi === p.midi) && Math.abs(p.time - s.time) <= windowSec))
  return Math.min(played, presses.length ? wanted.length / presses.length : 0)
}

// Taps against the times they were due. Each due time takes one tap.
export function tapScore(due: number[], taps: number[], windowSec: number): number {
  const left = [...taps]
  let hit = 0
  for (const time of due) {
    const i = left.findIndex(t => Math.abs(t - time) <= windowSec)
    if (i >= 0) { hit++; left.splice(i, 1) }
  }
  return due.length ? hit / Math.max(due.length, taps.length) : 0
}
