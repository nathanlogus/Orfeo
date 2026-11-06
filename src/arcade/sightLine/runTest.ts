/// <reference types="node" />
// Run: node --import ./scripts/ts-esbuild-hooks.mjs src/runAllTests.ts --file src/arcade/sightLine/runTest.ts
import { midiOf } from '../../lessons/drill'
import { engrave, inKey, musicOf, readLine, signature } from './lines'
import { AHEAD_FULL, LIVES, createRun, drillSteps, lineOrder, multiplierFor, starsFor, type Fork, type Run, type RunEvent } from './run'
import { STAGES, bpmAt, stageById, type StageId } from './stages'

const seeded = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32 }
const STEP = 16
const tex = (body: string) => `\\staff { score } \\clef G2\n${body}`

function play(id: StageId, assist = false, weak: string[] = []) {
  const events: RunEvent[] = []
  const run = createRun({ stage: stageById(id), assist, rng: seeded(1), emit: e => events.push(e), start: 0, weak })
  return { run, events }
}

// Plays each fork this many ms from when it reaches the coach, frame by frame
function drive(run: Run, offset: number, forks = Infinity) {
  let now = 0
  const seen = new Set<Fork>()
  while (!run.state.over && seen.size < forks) {
    now += STEP
    run.tick(now)
    const fork = run.target
    if (fork && !seen.has(fork) && now >= fork.at + offset) {
      seen.add(fork)
      for (const h of fork.heads) run.noteOn(midiOf(h.name), fork.at + offset)
    }
  }
}

function idle(run: Run) {
  for (let now = 0; !run.state.over; now += STEP) run.tick(now)
}

export function runSightLineTest(): number {
  let failures = 0
  const fail = (m: string) => { console.error(`FAIL  ${m}`); failures++ }
  const eq = (a: unknown, b: unknown, m: string) => { if (JSON.stringify(a) !== JSON.stringify(b)) fail(`${m}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`) }

  // Reading written lines
  {
    const m = readLine(tex(':4 C4 r (E4 G4).2 | A4.4{d} B4.8 C5.2'))
    eq(m.events.map(e => e.beat), [0, 2, 4, 5.5, 6], 'beats, sticky lengths and dots')
    eq(m.events[1].names, ['E4', 'G4'], 'a chord')
    eq([m.beats, m.rests], [8, 1], 'length and rests')
    const two = readLine(`${tex(':4 C4 D4 r r')}\n\\staff { score } \\clef F4\nr.2 :4 G3 C3`)
    eq(two.events.map(e => e.names), [['C4'], ['D4'], ['G3'], ['C3']], 'two staves take turns')
  }

  // Every stage's content is what the brief says
  {
    const heads = (id: StageId) => stageById(id).lines.flatMap(l => engrave(musicOf(l), stageById(id).clefs).flat())
    for (const stage of STAGES) if (stage.lines.length < 5) fail(`${stage.id}: too few lines`)
    for (const id of ['treble', 'bass'] as StageId[]) {
      for (const h of heads(id)) if (h.ledgers.length) fail(`${id} has a ledger note: ${h.name}`)
      if (stageById(id).lines.some(l => musicOf(l).events.some(e => e.names.length > 1))) fail(`${id} has a chord`)
    }
    const both = heads('both')
    if (!both.some(h => h.ledgers.length)) fail('both: no ledger lines')
    eq([...new Set(both.map(h => h.staff))].sort(), [0, 1], 'both staves')
    if (stageById('boss').rest) fail('boss: pause between lines')
    for (const line of stageById('boss').lines) {
      if (musicOf(line).rests) fail(`boss: ${line.id} pauses`)
      if (musicOf(line).events.some(e => e.names.length < 2)) fail(`boss: ${line.id} is not all chords`)
    }
    for (const line of stageById('endless').lines) for (const key of stageById('endless').keys) {
      for (const e of inKey(musicOf(line), key).events) for (const n of e.names) if (/##|bb/.test(n)) fail(`${line.id} in ${key}: ${n}`)
    }
  }

  // The staff
  {
    eq(signature('Eb').map(s => s.letter), ['B', 'E', 'A'], 'flats in order')
    eq(signature('A').map(s => s.letter), ['F', 'C', 'G'], 'sharps in order')
    eq(engrave(readLine(tex(':4 F#4 F4 F4 | F4 F#4')), ['treble'], 'G').flat().map(h => h.accidental), ['', 'n', '', 'n', '#'], 'the signature and the bar decide accidentals')
    const c = engrave(readLine(tex('(E4 F4).4 C4 A5')), ['treble'])
    eq(c[0][1].beside, true, 'a second sits beside')
    eq([c[1][0].pos, c[1][0].ledgers], [-2, [-2]], 'middle C on a ledger')
    eq(c[2][0].ledgers, [10], 'high A on a ledger')
    eq(engrave(readLine(tex('(G3 C4).4')), ['treble', 'bass'])[0].map(h => h.staff), [1, 0], 'middle C up, below it down')
    eq(inKey(readLine(tex(':4 F4 B4')), 'D').events.flatMap(e => e.names), ['G4', 'C#5'], 'moved up, spelled in the key')
    eq(inKey(readLine(tex(':4 E4')), 'Ab').events[0].names, ['C4'], 'a far key comes down')
  }

  // The dial only rises, in steps; Assist slows it
  for (const stage of STAGES) {
    for (let i = 1; i < 40; i++) if (bpmAt(stage, i, false) < bpmAt(stage, i - 1, false)) fail(`${stage.id} dial falls`)
    if (bpmAt(stage, 1, false) === bpmAt(stage, 0, false)) fail(`${stage.id} dial doesn't step`)
    if (bpmAt(stage, 0, true) >= bpmAt(stage, 0, false)) fail('Assist should slow the dial')
  }

  // A full run, played clean and ahead, clears each stage with three stars
  for (const id of ['treble', 'bass', 'both', 'boss'] as StageId[]) {
    const { run, events } = play(id)
    drive(run, -100)
    const total = stageById(id).lines.reduce((n, l) => n + musicOf(l).events.length, 0)
    eq([run.state.cleared, run.state.played, run.state.clean, run.state.misses], [true, total, total, 0], `${id}: clean run`)
    eq(starsFor(run.accuracy, false), 3, `${id}: three stars`)
    eq(run.state.ahead, total, `${id}: read ahead all the way`)
    eq(events.filter(e => e.type === 'enter').length, stageById(id).lines.length, `${id}: every line entered`)
    if (run.state.topBpm <= bpmAt(stageById(id), 0, false)) fail(`${id}: speed rose`)
    eq(events.filter(e => e.type === 'end').length, 1, `${id}: one end`)
  }

  // The boss's lines join with no open trail
  {
    const { events } = play('boss')
    const lines = events.flatMap(e => (e.type === 'line' ? [e.line] : []))
    eq(lines[1].at, lines[0].at + lines[0].length * 60_000 / lines[0].bpm, 'lines join in time')
    eq([lines[1].startBeat, lines[1].pad], [lines[0].length, 0], 'and on the trail')
  }

  // Timestamps decide, not frames: a key stamped in time counts after a slow frame
  {
    const { run } = play('treble')
    run.tick(100)
    const fork = run.target!
    run.noteOn(midiOf(fork.heads[0].name), fork.at - 10)
    run.tick(fork.at + 300)
    eq([run.state.clean, run.state.misses], [1, 0], 'stamped in time')
  }

  // Early is ahead, late is caught but not ahead, far too early is nothing yet
  {
    const { run } = play('treble')
    run.tick(100)
    const first = run.target!
    run.noteOn(midiOf(first.heads[0].name), first.at - 2000)
    eq(run.state.played, 0, 'far too early does nothing')
    run.noteOn(midiOf(first.heads[0].name), first.at - 300)
    eq(run.state.ahead, 1, 'early reads ahead')
    const second = run.target!
    run.noteOn(midiOf(second.heads[0].name), second.at + 120)
    eq([run.state.clean, run.state.ahead], [2, 0], 'late is clean but not ahead')
  }

  // Reading ahead pays more than catching notes at the coach
  {
    const ahead = play('treble'), late = play('treble')
    drive(ahead.run, -200)
    drive(late.run, 120)
    if (ahead.run.state.score <= late.run.state.score) fail('reading ahead should score more')
    eq(late.run.state.bestAhead, 0, 'late play never reads ahead')
    if (ahead.run.state.bestAhead <= AHEAD_FULL) fail('the meter should fill')
  }

  // A wrong key costs the streak and the clean note, not a life
  {
    const { run, events } = play('treble')
    run.tick(100)
    const fork = run.target!
    const key = midiOf(fork.heads[0].name)
    run.noteOn(key + 1, fork.at - 50)
    run.noteOn(key + 1, fork.at - 40)
    eq(events.filter(e => e.type === 'wrong').length, 1, 'one slip a note')
    run.noteOn(key, fork.at)
    eq([run.state.misses, run.state.clean, run.state.played, run.state.combo], [0, 0, 1, 0], 'a dirty note')
  }

  // Three misses at the line end a run, on every stage; a chord counts once
  for (const stage of STAGES) {
    const { run, events } = play(stage.id)
    idle(run)
    eq([run.state.cleared, run.state.misses], [false, LIVES], `${stage.id}: three misses`)
    eq(events.filter(e => e.type === 'miss').length, LIVES, `${stage.id}: one miss a fork`)
    eq(events.at(-1)!.type, 'end', `${stage.id}: nothing after the end`)
  }

  // A chord needs every note
  {
    const { run } = play('boss')
    run.tick(100)
    const fork = run.target!
    run.noteOn(midiOf(fork.heads[0].name), fork.at)
    eq(run.state.played, 0, 'half a chord is not a chord')
    run.noteOn(midiOf(fork.heads[1].name), fork.at + 10)
    eq(run.state.clean, 1, 'the whole chord is')
  }

  // Endless has no finish line, and its signature changes each line
  {
    const { run, events } = play('endless')
    drive(run, -100, 300)
    eq(run.state.over, false, 'endless runs on')
    const keys = events.flatMap(e => (e.type === 'enter' ? [e.line.key] : []))
    if (keys.length < 10) fail('endless: too few lines')
    keys.forEach((k, i) => { if (i && k === keys[i - 1]) fail('endless: key repeated') })
    if (run.state.topBpm <= bpmAt(stageById('endless'), 0, false)) fail('endless: speed rose')
  }

  // A line that slipped comes round sooner, but the opener stays
  {
    const { lines } = stageById('treble')
    const moved = lineOrder(lines, ['F4'])
    eq(moved[0], lines[0], 'opener stays')
    eq(moved[1], lines.slice(1).find(l => musicOf(l).events.some(e => e.names.includes('F4'))), 'the slipped note comes next')
    eq(moved.length, lines.length, 'nothing lost')
    eq(lineOrder(lines, []), lines, 'no weak notes, written order')
  }

  eq([multiplierFor(0), multiplierFor(7), multiplierFor(99)], [1, 2, 4], 'multiplier')
  eq(starsFor(1, true), 1, 'Assist earns one star')
  eq(drillSteps(['E4'])[0].keys, [64], 'drill keys')
  if (!drillSteps(['E4'])[0].fits([60, 64])) fail('drill fits')

  return failures
}
