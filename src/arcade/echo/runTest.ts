/// <reference types="node" />
// Run: node --import ./scripts/ts-esbuild-hooks.mjs src/runAllTests.ts --file src/arcade/echo/runTest.ts
import { LIBRARY } from '../library'
import { createRun, multiplierFor, rightForThree, scheduleOf, starsFor, LIVES, type Run, type RunEvent } from './run'
import { bossParts, poolAt } from './phrases'
import { STAGES, lengthAt, stageById, type StageId } from './stages'

const seeded = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32 }

function start(id: StageId, assist = false, seed = 1, weak: string[] = []) {
  const events: RunEvent[] = []
  const run = createRun({ stage: stageById(id), assist, rng: seeded(seed), emit: e => events.push(e), weak })
  run.sung()
  return { run, events }
}

// Plays the rest of the phrase on the screen, right or with a wrong last note
function answer(run: Run, wrongLast = false) {
  const { steps } = run.phrase
  for (let i = run.marks.length, at = 1000; i < steps.length; i++, at += 500) {
    const step = steps[i]
    const keys = wrongLast && i === steps.length - 1 ? step.keys.map(k => k + 1) : step.keys
    const held: number[] = []
    for (const key of keys) { held.push(key); run.noteOn(key, at, held) }
  }
}
const turn = (run: Run) => { run.next(); run.sung() }

export function runEchoTest(): number {
  let failures = 0
  const fail = (m: string) => { console.error(`FAIL  ${m}`); failures++ }
  const eq = (a: unknown, b: unknown, m: string) => { if (JSON.stringify(a) !== JSON.stringify(b)) fail(`${m}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`) }

  // Every id in the stages is in the library, in the key of the run, and the dial only grows
  for (const stage of STAGES) {
    for (const id of stage.items) if (!LIBRARY.some(i => i.id === id)) fail(`${stage.id}: ${id} is not in the library`)
    for (let n = 1; n < 40; n++) if (lengthAt(stage, n) < lengthAt(stage, n - 1)) fail(`${stage.id}: the dial shrank`)
    for (const key of stage.keys) for (let played = 0; played < 30; played++) {
      const pool = poolAt(stage, played, key)
      if (!pool.length) fail(`${stage.id}: nothing to sing at ${played} in ${key}`)
      if (stage.id !== 'boss') for (const p of pool) if (p.steps.length !== lengthAt(stage, played)) fail(`${stage.id}: ${p.id} has ${p.steps.length} notes at ${played}`)
    }
  }
  eq(lengthAt(stageById('intervals'), 7), 2, 'intervals stay two notes')
  eq([lengthAt(stageById('phrases'), 0), lengthAt(stageById('phrases'), 7)], [3, 5], 'short phrases grow')
  eq([lengthAt(stageById('leaps'), 0), lengthAt(stageById('leaps'), 7)], [5, 7], 'longer phrases grow')

  // Short phrases stay in one key; longer ones have leaps and rhythm
  const major = new Set([0, 2, 4, 5, 7, 9, 11])
  for (const key of ['C', 'G']) {
    const up = key === 'G' ? 7 : 0
    for (const p of poolAt(stageById('phrases'), 6, key)) for (const s of p.steps) if (!major.has((s.keys[0] - up + 120) % 12)) fail(`${p.id} leaves ${key}`)
  }
  for (const p of poolAt(stageById('leaps'), 6, 'C')) {
    const leap = Math.max(...p.steps.slice(1).map((s, i) => Math.abs(s.keys[0] - p.steps[i].keys[0])))
    if (leap < 5 || new Set(p.steps.map(s => s.beats)).size < 2) fail(`${p.id}: no leap or no rhythm`)
  }

  // The boss's parts are one phrase, whole and in order
  {
    const parts = bossParts(stageById('boss'))
    eq(parts.length, 3, 'three parts')
    eq(parts.flatMap(p => p.steps).length, 18, 'every note of the riff')
    eq(parts[0].steps.map(s => s.keys[0]), [72, 69, 65, 69, 67], 'starts where the riff starts')
  }

  // A full clear: every phrase right, no replay
  {
    const { run, events } = start('intervals')
    for (let i = 0; i < 8; i++) { answer(run); turn(run) }
    eq(events.at(-1), { type: 'end', cleared: true }, 'eight right answers clear the stage')
    eq([run.state.right, run.state.played, run.state.fails, run.state.noReplay], [8, 8, 0, 8], 'the run counts them')
    eq(starsFor(run.accuracy, false), 3, 'a clean run earns three stars')
    eq(run.near, 1, 'and the whale arrives')
    if (run.state.bestCombo !== 8) fail('right answers build a combo')
  }

  // Order matters: the right notes the wrong way round are a miss, and only once finished
  {
    const { run } = start('phrases')
    const notes = run.phrase.steps.map(s => s.keys[0])
    if (new Set(notes).size < 2) fail('the opening phrase needs two notes')
    const first = notes.find(n => n !== notes[0])!
    run.noteOn(first, 0, [first])
    eq(run.marks, ['wrong'], 'out of order is wrong')
    eq(run.state.fails, 0, 'a wrong note is not yet a missed phrase')
    run.noteOn(notes[1], 1, [notes[1]])
    run.noteOn(notes[2], 2, [notes[2]])
    eq(run.state.fails, 1, 'the phrase counts as missed once finished wrong')
    eq(run.state.phase, 'reveal', 'then the answer shows')
    eq(run.state.score, (run.marks.filter(m => m === 'right').length) * 50, 'right notes still score, with no bonus')
  }

  // Any octave counts; pitch is what's judged, and keys during the song are ignored
  {
    const { run } = start('intervals')
    run.noteOn(run.phrase.steps[0].keys[0] + 12, 0, [])
    eq(run.marks, ['right'], 'an octave up is the same note')
    const sung = createRun({ stage: stageById('intervals'), assist: false, rng: seeded(1), emit: () => undefined })
    sung.noteOn(sung.phrase.steps[0].keys[0], 0, [])
    eq(sung.marks, [], 'keys during the song do nothing')
  }

  // Replay costs the bonus and nothing else
  {
    const plain = start('intervals')
    answer(plain.run)
    const again = start('intervals')
    again.run.replay()
    eq(again.run.state.phase, 'singing', 'the whale sings again')
    again.run.sung()
    answer(again.run)
    eq(plain.run.state.score - again.run.state.score, 150, 'the bonus is all a replay costs')
    eq([again.run.state.fails, again.run.state.right, again.run.state.combo], [0, 1, 1], 'a replay is never a miss')
    eq(again.run.state.noReplay, 0, 'and it does not count as without a replay')
  }

  // A replay mid-answer keeps the notes already played
  {
    const { run } = start('phrases')
    run.noteOn(run.phrase.steps[0].keys[0], 0, [])
    run.replay()
    run.sung()
    eq(run.marks, ['right'], 'played notes stay')
  }

  // Three missed phrases end a run, on the screen's next step
  {
    const { run, events } = start('phrases')
    for (let i = 0; i < LIVES; i++) { answer(run, true); if (i < LIVES - 1) turn(run) }
    eq(run.state.phase, 'reveal', 'the last answer still shows')
    run.next()
    eq(events.at(-1), { type: 'end', cleared: false }, 'three fails end it')
    eq(run.state.right, 0, 'and nothing right was invented')
  }

  // A missed phrase moves on, but two misses still clear
  {
    const { run, events } = start('intervals')
    answer(run, true); turn(run)
    answer(run, true); turn(run)
    for (let i = 0; i < 6; i++) { answer(run); turn(run) }
    eq(events.at(-1), { type: 'end', cleared: true }, 'two misses clear')
    if (starsFor(run.accuracy, false) !== 1) fail('6 of 8 is one star')
  }

  // Assist gives the first note and a longer playback, and at most one star
  {
    const { run } = start('intervals', true)
    eq(run.marks, ['right'], 'the first note is given')
    answer(run)
    eq(run.state.right, 1, 'and the rest answers the phrase')
    const phrase = run.phrase
    if (scheduleOf(phrase, true).done <= scheduleOf(phrase, false).done) fail('Assist sings longer')
    eq(starsFor(1, true), 1, 'at most one star with Assist')
  }

  // The boss repeats a missed part, and clears on all its parts
  {
    const { run, events } = start('boss')
    const first = run.phrase.id
    answer(run, true); turn(run)
    eq(run.phrase.id, first, 'a missed part comes round again')
    for (let i = 0; i < 3; i++) { answer(run); turn(run) }
    eq(events.at(-1), { type: 'end', cleared: true }, 'all the parts clear the boss')
    eq([run.state.right, run.state.fails], [3, 1], 'the boss counts parts')
  }

  // Endless sings chords, any way up, and keeps going until three are missed
  {
    const { run, events } = start('endless')
    let phrases = 0
    while (phrases < 20) {
      if (!run.phrase.steps.every(s => s.chord)) fail('Endless sings chords')
      answer(run); turn(run); phrases++
    }
    if (events.some(e => e.type === 'end')) fail('Endless has no finish line')
    eq(run.phrase.steps.length, 8, 'the dial tops out')
    if (run.near >= 1) fail('the whale never quite arrives')
    for (let i = 0; i < 3; i++) { answer(run, true); turn(run) }
    if (events.at(-1)?.type !== 'end') fail('three misses end Endless')
  }

  // A chord: one wrong stack is one wrong step, not one per key
  {
    const { run } = start('endless')
    const [step, after] = run.phrase.steps
    const wrong = step.chord!.keys.map(k => k + 1)
    const extra = [...wrong, wrong[0] + 3]
    const held: number[] = []
    extra.forEach(k => { held.push(k); run.noteOn(k, 100, held) })
    eq(run.marks, ['wrong'], 'one try, one mark')
    const again: number[] = []
    for (const k of after.keys) { again.push(k); run.noteOn(k, 900, again) }
    eq(run.marks, ['wrong', 'right'], 'the next chord is judged on its own')
  }

  // Weak phrases come back more often than the rest
  {
    const weak = ['interval-4']
    let seen = 0, base = 0
    for (let seed = 1; seed <= 200; seed++) {
      const a = start('intervals', false, seed, weak), b = start('intervals', false, seed)
      answer(a.run); a.run.next(); answer(b.run); b.run.next()
      if (a.run.phrase.id === 'interval-4') seen++
      if (b.run.phrase.id === 'interval-4') base++
    }
    if (seen <= base) fail(`weak phrases should repeat: ${seen} vs ${base}`)
  }

  // The schedule keeps a phrase's rhythm, and starts on its first note
  {
    const phrase = bossParts(stageById('boss'))[1]
    const { notes } = scheduleOf(phrase, false)
    eq(notes[0].at, 0, 'the first note is at the start')
    if (notes.some((n, i) => i > 0 && n.at <= notes[i - 1].at)) fail('notes in order')
  }

  eq(rightForThree(8), 8, 'three stars needs 8 of 8')
  eq(multiplierFor(6), 2, 'six in a row is double')
  return failures
}
