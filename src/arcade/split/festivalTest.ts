/// <reference types="node" />
// Low-end check: the real art, built headless, with kites that answer to each hand
// Run: node --import ./scripts/ts-esbuild-hooks.mjs src/runAllTests.ts --file src/arcade/split/festivalTest.ts
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshBasicMaterial } from 'three'
import { drawCalls } from '../engine/stage'
import { DRAW_CALL_BUDGET, buildFestival } from './festival'

const ART = 'public/arcade/kites'
const MAX_ART_BYTES = 1.5 * 1024 * 1024
const CONFETTI_CALLS = 1
const STEADY = { left: 0, right: 0 }

function parse(file: string): Promise<GLTF> {
  const bytes = readFileSync(`${ART}/${file}.glb`)
  return new Promise((resolve, reject) => new GLTFLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, '', resolve, reject))
}

export async function runFestivalTest(): Promise<number> {
  let failures = 0
  const fail = (m: string) => { console.error(`FAIL  ${m}`); failures++ }

  const props = await parse('props')
  const still = () => buildFestival(props.scene, new MeshBasicMaterial(), { reduced: true })

  const world = still()
  const calls = drawCalls(world.scene) + CONFETTI_CALLS
  if (calls > DRAW_CALL_BUDGET) fail(`the festival costs ${calls} draw calls, budget ${DRAW_CALL_BUDGET}`)

  // Each kite answers to its own hand
  world.fly(1000, STEADY)
  const up = world.height('left')
  world.fly(2000, { left: 1, right: 0 })
  if (world.height('left') >= up) fail('a hand behind sags its kite')
  if (world.height('right') !== up) fail('the other kite stays up')
  world.fly(3000, STEADY)
  if (world.height('left') !== up) fail('a hand that catches up lifts its kite')

  world.slip('right')
  world.fly(4000, STEADY)
  const sagged = world.height('right')
  if (sagged >= up) fail('a slip dips the kite')
  world.hit('right', 'perfect', 4000)
  world.fly(5000, STEADY)
  if (world.height('right') <= sagged) fail('a landed note lifts it again')

  // Held still with reduced motion: the same answer, whenever you look
  const a = still()
  a.fly(1000, STEADY)
  const b = still()
  b.fly(987654, STEADY)
  if (a.height('left') !== b.height('left')) fail('reduced motion should stand still')

  const bytes = readdirSync(ART).reduce((sum, f) => sum + statSync(`${ART}/${f}`).size, 0)
  if (bytes > MAX_ART_BYTES) fail(`art is ${bytes} bytes`)
  return failures
}
