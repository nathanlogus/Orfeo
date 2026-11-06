/// <reference types="node" />
// Run: node --import ./scripts/ts-esbuild-hooks.mjs src/runAllTests.ts --file src/arcade/scaleClimb/runTest.ts
import { Note, Scale } from 'tonal'
import { FALL_SLIPS, GRIP_BEATS, LIVES, createRun, multiplierFor, riffFor, starsFor, type RunEvent } from './run'
import { STAGES, climbOf, drillSteps, paceAt, stageById, type Stage, type StageId } from './stages'

const KEYBOARD = [48, 84]
const GAP = 400

function start(id: StageId, assist = false, weak: string[] = []) {
  const events: RunEvent[] = []
  const stage = stageById(id)
  return { events, stage, run: createRun({ stage, assist, emit: e => events.push(e), weak }) }
}
type Play = ReturnType<typeof start>

// Plays the route to the top, at one steady gap; the clock is whatever `at` says
function playRoute({ run }: Play, at: number, gap = GAP) {
  const route = [...run.climb.keys]
  for (const key of route) { run.noteOn(key, at); at += gap }
  return at
}
// Lets the riff finish, as frames would
const rest = ({ run }: Play, at: number) => { while (run.resting && !run.state.over) { at += 16; run.tick(at) } return at }

export function runScaleClimbTest(): number {
  let failures = 0
  const fail = (m: string) => { console.error(`FAIL  ${m}`); failures++ }
  const eq = (a: unknown, b: unknown, m: string) => { if (JSON.stringify(a) !== JSON.stringify(b)) fail(`${m}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`) }

  // Routes are real scales, up and back down, and fit the Arcade's keyboard
  eq(climbOf('C', 'major').notes.join(' '), 'C D E F G A B C B A G F E D C', 'C major route')
  eq(climbOf('C', 'major').keys.slice(0, 8), [60, 62, 64, 65, 67, 69, 71, 72], 'C major keys')
  eq(climbOf('A', 'harmonic minor').notes.slice(0, 8).join(' '), 'A B C D E F G# A', 'harmonic minor raises the seventh')
  eq(climbOf('A', 'minor', 2).keys.length, 29, 'two octaves, up and down')
  eq(climbOf('A', 'minor', 2).keys[14], 81, 'two octaves reach the top note')
  for (const stage of STAGES) for (const climb of stage.scales) {
    if (Math.min(...climb.keys) < KEYBOARD[0] || Math.max(...climb.keys) > KEYBOARD[1]) fail(`${climb.id} runs off the keyboard`)
    const pcs = new Set(Scale.get(`${climb.tonic} ${climb.type === 'minor' ? 'aeolian' : climb.type}`).notes.map(n => Note.chroma(n)))
    if (climb.keys.some(k => !pcs.has(k % 12))) fail(`${climb.id} leaves its scale`)
    climb.keys.forEach((key, i) => { if (Note.chroma(climb.notes[i]) !== key % 12) fail(`${climb.id}: ${climb.notes[i]} is spelled wrong`) })
  }
  eq(stageById('c-major').scales.map(s => s.id), ['C major'], 'stage 1 is C major')
  eq(stageById('c-major').scales[0].top, 7, 'stage 1 is one octave')
  if (stageById('major-keys').scales.some(s => s.type !== 'major' || s.tonic === 'C')) fail('stage 2 is other major keys')
  if (stageById('minor-scales').scales.some(s => s.type === 'major' || s.top !== 14)) fail('stage 3 is minors, two octaves')
  if (new Set(stageById('endless').scales.map(s => s.id)).size !== 24) fail('Endless visits every key once')

  // The riff is the scale's own, the same each time, and short
  for (const stage of STAGES) stage.scales.forEach((climb, i) => {
    const riff = riffFor(climb, i)
    const pcs = new Set(climb.keys.map(k => k % 12))
    if (riff.notes.some(n => !pcs.has(n.key % 12))) fail(`${climb.id}: the riff leaves the scale`)
    eq(riffFor(climb, i), riff, `${climb.id}: riffs aren't random`)
    if (riff.ms > 4000) fail(`${climb.id}: the riff is long`)
  })

  // Only the dial moves, and it only tightens
  for (const stage of STAGES) for (let c = 1; c < 30; c++) if (paceAt(stage, c, false) > paceAt(stage, c - 1, false)) fail(`${stage.id} pace loosens`)
  if (paceAt(STAGES[0], 0, true) <= paceAt(STAGES[0], 0, false)) fail('Assist should slow the pace')

  // A full run: every climb clean and even, with a riff after each, then a clear
  {
    const play = start('c-major')
    const { run, events, stage } = play
    let at = 1000
    for (let c = 0; c < stage.climbs; c++) { at = playRoute(play, at); if (c < stage.climbs - 1) eq(run.resting, true, 'a riff after each climb'); at = rest(play, at) }
    eq(run.state.cleared, true, 'six clean climbs clear')
    eq(run.state.climbs, 6, 'six climbs')
    eq(run.state.right, 15 * 6, 'every note counted')
    eq(run.state.lives, LIVES, 'no lives lost')
    eq(run.accuracy, 1, 'perfect accuracy')
    eq(run.evenness, 1, 'perfect evenness')
    eq(events.filter(e => e.type === 'climb').length, 6, 'six climbs began')
    eq(events.filter(e => e.type === 'riff').length, 6, 'six riffs')
    if (!events.some(e => e.type === 'ring')) fail('the riff never rang')
    eq(starsFor(run.accuracy, run.evenness, false), 3, 'three stars')
  }

  // Only the next note climbs: a later note of the scale is a wrong note
  {
    const play = start('c-major')
    const { run } = play
    run.noteOn(60, 0)
    run.noteOn(64, 100)
    eq(run.pos, 0, 'skipping ahead slips back')
    eq(run.state.slips, 1, 'and counts')
    run.noteOn(60 + 12, 200)
    eq(run.pos, 1, 'any octave counts')
  }

  // A slip costs the stage's steps; the boss costs two
  {
    const { run } = start('c-major')
    for (const key of [60, 62, 64]) run.noteOn(key, key * 10)
    run.noteOn(61, 700)
    eq(run.pos, 2, 'one step back')
    const boss = start('boss').run
    for (const key of [60, 62, 64]) boss.noteOn(key, key * 10)
    boss.noteOn(61, 700)
    eq(boss.pos, 1, 'two steps back')
  }

  // Three slips on a climb are a fall; three falls end the run
  {
    const { run, events } = start('c-major')
    run.noteOn(60, 0)
    for (let f = 1; f <= LIVES; f++) for (let s = 0; s < FALL_SLIPS; s++) run.noteOn(61, f * 1000 + s)
    eq(run.state.lives, 0, 'three falls')
    eq(run.state.over, true, 'run over')
    eq(run.state.cleared, false, 'not cleared')
    eq(events.filter(e => e.type === 'fall').length, LIVES, 'each fall told')
    run.noteOn(60, 99999)
    eq(run.state.right, 1, 'nothing counts after the end')
  }

  // Hanging too long is a slip, judged on the clock handed in; the first note is free
  {
    const { run, stage } = start('c-major')
    const grip = paceAt(stage, 0, false) * GRIP_BEATS
    run.tick(60000)
    eq(run.state.slips, 0, 'resting at the bottom costs nothing')
    run.noteOn(60, 60000)
    run.tick(60000 + grip - 1)
    eq(run.state.slips, 0, 'inside the grip')
    run.noteOn(62, 60000 + grip - 1)
    eq(run.pos, 2, 'a key inside the grip counts')
    run.tick(60000 + 2 * grip + 200)
    eq(run.state.slips, 1, 'past the grip, a slip')
  }

  // Timestamps decide, not frames: a slow frame after the notes changes nothing
  {
    const { run, stage } = start('c-major')
    const grip = paceAt(stage, 0, false) * GRIP_BEATS
    run.noteOn(60, 0)
    run.noteOn(62, grip)      // stamped in time, seen by a frame much later
    run.tick(grip + 5)
    eq(run.state.slips, 0, 'a stamped key is never lost')
    eq(run.gaps[0].ms, grip, 'the gap is the stamps')
  }

  // Evenness is about gaps; an uneven step costs the combo, not the climb
  {
    const { run } = start('c-major')
    const keys = [60, 62, 64, 65, 67, 69]
    const times = [0, 400, 800, 1200, 2000, 2400]
    keys.forEach((key, i) => run.noteOn(key, times[i]))
    eq(run.state.gaps, 5, 'five gaps')
    eq(run.state.even, 4, 'one uneven')
    eq(run.gaps.map(g => g.even), [true, true, false, true].slice(-4), 'the last four gaps')
    eq(run.gaps[2].from + run.gaps[2].to, 'FG', 'and which notes')
    eq(run.state.combo, 1, 'the combo restarted')
    eq(run.pos, 6, 'still climbing')
    if (multiplierFor(8) <= multiplierFor(4) || multiplierFor(4) <= multiplierFor(0)) fail('combo raises the multiplier')
  }

  // The boss runs key to key without a rest, then one riff
  {
    const play: Play = start('boss')
    const { run, events, stage } = play
    let at = 0
    for (let c = 0; c < stage.climbs; c++) {
      const expected = stage.scales[c].id
      eq(run.climb.id, expected, 'boss key order')
      at = playRoute(play, at)
      if (c < stage.climbs - 1) eq(run.resting, false, 'no rest between keys')
    }
    eq(run.state.gaps, 15 * stage.climbs - 1, 'every gap counted, the changes too')
    eq(run.evenness, 1, 'steady across the changes')
    eq(events.filter(e => e.type === 'riff').length, 1, 'one riff at the end')
    rest(play, at)
    eq(run.state.cleared, true, 'boss cleared')
  }

  // Endless walks the keys in order and has no finish
  {
    const play = start('endless')
    const { run, stage } = play
    let at = 0
    for (let c = 0; c < stage.scales.length + 2; c++) {
      eq(run.climb.id, stage.scales[c % stage.scales.length].id, 'Endless order')
      at = rest(play, playRoute(play, at))
    }
    eq(run.state.over, false, 'Endless goes on')
  }

  // A weak scale earns one more climb at the end, without shuffling the order
  {
    const stage: Stage = stageById('major-keys')
    const play = start('major-keys', false, ['Nowhere', 'D major'])
    eq(play.run.total, stage.climbs + 1, 'one more climb')
    let at = 0
    for (let c = 0; c < stage.climbs; c++) { eq(play.run.climb.id, stage.scales[c].id, 'learning order holds'); at = rest(play, playRoute(play, at)) }
    eq(play.run.climb.id, 'D major', 'the weak scale comes back')
    eq(start('c-major', false, ['C major']).run.total, 6, 'one scale has nothing to add')
  }

  // Stars
  eq(starsFor(1, 1, true), 1, 'Assist earns one star')
  eq(starsFor(1, 0.5, false), 1, 'uneven is not two stars')
  eq(starsFor(0.9, 0.9, false), 2, 'two stars')

  // The drill plays each slipped scale, one note at a time
  {
    const steps = drillSteps(['F major', 'Nowhere'])
    eq(steps.map(s => s.label).join(' '), 'F G A Bb C D E F', 'drill notes')
    if (!steps[3].fits([58]) || steps[3].fits([59])) fail('drill accepts the note in any octave, and only it')
  }
  return failures
}
