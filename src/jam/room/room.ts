// ── A paper room behind the band: Monster Hollow's stage, indoors ─────────────
// Loaded with three.js, only when a room is on screen. One view lives as long as
// Jam shows a scene: changing scene swaps the world under a frozen frame of the
// old one, and leaving hands the shared renderer and every GPU resource back.
import * as THREE from 'three'
import { disposeScene, fitCamera, loadGlb, loadPalette, mergeProps, paperGrain, paperMaterial, releaseRenderer, sharedRenderer } from '../../arcade/engine/stage'
import type { BandLevel } from '../reaction'
import { ROOM_SPECS, type Mote, type RoomSpec } from './rooms'
import { roomLight, tooSlow, type Room } from './roomChoice'

const STAGE_ASPECT = 16 / 9
const CAMERA_LOOKS_AT = 0.2      // low, so the room stands in the top of the frame, above the docked HUD
const FRAME_MS = 1000 / 30       // a backdrop has no need for more, and phones run cooler
const FRAME_SLACK_MS = 4         // a 60 Hz frame lands a hair early; without this it would wait for a third
const SLOW_SAMPLE_FRAMES = 90
const LIGHT_EASE = 0.3           // softens the beat's attack
const STILL_AT = 40              // seconds into the loop: rain mid-fall, steam mid-rise
const STILL_LIGHT = roomLight(Infinity, 0.5, 1)
const SPARK_LOUD = 0.7           // sparks lift off on the bar's first beat, from here or at full band level
const CHORD_BURST_LOUD = 0.35    // a chord change throws a few too, once the player is really playing
const SPARK_FADE_SEC = 1.1
const SWAY = 0.03                // radians, either way
const SWING_LENGTH = 8
const POP_SEC = 1.4              // how long a poke or a nudge takes to die away
const KICK_FADE_SEC = 0.22
const KICK_LIGHT = 0.05
const CUE_SIZE = 2.4
const AWAKE_MS = 4500            // a paused room stays alive this long after being touched
const IDLE_MIN_MS = 9000
const IDLE_SPREAD_MS = 16000
const FADE_MS = 320
const PLANET_TURN = 0.05
const PLANET_RUSH = 0.8
const PLANET_TILT = 0.3
const FLAT = new THREE.Vector3(0, 0, 1)

// Counting the shadow pass, which only really runs once, and not counting an idle
// actor, which only draws while it crosses the room
export const DRAW_CALL_BUDGET = 6

export interface BandFeel { beat: number; loud: number; level: BandLevel; chord: { raw: string } | null }

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
const lick = (t: number, seed: number) => 0.75 + 0.25 * Math.sin(t * 9.1 + seed) * Math.sin(t * 5.3 + seed * 2)
const sway = (t: number) => SWAY * Math.sin(t * 0.7)

// A tired neon tube: one short dip every few seconds, never a strobe
function tubeBuzz(t: number, depth: number): number {
  const dips = fract(Math.sin(Math.floor(t * 14) * 12.9898) * 43758.5453) > 0.985
  return dips ? 1 - depth : 1
}

export interface RoomFeel {
  t: number; light: number; loud: number; pulse: number; kick: number; sinceSparks: number; buzz: number; aim: number
  pop(name: string): number    // 1 just after a poke, fading to 0
  since(name: string): number  // seconds since a poke
  off(name: string): boolean   // toggled off
}

// Where one mote is at this moment, and how bright; everything moves slowly
function moveMote(m: Mote, feel: RoomFeel, to: THREE.Object3D, facing: THREE.Quaternion, turn: THREE.Quaternion): number {
  const { t, light, loud, kick, sinceSparks, buzz } = feel
  const pop = m.on ? feel.pop(m.on) : 0
  const lit = m.on && feel.off(m.on) ? 0.1 : 1
  to.position.set(m.x, m.y, m.z)
  to.scale.set(m.size, m.h && m.kind === 'glow' ? m.size * m.h : m.size, 1)
  to.quaternion.copy(facing)
  switch (m.kind) {
    case 'glow':
      return lit * m.strength * light * flicker(t, m.seed) * (1 + pop)
    case 'neon':
      return m.strength * light * tubeBuzz(t, pop ? 0.7 : buzz) * (1 + pop * 1.4)
    case 'sway':
      to.position.x += SWING_LENGTH * Math.sin(sway(t) * (1 + 4 * pop))
      if (m.h) to.scale.y = m.size * m.h
      return m.strength * light * flicker(t, m.seed)
    case 'beam': {
      const free = m.w * Math.sin(t * 0.13 + m.seed)
      const held = m.on ? Math.exp(-feel.since(m.on) / 2.5) : 0
      const angle = free + (feel.aim - free) * held
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
      const reading = Math.min(1, loud * (0.75 + 0.35 * Math.sin(t * 5.3 + m.seed) * Math.sin(t * 3.1 + m.seed * 2)) + kick * 0.35)
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
      return m.strength * Math.sin(rise * Math.PI) * (1 + 2.5 * pop)
    }
    case 'drop': {
      const fall = fract(t * (0.05 + fract(m.seed) * 0.06) + m.seed)
      to.position.y -= fall * m.h
      to.position.x += 0.04 * Math.sin(fall * 20 + m.seed)
      to.scale.y = m.size * 7
      return m.strength * Math.min(1, (1 - fall) * 8)
    }
    case 'twinkle': {
      const on = Math.sin(t * 0.21 + m.seed * 7) + Math.sin(t * 0.13 + m.seed * 3)
      return m.strength * Math.max(0.05, Math.min(1, on + 0.7)) * (1 + pop)
    }
    case 'bulb': {
      const reach = 1 + 5 * pop
      to.position.y += 0.05 * reach * Math.sin(t * (1 + 2 * pop) + m.x * 0.7)
      to.position.x += 0.04 * Math.sin(t * 0.8 + m.x)
      return m.strength * light * (1 + 0.8 * pop * Math.sin(t * 6 + m.x * 1.2))
    }
    case 'fire': {
      const jump = lick(t, m.seed)
      to.position.x += 0.12 * Math.sin(t * 4 + m.seed)
      to.position.y += (0.15 + 0.5 * kick + 0.5 * pop) * jump
      to.scale.set(m.size * jump, m.size * (1.3 + 0.5 * kick + 0.6 * pop) * jump, 1)
      return m.strength * light * jump
    }
    case 'ember': {
      const rise = fract(t * (0.12 + fract(m.seed) * 0.1) + m.seed)
      to.position.x += m.w * Math.sin(rise * 6 + m.seed * 5) * rise
      to.position.y += rise * m.h
      return m.strength * (1 - rise) * (1 + 2 * kick)
    }
    case 'wave': {
      const roll = fract(t * 0.09 + m.seed)
      to.position.x += 0.5 * Math.sin(t * 0.2 + m.seed * 4)
      to.position.y -= roll * 0.5
      to.scale.set(m.w * (0.7 + 0.3 * roll), m.h * (1 + 1.5 * pop + kick), 1)
      return m.strength * light * Math.sin(roll * Math.PI) * (1 + pop + kick)
    }
    case 'star':
      to.position.x += fract(t * 0.006 + m.seed) * m.w
      return m.strength * (0.7 + 0.3 * Math.sin(t * 0.7 + m.seed * 9))
    case 'pump':
      to.scale.setScalar(m.size * (1 + 0.25 * (kick + pop)))
      return m.strength * (kick + pop)
    case 'pass': {
      const p = feel.since(m.on!) / m.seed
      if (p >= 1) { to.scale.setScalar(0); return 0 }
      to.position.x += m.w * p
      to.position.y += m.h * p
      to.scale.set(m.size * 6, m.size, 1)
      to.quaternion.multiply(turn.setFromAxisAngle(FLAT, Math.atan2(m.h, m.w)))
      return m.strength * Math.sin(p * Math.PI)
    }
  }
}

function shineOnly(mesh: THREE.Mesh, scene: THREE.Scene) {
  mesh.castShadow = mesh.receiveShadow = false
  scene.add(mesh)
  return mesh
}

export function buildRoom(spec: RoomSpec, props: THREE.Object3D, material: THREE.Material, lit: THREE.MeshBasicMaterial, glowMap: THREE.Texture | null) {
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(30, STAGE_ASPECT, 1, 80)
  camera.position.set(0, 4.8, 22)
  camera.lookAt(0, CAMERA_LOOKS_AT, 0)
  camera.updateMatrixWorld()

  scene.add(mergeProps(props, spec.stage, material))
  shineOnly(mergeProps(props, spec.lit, lit), scene)

  // Their own material, so a tube can dip without the lamps; only rooms with signals pay for them
  const signalMaterial = lit.clone()
  if (spec.signal.length) shineOnly(mergeProps(props, spec.signal, signalMaterial), scene)

  const swinging = spec.swing && shineOnly(mergeProps(props, [{ model: 'lamp_hanging', x: 0, y: -SWING_LENGTH, z: 0 }, { model: 'lamp_shine', x: 0, y: -SWING_LENGTH - 0.42, z: 0 }], lit), scene)
  if (swinging && spec.swing) swinging.position.set(spec.swing.x, spec.swing.y + SWING_LENGTH, spec.swing.z)

  const spinning = spec.spin && shineOnly(mergeProps(props, [{ model: spec.spin.model, x: 0, z: 0 }], lit), scene)
  if (spinning && spec.spin) {
    spinning.position.set(spec.spin.x, spec.spin.y, spec.spin.z)
    spinning.rotation.order = 'ZYX'
    spinning.rotation.z = PLANET_TILT
  }

  const actor = spec.actor && shineOnly(mergeProps(props, [{ model: spec.actor.model, x: 0, z: 0 }], lit), scene)
  if (actor) actor.visible = false

  const crowd = spec.figures && new THREE.InstancedMesh(mergeProps(props, [{ model: spec.figures.model, x: 0, z: 0 }], lit).geometry, lit, spec.figures.at.length)
  if (crowd) { crowd.frustumCulled = false; scene.add(crowd) }

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
  const motes = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), glowMaterial, spec.motes.length + 1)   // the last is the hover cue
  motes.frustumCulled = false
  scene.add(motes)

  const at = new THREE.Object3D()
  const turn = new THREE.Quaternion()
  const colors = spec.motes.map(m => new THREE.Color(m.color))
  const tinted = new THREE.Color()
  let planet = 0
  let lastT = STILL_AT

  const pose = (feel: RoomFeel, hover: { x: number; y: number; z: number } | null) => {
    const { t, light, pulse } = feel
    spec.motes.forEach((m, i) => {
      motes.setColorAt(i, tinted.copy(colors[i]).multiplyScalar(moveMote(m, feel, at, camera.quaternion, turn)))
      at.updateMatrix()
      motes.setMatrixAt(i, at.matrix)
    })
    at.quaternion.copy(camera.quaternion)
    if (hover) at.position.set(hover.x, hover.y, hover.z)
    at.scale.setScalar(hover ? CUE_SIZE : 0)
    at.updateMatrix()
    motes.setMatrixAt(spec.motes.length, at.matrix)
    motes.setColorAt(spec.motes.length, tinted.setScalar(0.22))
    motes.instanceMatrix.needsUpdate = true
    motes.instanceColor!.needsUpdate = true

    const dim = feel.off('lamps') ? 0.72 : 1
    ambient.intensity = spec.ambient.intensity * light * dim
    key.intensity = spec.key.intensity * light * dim
    lit.color.setScalar(light * (spec.dim ?? 1))
    signalMaterial.color.setScalar(feel.off('tally') ? 0.2 : light * tubeBuzz(t, feel.pop('neon') ? 0.7 : spec.buzz) * (1 + 0.5 * feel.pop('neon')))
    if (swinging) swinging.rotation.z = sway(t) * (1 + 4 * feel.pop('swing'))
    if (spinning) {
      planet += (t - lastT) * (PLANET_TURN + PLANET_RUSH * feel.pop('spin'))
      spinning.rotation.y = planet
    }
    lastT = t
    if (crowd && spec.figures) {
      spec.figures.at.forEach(([x, z], i) => {
        at.quaternion.identity()
        at.scale.setScalar(1)
        at.position.set(x + 0.07 * Math.sin(t * 1.3 + i * 1.7), pulse * (i % 2 ? 0.2 : 0.11), z)
        at.updateMatrix()
        crowd.setMatrixAt(i, at.matrix)
      })
      crowd.instanceMatrix.needsUpdate = true
    }
    if (actor && spec.actor) {
      const { from, to, secs } = spec.actor
      const p = feel.since('actor') / secs
      actor.visible = p < 1
      if (actor.visible) actor.position.set(from[0] + (to[0] - from[0]) * p, from[1] + (to[1] - from[1]) * p + 0.04 * Math.abs(Math.sin(t * 7)), from[2] + (to[2] - from[2]) * p)
    }
  }

  return { scene, camera, key, pose, motes, crowd, spec }
}

type World = ReturnType<typeof buildRoom> & { props: THREE.Object3D; palette: THREE.Texture }

function stillFeel(toggled: Set<string>): RoomFeel {
  return { t: STILL_AT, light: STILL_LIGHT, loud: 0.5, pulse: 0, kick: 0, sinceSparks: Infinity, buzz: 0, aim: 0, pop: () => 0, since: () => Infinity, off: n => toggled.has(n) }
}

export type RoomView = ReturnType<typeof createRoomView>

export function createRoomView(host: HTMLElement, reduced: boolean, band: () => BandFeel, onSlow: () => void) {
  let renderer: THREE.WebGLRenderer | null = null
  let world: World | null = null
  let latest = 0        // the newest show(): a slower, older load finds it has lost and goes quietly
  let playing = false
  let awakeUntil = 0
  let raf = 0
  let drawn = 0
  let frames = 0
  let sampleFrom = 0
  let lastBeat = -1
  let beatAt = -Infinity
  let lastChord = ''
  let light = STILL_LIGHT
  let sparksAt = -Infinity
  let kick = 0
  let kickAt = -Infinity
  let aim = 0
  let hovered = -1
  let nextIdle = performance.now() + IDLE_MIN_MS
  const pokes = new Map<string, number>()
  const toggled = new Set<string>()
  const point = new THREE.Vector3()

  const render = () => { if (renderer && world) renderer.render(world.scene, world.camera) }
  const hoverSpot = () => world?.spec.hot[hovered] ?? null

  const poseStill = () => { world?.pose(stillFeel(toggled), hoverSpot()); render() }

  const fit = () => {
    const { clientWidth: w, clientHeight: h } = host
    if (!renderer || !world || !w || !h) return
    renderer.setSize(w, h)
    fitCamera(world.camera, w, h, STAGE_ASPECT)
    poseStill()    // resizing clears the canvas, and a paused room has no next frame
  }
  const resize = new ResizeObserver(fit)
  resize.observe(host)

  const feelAt = (now: number, loud: number, pulse: number): RoomFeel => ({
    t: STILL_AT + now / 1000, light, loud, pulse, kick, aim, sinceSparks: (now - sparksAt) / 1000, buzz: world?.spec.buzz ?? 0,
    pop: name => Math.exp(-(now - (pokes.get(name) ?? -Infinity)) / 1000 / POP_SEC * 3),
    since: name => (now - (pokes.get(name) ?? -Infinity)) / 1000,
    off: name => toggled.has(name),
  })

  const frame = (now: number) => {
    if (!playing && now > awakeUntil) { raf = 0; poseStill(); return }
    raf = requestAnimationFrame(frame)
    if (playing && ++frames === SLOW_SAMPLE_FRAMES) {
      if (tooSlow(frames, now - sampleFrom)) onSlow()
      frames = 0
      sampleFrom = now
    }
    if (now - drawn < FRAME_MS - FRAME_SLACK_MS || !world) return
    drawn = now
    const { beat, loud, level, chord } = band()
    const raw = chord?.raw ?? ''
    if (beat !== lastBeat) {
      lastBeat = beat
      beatAt = now
      if (playing && beat === 0 && (level === 2 || loud > SPARK_LOUD)) sparksAt = now
    }
    if (raw !== lastChord) {
      lastChord = raw
      if (playing && loud > CHORD_BURST_LOUD) sparksAt = now
    }
    if (now > nextIdle && world.spec.idle.length) {
      const pick = world.spec.idle[Math.floor(Math.random() * world.spec.idle.length)]
      pokes.set(pick, now)
      nextIdle = now + IDLE_MIN_MS + Math.random() * IDLE_SPREAD_MS
    }
    const sinceBeat = playing ? (now - beatAt) / 1000 : Infinity
    kick = Math.max(0, kick * Math.exp(-(now - kickAt) / 1000 / KICK_FADE_SEC))
    kickAt = now
    light += (roomLight(sinceBeat, loud, level) + KICK_LIGHT * kick - light) * LIGHT_EASE
    world.pose(feelAt(now, loud, Math.exp(-sinceBeat / 0.16)), hoverSpot())
    render()
  }

  const wake = () => {
    if (reduced) { poseStill(); return }
    if (!raf) {
      frames = 0
      sampleFrom = performance.now()
      raf = requestAnimationFrame(frame)
    }
  }

  // Keep the last frame on screen, on its own canvas, while the renderer changes world
  function freeze(): (() => void) | null {
    if (reduced || !renderer || !world) return null
    render()
    const from = renderer.domElement
    const shot = document.createElement('canvas')
    shot.width = from.width
    shot.height = from.height
    shot.className = 'jam-room-fade'
    shot.getContext('2d')!.drawImage(from, 0, 0)
    host.appendChild(shot)
    return () => {
      requestAnimationFrame(() => { shot.style.opacity = '0' })
      setTimeout(() => shot.remove(), FADE_MS + 80)
    }
  }

  function release(gone: World) {
    gone.key.dispose()
    gone.motes.dispose()
    gone.crowd?.dispose()
    disposeScene(gone.scene)
    disposeScene(gone.props)
    gone.palette.dispose()
  }

  function clear() {
    latest++
    cancelAnimationFrame(raf)
    raf = 0
    if (world) release(world)
    world = null
    hovered = -1
    if (renderer) releaseRenderer()
    renderer = null
    host.querySelectorAll('.jam-room-fade').forEach(s => s.remove())
  }

  return {
    async show(room: Room) {
      const mine = ++latest
      const art = `./jam/${room}`
      const [palette, { scene: props }] = await Promise.all([loadPalette(`${art}/palette.png`), loadGlb(`${art}/props.glb`)])
      if (mine !== latest) {
        disposeScene(props)
        palette.dispose()
        return
      }
      const lit = paperGrain(new THREE.MeshBasicMaterial({ map: palette }))
      const next = { ...buildRoom(ROOM_SPECS[room], props, paperMaterial(palette), lit, glowTexture()), props, palette }
      if (!renderer) {
        renderer = sharedRenderer()
        renderer.shadowMap.autoUpdate = false
        host.appendChild(renderer.domElement)
      }
      const fade = freeze()
      if (world) release(world)
      world = next
      hovered = -1
      toggled.clear()
      renderer.shadowMap.needsUpdate = true
      fit()
      fade?.()
      if (playing) wake()
    },
    clear,
    // Reduced motion never leaves the still frame
    run(on: boolean) {
      playing = on
      if (!on) { cancelAnimationFrame(raf); raf = 0; poseStill() }
      else wake()
    },
    // The player's note: a nudge, nothing more. Costs one number, so it can't touch latency
    nudge(strength: number) { if (!reduced) kick = Math.min(1, kick + strength * 0.6) },
    // x and y in the room's own pixels; true over something that reacts
    hover(x: number, y: number): boolean {
      const was = hovered
      hovered = -1
      if (world) {
        const scale = host.clientHeight / 720
        world.spec.hot.forEach((spot, i) => {
          point.set(spot.x, spot.y, spot.z).project(world!.camera)
          const px = (point.x + 1) / 2 * host.clientWidth
          const py = (1 - point.y) / 2 * host.clientHeight
          if (Math.hypot(px - x, py - y) < spot.r * scale) hovered = i
        })
      }
      if (hovered !== was) { if (reduced || !(playing || raf)) poseStill() }
      return hovered >= 0
    },
    press(x: number, y: number) {
      if (!this.hover(x, y) || !world) return
      const { does } = world.spec.hot[hovered]
      const now = performance.now()
      if (does === 'lamps' || does === 'tally') { if (!toggled.delete(does)) toggled.add(does) }
      if (does === 'sparks') { if (!reduced) sparksAt = now }
      else if (!reduced) pokes.set(does, now)
      aim = Math.max(-0.5, Math.min(0.5, (x / host.clientWidth - 0.5) * -1.2))
      if (reduced) poseStill()
      else { if (!playing) awakeUntil = now + AWAKE_MS; wake() }
    },
    dispose() {
      clear()
      resize.disconnect()
    },
  }
}
