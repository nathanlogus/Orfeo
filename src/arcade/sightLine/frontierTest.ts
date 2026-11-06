/// <reference types="node" />
// Low-end check: the real art, built headless, for the desert and the bridge
// Run: node --import ./scripts/ts-esbuild-hooks.mjs src/runAllTests.ts --file src/arcade/sightLine/frontierTest.ts
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { MeshBasicMaterial, type Object3D } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { drawCalls } from '../engine/stage'
import { DRAW_CALL_BUDGET, buildFrontier } from './frontier'

const ART = 'public/arcade/frontier'
const MAX_ART_BYTES = 1024 * 1024

function parse(): Promise<Object3D> {
  const bytes = readFileSync(`${ART}/props.glb`)
  return new Promise((resolve, reject) => new GLTFLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, '', g => resolve(g.scene), reject))
}

export async function runFrontierTest(): Promise<number> {
  let failures = 0
  const fail = (m: string) => { console.error(`FAIL  ${m}`); failures++ }
  const props = await parse()

  for (const boss of [false, true]) {
    const world = buildFrontier(props, new MeshBasicMaterial(), boss)
    const calls = drawCalls(world.scene)
    if (calls > DRAW_CALL_BUDGET) fail(`${boss ? 'bridge' : 'desert'} costs ${calls} draw calls, budget ${DRAW_CALL_BUDGET}`)
    if (world.actors.skeleton.bones.length < 12) fail('wheels, horses and riders each need a bone')
    // A wheel's own vertices follow its own bone, so it really turns
    const skin = world.actors.geometry.attributes.skinIndex
    const used = new Set<number>()
    for (let i = 0; i < skin.count; i++) used.add(skin.getX(i))
    if (![3, 4, 5, 6].every(b => used.has(b))) fail('a wheel has no vertices of its own')
  }

  const bytes = readdirSync(ART).reduce((sum, f) => sum + statSync(`${ART}/${f}`).size, 0)
  if (bytes > MAX_ART_BYTES) fail(`art is ${bytes} bytes`)
  return failures
}
