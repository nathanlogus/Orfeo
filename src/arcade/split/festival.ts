// ── The Kite Festival, the place: a seaside town and the kites flying over it ─
// Loaded with three.js, only when a run starts. Two meshes hold everything: the
// town, which never moves, and one skinned mesh with a bone for each thing the wind
// moves. With confetti that is five draw calls, whatever happens in the sky.
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { MAX_PIXEL_RATIO, disposeScene, fitCamera, loadGlb, loadPalette, mergeProps, paperMaterial, sharedRenderer, type Placement } from '../engine/stage'
import { HANDS, type Hand } from './stages'

const ART = './arcade/kites'
export const DRAW_CALL_BUDGET = 5
const STAGE_ASPECT = 16 / 10
const FRAME_MS = 1000 / 30
const FRAME_SLACK_MS = 4       // a 60 Hz frame lands a hair early; without this it would wait for a third

const HEX_W = 2
const HEX_ROW = Math.sqrt(3)
const HEX_COLUMNS = 11
const GRASS_ROWS = [-4, 1]     // back to front; the coast, then the sea, come after
const SEA_ROWS = 4
const COAST_ROW = GRASS_ROWS[1] + 1
const COASTS = ['hex_coast_A', 'hex_coast_B', 'hex_coast_C']

const KITE_SIZE = 1.9
const KITE_LEAN = -0.32        // back into the wind
const TAIL_TOP = 0.75          // where the tail leaves a kite, in its own units
const TAIL_LENGTH = 1.7
const LINE_WIDTH = 0.035
const FLY_Y = 8.5              // full height
const SAG_Y = 4.8              // how far a kite sinks with its hand
const GROUND_Y = 0.7
const FLYERS: Record<Hand, { model: string; x: number; z: number; spool: [number, number, number]; colour: string; phase: number }> = {
  left: { model: 'kite_diamond_blue', x: -6.4, z: -1, spool: [-0.6, 0.5, 2.2], colour: '#5b7cff', phase: 0 },
  right: { model: 'kite_diamond_pink', x: 5.4, z: -1, spool: [0.6, 0.5, 2.2], colour: '#ff5fc8', phase: 1.7 },
}
// The rest of the festival, flying for the fun of it
const FAR_KITES = [
  { model: 'kite_delta', x: -0.6, y: 8.8, z: -6, size: 2, phase: 0.6 },
  { model: 'kite_diamond_sun', x: 12.4, y: 7.8, z: -5, size: 1.9, phase: 2.4 },
  { model: 'kite_box', x: 8.8, y: 6, z: -6, size: 1.3, phase: 3.3 },
  { model: 'windsock_fish', x: -15.4, y: 8.8, z: -6, size: 1.9, phase: 4.1 },
]
const BUNTINGS = [{ x: 0.2, y: 3.5, z: -1.8, size: 1.7, phase: 0 }, { x: -7, y: 3, z: -3.4, size: 1.3, phase: 1.1 }]
const CLOUDS = [
  { model: 'cloud_big', x: -9, y: 7.6, z: -9, size: 1.5 },
  { model: 'cloud_small', x: 2, y: 10, z: -10, size: 1.3 },
  { model: 'cloud_big', x: 12, y: 6.8, z: -9, size: 1.2 },
  { model: 'cloud_small', x: -16, y: 10, z: -10, size: 1.1 },
]
const CLOUD_SPAN = 44
const CLOUD_SPEED = 0.00035    // units a millisecond
const STORM_CLOUD = { scale: 2, lower: 2.4, speed: 3 }

const WIND = { bob: 0.28, drift: 0.32, roll: 0.09, tail: 0.2, flutter: 0.55, storm: 1.5 }
const WIND_MS = { bob: 950, drift: 1500, tail: 330, flutter: 260, far: 1700, gust: 3100 }
const TRIM = { perfect: 0.12, good: 0.05, slip: 0.25 }   // how far a hand's accuracy moves its kite
const SAG_RATE = 3             // the kite catches up with its hand in about 1/this seconds
const TUG_Y = 0.42
const TUG_DECAY = 0.86
const SHAKE_DECAY = 0.9
const SHAKE_ROLL = 0.5
const CLIMB_Y = 5
const FINISH_MS = 900

const BITS = 64
const BIT_SIZE = 0.22
const BIT_GRAVITY = 9
const BIT_LIFE_MS = 900
const HIT_BITS = 4
const TOGETHER_BITS = 12
const FAR_AWAY = -100

function townLayout(): Placement[] {
  const ground: Placement[] = []
  const cols = (row: number) => Array.from({ length: HEX_COLUMNS * 2 + 1 }, (_, i) => (i - HEX_COLUMNS) * HEX_W + (row % 2 ? HEX_W / 2 : 0))
  for (let row = GRASS_ROWS[0]; row <= COAST_ROW + SEA_ROWS; row++) {
    for (const x of cols(row)) {
      const z = row * HEX_ROW
      if (row < COAST_ROW) ground.push({ model: 'hex_grass', x, z })
      else if (row === COAST_ROW) ground.push({ model: COASTS[Math.abs(Math.round(x)) % 3], x, z, turn: Math.PI * 4 / 3 })
      else ground.push({ model: 'hex_water', x, z, y: -0.1 })
    }
  }
  return [
    ...ground,
    { model: 'building_windmill_blue', x: -11.4, z: -2.6, size: 2.2, turn: 0.5 },
    { model: 'building_home_A_blue', x: -6.6, z: -3.6, size: 1.9, turn: 0.3 },
    { model: 'building_home_B_blue', x: -3.6, z: -5, size: 1.8, turn: -0.2 },
    { model: 'tree_single_A', x: -1.2, z: -4.2, size: 1.4 },
    { model: 'tree_single_A', x: -9, z: -5.6, size: 1.2, turn: 1 },
    { model: 'building_market_blue', x: 4.6, z: -2.6, size: 1.9, turn: -0.3 },
    { model: 'building_tavern_blue', x: 10.8, z: -3.6, size: 2.2, turn: -0.6 },
    { model: 'tree_single_A', x: 13, z: -0.6, size: 1.2, turn: 2 },
    { model: 'flag_A_blue', x: -3, z: -1.8, size: 0.8 },
    { model: 'flag_C_blue', x: 3.4, z: -1.8, size: 0.8 },
    { model: 'kite_spool', x: FLYERS.left.spool[0], y: FLYERS.left.spool[1], z: FLYERS.left.spool[2], size: 1.2 },
    { model: 'kite_spool', x: FLYERS.right.spool[0], y: FLYERS.right.spool[1], z: FLYERS.right.spool[2], size: 1.2 },
  ]
}

// Bake one model at its rest pose, and tie it to a bone
function tied(geometry: THREE.BufferGeometry, index: (v: number) => [number, number], weight: (v: number) => number = () => 0) {
  const count = geometry.attributes.position.count
  const bones = new Uint16Array(count * 4)
  const weights = new Float32Array(count * 4)
  for (let v = 0; v < count; v++) {
    const [a, b] = index(v)
    const share = weight(v)
    bones.set([a, b, 0, 0], v * 4)
    weights.set([1 - share, share, 0, 0], v * 4)
  }
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(bones, 4))
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4))
  return geometry
}

export function buildFestival(props: THREE.Object3D, material: THREE.Material, { storm = false, reduced = false } = {}) {
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(30, STAGE_ASPECT, 1, 90)
  camera.position.set(0, 13, 30)
  camera.lookAt(0, 3.2, 0)

  const town = mergeProps(props, townLayout(), material)
  scene.add(town)
  scene.add(new THREE.HemisphereLight(storm ? '#8d93c4' : '#ffffff', storm ? '#3d3a52' : '#b9c6d8', storm ? 0.9 : 1.5))
  const sun = new THREE.DirectionalLight(storm ? '#c5c9ee' : '#fff3dc', storm ? 1.2 : 2.1)
  sun.position.set(-6, 18, 12)
  sun.castShadow = true
  sun.shadow.mapSize.set(1024, 1024)
  sun.shadow.radius = 6
  Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 14, bottom: -14, far: 50 })
  scene.add(sun)

  // Everything the wind touches, one bone each
  const bones: THREE.Bone[] = []
  const parts: THREE.BufferGeometry[] = []
  const bone = (x: number, y: number, z: number, parent?: THREE.Bone) => {
    const b = new THREE.Bone()
    b.position.set(x, y, z)
    bones.push(b)
    parent?.add(b)
    return { b, index: bones.length - 1 }
  }
  const bake = (place: Placement) => mergeProps(props, [place], material).geometry
  const loose = (place: Placement & { y: number }) => {
    const { b, index } = bone(place.x, place.y, place.z)
    parts.push(tied(bake(place), () => [index, index]))
    return b
  }

  const inkUv = (() => {
    // The bunting's wire is ink, and only the wire reaches its far end
    let uv: [number, number] = [0, 0]
    let reach = -Infinity
    props.getObjectByName('bunting')!.traverse(o => {
      const { geometry } = o as THREE.Mesh
      if (!geometry) return
      for (let v = 0; v < geometry.attributes.position.count; v++) {
        if (geometry.attributes.position.getX(v) <= reach) continue
        reach = geometry.attributes.position.getX(v)
        uv = [geometry.attributes.uv.getX(v), geometry.attributes.uv.getY(v)]
      }
    })
    return uv
  })()

  const flyers = Object.fromEntries(HANDS.map(hand => {
    const { model, x, z, spool, phase } = FLYERS[hand]
    const { b: kite, index } = bone(x, FLY_Y, z)
    const { b: tail, index: tailIndex } = bone(0, -TAIL_TOP * KITE_SIZE, 0, kite)
    const baked = bake({ model, x, y: FLY_Y, z, size: KITE_SIZE })
    const ys = baked.attributes.position
    const below = (v: number) => THREE.MathUtils.clamp(((FLY_Y - ys.getY(v)) / KITE_SIZE - TAIL_TOP) / TAIL_LENGTH, 0, 1)
    parts.push(tied(baked, () => [index, tailIndex], below))

    // The line: fixed at the spool, tied to the kite, so it stretches as the kite moves
    const { index: anchor } = bone(...spool)
    const line = new THREE.BoxGeometry(LINE_WIDTH, 1, LINE_WIDTH).translate(0, 0.5, 0)
    const at = line.attributes.position
    for (let v = 0; v < at.count; v++) {
      const top = at.getY(v) > 0.5
      at.setXYZ(v, at.getX(v) + (top ? x : spool[0]), top ? FLY_Y : spool[1], at.getZ(v) + (top ? z : spool[2]))
      line.attributes.uv.setXY(v, ...inkUv)
    }
    parts.push(tied(line, v => (at.getY(v) === FLY_Y ? [index, index] : [anchor, anchor])))

    return [hand, { kite, tail, x, z, phase, trim: 1, sag: 0, tug: 0, shake: 0, crashedAt: 0 }]
  })) as Record<Hand, { kite: THREE.Bone; tail: THREE.Bone; x: number; z: number; phase: number; trim: number; sag: number; tug: number; shake: number; crashedAt: number }>

  const far = FAR_KITES.map(k => ({ ...k, b: loose({ model: k.model, x: k.x, y: k.y, z: k.z, size: k.size }) }))
  const lines = BUNTINGS.map(b => ({ ...b, b: loose({ model: 'bunting', x: b.x, y: b.y, z: b.z, size: b.size }) }))
  const clouds = CLOUDS.map(c => {
    const y = storm ? c.y - STORM_CLOUD.lower : c.y
    const b = loose({ model: c.model, x: c.x, y, z: c.z, size: c.size * (storm ? STORM_CLOUD.scale : 1) })
    return { ...c, b }
  })

  const skin = new THREE.SkinnedMesh(mergeGeometries(parts), material)
  parts.forEach(p => p.dispose())
  skin.castShadow = true
  skin.frustumCulled = false   // its bounds don't follow the kites
  for (const b of bones) if (!b.parent) skin.add(b)
  skin.updateMatrixWorld(true)
  skin.bind(new THREE.Skeleton(bones))
  scene.add(skin)

  // Paper confetti: a bit of a hand's colour for each note it lands
  const bitAt = new Float32Array(BITS * 3).fill(FAR_AWAY)
  const bitColour = new Float32Array(BITS * 3)
  const bitMoves = Array.from({ length: BITS }, () => ({ born: -Infinity, vx: 0, vy: 0, x: 0, y: 0, z: 0 }))
  const bitShape = new THREE.BufferGeometry()
  bitShape.setAttribute('position', new THREE.BufferAttribute(bitAt, 3))
  bitShape.setAttribute('color', new THREE.BufferAttribute(bitColour, 3))
  const confetti = new THREE.Points(bitShape, new THREE.PointsMaterial({ size: BIT_SIZE, vertexColors: true }))
  confetti.frustumCulled = false
  confetti.visible = false
  scene.add(confetti)
  let nextBit = 0

  const tint = new THREE.Color()
  function puff(hand: Hand, now: number, count: number) {
    if (reduced) return
    const { kite } = flyers[hand]
    tint.set(FLYERS[hand].colour)
    for (let i = 0; i < count; i++) {
      const bit = bitMoves[nextBit]
      const turn = (nextBit * 2.399) % (Math.PI * 2)   // golden angle: spread without dice
      Object.assign(bit, { born: now, x: kite.position.x, y: kite.position.y, z: kite.position.z + 0.5, vx: Math.cos(turn) * 2.4, vy: 2 + Math.sin(turn) * 2 })
      bitColour.set([tint.r, tint.g, tint.b], nextBit * 3)
      nextBit = (nextBit + 1) % BITS
    }
    bitShape.attributes.color.needsUpdate = true
    confetti.visible = true
  }

  function moveBits(now: number) {
    if (!confetti.visible) return
    let alive = false
    bitMoves.forEach((bit, i) => {
      const age = (now - bit.born) / 1000
      if (age * 1000 > BIT_LIFE_MS) { bitAt[i * 3 + 1] = FAR_AWAY; return }
      alive = true
      bitAt.set([bit.x + bit.vx * age, bit.y + bit.vy * age - BIT_GRAVITY * age * age / 2, bit.z], i * 3)
    })
    bitShape.attributes.position.needsUpdate = true
    confetti.visible = alive
  }

  let climbedAt = 0
  let last = 0

  return {
    scene, camera,
    height: (hand: Hand) => flyers[hand].kite.position.y,

    // A hand's accuracy trims its kite; a landed note gives the line a tug
    hit(hand: Hand, grade: 'perfect' | 'good', now: number) {
      const f = flyers[hand]
      f.trim = Math.min(1, f.trim + TRIM[grade])
      if (!reduced) f.tug = TUG_Y
      puff(hand, now, HIT_BITS)
    },
    slip(hand: Hand) {
      const f = flyers[hand]
      f.trim = Math.max(0, f.trim - TRIM.slip)
      if (!reduced) f.shake = 1
    },
    together(now: number) { for (const hand of HANDS) puff(hand, now, TOGETHER_BITS) },
    crash(hand: Hand, now: number) { flyers[hand].crashedAt = now },
    climb(now: number) { climbedAt = now },

    // lag: 0 flying to 1 down, from the run. Time stands still with reduced motion;
    // the kites still show how each hand is doing.
    fly(now: number, lag: Record<Hand, number>) {
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      const t = reduced ? 0 : now
      const gust = (storm ? WIND.storm : 1) * (reduced ? 0 : 0.7 + 0.3 * Math.sin(t / WIND_MS.gust))
      for (const hand of HANDS) {
        const f = flyers[hand]
        f.sag += (Math.max(lag[hand], 1 - f.trim) - f.sag) * (reduced ? 1 : Math.min(1, dt * SAG_RATE))
        f.tug *= TUG_DECAY
        f.shake *= SHAKE_DECAY
        const fall = f.crashedAt ? Math.min(1, (now - f.crashedAt) / FINISH_MS) : 0
        const rise = climbedAt ? Math.min(1, (now - climbedAt) / FINISH_MS) : 0
        const height = FLY_Y - f.sag * SAG_Y + f.tug + rise * CLIMB_Y + Math.sin(t / WIND_MS.bob + f.phase) * WIND.bob * gust
        f.kite.position.y = Math.max(GROUND_Y, height - fall * fall * FLY_Y)
        f.kite.position.x = f.x + Math.sin(t / WIND_MS.drift + f.phase) * WIND.drift * gust
        f.kite.rotation.set(KITE_LEAN, 0, Math.sin(t / WIND_MS.bob + f.phase) * WIND.roll * gust + f.sag * WIND.roll * Math.sign(f.x) * 2 + Math.sin(t / 60) * f.shake * SHAKE_ROLL + fall * 1.6)
        f.tail.rotation.z = Math.sin(t / WIND_MS.tail + f.phase) * WIND.tail * gust
      }
      for (const k of far) {
        k.b.rotation.z = Math.sin(t / WIND_MS.far + k.phase) * WIND.roll * gust
        k.b.position.y = k.y + Math.sin(t / WIND_MS.drift + k.phase) * WIND.bob * gust
        if (k.model === 'kite_box') k.b.rotation.y = t / WIND_MS.far
      }
      for (const b of lines) b.b.rotation.x = Math.sin(t / WIND_MS.flutter + b.phase) * WIND.flutter * gust
      for (const c of clouds) {
        const run = c.x + CLOUD_SPAN / 2 + t * CLOUD_SPEED * (storm ? STORM_CLOUD.speed : 1)
        c.b.position.x = run % CLOUD_SPAN - CLOUD_SPAN / 2
      }
      moveBits(now)
    },
  }
}

export type Festival = Awaited<ReturnType<typeof openFestival>>

// The newest opening: one dropped mid-load must leave the shared canvas alone
let opening = 0

export async function openFestival(host: HTMLElement, options: { storm: boolean; reduced: boolean }) {
  const mine = ++opening
  const palette = await loadPalette(`${ART}/palette.png`)
  const material = paperMaterial(palette)
  const props = await loadGlb(`${ART}/props.glb`)
  const world = buildFestival(props.scene, material, options)
  const renderer = sharedRenderer()
  if (mine === opening) host.appendChild(renderer.domElement)
  const fit = () => {
    const { clientWidth: w, clientHeight: h } = host
    if (!w || !h) return
    // The Arcade zooms its board: draw for the pixels the canvas really covers
    renderer.setPixelRatio(Math.min(window.devicePixelRatio * host.getBoundingClientRect().width / w, MAX_PIXEL_RATIO))
    renderer.setSize(w, h)
    fitCamera(world.camera, w, h, STAGE_ASPECT)
  }
  const resize = new ResizeObserver(fit)
  resize.observe(host)
  fit()

  let drawn = -Infinity
  return {
    ...world,
    draw(now: number, lag: Record<Hand, number>) {
      if (now - drawn < FRAME_MS - FRAME_SLACK_MS) return
      drawn = now
      world.fly(now, lag)
      renderer.render(world.scene, world.camera)
    },
    dispose() {
      resize.disconnect()
      if (mine === opening) renderer.domElement.remove()
      disposeScene(props.scene)
      disposeScene(world.scene)
      palette.dispose()
    },
  }
}
