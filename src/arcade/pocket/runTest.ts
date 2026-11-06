/// <reference types="node" />
// Run: node --import ./scripts/ts-esbuild-hooks.mjs src/runAllTests.ts --file src/arcade/pocket/runTest.ts
import { readFileSync } from 'node:fs'
import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { STYLES } from '../../jam/band'
import { LIVES, createRun, multiplierFor, starsFor, type RunEvent, type Section } from './run'
import { STAGES, dialAt, stageById, type StageId } from './stages'
import { DRAW_CALL_BUDGET, buildStation } from './station'

const START = 500
const FRAME_MS = 16

// Plays a whole run frame by frame; `when` says how far off each note is struck, null to skip it
function play(id: StageId, when: (n: number) => number | null, { assist = false, frame = FRAME_MS, limit = Infinity, weak = [] as string[] } = {}) {
  const events: RunEvent[] = []
  const sections: Section[] = []
  const clicks: { at: number; accent: boolean }[] = []
  const stage = stageById(id)
  const run = createRun({ stage, assist, weak, start: START, emit: e => { events.push(e); if (e.type === 'section') sections.push(e.section) } })
  const planned: { at: number; n: number }[] = []
  let queued = 0, count = 0
  let t = START
  while (!run.state.over && t < limit) {
    t += frame
    clicks.push(...run.clicksUntil(t + 150))
    for (; queued < sections.length; queued++) {
      for (const note of sections[queued].notes) { const off = when(count++); if (off !== null) planned.push({ at: note.at + off, n: count }) }
    }
    planned.sort((a, b) => a.at - b.at)
    while (planned[0] && planned[0].at <= t) run.noteOn(60, planned.shift()!.at)
    run.tick(t)
  }
  return { run, events, sections, clicks, stage }
}

export async function runPocketTest(): Promise<number> {
  let failures = 0
  const fail = (m: string) => { console.error(`FAIL  ${m}`); failures++ }
  const eq = (a: unknown, b: unknown, m: string) => { if (JSON.stringify(a) !== JSON.stringify(b)) fail(`${m}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`) }
  const ok = (cond: boolean, m: string) => { if (!cond) fail(m) }

  // Every rhythm is a real groove, a bar of sixteenths
  eq(stageById('steady').rhythms[0].line, STYLES.ballad.comp[0], 'stage 1 is the ballad pulse')
  eq(stageById('syncopation').rhythms[0].line, STYLES.rock.comp[2], 'stage 3 opens on the rock tresillo')
  for (const stage of STAGES) for (const r of stage.rhythms) ok(r.line.length === 16, `${r.id} is one bar`)
  ok(/^(x\.\.\.){4}$/.test(stageById('steady').rhythms[0].line), 'stage 1 is steady beats')
  ok(/^(x\.){8}$/.test(stageById('eighths').rhythms[0].line), 'stage 2 is eighth notes')

  // The dial: silence grows, the boss has the longest, Assist shortens it
  const longest = (id: StageId) => Math.max(...[0, 1, 2].map(c => dialAt(stageById(id), c, false)))
  ok(longest('boss') > Math.max(longest('steady'), longest('eighths'), longest('syncopation')), 'the storm is the longest silence')
  ok(dialAt(stageById('eighths'), 2, false) === 4 && dialAt(stageById('eighths'), 0, false) < 4, 'silence grows to 4 bars')
  ok(dialAt(stageById('eighths'), 2, true) < dialAt(stageById('eighths'), 2, false), 'Assist shortens the silence')

  // A perfect full run of every rated stage: clears with three stars and no slips
  for (const stage of STAGES.filter(s => s.kind !== 'endless')) {
    const { run, events, sections, clicks } = play(stage.id, () => 0)
    ok(run.state.cleared, `${stage.id}: a perfect run clears`)
    eq(sections.length, stage.cycles, `${stage.id}: every cycle plays`)
    eq(events.filter(e => e.type === 'miss' || e.type === 'lost').length, 0, `${stage.id}: nothing slips`)
    eq(run.state.lives, LIVES, `${stage.id}: every life kept`)
    eq(starsFor(run.accuracy, false), 3, `${stage.id}: three stars`)
    eq(run.state.played, sections.reduce((n, s) => n + s.notes.length, 0), `${stage.id}: every note counted`)
    eq(run.state.longestSilence, Math.max(...sections.map(s => s.offBars)), `${stage.id}: longest silence reported`)
    // The click plays its bars and goes silent: never a click in a silent bar
    eq(clicks.length, sections.reduce((n, s) => n + s.onBars * 4, 0), `${stage.id}: clicks on the on bars`)
    for (const c of clicks) {
      const s = sections.find(x => c.at >= x.start && c.at < x.end)!
      ok(c.at < s.start + s.onBars * s.barMs, `${stage.id}: no click in the silence`)
    }
    eq(clicks.filter(c => c.accent).length, clicks.length / 4, `${stage.id}: bar ones are accented`)
  }

  // Frames don't matter: only the keys' own times do
  const fine = play('syncopation', n => (n % 3 - 1) * 20)
  const coarse = play('syncopation', n => (n % 3 - 1) * 20, { frame: 90 })
  eq(coarse.run.state.score, fine.run.state.score, 'the score ignores the frame rate')

  // Points grow the closer you stay
  const score = (off: number) => play('steady', () => off).run.state.score
  ok(score(0) > score(30) && score(30) > score(80), 'closer earns more')
  eq(multiplierFor(32), 4, 'the board\'s 32 in a row is ×4')

  // Early and late read on the drift, each its own way
  const lean = (off: number) => { const { run } = play('steady', () => off, { limit: START + 12_000 }); return run.state.drift }
  ok(lean(-30) < -20, 'early reads negative')
  ok(lean(30) > 20, 'late reads positive')

  // Rushing or dragging too far for too long ends the run; a moment of it doesn't
  for (const off of [-110, 110]) {
    const { run, events } = play('steady', () => off)
    ok(run.state.over && !run.state.cleared, `playing ${off}ms off ends the run`)
    eq(events.filter(e => e.type === 'lost').length, LIVES, 'three lives lost first')
  }
  const blip = play('steady', n => (n >= 8 && n < 10 ? 100 : 0))
  ok(blip.run.state.cleared && blip.run.state.lives === LIVES, 'a moment out of the zone is forgiven')
  ok(!play('steady', () => null).run.state.cleared, 'stopping ends the run')
  eq(play('steady', n => (n % 40 === 39 ? null : 0)).run.state.cleared, true, 'one missed note now and then does not')

  // Assist's wider zone keeps a run that would fail without it
  ok(!play('steady', () => 60).run.state.cleared, '60ms late fails unassisted')
  const helped = play('steady', () => 60, { assist: true })
  ok(helped.run.state.cleared, '60ms late clears with Assist')
  eq(starsFor(helped.run.accuracy, true), 1, 'Assist earns one star')

  // Other presses: a chord is one strike, an extra key reads as a stray
  {
    const events: RunEvent[] = []
    const sections: Section[] = []
    const run = createRun({ stage: stageById('steady'), assist: false, start: 0, emit: e => { events.push(e); if (e.type === 'section') sections.push(e.section) } })
    const at = sections[0].notes[0].at
    run.noteOn(48, at); run.noteOn(55, at + 5); run.noteOn(60, at + 9)
    eq(run.state.played, 1, 'a chord is one hit')
    eq(events.filter(e => e.type === 'stray').length, 0, 'a chord is no stray')
    run.noteOn(60, at + 300)
    eq(run.state.combo, 0, 'a key between notes breaks the combo')
    ok(run.state.drift > 0, 'and reads as late')
    run.noteOn(60, -400)
    eq(events.filter(e => e.type === 'stray').length, 1, 'keys in the listening bar count for nothing')
  }

  // Endless: the tempo changes, each new tempo gets a bar of click, and it goes on
  {
    const { sections, run } = play('endless', () => 0, { limit: START + 300_000 })
    ok(new Set(sections.map(s => s.bpm)).size >= 4, 'the tempo changes')
    ok(!run.state.over, 'a steady player keeps going')
    for (const [i, s] of sections.entries()) {
      if (i && s.bpm !== sections[i - 1].bpm) ok(s.notes[0].at >= s.start + s.barMs - 0.001, 'a new tempo starts with a bar to listen')
    }
    ok(sections.at(-1)!.offBars > sections[0].offBars, 'the silences grow')
  }

  // Weak grooves come first
  eq(play('syncopation', () => 0, { weak: ['soul'] }).sections[0].rhythm.id, 'soul', 'the weak groove opens the run')
  eq(play('syncopation', () => 0).sections[0].rhythm.id, 'rock', 'the first groove opens a fresh run')

  // What the bar strip reads
  {
    const { run, sections } = play('eighths', () => 0, { limit: START + 1000 })
    const s = sections[0]
    ok(run.phaseAt(s.start + s.barMs * 4.5).bar === 4, 'phase finds the bar')
    ok(Math.abs(run.phaseAt(s.start + s.barMs * 1.25).through - 0.25) < 1e-6, 'phase finds the beat')
  }

  // The world stays light
  const bytes = readFileSync('public/arcade/orbit/props.glb')
  const props = await new Promise<GLTF>((resolve, reject) => new GLTFLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, '', resolve, reject))
  const station = buildStation(props.scene, new THREE.MeshBasicMaterial(), null)
  let meshes = 0, triangles = 0
  station.scene.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { meshes++; triangles += (m.geometry.index?.count ?? 0) / 3 } })
  ok(meshes <= DRAW_CALL_BUDGET, `the station is ${meshes} draw calls`)
  ok(triangles < 6000, `the station is ${triangles} triangles`)
  ok(station.outer.geometry.drawRange.count === station.ringOnly, 'the warning ring starts dark')
  ok(station.ringOnly < station.outer.geometry.index!.count, 'the warning ring is part of the outer ring')

  return failures
}
