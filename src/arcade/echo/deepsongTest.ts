/// <reference types="node" />
// Low-end check: the real art, built headless
// Run: node --import ./scripts/ts-esbuild-hooks.mjs src/runAllTests.ts --file src/arcade/echo/deepsongTest.ts
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshBasicMaterial, type Mesh } from 'three'
import { DRAW_CALLS_PER_FRAME, buildDeep } from './deepsong'

const ART = 'public/arcade/deepsong'
const MAX_ART_BYTES = 800 * 1024

function parse(file: string): Promise<GLTF> {
  const bytes = readFileSync(`${ART}/${file}.glb`)
  return new Promise((resolve, reject) => new GLTFLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, '', resolve, reject))
}

export async function runDeepSongTest(): Promise<number> {
  let failures = 0
  const fail = (m: string) => { console.error(`FAIL  ${m}`); failures++ }

  const [props, whale, fish1, fish3] = await Promise.all(['props', 'whale', 'fish1', 'fish3'].map(parse))
  if (whale.animations[0]?.name !== 'walk') fail('the whale lost its swim')
  const world = buildDeep(props.scene, new MeshBasicMaterial(), whale, [fish1, fish3])

  // The shadow pass runs only while the whale moves, so a frame is each mesh once
  let meshes = 0
  world.scene.traverseVisible(o => { if ((o as Mesh).isMesh) meshes++ })
  if (meshes > DRAW_CALLS_PER_FRAME) fail(`a frame costs ${meshes} draw calls`)

  // The whale really comes closer, and only forward
  const time = { value: 0 }
  const far = world.whaleAt.z
  world.near(0.5)
  for (let i = 0; i < 300; i++) world.step(1 / 30, time)
  const middle = world.whaleAt.z
  world.near(1)
  for (let i = 0; i < 300; i++) world.step(1 / 30, time)
  if (!(far < middle && middle < world.whaleAt.z)) fail(`whale at ${far}, ${middle}, ${world.whaleAt.z}`)
  if (!world.settled) fail('the whale should settle, so shadows can stop')
  world.ripple()
  world.step(1 / 30, time)
  world.stop()

  // Kelp sways and the propeller spins; the rocks and the hull stay still
  const motion = (mesh: Mesh) => [...(mesh.geometry.getAttribute('motion').array as Float32Array)]
  if (!motion(world.reef).some(m => m > 0) || !motion(world.reef).some(m => m === 0)) fail('only the kelp sways')
  if (!motion(world.sub).some(m => m < 0) || !motion(world.sub).some(m => m === 0)) fail('only the propeller spins')

  const bytes = readdirSync(ART).reduce((sum, f) => sum + statSync(`${ART}/${f}`).size, 0)
  if (bytes > MAX_ART_BYTES) fail(`art is ${bytes} bytes`)
  return failures
}
