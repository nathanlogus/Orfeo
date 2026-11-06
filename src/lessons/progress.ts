// ── Lesson progress: what's open, what's next, and how a play-through scored ──
import { accuracy, type Press, type ScoredStep } from '../utils/practiceScore'
import { allLessons, type Unit } from './course'

export const PASS = 0.9
export const CLEAN_RUNS = 2

const unitDone = (unit: Unit, passed: string[]) => unit.lessons.every(l => passed.includes(l.id))

// The units on the same track as a lesson
export function trackUnits(all: Unit[], id: string): Unit[] {
  const track = all.find(unit => unit.lessons.some(l => l.id === id))?.track
  return all.filter(unit => unit.track === track)
}

// Each track's units open in order. Inside one, lessons open in order, and its
// last lesson is always open: passing that skips the rest of the unit.
export function isOpen(all: Unit[], passed: string[], id: string): boolean {
  const units = trackUnits(all, id)
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

export type TapMark = 'on-time' | 'early' | 'late' | 'missed' | 'extra'

// A tap this many windows out is shown as close, but only an on-time tap scores
const CLOSE_WINDOWS = 2

// One mark per due time (null: not due yet), then one 'extra' per tap left over.
// Each due time takes one tap, and every on-time tap is placed first, so a late
// tap can't take the one that was right on the next beat.
export function tapMarks(due: number[], taps: number[], windowSec: number, now = Infinity): (TapMark | null)[] {
  const left = [...taps]
  const take = (i: number) => left.splice(i, 1)[0]
  const marks: (TapMark | null)[] = due.map(time => {
    const i = left.findIndex(t => Math.abs(t - time) <= windowSec)
    if (i < 0) return null
    take(i)
    return 'on-time'
  })
  const close = windowSec * CLOSE_WINDOWS
  due.forEach((time, d) => {
    if (marks[d]) return
    const i = left.findIndex(t => Math.abs(t - time) <= close)
    if (i >= 0) marks[d] = take(i) < time ? 'early' : 'late'
    else if (now > time + close) marks[d] = 'missed'
  })
  return [...marks, ...left.map(() => 'extra' as const)]
}

// Taps against the times they were due
export function tapScore(due: number[], taps: number[], windowSec: number): number {
  const hit = tapMarks(due, taps, windowSec).filter(m => m === 'on-time').length
  return due.length ? hit / Math.max(due.length, taps.length) : 0
}

// The clean runs behind a pass, for the Lesson passed page: a miss starts them over
export const afterRun = (runs: number[], percent: number, clean: boolean) => (clean ? [...runs, percent].slice(-CLEAN_RUNS) : [])
