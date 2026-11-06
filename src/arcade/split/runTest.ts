/// <reference types="node" />
// Run: node --import ./scripts/ts-esbuild-hooks.mjs src/runAllTests.ts --file src/arcade/split/runTest.ts
import { FALL_MS, createRun, slipId, type RunEvent, type Shot } from './run'
import { SPLIT, STAGES, dialAt, parseLine, stageById, type StageId } from './stages'

const FRAME_MS = 16

function start(id: StageId, { assist = false, weak = [] as string[] } = {}) {
  const events: RunEvent[] = []
  const shots: Shot[] = []
  const run = createRun({ stage: stageById(id), assist, start: 0, weak, emit: e => { events.push(e); if (e.type === 'phrase') shots.push(...e.phrase.shots) } })
  return { run, events, shots }
}

// Plays what `plays` lets through, each key at its own stamp, for as long as the run lasts
function drive({ run, shots }: ReturnType<typeof start>, plays: (s: Shot) => number | null, until = 600_000) {
  let now = 0
  const played = new Set<number>()
  while (!run.state.over && now < until) {
    now += FRAME_MS
    run.tick(now)
    shots.filter(s => s.at <= now && !played.has(s.id)).sort((a, b) => a.at - b.at).forEach(s => {
      played.add(s.id)
      const at = plays(s)
      if (at !== null) run.noteOn(s.key, at)
    })
  }
  return now
}
const onTime = (s: Shot) => s.at

export function runSplitTest(): number {
  let failures = 0
  const fail = (m: string) => { console.error(`FAIL  ${m}`); failures++ }
  const eq = (a: unknown, b: unknown, m: string) => { if (JSON.stringify(a) !== JSON.stringify(b)) fail(`${m}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`) }

  // The notation reads as the library writes it
  eq(parseLine(':4 E4 r G4.2 | :8 Bb3'), [{ key: 64, beat: 0, beats: 1 }, { key: 67, beat: 2, beats: 2 }, { key: 58, beat: 4, beats: 0.5 }], 'durations stick, rests take time')
  eq(parseLine(':6 C4 E4 G4').at(-1)?.beat, 1.333, 'three in the time of two')

  // Every piece stays on the keyboard and on its own side of middle C, and both hands end together
  for (const stage of STAGES) for (const p of stage.pieces) {
    const end = (notes: typeof p.left.notes) => Math.round(Math.max(...notes.map(n => n.beat + n.beats)))
    eq(end(p.left.notes), end(p.right.notes), `${p.id}: both hands last as long`)
    if (p.beats % 4) fail(`${p.id}: whole bars`)
    if (p.left.notes.some(n => n.key >= SPLIT || n.key < 48)) fail(`${p.id}: left hand leaves its side`)
    if (p.right.notes.some(n => n.key < SPLIT || n.key > 84)) fail(`${p.id}: right hand leaves its side`)
    if (stage.swap && p.right.notes.some(n => n.key - 12 >= SPLIT)) fail(`${p.id}: can't swap below middle C`)
    if (stage.swap && p.left.notes.some(n => n.key + 12 < SPLIT)) fail(`${p.id}: can't swap above middle C`)
  }

  // Stage content is what the brief says it is
  for (const p of stageById('same').pieces) eq(p.left.notes.map(n => n.beat), p.right.notes.map(n => n.beat), `${p.id}: same rhythm`)
  for (const p of stageById('different').pieces) if (p.left.notes.map(n => n.beat).join() === p.right.notes.map(n => n.beat).join()) fail(`${p.id}: rhythms differ`)
  const widest = (id: StageId) => Math.max(...stageById(id).pieces.flatMap(p => [p.left, p.right].flatMap(l => l.notes.slice(1).map((n, i) => Math.abs(n.key - l.notes[i].key)))))
  if (widest('leaps') <= widest('same')) fail('leaps are wider')
  for (const p of stageById('boss').pieces) eq(p.right.notes.filter(n => n.beat < 2).length * 2, p.left.notes.filter(n => n.beat < 2).length * 3, `${p.id}: three against two`)

  // Note speed moves, and only tightens
  for (const stage of STAGES) for (let p = 1; p < 40; p++) if (dialAt(stage, p, false) > dialAt(stage, p - 1, false)) fail(`${stage.id} dial loosens`)
  if (dialAt(STAGES[0], 0, true) <= dialAt(STAGES[0], 0, false)) fail('Assist should slow the notes')

  // A full clean run clears, with three stars of accuracy and every bar together
  for (const id of ['same', 'different', 'leaps', 'boss'] as StageId[]) {
    const game = start(id)
    drive(game, onTime)
    const { state } = game.run
    if (!state.cleared) fail(`${id}: a clean run clears`)
    eq(game.run.accuracy, 1, `${id}: all clean`)
    eq(state.played, game.shots.length, `${id}: every note counted once`)
    eq(state.together, state.bars, `${id}: every bar together`)
    if (game.events.filter(e => e.type === 'end').length !== 1) fail(`${id}: ends once`)
  }

  // Both hands together pay more than the notes alone
  {
    const game = start('same')
    drive(game, onTime)
    const bars = game.events.filter(e => e.type === 'bar')
    if (!bars.length || !bars.every(e => e.type === 'bar' && e.points === 200)) fail('a together bar pays up and together')
  }

  // A hand that stops ends the run, about FALL_MS after its first missed note
  for (const hand of ['left', 'right'] as const) {
    const game = start('same')
    const ended = drive(game, s => (s.hand === hand ? null : s.at))
    const end = game.events.find(e => e.type === 'end')
    eq(end?.type === 'end' && [end.cleared, end.fell], [false, hand], `${hand} falling ends it`)
    const first = game.shots.find(s => s.hand === hand)!
    if (Math.abs(ended - (first.at + FALL_MS)) > FRAME_MS) fail(`${hand} fell at ${ended}`)
  }

  // A hand that catches up is back in the air: a slip is not a fall
  {
    const game = start('same')
    let skipped = 0
    drive(game, s => (s.hand === 'left' && skipped++ % 2 === 0 ? null : s.at))
    if (!game.run.state.cleared) fail('missing every other note never leaves a hand behind long enough')
    if (game.run.accuracy >= 0.95) fail('but it costs accuracy')
    if (game.run.state.together >= game.run.state.bars) fail('and not every bar counts as together')
  }

  // Timestamps decide, not frames: a key stamped in time wins after a slow frame
  {
    const game = start('same')
    const { run, shots } = game
    run.tick(0)
    const shot = shots[0]
    run.tick(shot.at + 200)
    run.noteOn(shot.key, shot.at)
    eq(run.state.clean, 1, 'stamped in time, arriving late')
    run.noteOn(shots[1].key, shots[1].at + 300)
    eq(run.state.clean, 1, 'stamped too late is nothing')
  }

  // The split: the right note in the wrong hand's lane is no answer, and a wrong key costs the combo once
  {
    const game = start('same')
    const { run, shots, events } = game
    run.tick(0)
    const left = shots.find(s => s.hand === 'left')!
    const right = shots.find(s => s.hand === 'right')!
    run.tick(left.at - 300)
    run.noteOn(right.key, left.at)
    eq(run.state.clean, 1, 'each hand has its own judge')
    run.noteOn(left.key + 1, left.at)
    run.noteOn(left.key + 2, left.at)
    eq(events.filter(e => e.type === 'wrong').length, 1, 'one slip per note')
    eq(run.state.combo, 0, 'a wrong key breaks the combo')
    run.noteOn(left.key, left.at + 10)
    eq([run.state.played, run.state.clean], [2, 1], 'a note with a wrong try is played, not clean')
  }

  // Assist: one hand at a time clears, and slower notes give it longer
  {
    const game = start('same', { assist: true })
    game.run.rest('left')
    drive(game, s => (s.hand === 'left' ? null : s.at))
    if (!game.run.state.cleared) fail('a resting hand cannot fall')
    if (game.events.some(e => e.type === 'miss')) fail('a resting hand cannot miss')
    eq(game.run.state.together, 0, 'one hand is never together')
    const solo = start('same')
    solo.run.rest('left')
    if (solo.run.resting) fail('only Assist rests a hand')
  }

  // Endless: every other phrase the parts trade sides, and it never clears
  {
    const game = start('endless')
    const ended = drive(game, onTime, 300_000)
    if (game.run.state.over) fail(`a clean Endless run went on: ended at ${ended}`)
    const phrases = game.events.flatMap(e => (e.type === 'phrase' ? [e.phrase] : []))
    if (phrases.length < 8) fail('Endless keeps sending phrases')
    for (const p of phrases) {
      eq(p.swapped, p.index % 2 === 1, 'swap alternates')
      if (p.shots.some(s => (s.key < SPLIT) !== (s.hand === 'left'))) fail('a swapped part stays on its hand\'s side')
    }
    const swapped = phrases[1]
    const leftKeys = swapped.shots.filter(s => s.hand === 'left').map(s => s.key)
    eq(leftKeys, swapped.piece.right.notes.map(n => n.key - 12), 'the left hand takes the tune an octave down')
    const quit = start('endless')
    drive(quit, s => (s.at < 30_000 ? s.at : null))
    if (quit.run.state.cleared || !quit.run.state.over) fail('Endless ends by falling')
  }

  // Slips come back first next time
  {
    const game = start('same', { weak: ['sway.left'] })
    game.run.tick(0)
    eq(game.shots[0].piece.id, 'sway', 'the weak piece opens')
    eq(slipId(game.shots[0]), 'sway.left', 'slips are named by piece and hand')
  }

  // Pausing is only not ticking: nothing moves without time
  {
    const game = start('same')
    game.run.tick(0)
    const beat = game.run.beatAt(-400)
    if (!(beat < 0)) fail('the lanes run in before the first note')
    if (game.run.lag('left', 1_000_000) !== 0) fail('nobody has fallen behind yet')
  }

  return failures
}
