// ── Frontier Express, the place: a paper desert rolling past the staff ────────
// Loaded with three.js, only when a run starts. The staff stays 2D: the land is
// drawn, the staff's rows are cleared back to the paper under the canvas, then the
// coach is drawn over them. So the trails run under its wheels and stay crisp.
// Land, far hills, actors and dust are four meshes, five draw calls with the land's
// shadow: everything that moves on its own is one skinned mesh, so wheels really turn.
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { MAX_PIXEL_RATIO, disposeScene, fitCamera, loadGlb, loadPalette, mergeProps, paperMaterial, sharedRenderer, type Placement } from '../engine/stage'

const ART = './arcade/frontier'
export const DRAW_CALL_BUDGET = 5

const STAGE_ASPECT = 2.2
const FRAME_MS = 30
const TILE = 48               // scripts/arcade-frontier.mjs folds the land to this repeat
const NEAR_TILES = [-1, 0, 1, 2]
const FAR_TILES = [-3, -2, -1, 0, 1, 2, 3, 4]
const HILLS_TILE = 340
const HILLS_PACE = 0.1
// Coach units along the trail per beat: the staff's 5.9 gaps, at 0.95 gaps a unit
const SCALE_GAPS = 0.95
const UNITS_PER_BEAT = 5.9 / SCALE_GAPS
const NOSE = 7                // coach origin to the horse's nose
const TAIL = 3                // coach origin to its back
const AXLES: [number, number][] = [[1.3, 1.48], [1.3, -1.48], [-1.85, 1.48], [-1.85, -1.48]]
const AXLE_Y = 0.82
const WHEEL_R = 0.78
const HORSE_X = 5.2
const COACH_EASE = 0.3
const RIDER_EASE = 0.08
const RIDER_LEAD = 1.75       // from a rider's middle to its horse's nose
const RIDER_CLOSE = 2.6       // gaps gained on the coach with each miss
const RIDER_BEHIND = 6        // gaps between the coach and the riders, before any miss
const LOST = 40               // gaps back, once they've given up
const SUN_X = 0.79            // of the width; it sits in the sky above the staff, whatever the staff's height
const SUN_AWAY = 700
const SUN_REACH = 4.1         // the model's rays
const SUN_ROOM = 0.46
const SUN_TURN = 0.00012
const WEED_PATH = 110
const WEED_Z = 4
const DUST = 8
const DUST_MS = 800
const LIGHT_SHADOW = 1024

type Rect = { top: number; height: number; edge: number; outer: number; bar: number; gap: number }

const WORLD_LAYER = 0, ACTOR_LAYER = 1


const tiled = (tiles: number[], list: Placement[], width = TILE) => tiles.flatMap(k => list.map(p => ({ ...p, x: p.x + k * width })))

function landPlacements(boss: boolean): Placement[] {
  if (boss) {
    return [
      { model: 'gorge', x: 0, z: 0 }, { model: 'deck', x: 0, z: 0 }, { model: 'far_rim', x: 0, z: -150 },
      ...tiled(NEAR_TILES, [-18, -6, 6, 18].map(x => ({ model: 'trestle', x, z: 0.4 }))),
      ...tiled(FAR_TILES, [
        { model: 'rock_a', x: -14, z: -150, y: 0, size: 12 }, { model: 'cactus_a', x: 8, z: -160, size: 3.4 }, { model: 'rock_b', x: 20, z: -170, size: 10, turn: 1 },
      ]),
    ]
  }
  return [
    { model: 'plain', x: 0, z: 0 },
    ...tiled(NEAR_TILES, [
      { model: 'dune', x: 0, z: 0 },
      { model: 'cactus_a', x: -17, z: 2, size: 1 }, { model: 'cactus_b', x: -8, z: 6, size: 0.9, turn: 1 },
      { model: 'rock_a', x: -1, z: 3, size: 1.6, turn: 0.6 }, { model: 'rock_b', x: 7, z: 7, size: 2 },
      { model: 'cactus_a', x: 14, z: 1, size: 0.85, turn: 2 }, { model: 'cactus_b', x: 21, z: 6, size: 1.1 },
    ]),
    ...tiled(FAR_TILES, [
      { model: 'drift', x: 0, z: 0 },
      { model: 'cactus_a', x: -12, z: -118, size: 3, turn: 1 }, { model: 'rock_b', x: 2, z: -130, size: 7, turn: 2 },
      { model: 'cactus_b', x: 10, z: -150, size: 3.6 }, { model: 'cactus_a', x: 20, z: -112, size: 2.6, turn: 2 },
    ]),
  ]
}

const HILLS = tiled([-1, 0, 1, 2], [
  { model: 'mesa_a', x: -130, z: -270, size: 3 }, { model: 'butte', x: -70, z: -250, size: 2.6 }, { model: 'mesa_b', x: 0, z: -300, size: 3.2 },
  { model: 'mesa_c', x: 80, z: -260, size: 3 }, { model: 'butte', x: 135, z: -280, size: 3, turn: 1 },
], HILLS_TILE)

// One model's triangles, with every vertex tied to one bone
function bonePart(props: THREE.Object3D, model: string, bone: number, place = new THREE.Matrix4()): THREE.BufferGeometry[] {
  const source = props.getObjectByName(model)
  if (!source) throw new Error(`No model named ${model}`)
  props.updateMatrixWorld(true)
  const parts: THREE.BufferGeometry[] = []
  source.traverse(o => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    const part = new THREE.BufferGeometry()
    for (const name of ['position', 'normal', 'uv']) part.setAttribute(name, mesh.geometry.attributes[name].clone())
    part.setIndex(mesh.geometry.index!.clone())
    part.applyMatrix4(place.clone().multiply(mesh.matrixWorld))
    const count = part.attributes.position.count
    part.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(count * 4).map((_, i) => (i % 4 ? 0 : bone)), 4))
    part.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Float32Array(count * 4).map((_, i) => (i % 4 ? 0 : 1)), 4))
    parts.push(part)
  })
  return parts
}

function buildActors(props: THREE.Object3D, material: THREE.Material) {
  const names = ['root', 'coach', 'body', 'wheel0', 'wheel1', 'wheel2', 'wheel3', 'horse', 'rider0', 'rider1', 'sun', 'weed']
  const bone = Object.fromEntries(names.map(n => [n, new THREE.Bone()])) as Record<string, THREE.Bone>
  const index = (name: string) => names.indexOf(name)
  bone.root.add(bone.coach, bone.rider0, bone.rider1, bone.sun, bone.weed)
  bone.coach.add(bone.body, bone.horse, bone.wheel0, bone.wheel1, bone.wheel2, bone.wheel3)
  const flip = new THREE.Matrix4().makeRotationY(Math.PI)
  const geometry = mergeGeometries([
    ...bonePart(props, 'coach', index('body')),
    ...AXLES.flatMap(([, z], i) => bonePart(props, 'wheel', index(`wheel${i}`), z < 0 ? flip : undefined)),
    ...bonePart(props, 'horse', index('horse')),
    ...[0, 1].flatMap(i => [...bonePart(props, 'horse', index(`rider${i}`)), ...bonePart(props, 'rider', index(`rider${i}`))]),
    ...bonePart(props, 'sun', index('sun')),
    ...bonePart(props, 'tumbleweed', index('weed')),
  ])
  const mesh = new THREE.SkinnedMesh(geometry, material)
  mesh.add(bone.root)
  mesh.updateMatrixWorld(true)
  mesh.bind(new THREE.Skeleton(names.map(n => bone[n])))
  mesh.frustumCulled = false   // its bones go everywhere
  AXLES.forEach(([x, z], i) => bone[`wheel${i}`].position.set(x, AXLE_Y, z))
  bone.horse.position.x = HORSE_X
  return { mesh, bone }
}

export function buildFrontier(props: THREE.Object3D, material: THREE.Material, boss: boolean) {
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(30, STAGE_ASPECT, 1, 1400)
  camera.position.set(0, 14, 40)
  camera.lookAt(0, 6.2, 0)

  const land = mergeProps(props, landPlacements(boss), material)
  land.castShadow = true
  const hills = mergeProps(props, HILLS, material)
  hills.castShadow = false
  hills.receiveShadow = false
  scene.add(land, hills)

  const { mesh: actors, bone } = buildActors(props, material)
  const puff = (props.getObjectByName('puff')!.children[0] as THREE.Mesh).geometry
  const dust = new THREE.InstancedMesh(puff, material, DUST)
  dust.frustumCulled = false
  actors.layers.set(ACTOR_LAYER)
  dust.layers.set(ACTOR_LAYER)
  scene.add(actors, dust)

  const sky = new THREE.HemisphereLight('#ffffff', '#f4e0c8', 2.3)
  const sun = new THREE.DirectionalLight('#fff6e4', 1.3)
  sun.position.set(16, 30, 24)
  sun.castShadow = true
  sun.shadow.mapSize.set(LIGHT_SHADOW, LIGHT_SHADOW)
  sun.shadow.radius = 6
  Object.assign(sun.shadow.camera, { left: -52, right: 52, top: 30, bottom: -30, far: 110 })
  sun.target.position.set(0, 0, -4)
  scene.add(sky, sun, sun.target)
  for (const light of [sky, sun]) light.layers.enableAll()

  return { scene, camera, land, hills, actors, bone, dust }
}

export type Frontier = Awaited<ReturnType<typeof openFrontier>>

// The newest opening: one dropped mid-load must leave the shared canvas alone
let opening = 0

export async function openFrontier(host: HTMLElement, band: HTMLElement, bar: HTMLElement, shade: HTMLElement, rows: number, reduced: boolean, boss: boolean) {
  const mine = ++opening
  const palette = await loadPalette(`${ART}/palette.png`)
  const material = paperMaterial(palette)
  const props = await loadGlb(`${ART}/props.glb`)
  const world = buildFrontier(props.scene, material, boss)
  const { scene, camera, land, hills, bone, dust } = world
  const renderer = sharedRenderer()
  if (mine === opening) host.appendChild(renderer.domElement)

  const rect: Rect = { top: 0, height: 0, edge: 0, outer: 0, bar: 0, gap: 0 }
  const fit = () => {
    const { clientWidth: w, clientHeight: h } = host
    if (!w || !h) return
    renderer.setPixelRatio(Math.min(window.devicePixelRatio * host.getBoundingClientRect().width / w, MAX_PIXEL_RATIO))
    renderer.setSize(w, h)
    fitCamera(camera, w, h, STAGE_ASPECT)
    rect.top = band.offsetTop + band.clientTop
    rect.height = band.clientHeight
    rect.edge = band.offsetTop
    rect.outer = band.offsetHeight
    rect.bar = bar.offsetLeft
    rect.gap = rect.height / rows
    camera.updateMatrixWorld()
    const sunAt = new THREE.Vector3(SUN_X * 2 - 1, 1 - rect.edge / h, 0.5).unproject(camera).sub(camera.position).setLength(SUN_AWAY)
    bone.sun.position.copy(camera.position).add(sunAt)
    bone.sun.scale.setScalar(rect.edge * SUN_ROOM / h * 2 * SUN_AWAY * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / SUN_REACH)
    bone.sun.lookAt(camera.position)
    // The bridge's front edge sits just under the staff
    if (boss) land.position.z = ground(rect.bar, rect.top + rect.height).z + 0.4
  }

  // Where a point of the screen falls on the ground, and how big a unit is there
  const ray = new THREE.Vector3(), hit = new THREE.Vector3(), forward = new THREE.Vector3()
  function ground(x: number, y: number) {
    const { clientWidth: w, clientHeight: h } = host
    ray.set(x / w * 2 - 1, 1 - y / h * 2, 0.5).unproject(camera).sub(camera.position)
    hit.copy(camera.position).addScaledVector(ray, -camera.position.y / ray.y)
    const depth = hit.clone().sub(camera.position).dot(camera.getWorldDirection(forward))
    return { x: hit.x, z: hit.z, perPixel: 2 * depth * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / h }
  }

  // Coach and riders are the same size wherever the trail puts them, like the notes
  function stand(target: THREE.Bone, x: number, y: number, nose: number) {
    const { x: gx, z, perPixel } = ground(x, y)
    const size = SCALE_GAPS * rect.gap * perPixel
    target.position.set(gx - nose * size, 0, z)
    target.scale.setScalar(size)
    return size
  }

  const resize = new ResizeObserver(fit)
  resize.observe(host)
  fit()

  let row = rect.top + rect.height / 2
  let drawn = 0
  let gain = 0, shown = 0
  const spot = new THREE.Object3D()

  function draw() {
    renderer.autoClear = false
    renderer.shadowMap.autoUpdate = false
    renderer.clear()
    camera.layers.set(WORLD_LAYER)
    renderer.shadowMap.needsUpdate = true
    renderer.render(scene, camera)
    const { clientWidth: w, clientHeight: h } = host
    renderer.setScissorTest(true)
    renderer.setScissor(0, h - rect.edge - rect.outer, w, rect.outer)
    renderer.clear()
    renderer.setScissorTest(false)
    camera.layers.set(ACTOR_LAYER)
    renderer.render(scene, camera)
    renderer.autoClear = true      // the renderer is shared
    renderer.shadowMap.autoUpdate = true
  }

  return {
    ...world,
    // beat: how far along the trail. y: the trail the coach should be on, in gaps
    frame(now: number, beat: number, y: number | null) {
      if (now - drawn < FRAME_MS) return
      drawn = now
      const want = y === null ? row : rect.top + y * rect.gap
      row = reduced ? want : row + (want - row) * COACH_EASE
      const size = stand(bone.coach, rect.bar, row, NOSE)
      shade.style.transform = `translate3d(0, ${row - rect.top}px, 0)`
      const distance = beat * UNITS_PER_BEAT
      if (!reduced) {
        land.position.x = -(distance % TILE)
        hills.position.x = -(distance * HILLS_PACE % HILLS_TILE)
        for (let i = 0; i < AXLES.length; i++) bone[`wheel${i}`].rotation.z = -distance / WHEEL_R * (AXLES[i][1] < 0 ? -1 : 1)
        bone.body.position.y = Math.abs(Math.sin(now * 0.012)) * 0.05
        bone.body.rotation.z = Math.sin(now * 0.009) * 0.012
        bone.horse.position.y = Math.abs(Math.sin(distance * 0.9)) * 0.22
        bone.horse.rotation.z = Math.sin(distance * 0.9) * 0.07
        bone.sun.rotateZ(SUN_TURN * FRAME_MS)
        if (boss) bone.weed.scale.setScalar(0)
        else bone.weed.scale.setScalar(1.3)
        const weedX = WEED_PATH / 2 - distance * 0.7 % WEED_PATH
        bone.weed.position.set(weedX, 0.5 + Math.abs(Math.sin(distance * 0.5)) * 0.8, WEED_Z)
        bone.weed.rotation.z = distance * 0.9
        for (let i = 0; i < DUST; i++) {
          const age = (now / DUST_MS + i / DUST) % 1
          spot.position.set(bone.coach.position.x - (TAIL * 0.7 + age * 3.4) * size, (0.3 + age * 1.2) * size, bone.coach.position.z + (i % 2 ? 1 : -1) * size)
          spot.scale.setScalar(size * Math.sin(age * Math.PI) * 1.1)
          spot.updateMatrix()
          dust.setMatrixAt(i, spot.matrix)
        }
        dust.instanceMatrix.needsUpdate = true
      }
      else {
        bone.weed.scale.setScalar(0)
        dust.count = 0
      }
      if (boss) {
        shown = reduced ? gain : shown + (gain - shown) * RIDER_EASE
        const x = rect.bar - (NOSE + TAIL) * SCALE_GAPS * rect.gap - (RIDER_BEHIND + (gain < 0 ? LOST : 0) - shown * RIDER_CLOSE) * rect.gap
        for (const i of [0, 1]) {
          const rider = bone[`rider${i}`]
          stand(rider, x - i * 2.6 * rect.gap, rect.top + rect.height * (0.36 + i * 0.4), RIDER_LEAD)
          rider.position.y = reduced ? 0 : Math.abs(Math.sin(distance * 0.9 + i * 1.7)) * 0.2 * size
          rider.rotation.z = reduced ? 0 : Math.sin(distance * 0.9 + i * 1.7) * 0.08
        }
      }
      else for (const i of [0, 1]) bone[`rider${i}`].scale.setScalar(0)
      draw()
    },
    gain(next: number) { gain = next },
    dispose() {
      resize.disconnect()
      if (mine === opening) renderer.domElement.remove()
      disposeScene(props.scene)
      world.actors.skeleton.dispose()
      disposeScene(scene)
      palette.dispose()
    },
  }
}
