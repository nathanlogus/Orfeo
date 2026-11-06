// ── The course: course.md parsed into units and lessons ─────────────────────
// course.md is the one place lessons are written, so this only reads it.

export type Clef = 'treble' | 'bass' | 'grand'

export type Check =
  | { kind: 'keys'; note: string }
  | { kind: 'notes'; clef: Clef; key?: string; notes: string[] }
  | { kind: 'pairs'; left: string[]; right: string[] }
  | { kind: 'shapes'; clef: Clef; notes: string[] }
  | { kind: 'intervals'; clef: Clef; sizes: number[]; notes: string[] }
  | { kind: 'tap'; beats: number; fade: boolean; patterns: string[][] }
  | { kind: 'chunks' }
  | { kind: 'scan' }
  | { kind: 'chords'; clef: Clef; chords: ChordAsk[] }
  | { kind: 'touch'; clef: Clef; styles: TouchStyle[]; notes: string[] }
  | { kind: 'quiz'; questions: Question[] }

// A chord with a name is played from the name, in any octave or inversion
export interface ChordAsk { name?: string; notes: string[] }
// What the keyboard can report about how a phrase was played
export type TouchStyle = 'soft' | 'loud' | 'even' | 'legato' | 'staccato' | 'pedal'
// hear: what to play first, one list of notes per moment
export interface Question { text: string; hear?: string[][]; answer: string; wrong: string[] }

export interface Lesson {
  id: string
  title: string
  goal: string
  learn?: string
  drill?: string
  check?: Check
  mode?: string
  notes?: string[]
  tex?: string
  piece?: string
  file?: string
  after?: string
  tool?: string
}

export interface Unit { n: number; title: string; track: string; intro?: string; lessons: Lesson[] }

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean)

export function parseCheck(text: string): Check {
  const [kind, ...rest] = words(text)
  const body = text.trim().slice(kind.length).trim()
  if (kind === 'keys') return { kind, note: rest[0] }
  if (kind === 'notes') {
    const key = rest.find(w => w.startsWith('key='))?.slice(4)
    return { kind, clef: rest[0] as Clef, key, notes: rest.slice(1).filter(w => !w.startsWith('key=')) }
  }
  if (kind === 'pairs') {
    const [left, right] = body.split('/').map(words)
    return { kind, left, right }
  }
  if (kind === 'shapes') return { kind, clef: rest[0] as Clef, notes: rest.slice(1) }
  if (kind === 'intervals') {
    const [sizes, notes] = body.split(':').map(words)
    return { kind, clef: sizes[0] as Clef, sizes: sizes.slice(1).map(Number), notes }
  }
  if (kind === 'tap') {
    const fade = rest[1] === 'fade'
    return { kind, beats: Number(rest[0]), fade, patterns: body.replace(/^\d+\s*(fade)?/, '').split('|').map(words) }
  }
  if (kind === 'chunks' || kind === 'scan') return { kind }
  if (kind === 'chords') {
    return {
      kind, clef: rest[0] as Clef,
      chords: rest.slice(1).map(word => {
        const [notes, name] = word.split('=').reverse()
        return { name: name?.replace(/_/g, ' '), notes: notes.split('+') }
      }),
    }
  }
  if (kind === 'touch') {
    const [styles, notes] = body.split(':').map(words)
    return { kind, clef: styles[0] as Clef, styles: styles.slice(1) as TouchStyle[], notes }
  }
  if (kind === 'quiz') return { kind, questions: body.split('|').map(parseQuestion) }
  throw new Error(`Unknown lesson check: ${text}`)
}

// "[C4 E4] What is this? = Right / Wrong / Wrong"
function parseQuestion(text: string): Question {
  const [ask, choices] = text.split('=')
  const hear = ask.match(/^\s*\[(.*)\]/)
  const [answer, ...wrong] = choices.split('/').map(c => c.trim())
  return { text: ask.replace(/^\s*\[.*\]/, '').trim(), hear: hear ? words(hear[1]).map(w => w.split('+')) : undefined, answer, wrong }
}

function parseLesson(id: string, title: string, body: string): Lesson {
  const fields = new Map([...body.matchAll(/^- \*\*(\w+):\*\* (.*)$/gm)].map(m => [m[1], m[2].trim()]))
  const tex = body.match(/```alphatex\n([\s\S]*?)```/)?.[1].trim()
  const check = fields.get('Check')
  const after = tex ? body.slice(body.indexOf('```', body.indexOf('```alphatex') + 3) + 3).trim() : ''
  return {
    id, title,
    goal: fields.get('Goal') ?? '',
    learn: fields.get('Learn'),
    drill: fields.get('Drill'),
    check: check ? parseCheck(check) : undefined,
    mode: fields.get('Mode'),
    notes: fields.get('Notes') ? words(fields.get('Notes')!) : undefined,
    tex,
    piece: fields.get('Piece'),
    file: fields.get('File'),
    after: after || undefined,
    tool: fields.get('Tool'),
  }
}

// Git may check course.md out with Windows line endings
const lines = (md: string) => md.replace(/\r\n/g, '\n')

export function parseCourse(md: string): Unit[] {
  const units: Unit[] = []
  let track = 'Reading music'
  for (const block of lines(md).split(/^(?=## )/m)) {
    track = block.match(/^## Track: (.*)$/m)?.[1].trim() ?? track
    const head = block.match(/^## Unit (\d+): (.*)$/m)
    if (!head) continue
    const [top, ...sections] = block.split(/^(?=### )/m)
    const intro = top.split('\n').slice(1).join('\n').trim()
    units.push({
      n: Number(head[1]), title: head[2].trim(), track, intro: intro || undefined,
      lessons: sections.map(s => {
        const m = s.match(/^### (\d+\.\d+) (.*)$/m)!
        return parseLesson(m[1], m[2].trim(), s)
      }),
    })
  }
  return units
}

export const allLessons = (units: Unit[]) => units.flatMap(u => u.lessons)

export interface ShelfPiece { after: number; title: string; why: string; file: string }

export function parseShelf(md: string): ShelfPiece[] {
  const text = lines(md)
  const shelf = text.slice(text.indexOf('## Song shelf'), text.indexOf('## Writing lessons'))
  return [...shelf.matchAll(/^\| (\d+) \| (.+?) \| (.+?) \| (\S+\.musicxml) \|$/gm)].map(m => ({ after: Number(m[1]), title: m[2], why: m[3], file: m[4] }))
}
