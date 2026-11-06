// ── The Summit, the place: a paper mountain and the climber working up its face ──
// Loaded with three.js, only when a run starts. The rules never see any of this:
// the screen says where the climber should be, and each frame eases it there.
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { MAX_PIXEL_RATIO, disposeScene, fitCamera, loadGlb, loadPalette, mergeProps, paperMaterial, sharedRenderer, type Placement } from '../engine/stage'

const ART = './arcade/summit'
const STAGE_ASPECT = 16 / 9
const FRAME_MS = 1000 / 30
const HEX_W = 2
const HEX_ROW = Math.sqrt(3)
const HEX_COLUMNS = 9
const HEX_ROWS_BACK = 6
const HEX_ROWS_FRONT = 3

const CLIFF_Z = -1
const HOLD_Z = CLIFF_Z + 0.44
const BODY_Z = CLIFF_Z + 0.95
const BODY_SIZE = 0.82
const HOLD_BASE = 2
const HOLD_TOP = 5.45
// Hands sit this far above the climber's feet
const REACH = 1.55
const ZIGZAG = [-1.15, 0.95, -0.55, 1.3, -0.95, 0.55]
const HOLD_MODELS = ['hold_large', 'hold_medium', 'hold_small']
const BODY_LEAN = 0.25
const LEDGE = { x: -0.6, y: 7, z: CLIFF_Z + 0.1 }

// One pull is half the climbing cycle, one hand's reach
const PULL_SECONDS = 0.6
const FIRST_PULL = 0.3
const EVEN_RATE = 20
const UNEVEN_RATE = 9
const SLIDE_RATE = 5
const TOP_RATE = 7
const FADE = 0.15
const ROLL_KICK = 0.32
const ROLL_DECAY = 7
const TREMBLE = 0.035

const FLAKES = 44
const SPARKS = 28
const POINTS = FLAKES + SPARKS
const PARKED = -80   // a spent spark, well below anything a tall window can see
const SNOW_AREA = { x: 18, top: 11, z: 9 }
const WIND = 0.55
const FLAG_TOP = { x: 1.15, y: 7, z: CLIFF_Z - 0.1 }
const COLOURS = { snow: '#fbf8f5', rock: '#6c6a80', sun: '#ffde3b', pink: '#ff5fc8', blue: '#5578ff' }

function layout(): Placement[] {
  const ground: Placement[] = []
  for (let row = -HEX_ROWS_BACK; row <= HEX_ROWS_FRONT; row++) {
    for (let col = -HEX_COLUMNS; col <= HEX_COLUMNS; col++) ground.push({ model: 'hex_grass', x: col * HEX_W + (row % 2 ? HEX_W / 2 : 0), z: row * HEX_ROW })
  }
  return [
    ...ground,
    { model: 'cliff_face', x: 0, z: CLIFF_Z },
    { model: 'paper_peak_A', x: 2.6, z: -6.5 },
    { model: 'paper_peak_B', x: -7.2, z: -5.5, turn: 1 },
    { model: 'paper_peak_C', x: 8.6, z: -5, turn: 2 },
    { model: 'mountain_B', x: -11.4, z: -6.5, size: 2 },
    { model: 'mountain_A_grass_trees', x: 12.6, z: -7, size: 1.8 },
    { model: 'basecamp_tent', x: -5.4, z: 2.2, turn: 0.5, size: 1.25 },
    { model: 'rope_coil', x: -3.6, z: 2.8 },
    { model: 'platform_wood_1x1x1', x: -7.2, z: 3, size: 0.45, turn: 0.4 },
    { model: 'Tree_2_A_Color1', x: 7, z: 0.8, size: 0.85 },
    { model: 'Rock_1_A_Color1', x: 3.6, z: 2.6, size: 0.8 },
    { model: 'Rock_3_E_Color1', x: 4.8, z: -0.8, size: 0.5, y: 0.25 },
    { model: 'rock_single_C', x: -2.6, z: 1.8, size: 1.6 },
    { model: 'piton', x: -0.3, z: HOLD_Z - 0.1, y: 3 },
    { model: 'piton', x: 0.6, z: HOLD_Z - 0.1, y: 4.6 },
    { model: 'cloud_big', x: -6.6, z: -8, y: 11.4, size: 1.1 },
  ]
}

export const holdAt = (i: number, count: number) => ({ x: ZIGZAG[i % ZIGZAG.length], y: HOLD_BASE + Math.min(i, count - 1) / (count - 1) * (HOLD_TOP - HOLD_BASE), z: HOLD_Z })

// A route's holds in one mesh. `starts` says where each hold's vertices begin, so
// the draw range can drop the ones already climbed.
function routeMesh(props: THREE.Object3D, count: number, material: THREE.Material) {
  const models = Array.from({ length: count }, (_, i) => HOLD_MODELS[i % HOLD_MODELS.length])
  const mesh = mergeProps(props, models.map((model, i) => ({ model, ...holdAt(i, count) })), material)
  mesh.castShadow = false
  const sizes = Object.fromEntries(HOLD_MODELS.map(model => {
    let size = 0
    props.getObjectByName(model)!.traverse(o => { const g = (o as THREE.Mesh).geometry as THREE.BufferGeometry | undefined; if (g) size += g.index?.count ?? g.attributes.position.count })
    return [model, size]
  }))
  let at = 0
  const starts = models.map(model => { const start = at; at += sizes[model]; return start })
  return { mesh, starts, end: at }
}

// Seven skinned parts would be seven draw calls, twice over with the shadow pass.
// They share one rig, so they become one mesh; the rigid cape rides the chest bone.
function oneSkin(root: THREE.Object3D, material: THREE.Material): THREE.SkinnedMesh {
  root.updateMatrixWorld(true)
  const skins: THREE.SkinnedMesh[] = []
  const rigid: THREE.Mesh[] = []
  root.traverse(o => { const m = o as THREE.SkinnedMesh; if (m.isSkinnedMesh) skins.push(m); else if (m.isMesh) rigid.push(m) })
  const body = skins[0]
  const bones = body.skeleton.bones
  const parts = skins.map(s => s.geometry)
  for (const part of rigid) {
    const g = part.geometry.clone().applyMatrix4(part.matrixWorld)
    const bone = bones.indexOf(part.parent as THREE.Bone)
    const vertices = g.attributes.position.count
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(Array.from({ length: vertices * 4 }, (_, i) => (i % 4 ? 0 : Math.max(0, bone))), 4))
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(Array.from({ length: vertices * 4 }, (_, i) => (i % 4 ? 0 : 1)), 4))
    parts.push(g)
  }
  for (const part of parts) if (part.attributes.skinIndex.array.constructor !== Uint16Array) part.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(part.attributes.skinIndex.array, 4))
  body.geometry = mergeGeometries(parts)
  body.material = material
  body.castShadow = true
  body.frustumCulled = false   // skinned bounds don't follow the climb
  for (const part of [...skins.slice(1), ...rigid]) part.removeFromParent()
  return body
}

type Clip = 'climb' | 'Cheer' | 'Jump_Full_Short'

export function buildSummit(props: THREE.Object3D, climber: { scene: THREE.Object3D; animations: THREE.AnimationClip[] }, material: THREE.Material) {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#cfe6f5')
  const camera = new THREE.PerspectiveCamera(30, STAGE_ASPECT, 1, 80)
  camera.position.set(0, 5.4, 22)
  camera.lookAt(0, 4.5, 0)

  scene.add(mergeProps(props, layout(), material))
  scene.add(new THREE.HemisphereLight('#ffffff', '#b9c48a', 1.7))
  const sun = new THREE.DirectionalLight('#fff4e0', 2.2)
  sun.position.set(-6, 15, 10)
  sun.castShadow = true
  sun.shadow.mapSize.set(1024, 1024)
  sun.shadow.radius = 6
  Object.assign(sun.shadow.camera, { left: -15, right: 15, top: 12, bottom: -10, far: 45 })
  scene.add(sun)

  // One clone, then `flag.rotation` flutters it around its own pole
  const flag = mergeProps(props, [{ model: 'summit_flag', x: 0, z: 0 }], material)
  flag.castShadow = false
  flag.position.set(FLAG_TOP.x, FLAG_TOP.y, FLAG_TOP.z)
  scene.add(flag)

  const skin = oneSkin(climber.scene, material)
  const body = new THREE.Group()
  body.add(climber.scene)
  climber.scene.scale.setScalar(BODY_SIZE)
  body.rotation.y = Math.PI   // the model faces +z; the cliff is behind it from the camera
  scene.add(body)
  const mixer = new THREE.AnimationMixer(climber.scene)
  const clip = (name: Clip) => {
    const found = climber.animations.find(a => a.name === name)
    if (!found) throw new Error(`The climber has no ${name}`)
    return mixer.clipAction(found)
  }
  const climbing = clip('climb').play()
  climbing.paused = true
  clip('Jump_Full_Short').setLoop(THREE.LoopOnce, 1).clampWhenFinished = true

  const positions = new Float32Array(POINTS * 3)
  const colours = new Float32Array(POINTS * 3)
  const flakes = new THREE.BufferGeometry()
  flakes.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  flakes.setAttribute('color', new THREE.BufferAttribute(colours, 3))
  const snow = new THREE.Points(flakes, new THREE.PointsMaterial({ size: 0.15, vertexColors: true }))
  snow.frustumCulled = false
  scene.add(snow)

  const holds = { mesh: null as THREE.Mesh | null, starts: [] as number[], end: 0 }
  const route = (count: number) => {
    if (holds.mesh) { scene.remove(holds.mesh); holds.mesh.geometry.dispose() }
    Object.assign(holds, routeMesh(props, count, material))
    scene.add(holds.mesh!)
  }
  const showFrom = (pos: number) => {
    const start = holds.starts[pos] ?? holds.end
    holds.mesh!.geometry.setDrawRange(start, holds.end - start)
  }
  return { scene, camera, body, skin, mixer, clip, climbing, flag, snow, positions, colours, route, showFrom }
}

export type Summit = Awaited<ReturnType<typeof openSummit>>

let opening = 0

export async function openSummit(host: HTMLElement, reduced: boolean) {
  const mine = ++opening
  const palette = await loadPalette(`${ART}/palette.png`)
  const material = paperMaterial(palette)
  const [props, climber] = await Promise.all([loadGlb(`${ART}/props.glb`), loadGlb(`${ART}/climber.glb`)])
  const world = buildSummit(props.scene, climber, material)
  const renderer = sharedRenderer()
  if (mine === opening) host.appendChild(renderer.domElement)
  const fit = () => {
    const { clientWidth: w, clientHeight: h } = host
    if (!w || !h) return
    renderer.setPixelRatio(Math.min(window.devicePixelRatio * host.getBoundingClientRect().width / w, MAX_PIXEL_RATIO))
    renderer.setSize(w, h)
    fitCamera(world.camera, w, h, STAGE_ASPECT)
  }
  const resize = new ResizeObserver(fit)
  resize.observe(host)
  fit()

  const { body, mixer, climbing, positions, colours } = world
  const paint = new THREE.Color()
  const dye = (i: number, colour: string) => { paint.set(colour).toArray(colours, i * 3); world.snow.geometry.attributes.color.needsUpdate = true }
  const seed = (i: number) => Math.abs(Math.sin(i * 91.7)) % 1
  for (let i = 0; i < POINTS; i++) {
    dye(i, COLOURS.snow)
    positions[i * 3] = (seed(i) - 0.5) * SNOW_AREA.x
    positions[i * 3 + 1] = i < FLAKES ? seed(i + 7) * SNOW_AREA.top : PARKED
    positions[i * 3 + 2] = (seed(i + 3) - 0.5) * SNOW_AREA.z
  }
  const sparks = Array.from({ length: SPARKS }, () => ({ vx: 0, vy: 0, life: 0 }))
  let nextSpark = 0
  const burst = (x: number, y: number, z: number, count: number, tint: string[], speed: number) => {
    if (reduced) return
    for (let n = 0; n < count; n++) {
      const spark = sparks[nextSpark], i = FLAKES + nextSpark
      nextSpark = (nextSpark + 1) % SPARKS
      dye(i, tint[n % tint.length])
      positions.set([x, y, z], i * 3)
      const angle = Math.random() * Math.PI * 2
      Object.assign(spark, { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed + speed * 0.5, life: 1 })
    }
  }

  const target = { x: 0, y: 0, z: BODY_Z, face: Math.PI, rate: SLIDE_RATE }
  let phase = FIRST_PULL
  let roll = 0
  let count = 2
  let strained = false
  let gust = 0
  let clipNow: THREE.AnimationAction = climbing
  const pose = (next: THREE.AnimationAction) => {
    if (next === clipNow) return
    clipNow.fadeOut(reduced ? 0 : FADE)
    next.reset().fadeIn(reduced ? 0 : FADE).play()
    if (next === climbing) next.paused = true
    clipNow = next
    if (reduced) mixer.update(0)
  }
  const aim = (pos: number, rate: number) => {
    const hold = holdAt(pos, count)
    target.x = hold.x * BODY_LEAN
    target.y = hold.y - REACH
    target.z = BODY_Z
    target.face = Math.PI
    target.rate = rate
  }
  const settle = () => {
    body.position.set(target.x, target.y, target.z)
    body.rotation.y = target.face
    climbing.time = phase % climbing.getClip().duration
    mixer.update(0)
  }
  const go = () => { if (reduced) settle() }

  let last = performance.now(), drawn = 0
  const point = new THREE.Vector3()
  return {
    ...world,
    // A new route, from the bottom
    start(holds: number) {
      count = holds
      world.route(holds)
      world.showFrom(0)
      pose(climbing)
      phase = FIRST_PULL
      aim(0, SLIDE_RATE)
      go()
    },
    step(pos: number, even: boolean) {
      phase += PULL_SECONDS
      aim(pos, even ? EVEN_RATE : UNEVEN_RATE)
      world.showFrom(pos)
      const hold = holdAt(pos - 1, count)
      burst(hold.x, hold.y, hold.z, 3, [COLOURS.snow], 1.1)
      gust = Math.min(1, gust + (even ? 0.1 : 0))
      go()
    },
    slip(pos: number, steps: number) {
      phase -= PULL_SECONDS * steps
      aim(pos, UNEVEN_RATE)
      world.showFrom(pos)
      roll = ROLL_KICK
      burst(body.position.x, body.position.y + REACH, BODY_Z, 7, [COLOURS.rock, COLOURS.snow], 1.8)
      gust = 0
      go()
    },
    fall() {
      pose(world.clip('Jump_Full_Short'))
      aim(0, SLIDE_RATE)
      world.showFrom(0)
      burst(body.position.x, body.position.y + 0.3, BODY_Z, 10, [COLOURS.rock, COLOURS.snow], 2.4)
      go()
    },
    top() {
      Object.assign(target, { ...LEDGE, face: 0, rate: TOP_RATE })
      pose(world.clip('Cheer'))
      gust = 1
      burst(LEDGE.x, LEDGE.y + 1.2, LEDGE.z, SPARKS, [COLOURS.sun, COLOURS.pink, COLOURS.blue], 3.2)
      go()
    },
    strain(on: boolean) { strained = on },
    // Where the hands are on screen, for the points
    handsAt() {
      point.set(body.position.x, body.position.y + REACH + 0.6, body.position.z).project(world.camera)
      return { x: (point.x + 1) / 2 * host.clientWidth, y: (1 - point.y) / 2 * host.clientHeight }
    },
    frame(now: number) {
      if (now - drawn < FRAME_MS) return
      drawn = now
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      if (!reduced) {
        const ease = 1 - Math.exp(-dt * target.rate)
        body.position.x += (target.x - body.position.x) * ease
        body.position.y += (target.y - body.position.y) * ease
        body.position.z += (target.z - body.position.z) * ease
        body.rotation.y += (target.face - body.rotation.y) * ease
        roll *= Math.exp(-dt * ROLL_DECAY)
        body.rotation.z = roll + (strained ? Math.sin(now / 28) * TREMBLE : 0)
        if (clipNow === climbing) {
          // The limbs only move as far as the notes have taken them
          const length = climbing.getClip().duration
          const wrapped = climbing.time + ((phase - climbing.time + length * 100 + length / 2) % length - length / 2) * ease
          climbing.time = (wrapped + length) % length
          mixer.update(0)
        }
        else mixer.update(dt)

        const t = now / 1000
        gust *= Math.exp(-dt * 0.6)
        const wind = WIND * (1 + 0.5 * Math.sin(t * 0.7)) + gust
        for (let i = 0; i < FLAKES; i++) {
          const at = i * 3
          positions[at] += (wind + 0.12 * Math.sin(t + i)) * dt
          positions[at + 1] -= (0.5 + seed(i) * 0.5) * dt
          if (positions[at + 1] < 0) positions[at + 1] = SNOW_AREA.top
          if (positions[at] > SNOW_AREA.x / 2) positions[at] = -SNOW_AREA.x / 2
        }
        sparks.forEach((spark, n) => {
          if (spark.life <= 0) return
          const at = (FLAKES + n) * 3
          spark.life -= dt * 1.3
          spark.vy -= 5 * dt
          positions[at] += spark.vx * dt
          positions[at + 1] += spark.vy * dt
          if (spark.life <= 0) positions[at + 1] = PARKED
        })
        world.snow.geometry.attributes.position.needsUpdate = true
        world.flag.rotation.y = -0.2 + Math.sin(t * (5 + gust * 6)) * (0.12 + gust * 0.2)
        world.flag.scale.x = 1 + Math.sin(t * 7.3) * 0.05
      }
      renderer.render(world.scene, world.camera)
    },
    dispose() {
      resize.disconnect()
      mixer.stopAllAction()
      if (mine === opening) renderer.domElement.remove()
      disposeScene(props.scene)
      disposeScene(climber.scene)
      disposeScene(world.scene)
      palette.dispose()
    },
  }
}
