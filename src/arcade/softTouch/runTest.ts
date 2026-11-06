/// <reference types="node" />
// Run: node --import ./scripts/ts-esbuild-hooks.mjs src/runAllTests.ts --file src/arcade/softTouch/runTest.ts
import { LIBRARY } from '../library'
import { levelOf, readTouch, type Touch } from './calibrate'
import { LIVES, SLIPS_PER_LIFE, bossStars, cleanForThree, createRun, multiplierFor, nextPhrase, starsFor, stepsOf, type RunEvent, type Step } from './run'
import { STAGES, beatAt, riffNotes, stageById, widthAt, type StageId } from './stages'

const seeded = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32 }
const TOUCH: Touch = { soft: 30, loud: 110 }

function play(id: StageId, assist = false) {
  const events: RunEvent[] = []
  const stage = stageById(id)
  const run = createRun({ stage, assist, rng: seeded(1), emit: e => events.push(e), start: 0 })
  return { run, events, stage }
}

// Plays every note on its stamp at the height `aim` gives, until the run stops
function drive(game: ReturnType<typeof play>, aim: (s: Step) => number | null, limit = 600_000) {
  const { run } = game
  let now = 0
  let last: Step | null = null
  while (!run.state.over && now < limit) {
    const next = run.coming[0]
    if (next && next !== last && now >= next.at) {
      last = next
      const level = aim(next)
      if (level !== null) run.noteOn(next.key, next.at + 5, level)
    }
    run.tick(now += 16)
  }
}

export function runSoftTouchTest(): number {
  let failures = 0
  const fail = (m: string) => { console.error(`FAIL  ${m}`); failures++ }
  const eq = (a: unknown, b: unknown, m: string) => { if (JSON.stringify(a) !== JSON.stringify(b)) fail(`${m}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`) }

  // Every phrase is a library riff the keyboard reaches, and its rhythm fills its bars
  for (const stage of STAGES) for (const phrase of stage.phrases) {
    if (!LIBRARY.some(i => i.id === phrase.id)) fail(`${phrase.id} is not in the library`)
    for (const n of phrase.notes) if (n.key < 48 || n.key > 84) fail(`${phrase.id} leaves the keyboard: ${n.key}`)
    const riff = LIBRARY.find(i => i.id === phrase.id)
    const bars = riff?.kind === 'riff' ? riff.tex.split('\n').at(-1)!.split('|').length : 0
    const last = phrase.notes[phrase.notes.length - 1].beat
    if (last >= bars * 4 || last < (bars - 1) * 4) fail(`${phrase.id}: last note on beat ${last} of ${bars} bars`)
  }
  eq(riffNotes('or-bl-walk').map(n => n.beat), [0, 1, 2, 3, 4, 6, 8, 9, 10, 11, 12], 'durations stick')
  const marks = (id: StageId) => [...new Set(stageById(id).phrases.flatMap(p => p.notes.map(n => n.mark)))].sort()
  eq(marks('levels'), ['f', 'p'], 'stage 1 has two levels')
  eq(marks('three'), ['ff', 'mf', 'p'], 'stage 2 has three levels')
  for (const p of stageById('crescendo').phrases) {
    const heights = stepsOf(p, 0, 1000).map(s => s.level)
    if (heights.some((h, i) => i > 0 && h < heights[i - 1])) fail(`${p.id} is not a crescendo`)
  }
  const peak = stepsOf(stageById('boss').phrases[0], 0, 1000).map(s => s.level)
  const top = peak.indexOf(Math.max(...peak))
  if (top === 0 || top === peak.length - 1 || peak.some((h, i) => (i > 0 && i <= top && h < peak[i - 1]) || (i > top && h > peak[i - 1]))) fail('the vault phrase rises and falls')

  // The dial only tightens and hurries, and Assist only widens
  for (const stage of STAGES) {
    for (let r = 1; r < 40; r++) {
      if (widthAt(stage, r, false) > widthAt(stage, r - 1, false)) fail(`${stage.id} window widens`)
      if (beatAt(stage, r) > beatAt(stage, r - 1)) fail(`${stage.id} slows down`)
    }
    if (widthAt(stage, 0, true) <= widthAt(stage, 0, false)) fail('Assist should widen the window')
  }
  if (widthAt(stageById('endless'), 40, false) >= widthAt(stageById('levels'), 40, false)) fail('Endless narrows furthest')

  // Calibration: your own range, a keyboard that ignores touch, a range too close to use
  eq(readTouch([30, 31, 29, 30, 90], [110, 112, 108, 110, 111]), { soft: 30, loud: 110 }, 'medians shrug off a stray hit')
  eq(readTouch([64, 64, 64, 64, 64], [64, 64, 64, 64, 64]), 'fixed', 'fixed velocity')
  eq(readTouch([100, 101, 100, 100, 100], [100, 102, 101, 100, 101]), 'fixed', 'barely moving')
  eq(readTouch([60, 62, 61, 60, 61], [70, 72, 71, 70, 71]), 'close', 'too close')
  eq(levelOf(30, TOUCH).toFixed(2), '0.15', 'your softest')
  eq(levelOf(110, TOUCH).toFixed(2), '0.85', 'your loudest')
  eq([levelOf(1, TOUCH), levelOf(127, { soft: 30, loud: 90 })], [0, 1], 'the meter stops at its ends')
  const narrowest = widthAt(stageById('endless'), 40, false)
  if (Math.abs(levelOf(30, TOUCH) - 0.1) > narrowest / 2 || Math.abs(levelOf(110, TOUCH) - 0.9) > narrowest / 2) fail('your limits should reach pp and ff')

  // A full run: clears every room, centred, for three stars
  for (const id of ['levels', 'three', 'crescendo'] as const) {
    const game = play(id)
    drive(game, s => s.level)
    const { state } = game.run
    eq([state.cleared, state.rooms, state.slips], [true, 4, 0], `${id} clears`)
    eq(game.events.filter(e => e.type === 'room').length, 4, `${id} rooms`)
    eq(starsFor(game.run.accuracy, false), 3, `${id} stars`)
    if (state.width >= widthAt(game.stage, 0, false)) fail(`${id} window should narrow`)
  }

  // Timestamps decide, not frames: a note stamped in time counts after a slow frame
  {
    const game = play('levels')
    const first = game.run.coming[0]
    game.run.noteOn(first.key, first.at + 10, first.level)
    game.run.tick(first.at + 900)
    eq([game.run.state.clean, game.run.state.slips], [1, 0], 'a stamped note is never lost')
  }

  // Any key counts; between notes a key counts for nothing; a chord is one note
  {
    const game = play('levels')
    const first = game.run.coming[0]
    game.run.noteOn(50, first.at - 900, 0.9)
    eq(game.run.state.played, 0, 'no note due, nothing happens')
    game.run.noteOn(50, first.at, first.level)
    game.run.noteOn(54, first.at, first.level)
    eq(game.run.state.played, 1, 'a chord is one step')
  }

  // Inside pays, more nearer the centre
  {
    const a = play('levels'), b = play('levels')
    const s = a.run.coming[0]
    a.run.noteOn(s.key, s.at, s.level)
    b.run.noteOn(s.key, s.at, s.level + a.run.state.width / 2 - 0.01)
    if (a.run.state.score <= b.run.state.score) fail('the centre should pay more')
    if (b.run.state.score < 100) fail('inside always pays')
    eq([multiplierFor(0), multiplierFor(11), multiplierFor(40)], [1, 2, 3], 'multiplier')
  }

  // Too loud, too soft and silence are told apart; every second slip wakes the house
  {
    const game = play('levels')
    let notes = 0
    drive(game, s => s.level + (++notes % 2 ? 0.4 : -0.4))
    const slips = game.events.flatMap(e => (e.type === 'slip' ? [e] : []))
    eq(game.run.state.slips, LIVES * SLIPS_PER_LIFE, 'too many misses end it')
    eq([game.run.state.lives, game.run.state.cleared], [0, false], 'not a clear')
    eq(slips.filter(e => e.alarm).length, LIVES, 'every second slip is an alarm')
    eq(slips.slice(0, 2).map(e => e.slip), ['loud', 'soft'], 'which way it missed')
    const quiet = play('levels')
    drive(quiet, () => null)
    eq(quiet.events.some(e => e.type === 'slip' && e.slip === 'late'), true, 'a note not played is late')
    eq(quiet.run.state.over, true, 'walking away ends the run')
  }

  // Assist lets a note through that the plain window turns away
  {
    const plain = play('levels'), helped = play('levels', true)
    const s = plain.run.coming[0]
    const off = s.level + plain.run.state.width / 2 + 0.02
    plain.run.noteOn(s.key, s.at, off)
    helped.run.noteOn(s.key, s.at, off)
    eq([plain.run.state.clean, helped.run.state.clean], [0, 1], 'Assist widens')
    eq([starsFor(1, true), bossStars(1, true)], [1, 1], 'a clear with Assist is 1 star')
  }

  // The boss: the whole phrase in one go. A slip spins it back; three end the job
  {
    const game = play('boss')
    drive(game, s => s.level)
    eq([game.run.state.cleared, game.run.state.tries, game.run.state.clean], [true, 1, 11], 'the vault opens')
    const again = play('boss')
    let slipped = false
    drive(again, s => { if (s.mark === 'ff' && !slipped) { slipped = true; return 0.1 } return s.level })
    eq([again.run.state.cleared, again.run.state.tries, again.run.state.lives], [true, 2, LIVES - 1], 'it can be tried again')
    eq(again.events.filter(e => e.type === 'room').length, 2, 'the phrase starts over')
    const shut = play('boss')
    drive(shut, s => (s.mark === 'mf' ? 0.1 : s.level))
    eq([shut.run.state.cleared, shut.run.state.tries, shut.run.state.lives], [false, LIVES, 0], 'three tries')
    eq([bossStars(1, false), bossStars(2, false), bossStars(3, false)], [3, 2, 1], 'boss stars')
  }

  // Endless goes on until the alarm, and it does narrow
  {
    const game = play('endless')
    let notes = 0
    drive(game, s => (++notes > 70 ? (s.level > 0.5 ? 0 : 1) : s.level))
    eq([game.run.state.over, game.run.state.cleared], [true, false], 'only the alarm ends it')
    if (game.run.state.rooms < 5) fail(`endless reached room ${game.run.state.rooms}`)
    if (game.run.state.width >= widthAt(game.stage, 0, false)) fail('endless narrows')
  }

  // A marking that slips comes back more often; a phrase never repeats at once
  {
    const pool = [...stageById('three').phrases, ...stageById('crescendo').phrases]
    const count = (missed: string[]) => { const rng = seeded(7); return Array.from({ length: 400 }, () => nextPhrase(pool, missed, null, rng)).filter(p => p.notes.some(n => n.mark === 'pp')).length }
    if (count(['pp']) <= count([])) fail('a weak marking should come up more')
    if (nextPhrase(pool, [], pool[0], seeded(3)) === pool[0]) fail('a phrase should not repeat at once')
    if (!createRun({ stage: stageById('levels'), assist: false, rng: seeded(1), emit: () => {}, start: 0, weak: ['p'] }).coming.length) fail('a run with weak marks still starts')
  }

  // The door is the phrase's last loud note
  eq(stepsOf(stageById('levels').phrases[0], 0, 1000).map(s => s.act), [null, null, 'noise', null, 'door', null], 'loud notes act')

  eq([starsFor(0.5, false), starsFor(0.8, false), starsFor(0.95, false)], [1, 2, 3], 'stars')
  for (const played of [1, 24, 37, 100]) if (starsFor(cleanForThree(played) / played, false) !== 3) fail(`${played} three-star count`)
  return failures
}
