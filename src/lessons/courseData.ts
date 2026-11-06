// ── The course as the app sees it ─────────────────────────────────────────────
import courseText from './course.md?raw'
import { allLessons, parseCourse, parseShelf, type Lesson } from './course'

export const COURSE = parseCourse(courseText)
export const LESSONS = allLessons(COURSE)
export const lessonById = (id: string) => LESSONS.find(l => l.id === id) ?? null
export const SHELF = parseShelf(courseText)
// The scan drill's pool: its questions only know the keys and metres Reading music uses
export const EXERCISES = allLessons(COURSE.filter(u => u.track === COURSE[0].track)).flatMap(l => (l.tex ? [l.tex] : []))

// Real pieces are kept out of the startup bundle until a lesson opens one
const PIECES = import.meta.glob('./pieces/*.musicxml', { query: '?raw', import: 'default' }) as Record<string, () => Promise<string>>

export async function pieceScore(file: string): Promise<Uint8Array | null> {
  const load = PIECES[`./pieces/${file}`]
  return load ? new TextEncoder().encode(await load()) : null
}

export async function lessonScore(lesson: Lesson): Promise<Uint8Array | null> {
  if (lesson.tex) return new TextEncoder().encode(lesson.tex)
  return lesson.file ? pieceScore(lesson.file) : null
}
