/// <reference types="node" />
// Low-end check: the real art, built headless, with the longest route a run can draw
// Run: node --import ./scripts/ts-esbuild-hooks.mjs src/runAllTests.ts --file src/arcade/scaleClimb/summitTest.ts
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshBasicMaterial, type Mesh, type SkinnedMesh } from 'three'
import { drawCalls } from '../engine/stage'
import { buildSummit, holdAt } from './summit'

const ART = 'public/arcade/summit'
const MAX_ART_BYTES = 1.5 * 1024 * 1024
// Ground and props, climber, each with a shadow pass, then holds, snow and flag
const DRAW_CALLS = 7
const LONGEST_ROUTE = 29

function parse(file: string): Promise<GLTF> {
  const bytes = readFileSync(`${ART}/${file}.glb`)
  return new Promise((resolve, reject) => new GLTFLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, '', resolve, reject))
}

export async function runSummitTest(): Promise<number> {
  let failures = 0
  const fail = (m: string) => { console.error(`FAIL  ${m}`); failures++ }

  const props = await parse('props')
  const climber = await parse('climber')
  const world = buildSummit(props.scene, climber, new MeshBasicMaterial())
  for (const name of ['climb', 'Cheer', 'Jump_Full_Short'] as const) world.clip(name)
  world.route(LONGEST_ROUTE)
  world.showFrom(0)

  const calls = drawCalls(world.scene)
  if (calls > DRAW_CALLS) fail(`the Summit costs ${calls} draw calls, budget ${DRAW_CALLS}`)
  let skins = 0
  world.scene.traverse(o => { if ((o as SkinnedMesh).isSkinnedMesh) skins++ })
  if (skins !== 1) fail(`the climber is ${skins} skinned meshes, not one`)

  // Climbed holds drop out of the draw, and a slip brings them back
  const holds = world.scene.children[world.scene.children.length - 1] as Mesh
  const whole = holds.geometry.drawRange.count
  const total = holds.geometry.index?.count ?? holds.geometry.attributes.position.count
  if (whole !== total) fail(`hold offsets add up to ${whole}, the mesh has ${total}`)
  world.showFrom(LONGEST_ROUTE - 1)
  const left = holds.geometry.drawRange.count
  if (left <= 0 || left >= whole) fail('the last hold should be all that is left')
  world.showFrom(LONGEST_ROUTE)
  if (holds.geometry.drawRange.count !== 0) fail('no holds left at the top')

  // Every hold is on the cliff, and each one is higher than the last
  for (let i = 0; i < LONGEST_ROUTE; i++) {
    const hold = holdAt(i, LONGEST_ROUTE)
    if (Math.abs(hold.x) > 2.1 || hold.y > 6) fail(`hold ${i} is off the face`)
    if (i && hold.y <= holdAt(i - 1, LONGEST_ROUTE).y) fail(`hold ${i} isn't higher`)
  }

  const bytes = readdirSync(ART).reduce((sum, f) => sum + statSync(`${ART}/${f}`).size, 0)
  if (bytes > MAX_ART_BYTES) fail(`art is ${bytes} bytes`)
  return failures
}
