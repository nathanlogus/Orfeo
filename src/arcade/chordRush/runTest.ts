/// <reference types="node" />
// Run: node --import ./scripts/ts-esbuild-hooks.mjs src/runAllTests.ts --file src/arcade/chordRush/runTest.ts
import { progression } from '../library'
import { chordsOf } from '../library/chords'
import { LIVES, cleanForThree, createRun, drillSteps, multiplierFor, nextWave, starsFor, type RunEvent, type Wave } from './run'
import { STAGES, dialAt, stageById } from './stages'

const seeded = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32 }

function play(stageId: Parameters<typeof stageById>[0], assist = false, seed = 1) {
  const events: RunEvent[] = []
  const stage = stageById(stageId)
  const run = createRun({ stage, assist, rng: seeded(seed), emit: e => events.push(e), start: 0 })
  return { run, events, stage }
}

const strike = (run: ReturnType<typeof play>['run'], keys: number[], at: number) => {
  const held: number[] = []
  for (const key of keys) { held.push(key); run.noteOn(key, at, held) }
}

export function runChordRushTest(): number {
  let failures = 0
  const fail = (m: string) => { console.error(`FAIL  ${m}`); failures++ }
  const eq = (a: unknown, b: unknown, m: string) => { if (JSON.stringify(a) !== JSON.stringify(b)) fail(`${m}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`) }

  // Stage content is what the brief says it is
  for (const key of stageById('triads').keys) for (const id of stageById('triads').items) {
    for (const c of chordsOf(progression(id), key)) if (c.pcs.length !== 3 || /dim|aug/.test(c.name)) fail(`triads stage has ${c.name}`)
  }
  eq(stageById('triads').keys.length, 3, 'three keys')
  eq(stageById('inversions').keys.length, 12, 'all twelve keys')
  for (const id of stageById('sevenths').items) for (const c of chordsOf(progression(id))) if (c.pcs.length !== 4) fail(`sevenths stage has ${c.name}`)
  for (const id of stageById('inversions').items) if (!chordsOf(progression(id)).some(c => c.bass !== null)) fail(`${id} has no inversion`)

  // Only the dial moves, and it only tightens
  for (const stage of STAGES) {
    for (let w = 1; w < 40; w++) if (dialAt(stage, w, false) > dialAt(stage, w - 1, false)) fail(`${stage.id} dial loosens`)
  }
  if (dialAt(STAGES[0], 0, true) <= dialAt(STAGES[0], 0, false)) fail('Assist should slow the dial')

  // A wave plays a whole progression, in order
  {
    const { run, events } = play('triads')
    const want = chordsOf(progression('xp-pop'), 'C').map(c => c.name)
    let now = 0
    const got: string[] = []
    while (got.length < want.length) {
      now += 16
      run.tick(now)
      const foe = run.foes[0]
      if (foe) { got.push(foe.target.name); strike(run, foe.target.keys, now); }
    }
    eq(got, want, 'first wave order')
    eq(run.state.combo, want.length, 'clean chords build a combo')
    if (!events.some(e => e.type === 'fold')) fail('no fold event')
  }

  // Timestamps decide, not frames: a chord stamped in time wins after a slow frame
  {
    const { run } = play('triads')
    run.tick(2000)
    const foe = run.foes[0]
    const held: number[] = []
    for (const key of foe.target.keys) { held.push(key); run.noteOn(key, foe.landAt - 5, held) }
    run.tick(foe.landAt + 5000)
    eq(run.state.landed, 0, 'a chord played before landing is never lost')
    eq(run.state.clean, 1, 'and it counts as clean')
  }

  // Speed pays
  {
    const fast = play('triads'), slow = play('triads')
    fast.run.tick(2000); slow.run.tick(2000)
    const foe = fast.run.foes[0]
    strike(fast.run, foe.target.keys, 2100)
    strike(slow.run, foe.target.keys, foe.landAt - 100)
    if (fast.run.state.score <= slow.run.state.score) fail('faster chords should score more')
  }

  // A wrong chord breaks the combo once, and the chord can still be played
  {
    const { run, events } = play('triads')
    run.tick(2000)
    const foe = run.foes[0]
    strike(run, foe.target.keys.map(k => k + 1), 2100)
    strike(run, foe.target.keys.map(k => k + 2), 2500)
    eq(events.filter(e => e.type === 'wrong').length, 1, 'one wrong per chord')
    strike(run, foe.target.keys, 2900)
    eq([run.state.played, run.state.clean, run.state.combo], [1, 0, 0], 'a wrong try costs the clean mark')
  }

  // Legato: the old chord's keys may still be down when the new one is struck
  {
    const { run } = play('triads')
    run.tick(2000)
    const foe = run.foes[0]
    const old = [50, 53]
    const held = [...old]
    for (const k of old) run.noteOn(k, 1000, held)
    for (const key of foe.target.keys) { held.push(key); run.noteOn(key, 2100, held) }
    eq(run.state.clean, 1, 'keys from the last chord do not spoil the next')
  }

  // A stray single note is forgiven; three landings end the run
  {
    const { run, events } = play('triads')
    run.tick(2000)
    run.noteOn(61, 2100, [61])
    eq(events.filter(e => e.type === 'wrong').length, 0, 'one stray note is not a wrong chord')
    let now = 2000
    while (!run.state.over) run.tick(now += 100)
    eq(run.state.landed, LIVES, 'three landings')
    eq(run.state.cleared, false, 'not a clear')
    if (run.foes.length && !run.foes.every(f => f.live)) fail('landed foe still walking')
  }

  // A perfect run clears, in stage order, and the boss wears its waves in order
  for (const id of ['triads', 'boss'] as const) {
    const { run, events, stage } = play(id)
    let now = 0
    while (!run.state.over && now < 3_600_000) {
      run.tick(now += 16)
      const foe = run.foes[0]
      if (foe && now - foe.spawnAt > 200) strike(run, foe.target.keys, now)
    }
    eq(run.state.cleared, true, `${id} clears`)
    eq(run.accuracy, 1, `${id} accuracy`)
    eq(events.filter(e => e.type === 'wave').length, stage.waves, `${id} waves`)
    if (id === 'boss') for (const e of events) if (e.type === 'spawn' && events.filter(x => x.type === 'spawn').length !== 28) fail('boss plays every chord')
  }

  // The mix: about 40% recent misses, 30% earlier, always from the library
  {
    const wave = (name: string, chord: string) => ({ itemId: name, name, key: 'C', chords: [{ name: chord }] }) as Wave
    const stagePool = [wave('a', 'C'), wave('b', 'F'), wave('c', 'G')]
    const earlier = [wave('old', 'Dm')]
    const rng = seeded(7)
    const seen: Record<string, number> = { a: 0, b: 0, c: 0, old: 0 }
    const rounds = 4000
    for (let i = 0; i < rounds; i++) seen[nextWave(stagePool, earlier, ['F'], null, rng).name]++
    const share = (n: number) => n / rounds
    if (Math.abs(share(seen.old) - 0.3) > 0.03) fail(`earlier share ${share(seen.old)}`)
    if (share(seen.b) < 0.4) fail(`missed share ${share(seen.b)}`)
    if (nextWave(stagePool, [], [], stagePool[0], rng) === stagePool[0]) fail('a wave should not repeat at once')
  }

  eq([starsFor(0.5, false), starsFor(0.8, false), starsFor(0.95, false), starsFor(1, true)], [1, 2, 3, 1], 'stars')
  // What the shared screens are told is what the judge really needs
  for (const played of [1, 20, 36, 37, 100]) {
    const need = cleanForThree(played)
    if (starsFor(need / played, false) !== 3) fail(`${need} of ${played} should be three stars`)
    if (need > 1 && starsFor((need - 1) / played, false) === 3) fail(`${need - 1} of ${played} should not be`)
  }
  eq([multiplierFor(0), multiplierFor(4), multiplierFor(40)], [1, 1.5, 3], 'multiplier')

  // A saved weak chord is sent more often from the first wave on
  const pool = STAGES[0].items.flatMap(id => STAGES[0].keys.map(key => ({ itemId: id, name: id, key, chords: chordsOf(progression(id), key) })))
  const weakChord = 'Dm'
  const holds = (w: Wave) => w.chords.some(c => c.name === weakChord)
  const count = (missed: string[]) => { const rng = seeded(7); return Array.from({ length: 400 }, () => nextWave(pool, [], missed, null, rng)).filter(holds).length }
  if (count([weakChord]) <= count([])) fail('a weak chord should come up more')
  const seededRun = createRun({ stage: stageById('triads'), assist: false, rng: seeded(1), emit: () => {}, start: 0, weak: [weakChord] })
  if (!seededRun.wave) fail('a run with weak chords still starts')

  // The drill holds what slipped and nothing else, and hears it any way up
  const steps = drillSteps(['Dm7', 'Am7', 'no such chord'])
  eq(steps.map(s => s.label).sort(), ['Am7', 'Dm7'], 'drill steps')
  const dm7 = steps.find(s => s.label === 'Dm7')!
  if (!dm7.fits([50, 53, 57, 60]) || dm7.fits([50, 53, 57])) fail('drill judges the chord')
  return failures
}
