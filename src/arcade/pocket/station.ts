// ── Orbit Station, the place: a paper station whose rings turn on your beat ───
// The Arcade's paper diorama: one palette, one material, a fixed camera. Laid out
// to the board's composition. Loaded with three.js, only when a run starts.
import * as THREE from 'three'
import { MAX_PIXEL_RATIO, disposeScene, fitCamera, loadGlb, loadPalette, mergeProps, paperMaterial, sharedRenderer, type Placement } from '../engine/stage'

const ART = './arcade/orbit'

// Each frame stays at this. The shadow pass comes on top, one frame in SHADOW_EVERY
export const DRAW_CALL_BUDGET = 5

const BOARD_W = 1280
const BOARD_H = 800
const STAGE_ASPECT = BOARD_W / BOARD_H
const FOV = 30
const CAMERA_DISTANCE = 19.6
const CAMERA_LIFT = 0.38            // radians above the rings
const LOOK_Y = -0.6
const RING_SIZE = 1.35
const POD_RADIUS = 3.7 * RING_SIZE
const PODS = 8
const BEACON_Y = 2.05 * RING_SIZE
const FRAME_MS = 30                 // draw at 30 frames a second; the rules never wait for it
const SHADOW_EVERY = 8

const OUTER_TURN = 0.32             // radians a second, in orbit
const INNER_TURN = -0.5
const MAX_SLOW = 0.85               // how much of the turn strain can take away
const HIT_KICK = 0.5                // a note in the pocket adds this to the turn
const MAX_TILT = 0.2
const MAX_SLIDE = 0.45
const WOBBLE = 0.1
const WOBBLE_RATE = 0.005
const EASE = 6                      // per second
const JOLT_DECAY = 2.5
const KICK_DECAY = 3
const WARNING_AT = 0.15             // strain that lights the warning ring

const SPARKS = 12
const SPARK_SEC = 0.7
const SPARK_MIN_CLOSE = 0.5         // only a note close to the beat throws one
const STARS: [number, number, number][] = [[35, 213, 1.2], [1233, 305, 0.8], [420, 34, 0.7], [760, 92, 0.6], [150, 420, 0.8], [1180, 470, 1]]

const SUN = new THREE.Color('#ffd27a')
const CORAL = new THREE.Color('#ff7a5c')
const PINK = new THREE.Color('#ff5fc8')
const SKY = new THREE.Color('#9fb0ff')

function glowTexture(): THREE.CanvasTexture {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const pen = canvas.getContext('2d')!
  const light = pen.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  light.addColorStop(0, 'rgba(255,255,255,1)')
  light.addColorStop(0.35, 'rgba(255,255,255,0.4)')
  light.addColorStop(1, 'rgba(255,255,255,0)')
  pen.fillStyle = light
  pen.fillRect(0, 0, size, size)
  return new THREE.CanvasTexture(canvas)
}

export function buildStation(props: THREE.Object3D, material: THREE.Material, glowMap: THREE.Texture | null) {
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(FOV, STAGE_ASPECT, 0.1, 100)
  camera.position.set(0, Math.sin(CAMERA_LIFT) * CAMERA_DISTANCE, Math.cos(CAMERA_LIFT) * CAMERA_DISTANCE)
  camera.lookAt(0, LOOK_Y, 0)
  camera.updateMatrixWorld()

  // A place in the board's own pixels, on the plane this far behind the station
  const spot = (px: number, py: number, behind: number) => {
    const ray = new THREE.Vector3(px / (BOARD_W / 2) - 1, 1 - py / (BOARD_H / 2), 0.5).unproject(camera).sub(camera.position).normalize()
    return camera.position.clone().addScaledVector(ray, (-behind - camera.position.z) / ray.z)
  }
  const placed = (model: string, px: number, py: number, behind: number, size: number): Placement => {
    const { x, y, z } = spot(px, py, behind)
    return { model, x, y, z, size }
  }

  const stars = STARS.map(([px, py, size]) => placed('star_paper', px, py, 5, size))
  const still = mergeProps(props, [
    { model: 'station_hub', x: 0, z: 0, size: RING_SIZE },
    placed('planet_paper', 1115, 40, 10, 1.5),
    placed('moon_paper', 105, 6, 6, 1.2),
    ...stars,
  ], material)
  scene.add(still)

  const ring = (model: string) => ({ model, x: 0, z: 0, size: RING_SIZE })
  const inner = mergeProps(props, [ring('ring_inner')], material)
  // The warning ring shares the outer ring's draw call: it's the tail of the same mesh
  const plain = mergeProps(props, [ring('ring_outer')], material)
  const ringOnly = plain.geometry.index!.count
  plain.geometry.dispose()
  const outer = mergeProps(props, [ring('ring_outer'), ring('ring_warning')], material)
  outer.geometry.setDrawRange(0, ringOnly)
  outer.rotation.order = inner.rotation.order = 'ZXY'    // the turn stays inside the tilt
  scene.add(outer, inner)

  const comet = mergeProps(props, [{ model: 'comet', x: 0, z: 0, size: 2.4 }], material)
  comet.castShadow = comet.receiveShadow = false
  comet.position.copy(spot(258, 85, 6))
  comet.rotation.z = -0.38
  scene.add(comet)

  scene.add(new THREE.HemisphereLight('#c4ccff', '#2a2350', 1.3))
  const sun = new THREE.DirectionalLight('#fff1dc', 2.5)
  sun.position.set(-7, 14, 8)
  sun.castShadow = true
  sun.shadow.mapSize.set(1024, 1024)
  sun.shadow.radius = 6
  Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, far: 40 })
  scene.add(sun)

  // Everything that glows, in one instanced draw: beacon, hub, planet, the rim's
  // windows, the stars, then the sparks of play
  const lamps = 3 + PODS + stars.length
  const glows = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: glowMap, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }), lamps + SPARKS)
  glows.frustumCulled = false
  scene.add(glows)

  return { scene, camera, outer, inner, comet, glows, ringOnly, lamps, planetAt: spot(1115, 40, 10), starsAt: stars.map(s => new THREE.Vector3(s.x, s.y, s.z)) }
}

interface Spark { born: number; at: THREE.Vector3; color: THREE.Color; size: number }

// The newest opening: one dropped mid-load must leave the shared canvas alone
let opening = 0

export async function openStation(host: HTMLElement, still: boolean) {
  const mine = ++opening
  const palette = await loadPalette(`${ART}/palette.png`)
  const props = await loadGlb(`${ART}/props.glb`)
  const material = paperMaterial(palette)
  const world = buildStation(props.scene, material, glowTexture())
  const { scene, camera, outer, inner, comet, glows, ringOnly, lamps, planetAt, starsAt } = world
  const cometHome = comet.position.clone()
  const renderer = sharedRenderer()
  renderer.shadowMap.autoUpdate = false
  renderer.shadowMap.needsUpdate = true
  if (mine === opening) host.appendChild(renderer.domElement)
  const fit = () => {
    const { clientWidth: w, clientHeight: h } = host
    if (!w || !h) return
    // The Arcade zooms its board: draw for the pixels the canvas really covers
    renderer.setPixelRatio(Math.min(window.devicePixelRatio * host.getBoundingClientRect().width / w, MAX_PIXEL_RATIO))
    renderer.setSize(w, h)
    fitCamera(camera, w, h, STAGE_ASPECT)
  }
  const resize = new ResizeObserver(fit)
  resize.observe(host)
  fit()

  let tilt = 0, shake = 0, jolt = 0, kick = 0, beacon = 0, steady = 1, clockSec = 0
  let drawnAt = -Infinity, frames = 0, nextSpark = 0
  const sparks: (Spark | null)[] = Array(SPARKS).fill(null)
  const at = new THREE.Object3D()
  const point = new THREE.Vector3()
  const tinted = new THREE.Color()

  const glow = (i: number, where: THREE.Vector3, size: number, color: THREE.Color, strength: number) => {
    at.position.copy(where)
    at.quaternion.copy(camera.quaternion)
    at.scale.setScalar(size)
    at.updateMatrix()
    glows.setMatrixAt(i, at.matrix)
    glows.setColorAt(i, tinted.copy(color).multiplyScalar(strength))
  }
  const podAt = (i: number) => {
    const a = i * Math.PI * 2 / PODS
    return outer.localToWorld(point.set(Math.cos(a) * POD_RADIUS, 0, Math.sin(a) * POD_RADIUS))
  }
  const throwSpark = (color: THREE.Color, size: number) => {
    sparks[nextSpark] = { born: clockSec, at: podAt(nextSpark % PODS).clone(), color, size }
    nextSpark = (nextSpark + 1) % SPARKS
  }

  function poseGlows() {
    outer.updateMatrixWorld()
    const warn = shake > WARNING_AT
    glow(0, point.set(0, BEACON_Y, 0), 1.2 + 1.6 * beacon, PINK, 0.35 + 0.65 * beacon)
    glow(1, point.set(0, 0, 0), 6, SUN, 0.06 + 0.1 * steady)
    glow(2, planetAt, 11, CORAL, 0.16)
    for (let i = 0; i < PODS; i++) glow(3 + i, podAt(i), 1.3, warn ? CORAL : SUN, 0.25 + 0.5 * steady)
    starsAt.forEach((s, i) => glow(3 + PODS + i, s, 1.5, SKY, 0.3 + (still ? 0 : 0.14 * Math.sin(clockSec * 1.4 + i * 2))))
    sparks.forEach((spark, i) => {
      const age = spark ? (clockSec - spark.born) / SPARK_SEC : 1
      if (!spark || age >= 1) return glow(lamps + i, point.set(0, 0, 0), 0, SUN, 0)
      glow(lamps + i, point.copy(spark.at).setY(spark.at.y + age * 1.2), spark.size * (1 - age * 0.6), spark.color, 1 - age)
    })
    glows.instanceMatrix.needsUpdate = true
    glows.instanceColor!.needsUpdate = true
  }

  return {
    // drift: -1 rushing to 1 dragging; strain: 0 to 1, how close to losing a life; beat: 1 on a click, fading
    fly(drift: number, strain: number, beat: number, dt: number) {
      if (still) return      // the drift meter says all this in words
      clockSec += dt
      const k = Math.min(1, dt * EASE)
      tilt += (drift - tilt) * k
      shake += (strain - shake) * k
      beacon = beat
      jolt = Math.max(0, jolt - dt * JOLT_DECAY)
      kick = Math.max(0, kick - dt * KICK_DECAY * kick)
      steady = 1 - Math.min(1, Math.max(shake, Math.abs(tilt)))
      const wobble = Math.sin(clockSec * 1000 * WOBBLE_RATE) * WOBBLE * (shake + jolt)
      outer.rotation.x = tilt * MAX_TILT + wobble
      outer.rotation.z = -wobble
      outer.position.x = tilt * MAX_SLIDE
      inner.rotation.x = -tilt * MAX_TILT + wobble
      inner.rotation.z = wobble
      inner.position.x = -tilt * MAX_SLIDE / 2
      outer.geometry.setDrawRange(0, shake > WARNING_AT ? Infinity : ringOnly)
      const orbit = 1 - MAX_SLOW * (1 - steady) + kick
      outer.rotation.y += OUTER_TURN * orbit * dt
      inner.rotation.y += INNER_TURN * orbit * dt
      const sway = Math.sin(clockSec / 2.6)
      comet.position.copy(cometHome)
      comet.position.x += sway * 0.7
      comet.position.y += sway * 0.25
    },
    // close: 0 to 1, how near the beat this note landed
    hit(close: number) {
      if (still) return
      kick = Math.min(1, kick + HIT_KICK * close)
      if (close >= SPARK_MIN_CLOSE) { outer.updateMatrixWorld(); throwSpark(SUN, 0.6 + 0.5 * close) }
    },
    lost() {
      if (still) return
      jolt = 1
      outer.updateMatrixWorld()
      for (let i = 0; i < SPARKS; i++) throwSpark(CORAL, 1.4)
    },
    render(now: number) {
      if (now - drawnAt < FRAME_MS) return
      drawnAt = now
      poseGlows()
      if (!still && ++frames % SHADOW_EVERY === 0) renderer.shadowMap.needsUpdate = true
      renderer.render(scene, camera)
    },
    dispose() {
      resize.disconnect()
      if (mine === opening) renderer.domElement.remove()
      renderer.shadowMap.autoUpdate = true
      disposeScene(props.scene)
      disposeScene(scene)
      palette.dispose()
    },
  }
}

export type Station = Awaited<ReturnType<typeof openStation>>
