/// <reference types="node" />
// Low-end check: the real art, built headless, with everything in the room moving
// Run: node --import ./scripts/ts-esbuild-hooks.mjs src/runAllTests.ts --file src/arcade/softTouch/mansionTest.ts
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { MeshBasicMaterial, type SkinnedMesh } from 'three'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { drawCalls } from '../engine/stage'
import { DRAW_CALL_BUDGET, buildMansion } from './mansion'

const ART = 'public/arcade/midnight'
const MAX_ART_BYTES = 2.5 * 1024 * 1024

function parse(file: string): Promise<GLTF> {
  const bytes = readFileSync(`${ART}/${file}.glb`)
  return new Promise((resolve, reject) => new GLTFLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, '', resolve, reject))
}

export async function runMansionTest(): Promise<number> {
  let failures = 0
  const fail = (m: string) => { console.error(`FAIL  ${m}`); failures++ }

  const [props, burglar, guard] = await Promise.all(['props', 'burglar', 'guard'].map(parse))
  const world = buildMansion(props.scene, new MeshBasicMaterial(), burglar, guard, null)
  world.shadowsBaked()
  const calls = drawCalls(world.scene)
  if (calls > DRAW_CALL_BUDGET) fail(`the room costs ${calls} draw calls, budget ${DRAW_CALL_BUDGET}`)

  // Nothing of the characters is left drawing on its own
  let meshes = 0
  for (const model of [burglar.scene, guard.scene]) model.traverse(o => { if ((o as SkinnedMesh).isMesh) meshes++ })
  if (meshes) fail(`${meshes} meshes escaped the merge`)
  const { skeleton, geometry } = world.actors as SkinnedMesh
  const top = Math.max(...geometry.attributes.skinIndex.array)
  if (top >= skeleton.bones.length) fail(`a vertex hangs off bone ${top} of ${skeleton.bones.length}`)
  if (new Set(skeleton.bones).size !== skeleton.bones.length) fail('a bone is listed twice')
  if (!Object.keys(world.sneak.actions).includes('Walking_C') || !Object.keys(world.sleeper.actions).includes('Sit_Chair_Idle')) fail('the sneak and the sleep are missing')

  const bytes = readdirSync(ART).reduce((sum, f) => sum + statSync(`${ART}/${f}`).size, 0)
  if (bytes > MAX_ART_BYTES) fail(`art is ${bytes} bytes`)
  return failures
}
