/// <reference types="node" />
// Low-end check: the real art, built headless, on the busiest night a run can make
// Run: node --import ./scripts/ts-esbuild-hooks.mjs src/runAllTests.ts --file src/arcade/chordRush/hollowTest.ts
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshBasicMaterial } from 'three'
import { chordOf } from '../library/chords'
import { drawCalls } from '../engine/stage'
import { gameClock } from '../clock'
import { DRAW_CALL_BUDGET, MONSTERS, buildHollow, monsterFor } from './hollow'
import { SPACING } from './stages'

const ART = 'public/arcade/hollow'
const MAX_ART_BYTES = 2.5 * 1024 * 1024
// A walking monster and the ones still folding away: chords enter SPACING of a
// dial apart, so this many can share the path, and as many again can be drifting.
const WALKING = Math.ceil(1 / SPACING)
const BUSY = WALKING * 2

function parse(file: string): Promise<GLTF> {
  const bytes = readFileSync(`${ART}/${file}.glb`)
  return new Promise((resolve, reject) => new GLTFLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, '', resolve, reject))
}

export async function runHollowTest(): Promise<number> {
  let failures = 0
  const fail = (m: string) => { console.error(`FAIL  ${m}`); failures++ }

  const props = await parse('props')
  const loaded = await Promise.all(MONSTERS.map(parse))
  const models = Object.fromEntries(MONSTERS.map((m, i) => [m, loaded[i]])) as Record<typeof MONSTERS[number], GLTF>
  for (const [name, model] of Object.entries(models)) if (model.animations[0]?.name !== 'walk') fail(`${name} lost its walk`)

  const world = buildHollow(props.scene, new MeshBasicMaterial(), models, null)
  const bare = drawCalls(world.scene)
  if (bare > 5) fail(`an empty hollow costs ${bare} draw calls: props should be one mesh`)
  // Bats are the costliest monster: body and eyes are two meshes
  const bat = chordOf('i', 'A', true)
  if (monsterFor(bat) !== 'bat') fail('a minor chord should wear a bat')
  for (let id = 0; id < BUSY; id++) world.spawn(bat, id)
  const busy = drawCalls(world.scene)
  if (busy > DRAW_CALL_BUDGET) fail(`busiest night costs ${busy} draw calls, budget ${DRAW_CALL_BUDGET}`)

  const bytes = readdirSync(ART).reduce((sum, f) => sum + statSync(`${ART}/${f}`).size, 0)
  if (bytes > MAX_ART_BYTES) fail(`art is ${bytes} bytes`)

  // A slow frame stretches game time and never jumps it
  const clock = gameClock(0)
  clock.tick(16)
  const stalled = clock.tick(3016)
  if (stalled > 120) fail(`a 3 s frame moved the game ${stalled} ms`)
  if (clock.at(3016) !== stalled) fail('a key stamped now is at game now')
  if (clock.hold(5000) !== stalled || clock.tick(5016) !== stalled + 16) fail('hold keeps the clock still')
  return failures
}
