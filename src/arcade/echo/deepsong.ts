// ── Deep Song, the place: a paper reef, a small submarine, and the whale coming in ──
// Loaded with three.js, only when a run starts. Five draw calls a frame: the reef
// (kelp sways in the shader), the submarine (so does its propeller), the whale, one
// instanced school, and one instanced quad for glows, bubbles and song ripples.
// Shadows only re-render while the whale is on the move.
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MAX_PIXEL_RATIO, disposeScene, fitCamera, loadGlb, loadPalette, mergeProps, paperMaterial, sharedRenderer, type Placement } from '../engine/stage'

const ART = './arcade/deepsong'
const STAGE_ASPECT = 8 / 5

export const DRAW_CALLS_PER_FRAME = 5

const WHALE_LENGTH = 12
const WHALE_FAR = new THREE.Vector3(10, 6.4, -24)
const WHALE_NEAR = new THREE.Vector3(5.4, 6.8, 2)
const ANCIENT_SCALE = 1.3
const ANCIENT_TINT = 0.62
const SWIM_SECONDS = 1.6
const SWIM_RATE = 0.7
const SONG_RATE = 1.5
const SHADOW_EVERY_S = 0.4

const SUB_X = -2.1
const SUB_Y = 2.9
const SUB_SIZE = 1.25
const HUB_Y = 1.1                 // the propeller's axis, in the submarine's own space
const HUB_X = -2.25
const KELP_SWAY = 0.09

const RINGS = 6
const RING_SECONDS = 1.5
const RING_SIZE = 8
const FISH_LENGTH = 2
const FISH_GAP = 1.1
const SCHOOL: { y: number; z: number; speed: number; phase: number; span: number; size: number }[] = [
  { y: 5.8, z: -3, speed: 0.045, phase: 0.2, span: 13, size: 1.2 },
  { y: 2.4, z: 2, speed: 0.06, phase: 1.1, span: 11, size: 0.8 },
  { y: 7.2, z: -7, speed: 0.035, phase: 1.6, span: 15, size: 1 },
]
const GLOWS: [number, number, number][] = [[-8, 2.2, -1], [-5, 4.4, -2], [-3.4, 1.5, 1.8], [-0.4, 6.2, -3], [1.4, 1.4, 2], [3, 4.8, -2], [5, 2, 1], [7.4, 4, -2], [9, 1.7, 0], [-9.6, 5.4, -3], [0.6, 3.4, -5], [6.2, 6.6, -5]]
const GLOW_SIZE = 1.5
const BUBBLES: [number, number, number][] = [[-7, -1, 0.1], [-6.4, 0, 0.3], [-1, 1, 0.2], [0.2, -2, 0.15], [1.2, 0, 0.25], [2.2, 1, 0.1], [4.6, -1, 0.2], [7.8, 0, 0.15], [8.6, -2, 0.25]]
const BUBBLE_TOP = 11
const BUBBLE_RISE = 0.75
const BEAM = RINGS + GLOWS.length
const MOTES = BEAM + 1 + BUBBLES.length

const DARK = new THREE.Color('#071a33')
const LIT = new THREE.Color('#1c5a7f')

function reefLayout(): { still: Placement[]; kelp: Placement[] } {
  const still: Placement[] = [
    { model: 'seabed', x: 0, z: 0, size: 2.6 },
    { model: 'seabed', x: -8.6, z: -3, size: 1.7, turn: 1 },
    { model: 'seabed', x: 8.6, z: -3, size: 1.7, turn: 2 },
    { model: 'Rock_1_A_Color1', x: -7.4, z: -3.4, size: 2.4, turn: 0.4 },
    { model: 'Rock_3_A_Color1', x: 5.4, z: -2.6, size: 2.8, turn: 1.2 },
    { model: 'Rock_2_A_Color1', x: 10, z: -1, size: 1.3 },
    { model: 'Rock_3_E_Color1', x: -0.6, z: -6, size: 2.4, turn: 2.2 },
    { model: 'Rock_1_D_Color1', x: 2.4, z: 3.8, size: 0.9, turn: 0.8 },
    { model: 'Grass_2_A_Color1', x: -2.6, z: 3.2, size: 1.2 },
    { model: 'coral_fan', x: -3.2, z: -1.7, size: 2.3, turn: 0.15 },
    { model: 'coral_branch', x: 2.4, z: -1.2, size: 2.6, turn: 0.5 },
    { model: 'coral_branch', x: -9.6, z: 0.2, size: 2.2, turn: 2 },
    { model: 'coral_fan', x: 8.4, z: -3.8, size: 1.5, turn: -0.3 },
    { model: 'shell', x: 0.8, z: 3.5, size: 1.5, turn: 0.5 },
    { model: 'shell', x: -5.4, z: 1.2, size: 1.1, turn: 2 },
  ]
  const kelp: Placement[] = [
    { model: 'kelp_tall', x: -5.4, z: -1.6, size: 2.6 },
    { model: 'kelp_short', x: -4.3, z: -2.8, size: 2.6, turn: 0.6 },
    { model: 'kelp_tall', x: 7.6, z: -1, size: 2.3, turn: 1 },
    { model: 'kelp_short', x: 3.8, z: -2.2, size: 2.8, turn: 2 },
    { model: 'kelp_short', x: -8.2, z: -4.6, size: 2.4, turn: 1.4 },
  ]
  return { still, kelp }
}

// Kelp and the propeller move on the GPU, so neither costs a draw call of its own.
// `motion` is above 0 for what sways, by how much, and below 0 for what spins.
function waterMaterial(palette: THREE.Texture | null, time: { value: number }): THREE.MeshToonMaterial {
  const material = paperMaterial(palette)
  const paper = material.onBeforeCompile
  material.onBeforeCompile = (shader, gl) => {
    paper.call(material, shader, gl)
    shader.uniforms.uTime = time
    shader.vertexShader = `attribute float motion;\nuniform float uTime;\n${shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      if (motion > 0.0) transformed.xz += motion * vec2(sin(uTime * 0.9 + position.y * 0.8 + position.x), 0.5 * cos(uTime * 0.7 + position.y * 0.6));
      else if (motion < 0.0) {
        float a = uTime * 8.0;
        vec2 hub = vec2(${HUB_Y.toFixed(2)}, 0.0);
        transformed.yz = hub + mat2(cos(a), sin(a), -sin(a), cos(a)) * (transformed.yz - hub);
      }`)}`
  }
  return material
}

const verticesOf = (mesh: THREE.Mesh) => mesh.geometry.getAttribute('position').count

function moving(mesh: THREE.Mesh, from: number, amount: (y: number) => number) {
  const position = mesh.geometry.getAttribute('position')
  const motion = new Float32Array(position.count)
  for (let i = from; i < position.count; i++) motion[i] = amount(position.getY(i))
  mesh.geometry.setAttribute('motion', new THREE.BufferAttribute(motion, 1))
}

function buildReef(props: THREE.Object3D, material: THREE.Material): THREE.Mesh {
  const { still, kelp } = reefLayout()
  const rocks = mergeProps(props, still, material)
  const reef = mergeProps(props, [...still, ...kelp], material)
  moving(reef, verticesOf(rocks), y => Math.max(0, y) * KELP_SWAY)
  rocks.geometry.dispose()
  return reef
}

function buildSub(props: THREE.Object3D, material: THREE.Material): THREE.Mesh {
  const hull = mergeProps(props, [{ model: 'submarine', x: 0, z: 0 }], material)
  const sub = mergeProps(props, [{ model: 'submarine', x: 0, z: 0 }, { model: 'submarine_propeller', x: HUB_X, y: HUB_Y, z: 0 }], material)
  moving(sub, verticesOf(hull), () => -1)
  hull.geometry.dispose()
  sub.scale.setScalar(SUB_SIZE)
  sub.receiveShadow = false
  return sub
}

// One school instance is a pair of the pack's fish, nose to +x. Their bones stay still:
// a whole fish turning is enough at this size, and costs no skinning.
function buildSchool(fish: GLTF[], material: THREE.Material): THREE.InstancedMesh {
  const parts = fish.map((model, i) => {
    let source: THREE.Mesh | undefined
    model.scene.updateMatrixWorld(true)
    model.scene.traverse(o => { if ((o as THREE.Mesh).isMesh) source ??= o as THREE.Mesh })
    const part = source!.geometry.clone()
    for (const name of Object.keys(part.attributes)) if (!['position', 'normal', 'uv'].includes(name)) part.deleteAttribute(name)
    part.computeBoundingBox()
    const box = part.boundingBox!
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    part.translate(-center.x, -center.y, -center.z)
    // The pack's fish are bound nose down, back to +z
    part.rotateX(-Math.PI / 2)
    part.rotateY(Math.PI / 2)
    const fit = FISH_LENGTH / Math.max(size.x, size.y, size.z)
    part.scale(fit, fit, fit)
    part.translate(i * -FISH_GAP, i * 0.5, i * 0.6)
    return part
  })
  const school = new THREE.InstancedMesh(mergeGeometries(parts), material, SCHOOL.length)
  parts.forEach(p => p.dispose())
  school.frustumCulled = false
  return school
}

// Glows, the lamp, bubbles and rings: one quad, drawn in three cut-paper shapes
function buildMotes(): THREE.InstancedMesh {
  const material = new THREE.ShaderMaterial({
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
    vertexShader: `varying vec2 vUv; varying vec3 vTint; varying float vShape;
      void main() {
        vUv = uv; vTint = instanceColor;
        vShape = gl_InstanceID < ${RINGS} ? 0.0 : gl_InstanceID <= ${BEAM} ? 1.0 : 2.0;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `varying vec2 vUv; varying vec3 vTint; varying float vShape;
      void main() {
        float d = length(vUv - 0.5);
        float a = vShape < 0.5 ? smoothstep(0.035, 0.0, abs(d - 0.44))
          : vShape < 1.5 ? pow(max(0.0, 1.0 - d * 2.0), 2.0)
          : smoothstep(0.5, 0.45, d) * (0.3 + 0.7 * smoothstep(0.2, 0.45, d));
        gl_FragColor = vec4(vTint * a, 1.0);
      }`,
  })
  const motes = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), material, MOTES)
  motes.frustumCulled = false
  for (let i = 0; i < MOTES; i++) motes.setColorAt(i, new THREE.Color(0, 0, 0))
  return motes
}

export function buildDeep(props: THREE.Object3D, material: THREE.Material, whale: GLTF, fish: GLTF[], ancient = false) {
  const scene = new THREE.Scene()
  scene.background = DARK.clone()
  scene.fog = new THREE.Fog(DARK.clone(), 24, 60)
  const camera = new THREE.PerspectiveCamera(30, STAGE_ASPECT, 1, 90)
  camera.position.set(0, 6.5, 26)
  camera.lookAt(0, 3.1, 0)

  const reef = buildReef(props, material)
  const sub = buildSub(props, material)
  sub.position.set(SUB_X, SUB_Y, 0)
  const school = buildSchool(fish, material)
  const motes = buildMotes()
  scene.add(reef, sub, school, motes)

  const ambient = new THREE.HemisphereLight('#9fd8ff', '#143a55', 1)
  const sun = new THREE.DirectionalLight('#e9fbff', 2)
  sun.position.set(-5, 16, 8)
  sun.castShadow = true
  sun.shadow.mapSize.set(1024, 1024)
  sun.shadow.radius = 6
  Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 12, bottom: -12, far: 40 })
  scene.add(ambient, sun)

  const swimmer = new THREE.Group()
  const box = new THREE.Box3().setFromObject(whale.scene)
  const length = box.getSize(new THREE.Vector3())
  whale.scene.scale.setScalar(WHALE_LENGTH * (ancient ? ANCIENT_SCALE : 1) / Math.max(length.x, length.y, length.z))
  whale.scene.rotation.y = -Math.PI / 2 - 0.35
  whale.scene.traverse(o => {
    const mesh = o as THREE.SkinnedMesh
    if (!mesh.isMesh) return
    mesh.castShadow = true
    mesh.frustumCulled = false
    if (ancient) {
      const old = (material as THREE.MeshToonMaterial).clone()
      old.onBeforeCompile = material.onBeforeCompile
      old.color.setScalar(ANCIENT_TINT)
      mesh.material = old
    }
    else mesh.material = material
  })
  swimmer.add(whale.scene)
  scene.add(swimmer)
  const mixer = new THREE.AnimationMixer(whale.scene)
  mixer.clipAction(whale.animations[0]).play()
  mixer.update(0)

  const at = new THREE.Object3D()
  const tint = new THREE.Color()
  const rings: number[] = Array(RINGS).fill(-Infinity)
  let shown = 0
  let target = 0
  let t = 0
  let nextRing = 0
  let singing = 0

  function poseMotes() {
    const mouth = swimmer.position
    const face = camera.quaternion
    for (let i = 0; i < RINGS; i++) {
      const age = (t - rings[i]) / RING_SECONDS
      const alive = age >= 0 && age < 1
      at.position.set(mouth.x - WHALE_LENGTH * 0.42, mouth.y, mouth.z + 0.4)
      at.quaternion.copy(face)
      at.scale.setScalar(alive ? 1 + RING_SIZE * age : 0)
      at.updateMatrix()
      motes.setMatrixAt(i, at.matrix)
      motes.setColorAt(i, tint.set('#bfeaf2').multiplyScalar(alive ? (1 - age) * 0.7 : 0))
    }
    GLOWS.forEach(([x, y, z], i) => {
      const lit = Math.max(0, Math.min(1, shown * GLOWS.length - i))
      at.position.set(x, y + Math.sin(t * 0.4 + i) * 0.25, z)
      at.quaternion.copy(face)
      at.scale.setScalar(GLOW_SIZE * (1 + 0.14 * Math.sin(t * 1.1 + i * 2)))
      at.updateMatrix()
      motes.setMatrixAt(RINGS + i, at.matrix)
      motes.setColorAt(RINGS + i, tint.setRGB(0.32, 0.62, 0.56).multiplyScalar(lit))
    })
    at.position.set(sub.position.x + 3.9 * SUB_SIZE + 1.4, sub.position.y + 1.1 * SUB_SIZE, 0.2)
    at.quaternion.copy(face)
    at.scale.set(7, 1.8, 1)
    at.updateMatrix()
    motes.setMatrixAt(BEAM, at.matrix)
    motes.setColorAt(BEAM, tint.set('#fff2b8').multiplyScalar(0.3 + 0.2 * shown))
    BUBBLES.forEach(([x, z, delay], i) => {
      const y = ((t * BUBBLE_RISE * (0.8 + delay) + i * 1.7) % BUBBLE_TOP)
      at.position.set(x + Math.sin(t * 0.8 + i) * 0.2, y, z)
      at.quaternion.copy(face)
      at.scale.setScalar(0.22 + i % 3 * 0.07)
      at.updateMatrix()
      motes.setMatrixAt(BEAM + 1 + i, at.matrix)
      motes.setColorAt(BEAM + 1 + i, tint.set('#cfe9ff').multiplyScalar(0.8 * Math.min(1, (BUBBLE_TOP - y) / 2)))
    })
    motes.instanceMatrix.needsUpdate = true
    motes.instanceColor!.needsUpdate = true
  }

  function poseSchool() {
    SCHOOL.forEach(({ y, z, speed, phase, span, size }, i) => {
      const u = (t * speed + phase) % 2
      const outward = u < 1
      const wiggle = Math.sin(t * 3 + i) * 0.1
      at.position.set(-span + 2 * span * (outward ? u : 2 - u), y + Math.sin(t * 0.5 + i) * 0.3, z)
      at.quaternion.setFromEuler(new THREE.Euler(0, (outward ? 0 : Math.PI) + wiggle, 0))
      at.scale.setScalar(size)
      at.updateMatrix()
      school.setMatrixAt(i, at.matrix)
    })
    school.instanceMatrix.needsUpdate = true
  }

  function poseSea() {
    const light = shown * shown * (3 - 2 * shown)
    swimmer.position.lerpVectors(WHALE_FAR, WHALE_NEAR, light)
    swimmer.position.y += Math.sin(t * 0.35) * 0.3
    ;(scene.background as THREE.Color).lerpColors(DARK, LIT, 0.2 + 0.8 * shown)
    scene.fog!.color.copy(scene.background as THREE.Color)
    ambient.intensity = 0.7 + 0.8 * shown
    sun.intensity = 0.9 + 1.5 * shown
    sub.position.y = SUB_Y + Math.sin(t * 0.6) * 0.12
    sub.rotation.z = Math.sin(t * 0.45) * 0.025
  }

  const pose = () => { poseSea(); poseSchool(); poseMotes() }
  pose()

  return {
    scene, camera, sub, reef, school, motes,
    get settled() { return Math.abs(target - shown) < 0.002 },
    get whaleAt() { return swimmer.position },
    near(value: number) { target = value },
    ripple() { rings[nextRing] = t; nextRing = (nextRing + 1) % RINGS; singing = RING_SECONDS },
    step(dt: number, time: { value: number }) {
      t += dt
      time.value = t
      shown += (target - shown) * (1 - Math.exp(-dt / SWIM_SECONDS))
      singing = Math.max(0, singing - dt)
      mixer.update(dt * (singing ? SONG_RATE : SWIM_RATE))
      pose()
    },
    jump() { shown = target; pose() },
    stop() { mixer.stopAllAction(); mixer.uncacheRoot(whale.scene) },
  }
}

export type Deep = Awaited<ReturnType<typeof openDeep>>

// The newest opening: one dropped mid-load must leave the shared canvas alone
let opening = 0

export async function openDeep(host: HTMLElement, ancient: boolean, reduced: boolean) {
  const mine = ++opening
  const palette = await loadPalette(`${ART}/palette.png`)
  const time = { value: 0 }
  const material = waterMaterial(palette, time)
  const [props, whale, ...fish] = await Promise.all([loadGlb(`${ART}/props.glb`), loadGlb(`${ART}/whale.glb`), loadGlb(`${ART}/fish1.glb`), loadGlb(`${ART}/fish3.glb`)])
  const world = buildDeep(props.scene, material, whale, fish, ancient)
  const renderer = sharedRenderer()
  renderer.shadowMap.autoUpdate = false
  renderer.shadowMap.needsUpdate = true
  if (mine === opening) host.appendChild(renderer.domElement)

  let dirty = true
  const fit = () => {
    const { clientWidth: w, clientHeight: h } = host
    if (!w || !h) return
    // The Arcade zooms its board: draw for the pixels the canvas really covers
    renderer.setPixelRatio(Math.min(window.devicePixelRatio * host.getBoundingClientRect().width / w, MAX_PIXEL_RATIO))
    renderer.setSize(w, h)
    fitCamera(world.camera, w, h, STAGE_ASPECT)
    dirty = true
  }
  const resize = new ResizeObserver(fit)
  resize.observe(host)
  fit()

  const point = new THREE.Vector3()
  let shadowIn = 0
  return {
    near(value: number) {
      world.near(value)
      if (!reduced) return
      world.jump()
      renderer.shadowMap.needsUpdate = dirty = true
    },
    ripple() { if (!reduced) world.ripple() },
    // Paused: the sea holds still with the game. Reduced motion: drawn only when it changes.
    frame(dt: number, held: boolean) {
      if (reduced || held) {
        if (dirty) renderer.render(world.scene, world.camera)
        dirty = false
        return
      }
      world.step(dt, time)
      shadowIn -= dt
      if (!world.settled && shadowIn <= 0) { renderer.shadowMap.needsUpdate = true; shadowIn = SHADOW_EVERY_S }
      renderer.render(world.scene, world.camera)
    },
    // Where the whale's words sit on screen
    speechAt(): { x: number; y: number } {
      point.copy(world.whaleAt).setX(world.whaleAt.x - WHALE_LENGTH * 0.12).project(world.camera)
      return { x: (point.x + 1) / 2 * host.clientWidth, y: (1 - point.y) / 2 * host.clientHeight }
    },
    dispose() {
      resize.disconnect()
      world.stop()
      if (mine === opening) {
        renderer.shadowMap.autoUpdate = true
        renderer.domElement.remove()
      }
      for (const model of [whale, props, ...fish]) disposeScene(model.scene)
      disposeScene(world.scene)
      palette.dispose()
    },
  }
}
