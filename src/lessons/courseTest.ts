import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { allLessons, parseCourse, parseShelf } from './course'
import { Chord } from 'tonal'
import { chordPress, midiOf, nextPrompt, promptCount, tapBeats, touchScore, type Prompt, type Struck } from './drill'
import { nextWaitTime, buildSteps } from '../utils/stepThrough'
import { parseMidiBuffer } from '../utils/midiParser'
import { convertForeignFileToMidiBuffer } from '../utils/foreignFormatImport'
import { WINDOW_SEC } from '../utils/practiceSession'
import { PASS, playScore } from './progress'

// Keys each signature rules out, as note numbers within an octave
const OFF_KEY: Record<number, number[]> = { 1: [5], 2: [5, 0], [-1]: [11], [-2]: [11, 4] }

// The keys of a 49-key keyboard, and what one hand can hold down at once
const LOWEST = 36, HIGHEST = 84, HAND_SPAN = 14
const FASTEST_STEP_SEC = 0.15
const TOOLS = ['chords', 'scales', 'starmap']

// A student who plays exactly what's asked: every key, on the moment, in order
async function playThrough(tex: string, at: any): Promise<string[]> {
  const stub = (globalThis as any).window
  delete (globalThis as any).window
  const buffer = await convertForeignFileToMidiBuffer(new TextEncoder().encode(tex), 'musicxml').finally(() => { (globalThis as any).window = stub })
  const midi = parseMidiBuffer(buffer, 'test', 'test.score') as any
  const tracks = midi.tracks.map((t: any) => ({ index: t.index, muted: false, solo: false, visible: true, color: '#000' }))
  const steps = buildSteps(midi, tracks as any)
  const problems: string[] = []
  if (!steps.length) return ['has nothing to play']
  const presses = steps.flatMap(s => s.notes.map(n => ({ midi: n.midi, time: s.time })))
  if (playScore(steps, presses, WINDOW_SEC) < 1) problems.push('a perfect run scores under 100%')
  let now = steps[0].time
  for (const step of steps) {
    const next = nextWaitTime(steps, now, new Set(step.notes.map(n => n.midi)), 0, midi.duration)
    if (next === null) problems.push(`wait step sticks at ${step.time}`)
    now = next ?? step.time
  }
  if (now < steps.at(-1)!.time) problems.push('wait step never reaches the end')
  for (let i = 1; i < steps.length; i++) if (steps[i].time - steps[i - 1].time < FASTEST_STEP_SEC) problems.push(`too quick at ${steps[i].time}`)
  return problems
}

// The right answer to a prompt, as the drill would see it
function answerPrompt(prompt: Prompt): string | null {
  if (prompt.kind === 'chord') {
    const held = new Set<number>()
    let result = ''
    for (const note of prompt.notes) { held.add(midiOf(note)); result = chordPress(prompt, midiOf(note), held) }
    return result === 'done' ? null : `chord ${prompt.notes} can't be finished`
  }
  if (prompt.kind === 'touch') {
    const beat = 600
    const well: Record<string, (i: number) => Partial<Struck>> = {
      soft: () => ({ vel: 40 }), loud: () => ({ vel: 100 }),
      legato: i => ({ off: (i + 1) * beat + 10 }), staccato: i => ({ off: i * beat + 150 }),
    }
    const notes = prompt.notes.map((_, i) => ({ vel: 70, on: i * beat, pedal: 2, off: i * beat + 500, ...well[prompt.style]?.(i) }))
    const before = notes.map(n => ({ ...n, vel: 70 }))
    return touchScore(prompt.style, notes, before, true).value === 1 ? null : `touch ${prompt.style} can't be passed`
  }
  if (prompt.kind === 'quiz' && new Set(prompt.options).size < 2) return `quiz has no choice: ${prompt.question}`
  return null
}

export async function runCourseTest(): Promise<number> {
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

  const reading = units.filter(u => u.track === 'Reading music')
  const skills = units.filter(u => u.track === 'Piano skills')
  const readingLessons = allLessons(reading)
  if (parseCourse(text.replace(/\r?\n/g, '\r\n')).flatMap(u => u.lessons).filter(l => l.tex).length !== lessons.filter(l => l.tex).length) fail('Windows line endings lose exercises')
  if (readingLessons.filter(l => l.tex).length !== 39) fail('Reading music lost an exercise')
  if (reading.length !== 10) fail(`expected 10 Reading music units, found ${reading.length}`)
  if (readingLessons.length !== 47) fail(`expected 47 Reading music lessons, found ${readingLessons.length}`)
  if (skills.length !== 7) fail(`expected 7 Piano skills units, found ${skills.length}`)
  if (allLessons(skills).length !== 34) fail(`expected 34 Piano skills lessons, found ${allLessons(skills).length}`)
  if (units.length !== reading.length + skills.length) fail('a unit is on no known track')
  if (new Set(lessons.map(l => l.id)).size !== lessons.length) fail('two lessons share an id')

  for (const lesson of lessons) {
    if (lesson.tool && !TOOLS.includes(lesson.tool)) fail(`${lesson.id} names an unknown tool: ${lesson.tool}`)
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
            const held = beat.notes.map((n: any) => n.realValue)
            if (held.length && Math.max(...held) - Math.min(...held) > HAND_SPAN) fail(`${lesson.id} staff ${s} bar ${b + 1}: too wide for one hand`)
          }
          if (master.isAnacrusis ? got >= want : got !== want) fail(`${lesson.id} staff ${s} bar ${b + 1}: ${got / 960} of ${want / 960} beats`)
        })
      })
      const off = OFF_KEY[score.tracks[0].staves[0].bars[0].keySignature] ?? []
      for (const midi of used) if (off.includes(midi % 12)) fail(`${lesson.id} leaves its key: ${midi}`)
      for (const midi of used) if (midi < LOWEST || midi > HIGHEST) fail(`${lesson.id} runs off a 49-key keyboard: ${midi}`)
      const want = new Set(lesson.notes!.map(midiOf))
      if ([...want].some(m => !used.has(m)) || [...used].some(m => !want.has(m))) fail(`${lesson.id} Notes don't match its exercise`)
      for (const problem of await playThrough(lesson.tex, at)) fail(`${lesson.id} ${problem}`)
    }

    const check = lesson.check
    if (check?.kind === 'tap') for (const tokens of check.patterns) {
      if (tapBeats(tokens).length % check.beats) fail(`${lesson.id} tap pattern isn't whole bars: ${tokens.join(' ')}`)
    }
    if (check?.kind === 'chords') for (const { name, notes } of check.chords) {
      const spelled = name ? Chord.get(name) : null
      const classes = (list: string[]) => [...new Set(list.map(n => midiOf(`${n.replace(/\d/, '')}4`) % 12))].sort().join()
      if (spelled && !spelled.empty && classes(spelled.notes) !== classes(notes)) fail(`${lesson.id} spells ${name} wrongly: ${notes}`)
    }
    if (check) {
      const exercises = readingLessons.flatMap(l => (l.tex ? [l.tex] : []))
      for (let index = 0; index < promptCount(check); index++) {
        const prompt = nextPrompt(check, { index, earlier: [], missed: [], exercises, rng: Math.random })
        if ('options' in prompt && !prompt.options.includes(prompt.answer)) fail(`${lesson.id} prompt has no right answer: ${prompt.answer}`)
        if ('options' in prompt && new Set(prompt.options).size !== prompt.options.length) fail(`${lesson.id} repeats an option: ${prompt.options}`)
        if (prompt.kind === 'quiz') prompt.hear?.flat().forEach(midiOf)
        if (prompt.kind === 'note') midiOf(prompt.name)
        const problem = answerPrompt(prompt)
        if (problem) fail(`${lesson.id} ${problem}`)
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
