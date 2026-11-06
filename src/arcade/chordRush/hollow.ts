// ── Monster Hollow, the place: a night village and the paper monsters walking at it ──
// Loaded with three.js, only when a run starts.
import * as THREE from 'three'
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MAX_PIXEL_RATIO, disposeScene, fitCamera, loadGlb, loadPalette, mergeProps, paperMaterial, sharedRenderer, type Placement } from '../engine/stage'
import type { Target } from '../library/chords'

const ART = './arcade/hollow'
export const MONSTERS = ['slime', 'skeleton', 'bat', 'dragon'] as const
type Monster = typeof MONSTERS[number]

// Each frame stays under this, however busy the night gets
export const DRAW_CALL_BUDGET = 32

const PATH_START = -9.5
const PATH_END = 5.2
const PATH_Z = 1
const STAGE_ASPECT = 16 / 9
const HEX_W = 2
const HEX_ROW = Math.sqrt(3)
const HEX_COLUMNS = 7
const HEX_ROWS_BACK = 4
const HEX_ROWS_FRONT = 2
// Monsters are flattened across the path, so they read as cut paper from the side
const PAPER_THICKNESS = 0.35
const SIZES: Record<Monster, number> = { slime: 0.85, skeleton: 1.5, bat: 1.2, dragon: 3.8 }
const LABEL_LIFT = 0.45
const FOLD_MS = 650
const DRIFT_MS = 1300
const STRIDE = 1.6
const GLOW_SIZE = 2.6

const LANTERNS: [number, number, number][] = [[6, 1.5, -0.3], [7.4, 1.5, 2.1], [8.6, 1.5, -0.5]]

function layout(): Placement[] {
  const ground: Placement[] = []
  for (let row = -HEX_ROWS_BACK; row <= HEX_ROWS_FRONT; row++) {
    for (let col = -HEX_COLUMNS; col <= HEX_COLUMNS; col++) {
      const z = PATH_Z + row * HEX_ROW
      ground.push({ model: row === 0 ? 'hex_road_A' : 'hex_grass', x: col * HEX_W + (row % 2 ? HEX_W / 2 : 0), z })
    }
  }
  return [
    ...ground,
    // The hollow, far left
    { model: 'tree_dead_large', x: -8.8, z: -2.6, size: 1.1 },
    { model: 'tree_dead_medium', x: -6.6, z: -3.4, size: 1.1, turn: 1 },
    { model: 'tree_dead_small', x: -9.4, z: 3.2, size: 0.8, turn: 2 },
    { model: 'Tree_Bare_1_A_Color1', x: -3.8, z: -3.6, size: 0.6 },
    { model: 'Tree_Bare_2_A_Color1', x: -0.6, z: -4, size: 0.55, turn: 2 },
    { model: 'gravestone', x: -7.4, z: -0.5, turn: 0.2, size: 0.42 },
    { model: 'gravemarker_A', x: -6, z: -0.8, turn: -0.3, size: 0.5 },
    { model: 'grave_A', x: -4.2, z: -0.9, turn: 0.1, size: 0.5 },
    { model: 'gravestone', x: -5, z: -2.2, turn: -0.2, size: 0.42 },
    { model: 'gravemarker_A', x: -2.6, z: -1.8, turn: 0.4, size: 0.5 },
    { model: 'fence_broken', x: -3.2, z: 3.1, size: 0.45 },
    { model: 'fence', x: -1.4, z: 3.1, size: 0.45 },
    { model: 'fence', x: 0.4, z: 3.1, size: 0.45 },
    { model: 'pumpkin_yellow_small', x: -1.4, z: -0.7, size: 0.6 },
    { model: 'pumpkin_orange_jackolantern', x: 1.3, z: -0.9, turn: 0.4, size: 0.6 },
    { model: 'Rock_1_A_Color1', x: 2.2, z: 3, size: 0.5 },
    { model: 'Bush_1_A_Color1', x: 1.8, z: -2.2, size: 0.6 },
    // The village, right, with its three lanterns
    { model: 'building_church_blue', x: 8.2, z: -3.6, size: 2.3, turn: -0.5 },
    { model: 'building_home_A_blue', x: 5.4, z: -2.2, size: 1.9, turn: 0.3 },
    { model: 'building_home_B_blue', x: 3.2, z: -4, size: 1.9, turn: 0.1 },
    { model: 'building_home_A_blue', x: 8.8, z: 3, size: 1.9, turn: 3.6 },
    { model: 'building_well_blue', x: 5.6, z: 3.3, size: 1.3 },
    ...LANTERNS.map(([x, , z]) => ({ model: 'post_lantern', x, z, size: 0.6 })),
    { model: 'cloud_small', x: -5, z: -7, y: 6.4, size: 0.8 },
    { model: 'cloud_small', x: 6.4, z: -7.6, y: 7, size: 0.6 },
  ]
}

// Which paper monster wears a chord: its shape is a hint at the chord's quality
export function monsterFor(target: Target): Monster {
  if (target.pcs.length > 3) return 'skeleton'
  return /^[A-G][#b]?m/.test(target.name) ? 'bat' : 'slime'
}

function glowTexture(): THREE.CanvasTexture {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const pen = canvas.getContext('2d')!
  const light = pen.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  light.addColorStop(0, 'rgba(255,200,110,0.5)')
  light.addColorStop(1, 'rgba(255,170,60,0)')
  pen.fillStyle = light
  pen.fillRect(0, 0, size, size)
  return new THREE.CanvasTexture(canvas)
}

interface Actor { root: THREE.Group; mixer: THREE.AnimationMixer; foldedAt: number | null; x: number; height: number }

export function buildHollow(props: THREE.Object3D, material: THREE.Material, models: Record<Monster, GLTF>, glowMap: THREE.Texture | null) {
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(30, STAGE_ASPECT, 1, 80)
  camera.position.set(-0.3, 9.6, 19)
  camera.lookAt(-0.3, 1.2, 0)

  scene.add(mergeProps(props, layout(), material))
  scene.add(new THREE.HemisphereLight('#aab8ff', '#2a2350', 1.1))
  const moon = new THREE.DirectionalLight('#dfe6ff', 2.4)
  moon.position.set(-7, 14, 8)
  moon.castShadow = true
  moon.shadow.mapSize.set(1024, 1024)
  moon.shadow.radius = 6
  Object.assign(moon.shadow.camera, { left: -14, right: 14, top: 10, bottom: -10, far: 40 })
  scene.add(moon)

  const actors = new Map<number, Actor>()
  const walkIn = (kind: Monster, id: number) => {
    const model = models[kind]
    const body = clone(model.scene)
    const box = new THREE.Box3().setFromObject(model.scene)
    const size = SIZES[kind] / Math.max(0.01, box.max.y - box.min.y)
    body.scale.setScalar(size)
    body.rotation.y = Math.PI / 2
    body.traverse(o => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.material = material
      mesh.castShadow = true
      mesh.frustumCulled = false   // skinned bounds don't follow the walk
    })
    const root = new THREE.Group()
    root.scale.z = PAPER_THICKNESS
    root.add(body)
    root.position.set(PATH_START, 0, PATH_Z)
    scene.add(root)
    const mixer = new THREE.AnimationMixer(body)
    mixer.clipAction(model.animations[0]).play()
    mixer.update(0)   // reduced motion never steps it: stand in a pose, not the bind shape
    const actor: Actor = { root, mixer, foldedAt: null, x: PATH_START, height: SIZES[kind] }
    actors.set(id, actor)
    return actor
  }
  const remove = (id: number) => {
    const actor = actors.get(id)
    if (!actor) return
    scene.remove(actor.root)
    actor.mixer.stopAllAction()
    actor.mixer.uncacheRoot(actor.root.children[0])
    actor.root.traverse(o => (o as THREE.SkinnedMesh).skeleton?.dispose())
    actors.delete(id)
  }

  // Lanterns are the lives: one goes out with each chord that lands
  const glows = LANTERNS.map(([x, y, z]) => {
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowMap, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }))
    glow.position.set(x, y, z)
    glow.scale.setScalar(GLOW_SIZE)
    scene.add(glow)
    return glow
  })

  return {
    scene, camera,
    actors,
    spawn: (target: Target, id: number) => walkIn(monsterFor(target), id),
    spawnBoss: (id: number) => walkIn('dragon', id),
    remove,
    lives(left: number) { glows.forEach((g, i) => { g.visible = i < left }) },
  }
}

export type Hollow = Awaited<ReturnType<typeof openHollow>>

// The newest opening: one dropped mid-load must leave the shared canvas alone
let opening = 0

export async function openHollow(host: HTMLElement, reduced: boolean) {
  const mine = ++opening
  const palette = await loadPalette(`${ART}/palette.png`)
  const material = paperMaterial(palette)
  const [props, ...monsters] = await Promise.all([loadGlb(`${ART}/props.glb`), ...MONSTERS.map(m => loadGlb(`${ART}/${m}.glb`))])
  const models = Object.fromEntries(MONSTERS.map((m, i) => [m, monsters[i]])) as Record<Monster, GLTF>
  const world = buildHollow(props.scene, material, models, glowTexture())
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

  const point = new THREE.Vector3()
  return {
    ...world,
    walk(id: number, x: number, dt: number) {
      const actor = world.actors.get(id)
      if (!actor) return
      actor.x = PATH_START + (PATH_END - PATH_START) * x
      actor.root.position.x = actor.x
      if (!reduced) actor.mixer.update(dt * STRIDE)
    },
    // Fold it flat where it stands, then let it drift off like a loose sheet
    fold(id: number, now: number) {
      const actor = world.actors.get(id)
      if (!actor) return
      if (reduced) world.remove(id)
      else actor.foldedAt = now
    },
    drift(now: number) {
      for (const [id, actor] of world.actors) {
        if (actor.foldedAt === null) continue
        const age = now - actor.foldedAt
        const fold = Math.min(1, age / FOLD_MS)
        const away = Math.max(0, (age - FOLD_MS) / DRIFT_MS)
        actor.root.scale.y = Math.max(0.04, 1 - fold)
        actor.root.rotation.x = -fold * 0.5 - away * 0.8
        actor.root.rotation.z = away * 1.4
        actor.root.position.set(actor.x - away * 1.5, away * 5, PATH_Z - away * 2)
        const fade = Math.max(0.01, 1 - away)
        actor.root.scale.x = fade
        if (away >= 1) world.remove(id)
      }
    },
    // Where a monster's chord name sits on screen
    labelAt(id: number): { x: number; y: number } | null {
      const actor = world.actors.get(id)
      if (!actor) return null
      point.set(actor.root.position.x, actor.height + LABEL_LIFT, actor.root.position.z).project(world.camera)
      return { x: (point.x + 1) / 2 * host.clientWidth, y: (1 - point.y) / 2 * host.clientHeight }
    },
    render() { renderer.render(world.scene, world.camera) },
    dispose() {
      resize.disconnect()
      for (const id of [...world.actors.keys()]) world.remove(id)
      if (mine === opening) renderer.domElement.remove()
      for (const model of [...monsters, props]) disposeScene(model.scene)
      disposeScene(world.scene)
      palette.dispose()
    },
  }
}
