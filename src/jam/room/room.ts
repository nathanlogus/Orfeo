// ── A paper room behind the band: Monster Hollow's stage, indoors ─────────────
// Loaded with three.js, only when a room is on screen. The shared renderer goes
// with the room, so leaving Jam hands every GPU resource back.
import * as THREE from 'three'
import { disposeScene, fitCamera, loadGlb, loadPalette, mergeProps, paperMaterial, releaseRenderer, sharedRenderer } from '../../arcade/engine/stage'
import type { BandLevel } from '../reaction'
import { ROOM_SPECS, type Mote, type RoomSpec } from './rooms'
import { roomLight, tooSlow, type Room } from './roomChoice'

const STAGE_ASPECT = 16 / 9
const CAMERA_LOOKS_AT = 0.2      // low, so the room stands in the top of the frame, above the docked HUD
const FRAME_MS = 1000 / 30      // a backdrop has no need for more, and phones run cooler
const FRAME_SLACK_MS = 4         // a 60 Hz frame lands a hair early; without this it would wait for a third
const SLOW_SAMPLE_FRAMES = 90
const LIGHT_EASE = 0.3          // softens the beat's attack
const STILL_AT = 40             // seconds into the loop: rain mid-fall, steam mid-rise
const STILL_LIGHT = roomLight(Infinity, 0.5, 1)
const SPARK_LOUD = 0.7          // sparks lift off on the bar's first beat, from here or at full band level
const SPARK_FADE_SEC = 1.1
const SWAY = 0.03               // radians, either way
const SWING_LENGTH = 8
const FLAT = new THREE.Vector3(0, 0, 1)

// Counting the shadow pass, which only really runs once: nothing that casts a shadow moves
export const DRAW_CALL_BUDGET = 6

export interface BandFeel { beat: number; loud: number; level: BandLevel }

function glowTexture(): THREE.CanvasTexture {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const pen = canvas.getContext('2d')!
  const light = pen.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  light.addColorStop(0, 'rgba(255,255,255,1)')
  light.addColorStop(0.35, 'rgba(255,255,255,0.45)')
  light.addColorStop(1, 'rgba(255,255,255,0)')
  pen.fillStyle = light
  pen.fillRect(0, 0, size, size)
  return new THREE.CanvasTexture(canvas)
}

const fract = (v: number) => v - Math.floor(v)
const flicker = (t: number, seed: number) => 1 + 0.05 * Math.sin(t * 2.3 + seed) * Math.sin(t * 7.1 + seed * 3)
const sway = (t: number) => SWAY * Math.sin(t * 0.7)

// A tired neon tube: one short dip every few seconds, never a strobe
function tubeBuzz(t: number, depth: number): number {
  const dips = fract(Math.sin(Math.floor(t * 14) * 12.9898) * 43758.5453) > 0.985
  return dips ? 1 - depth : 1
}

export interface RoomFeel { t: number; light: number; loud: number; sinceSparks: number; buzz: number }

// Where one mote is at this moment, and how bright; everything moves slowly
function moveMote(m: Mote, { t, light, loud, sinceSparks, buzz }: RoomFeel, to: THREE.Object3D, facing: THREE.Quaternion, turn: THREE.Quaternion): number {
  to.position.set(m.x, m.y, m.z)
  to.scale.set(m.size, m.h && m.kind === 'glow' ? m.size * m.h : m.size, 1)
  to.quaternion.copy(facing)
  switch (m.kind) {
    case 'glow':
      return m.strength * light * flicker(t, m.seed)
    case 'neon':
      return m.strength * light * tubeBuzz(t, buzz)
    case 'sway':
      to.position.x += SWING_LENGTH * Math.sin(sway(t))
      if (m.h) to.scale.y = m.size * m.h
      return m.strength * light * flicker(t, m.seed)
    case 'beam': {
      const angle = m.w * Math.sin(t * 0.13 + m.seed)
      to.position.x += Math.sin(angle) * m.h / 2
      to.position.y -= Math.cos(angle) * m.h / 2
      to.scale.y = m.h
      to.quaternion.multiply(turn.setFromAxisAngle(FLAT, angle))
      return m.strength * light
    }
    case 'spark': {
      const fade = Math.exp(-sinceSparks / SPARK_FADE_SEC)
      to.position.x += m.w * Math.sin(m.seed) * (1 - fade)
      to.position.y += m.h * (1 - fade)
      return m.strength * fade * Math.min(1, sinceSparks * 12)
    }
    case 'meter': {
      const reading = Math.min(1, loud * (0.75 + 0.35 * Math.sin(t * 5.3 + m.seed) * Math.sin(t * 3.1 + m.seed * 2)))
      to.scale.y = m.h * (0.25 + 0.75 * reading)
      to.position.y += to.scale.y / 2
      to.scale.x = m.size * 0.5
      return m.strength * light
    }
    case 'dust':
      to.position.x += m.w * Math.sin(t * 0.11 + m.seed)
      to.position.y += m.h * Math.sin(t * 0.07 + m.seed * 2)
      return m.strength * light * (0.6 + 0.4 * Math.sin(t * 0.3 + m.seed))
    case 'haze':
      to.position.x = m.x + (fract(t * 0.008 + m.seed) - 0.5) * m.w
      to.position.y += m.h * Math.sin(t * 0.05 + m.seed)
      return m.strength * light
    case 'steam': {
      const rise = fract(t * 0.16 + m.seed)
      to.position.x += m.w * Math.sin(rise * 5 + m.seed * 6)
      to.position.y += rise * m.h
      to.scale.set(m.size * (0.6 + rise), m.size * (1.2 + 2 * rise), 1)
      return m.strength * Math.sin(rise * Math.PI)
    }
    case 'drop': {
      const fall = fract(t * (0.05 + fract(m.seed) * 0.06) + m.seed)
      to.position.y -= fall * m.h
      to.position.x += 0.04 * Math.sin(fall * 20 + m.seed)
      to.scale.y = m.size * 7
      return m.strength * Math.min(1, (1 - fall) * 8)
    }
  }
}

export function buildRoom(spec: RoomSpec, props: THREE.Object3D, material: THREE.Material, lit: THREE.MeshBasicMaterial, glowMap: THREE.Texture | null) {
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(30, STAGE_ASPECT, 1, 80)
  camera.position.set(0, 4.8, 22)
  camera.lookAt(0, CAMERA_LOOKS_AT, 0)

  scene.add(mergeProps(props, spec.stage, material))
  const shining = mergeProps(props, spec.lit, lit)
  shining.castShadow = shining.receiveShadow = false
  scene.add(shining)

  // Their own material, so a tube can dip without the lamps; only rooms with signals pay for them
  const signalMaterial = lit.clone()
  if (spec.signal.length) {
    const signal = mergeProps(props, spec.signal, signalMaterial)
    signal.castShadow = signal.receiveShadow = false
    scene.add(signal)
  }

  const swinging = spec.swing && mergeProps(props, [{ model: 'lamp_hanging', x: 0, y: -SWING_LENGTH, z: 0 }, { model: 'lamp_shine', x: 0, y: -SWING_LENGTH - 0.42, z: 0 }], lit)
  if (swinging && spec.swing) {
    swinging.castShadow = swinging.receiveShadow = false
    swinging.position.set(spec.swing.x, spec.swing.y + SWING_LENGTH, spec.swing.z)
    scene.add(swinging)
  }

  const ambient = new THREE.HemisphereLight(spec.ambient.sky, spec.ambient.ground, spec.ambient.intensity)
  scene.add(ambient)
  const key = new THREE.DirectionalLight(spec.key.color, spec.key.intensity)
  key.position.set(...spec.key.from)
  key.castShadow = true
  key.shadow.mapSize.set(1024, 1024)
  key.shadow.radius = 6
  Object.assign(key.shadow.camera, { left: -14, right: 14, top: 12, bottom: -8, far: 40 })
  scene.add(key)

  const glowMaterial = new THREE.MeshBasicMaterial({ map: glowMap, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })
  const motes = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), glowMaterial, spec.motes.length)
  motes.frustumCulled = false
  scene.add(motes)

  const at = new THREE.Object3D()
  const turn = new THREE.Quaternion()
  const colors = spec.motes.map(m => new THREE.Color(m.color))
  const tinted = new THREE.Color()

  const pose = (t: number, light: number, loud: number, sinceSparks: number) => {
    const feel = { t, light, loud, sinceSparks, buzz: spec.buzz }
    spec.motes.forEach((m, i) => {
      motes.setColorAt(i, tinted.copy(colors[i]).multiplyScalar(moveMote(m, feel, at, camera.quaternion, turn)))
      at.updateMatrix()
      motes.setMatrixAt(i, at.matrix)
    })
    motes.instanceMatrix.needsUpdate = true
    motes.instanceColor!.needsUpdate = true
    ambient.intensity = spec.ambient.intensity * light
    key.intensity = spec.key.intensity * light
    lit.color.setScalar(light)
    signalMaterial.color.setScalar(light * tubeBuzz(t, spec.buzz))
    if (swinging) swinging.rotation.z = sway(t)
  }
  pose(STILL_AT, STILL_LIGHT, 0.5, Infinity)

  return { scene, camera, key, pose }
}

// A signal aborted during the load leaves the shared canvas alone and resolves null
export async function openRoom(host: HTMLElement, room: Room, reduced: boolean, signal: AbortSignal, band: () => BandFeel, onSlow: () => void) {
  const art = `./jam/${room}`
  const palette = await loadPalette(`${art}/palette.png`)
  const { scene: props } = await loadGlb(`${art}/props.glb`)
  if (signal.aborted) {
    disposeScene(props)
    palette.dispose()
    return null
  }
  const lit = new THREE.MeshBasicMaterial({ map: palette })
  const world = buildRoom(ROOM_SPECS[room], props, paperMaterial(palette), lit, glowTexture())
  const renderer = sharedRenderer()
  renderer.shadowMap.autoUpdate = false
  renderer.shadowMap.needsUpdate = true
  host.appendChild(renderer.domElement)
  const render = () => renderer.render(world.scene, world.camera)
  const fit = () => {
    const { clientWidth: w, clientHeight: h } = host
    if (!w || !h) return
    renderer.setSize(w, h)
    fitCamera(world.camera, w, h, STAGE_ASPECT)
    render()    // resizing clears the canvas, and a paused room has no next frame
  }
  const resize = new ResizeObserver(fit)
  resize.observe(host)
  fit()

  let raf = 0
  let drawn = 0
  let frames = 0
  let sampleFrom = 0
  let lastBeat = -1
  let beatAt = -Infinity
  let light = STILL_LIGHT
  let sparksAt = -Infinity
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame)
    if (++frames === SLOW_SAMPLE_FRAMES) {
      if (tooSlow(frames, now - sampleFrom)) onSlow()
      frames = 0
      sampleFrom = now
    }
    if (now - drawn < FRAME_MS - FRAME_SLACK_MS) return
    drawn = now
    const { beat, loud, level } = band()
    if (beat !== lastBeat) {
      lastBeat = beat
      beatAt = now
      if (beat === 0 && (level === 2 || loud > SPARK_LOUD)) sparksAt = now
    }
    light += (roomLight((now - beatAt) / 1000, loud, level) - light) * LIGHT_EASE
    world.pose(STILL_AT + now / 1000, light, loud, (now - sparksAt) / 1000)
    render()
  }

  return {
    // Reduced motion never leaves the still frame
    run(on: boolean) {
      cancelAnimationFrame(raf)
      if (!on) { world.pose(STILL_AT, STILL_LIGHT, 0.5, Infinity); render(); return }
      if (reduced) return
      frames = 0
      sampleFrom = performance.now()
      raf = requestAnimationFrame(frame)
    },
    dispose() {
      cancelAnimationFrame(raf)
      resize.disconnect()
      world.key.dispose()
      disposeScene(world.scene)
      disposeScene(props)
      palette.dispose()
      releaseRenderer()
    },
  }
}
