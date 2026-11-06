/// <reference types="node" />
// Self-check: which room plays, how bright it may get, and what the real art costs a phone
// Run: node --import ./scripts/ts-esbuild-hooks.mjs src/runAllTests.ts --file src/jam/room/roomTest.ts
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { MeshBasicMaterial } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { drawCalls } from '../../arcade/engine/stage'
import { DRAW_CALL_BUDGET, buildRoom } from './room'
import { ROOM_SPECS } from './rooms'
import { ROOMS, SCENES, lowEnd, roomFor, roomLight, sceneChoice, stepScene, tooSlow } from './roomChoice'

const ART = 'public/jam'
const MAX_ROOM_BYTES = 450 * 1024
const MAX_PULSE = 0.12   // a beat's share of the light: anything more reads as a flash

function parse(room: string) {
  const bytes = readFileSync(`${ART}/${room}/props.glb`)
  return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, '')
}

export async function runRoomTest(): Promise<number> {
  let failures = 0
  const fail = (m: string) => { console.error(`FAIL  ${m}`); failures++ }

  const defaults = { blues: 'roadhouse', jazz: 'cafe', pop: 'studio', rock: 'stage', rnb: 'studio', soul: 'cafe', funk: 'roadhouse', bossa: 'beach', hiphop: 'rooftop', alternative: 'rooftop', ballad: 'cafe' } as const
  for (const [style, room] of Object.entries(defaults)) {
    if (roomFor(null, style as keyof typeof defaults) !== room) fail(`${style} should default to ${room}`)
    if (roomFor(undefined, style as keyof typeof defaults) !== room) fail(`${style} with no prefs should default to ${room}`)
  }
  if (roomFor('cafe', 'rock') !== 'cafe') fail('a saved room beats the style')
  if (roomFor('plain', 'jazz') !== 'plain') fail('Plain is a choice')
  if (roomFor('auto', 'bossa') !== 'beach') fail('Auto follows the style')
  if (sceneChoice('disco') !== 'auto' || sceneChoice(null) !== 'auto' || sceneChoice('space') !== 'space') fail('anything unknown reads as Auto')
  if (stepScene('auto', -1) !== 'plain' || stepScene('plain', 1) !== 'auto' || stepScene('auto', 1) !== 'studio') fail('the arrows go round')
  let walked = SCENES[0]
  for (let i = 0; i < SCENES.length; i++) walked = stepScene(walked, 1)
  if (walked !== SCENES[0] || SCENES.length !== ROOMS.length + 2) fail('a full lap visits every scene')
  if (roomFor('disco', 'pop') !== 'studio' || roomFor(7, 'pop') !== 'studio') fail('a damaged pref falls back to the style')

  if (!lowEnd(2, 8) || !lowEnd(8, 2)) fail('little memory or few cores is low-end')
  if (lowEnd(8, 8) || lowEnd(undefined, undefined)) fail('a device that says nothing is not low-end')
  if (tooSlow(90, 90 * 34) || !tooSlow(90, 90 * 60)) fail('slow means well under 30 fps')

  const quiet = roomLight(Infinity, 0, 0)
  if (roomLight(Infinity, 1, 0) <= quiet || roomLight(Infinity, 0, 2) <= quiet) fail('loud and level should brighten the room')
  if (roomLight(0, 0.5, 1) <= roomLight(1, 0.5, 1)) fail('a beat should brighten the room')
  if (roomLight(0, 0.5, 1) - roomLight(Infinity, 0.5, 1) > MAX_PULSE) fail('the beat is too strong to stay calm')

  for (const room of ROOMS) {
    const { scene } = await parse(room)
    const built = buildRoom(ROOM_SPECS[room], scene, new MeshBasicMaterial(), new MeshBasicMaterial(), null)
    const calls = drawCalls(built.scene)
    console.log(`${room}: ${calls} draw calls, ${ROOM_SPECS[room].motes.length} motes`)
    if (calls > DRAW_CALL_BUDGET) fail(`${room} costs ${calls} draw calls, budget ${DRAW_CALL_BUDGET}`)
    if (!ROOM_SPECS[room].hot.length) fail(`${room} has nothing to touch`)
    const bytes = readdirSync(`${ART}/${room}`).reduce((sum, f) => sum + statSync(`${ART}/${room}/${f}`).size, 0)
    if (bytes > MAX_ROOM_BYTES) fail(`${room} art is ${bytes} bytes`)
  }
  return failures
}
