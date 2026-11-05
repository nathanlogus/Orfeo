import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { allLessons, parseCourse, parseShelf } from './course'
import { midiOf, nextPrompt, promptCount, tapBeats } from './drill'

// Keys each signature rules out, as note numbers within an octave
const OFF_KEY: Record<number, number[]> = { 1: [5], 2: [5, 0], [-1]: [11], [-2]: [11, 4] }

export function runCourseTest(): number {
  let failures = 0
  const fail = (msg: string) => { console.error(`FAIL ${msg}`); failures++ }
  const text = readFileSync('src/lessons/course.md', 'utf8')
  const units = parseCourse(text)
  const lessons = allLessons(units)
  // The test environment's stub window would make alphaTab set itself up for a browser
  const stub = (globalThis as any).window
  delete (globalThis as any).window
  const at = createRequire(import.meta.url)('@coderline/alphatab')
  ;(globalThis as any).window = stub

  if (parseCourse(text.replace(/\r?\n/g, '\r\n')).flatMap(u => u.lessons).filter(l => l.tex).length !== 39) fail('Windows line endings lose exercises')
  if (units.length !== 10) fail(`expected 10 units, found ${units.length}`)
  if (lessons.length !== 47) fail(`expected 47 lessons, found ${lessons.length}`)

  for (const lesson of lessons) {
    if (!lesson.goal) fail(`${lesson.id} has no goal`)
    if (!lesson.tex !== !lesson.notes) fail(`${lesson.id}: exercise and Notes must come together`)
    if (!lesson.tex && !lesson.check && !lesson.file) fail(`${lesson.id} has nothing to pass`)
    if (lesson.file && !existsSync(`src/lessons/pieces/${lesson.file}`)) fail(`${lesson.id} names a missing file: ${lesson.file}`)

    if (lesson.tex) {
      const score = at.importer.ScoreLoader.loadScoreFromBytes(new TextEncoder().encode(lesson.tex), new at.Settings())
      const used = new Set<number>()
      if (score.tracks.length !== 1 || score.tracks[0].playbackInfo.program !== 0) fail(`${lesson.id} must be one piano part`)
      score.tracks[0].staves.forEach((staff: any, s: number) => {
        if (staff.bars.length !== score.masterBars.length) fail(`${lesson.id} staff ${s} has the wrong bar count`)
        staff.bars.forEach((bar: any, b: number) => {
          const master = score.masterBars[b]
          const want = master.timeSignatureNumerator * 3840 / master.timeSignatureDenominator
          let got = 0
          for (const voice of bar.voices) for (const beat of voice.beats) {
            got += (3840 / beat.duration) * (beat.dots ? 1.5 : 1)
            for (const note of beat.notes) used.add(note.realValue)
          }
          if (master.isAnacrusis ? got >= want : got !== want) fail(`${lesson.id} staff ${s} bar ${b + 1}: ${got / 960} of ${want / 960} beats`)
        })
      })
      const off = OFF_KEY[score.tracks[0].staves[0].bars[0].keySignature] ?? []
      for (const midi of used) if (off.includes(midi % 12)) fail(`${lesson.id} leaves its key: ${midi}`)
      const want = new Set(lesson.notes!.map(midiOf))
      if ([...want].some(m => !used.has(m)) || [...used].some(m => !want.has(m))) fail(`${lesson.id} Notes don't match its exercise`)
    }

    const check = lesson.check
    if (check?.kind === 'tap') for (const tokens of check.patterns) {
      if (tapBeats(tokens).length % check.beats) fail(`${lesson.id} tap pattern isn't whole bars: ${tokens.join(' ')}`)
    }
    if (check) {
      const exercises = lessons.flatMap(l => (l.tex ? [l.tex] : []))
      for (let index = 0; index < promptCount(check); index++) {
        const prompt = nextPrompt(check, { index, earlier: [], missed: [], exercises, rng: Math.random })
        if ('options' in prompt && !prompt.options.includes(prompt.answer)) fail(`${lesson.id} prompt has no right answer: ${prompt.answer}`)
      }
    }
  }
  const shelf = parseShelf(text)
  if (shelf.length !== 15) fail(`expected 15 shelf pieces, found ${shelf.length}`)
  for (const piece of shelf) {
    const path = `src/lessons/pieces/${piece.file}`
    if (!existsSync(path)) { fail(`shelf names a missing file: ${piece.file}`); continue }
    const score = at.importer.ScoreLoader.loadScoreFromBytes(new Uint8Array(readFileSync(path)), new at.Settings())
    if (score.tracks[0].staves.length !== 2) fail(`${piece.file} isn't two staves`)
    if (!score.tracks[0].staves.every((s: any) => s.bars.some((b: any) => b.voices.some((v: any) => v.beats.some((n: any) => n.notes.length))))) fail(`${piece.file} has an empty staff`)
  }
  return failures
}
