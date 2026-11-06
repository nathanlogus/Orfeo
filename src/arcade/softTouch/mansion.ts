// ── The Midnight Job, the place: a paper mansion room and who is in it ────────
// Loaded with three.js, only when a run starts. Everything that moves, burglar,
// guard, doors and vault alike, is one skinned mesh with one skeleton, and every
// soft light is one instanced mesh, so the room stays cheap on a phone.
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MAX_PIXEL_RATIO, disposeScene, fitCamera, loadGlb, loadPalette, mergeProps, paperMaterial, sharedRenderer, type Placement } from '../engine/stage'

const ART = './arcade/midnight'
// Room, movers, the movers' shadow, and the lights. The room's own shadow is baked once.
export const DRAW_CALL_BUDGET = 5

const STAGE_ASPECT = 2
const FRAME_MS = 1000 / 30
const FRAME_SLACK_MS = 4
const WALL_Z = -4
const DOOR = { x: 0, z: -3.8, hinge: 0.97 }
const VAULT = { x: 9.2, y: 1.9, z: -3.42, radius: 1.12 }
const CHAIR = { x: 6.2, z: -0.4, turn: -0.55 }
const SEAT = 0.22
const START = new THREE.Vector3(-5.4, 0, 1.9)
const AT_DOOR = new THREE.Vector3(0, 0, -2.7)
const AT_VAULT = new THREE.Vector3(5.2, 0, -2.5)
const LABEL_BURGLAR = 2.55
const LABEL_GUARD = 2.5
const STRIDE_EASE = 3.2        // how fast he closes on where the last note sent him, per second
const WALK_SPEED = 0.25        // below this he stands
const WEIGHT_EASE = 8
const STIR_FADE = 1.3
const STAND_EASE = 7
const DOOR_OPEN = 1.45
const VAULT_OPEN = 1.9
const SWAY = 0.035
const NOISE_FADE = 1.6
const CROUCH = 0.1
const MOON = '#9fb4ff'
const CANDLE = '#ffb860'
const DUST = 26
const CANDLES = 6
const CANDLE_RING = 0.66
const CHANDELIER = { x: 0, y: 5.1, z: -1.6, drop: 1.4 }

function layout(): Placement[] {
  const walls = [-14, -10, -6, -2, 2, 6, 10, 14]
  return [
    ...walls.flatMap(x => [-2, 2, 6, 10].map(z => ({ model: 'floor_wood_large', x, z }))),
    ...walls.flatMap(x => [0, 4.9].map(y => ({ model: 'mansion_wall', x, y, z: WALL_Z }))),
    { model: 'mansion_window', x: -6, z: WALL_Z + 0.2 },
    { model: 'lamp_standing', x: -9, z: -2.8, size: 1.2 },
    { model: 'couch_pillows', x: -6.2, z: -2.8, size: 1.25 },
    { model: 'cabinet_medium_decorated', x: 3.9, z: -3.2 },
    { model: 'pictureframe_large_A', x: 3.9, y: 3.2, z: WALL_Z + 0.18, size: 1.3 },
    { model: 'vault_frame', x: VAULT.x, z: WALL_Z + 0.35 },
    { model: 'coin_stack_medium', x: 8.1, z: -2.5, size: 0.7 },
    { model: 'armchair', x: CHAIR.x, z: CHAIR.z, turn: CHAIR.turn, size: 1.4 },
    { model: 'rug_grand', x: 0, z: 0.5, size: 1.1 },
    { model: 'candle_triple', x: 3.4, y: 1.83, z: -3.2, size: 0.5 },
  ]
}

const part = (mesh: THREE.Mesh, place: THREE.Matrix4) => {
  const geometry = new THREE.BufferGeometry()
  for (const name of ['position', 'normal', 'uv']) geometry.setAttribute(name, mesh.geometry.attributes[name].clone())
  const { index } = mesh.geometry
  geometry.setIndex(index ? index.clone() : Array.from({ length: geometry.attributes.position.count }, (_, i) => i))
  return geometry.applyMatrix4(place)
}

// Collects everything that moves. A character brings its skeleton; anything else
// hangs off one object of ours, which works as a bone like any other.
function rig() {
  const bones: THREE.Object3D[] = []
  const inverses: THREE.Matrix4[] = []
  const parts: THREE.BufferGeometry[] = []
  const slot = (bone: THREE.Object3D, inverse: THREE.Matrix4) => {
    const known = bones.indexOf(bone)
    if (known >= 0) return known
    bones.push(bone)
    inverses.push(inverse)
    return bones.length - 1
  }
  const rigid = (mesh: THREE.Mesh, place: THREE.Matrix4, bone: THREE.Object3D, inverse: THREE.Matrix4) => {
    const geometry = part(mesh, place)
    const index = slot(bone, inverse)
    const { count } = geometry.attributes.position
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(count * 4).map((_, i) => (i % 4 ? 0 : index)), 4))
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Float32Array(count * 4).map((_, i) => (i % 4 ? 0 : 1)), 4))
    parts.push(geometry)
  }
  return {
    bones, inverses, parts, rigid,
    // Fixed to a joint it was modelled on (the hood's cape, the knight's helmet) or skinned to many
    character(model: THREE.Object3D) {
      model.updateMatrixWorld(true)
      const meshes: THREE.Mesh[] = []
      model.traverse(o => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh) })
      for (const mesh of meshes) {
        if (!(mesh as THREE.SkinnedMesh).isSkinnedMesh) {
          rigid(mesh, mesh.matrixWorld, mesh.parent!, mesh.parent!.matrixWorld.clone().invert())
          continue
        }
        const { skeleton, bindMatrix } = mesh as THREE.SkinnedMesh
        const geometry = part(mesh, bindMatrix)
        const from = mesh.geometry.attributes.skinIndex
        const weight = mesh.geometry.attributes.skinWeight
        const joints = new Uint16Array(from.count * 4)
        const weights = new Float32Array(from.count * 4)
        for (let v = 0; v < from.count; v++) {
          for (let c = 0; c < 4; c++) {
            const joint = from.getComponent(v, c)
            joints[v * 4 + c] = slot(skeleton.bones[joint], skeleton.boneInverses[joint])
            weights[v * 4 + c] = weight.getComponent(v, c)
          }
        }
        geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(joints, 4))
        geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4))
        parts.push(geometry)
      }
      for (const mesh of meshes) mesh.removeFromParent()
    },
    finish(material: THREE.Material) {
      const mesh = new THREE.SkinnedMesh(mergeGeometries(parts), material)
      parts.forEach(p => p.dispose())
      mesh.bind(new THREE.Skeleton(bones as THREE.Bone[], inverses), new THREE.Matrix4())
      mesh.frustumCulled = false   // its bounds are wherever the bones have gone
      mesh.castShadow = true
      return mesh
    },
  }
}

const clipOf = (model: GLTF, name: string) => {
  const clip = model.animations.find(a => a.name === name)
  if (!clip) throw new Error(`No clip named ${name}`)
  return clip
}

// One clip at a time, eased across, so nobody snaps between poses
function moves(model: GLTF, names: string[]) {
  const mixer = new THREE.AnimationMixer(model.scene)
  const actions = Object.fromEntries(names.map(name => [name, mixer.clipAction(clipOf(model, name))]))
  let now = names[0]
  for (const action of Object.values(actions)) action.play().setEffectiveWeight(0)
  actions[now].setEffectiveWeight(1)
  mixer.update(0)   // reduced motion never steps it: stand in a pose, not the bind shape
  return {
    mixer, actions,
    set(name: string) { now = name },
    step(dt: number) {
      const ease = 1 - Math.exp(-WEIGHT_EASE * dt)
      for (const [name, action] of Object.entries(actions)) {
        const weight = action.getEffectiveWeight()
        action.setEffectiveWeight(weight + ((name === now ? 1 : 0) - weight) * ease)
      }
      mixer.update(dt)
    },
    snap() {
      for (const [name, action] of Object.entries(actions)) action.setEffectiveWeight(name === now ? 1 : 0)
      mixer.update(0)
    },
  }
}

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

export function buildMansion(props: THREE.Object3D, material: THREE.Material, burglar: GLTF, guard: GLTF, glowMap: THREE.Texture | null) {
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(30, STAGE_ASPECT, 1, 80)
  camera.position.set(0, 5.6, 15.5)
  camera.lookAt(0, 2.05, -1)

  const room = mergeProps(props, layout(), material)
  scene.add(room)
  props.updateMatrixWorld(true)

  const movers = rig()
  const meshesOf = (name: string) => {
    const meshes: THREE.Mesh[] = []
    const model = props.getObjectByName(name)
    if (!model) throw new Error(`No model named ${name}`)
    model.traverse(o => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh) })
    return meshes
  }
  // Something of ours in the scene, turning about `pivot` in its model's own space
  const hang = (name: string, parent: THREE.Object3D, at: [number, number, number], pivot: [number, number, number] = [0, 0, 0], keep: (m: THREE.Mesh) => boolean = () => true) => {
    const bone = new THREE.Object3D()
    bone.position.set(...at)
    parent.add(bone)
    const inverse = new THREE.Matrix4().makeTranslation(-pivot[0], -pivot[1], -pivot[2])
    for (const mesh of meshesOf(name).filter(keep)) movers.rigid(mesh, mesh.matrixWorld, bone, inverse)
    return bone
  }
  const centreX = (mesh: THREE.Mesh) => {
    mesh.geometry.computeBoundingBox()
    return mesh.geometry.boundingBox!.getCenter(new THREE.Vector3()).applyMatrix4(mesh.matrixWorld).x
  }

  const frame = meshesOf('mansion_door')[0]
  hang('mansion_door', scene, [DOOR.x, 0, DOOR.z], [0, 0, 0], m => m === frame)
  const doorLeft = hang('mansion_door', scene, [DOOR.x - DOOR.hinge, 0, DOOR.z + 0.06], [-DOOR.hinge, 0, 0.06], m => m !== frame && centreX(m) < 0)
  const doorRight = hang('mansion_door', scene, [DOOR.x + DOOR.hinge, 0, DOOR.z + 0.06], [DOOR.hinge, 0, 0.06], m => m !== frame && centreX(m) > 0)
  const vaultDoor = hang('vault_door', scene, [VAULT.x - VAULT.radius, VAULT.y, VAULT.z], [-VAULT.radius, 0, 0])
  const wheel = hang('vault_wheel', vaultDoor, [VAULT.radius, 0, 0.3])
  const chandelier = hang('chandelier', scene, [CHANDELIER.x, CHANDELIER.y, CHANDELIER.z], [0, CHANDELIER.drop, 0])
  const beam = hang('lamp_beam', scene, [CHAIR.x - 1, 0.05, CHAIR.z + 0.2])
  beam.rotation.y = Math.PI + 0.25

  scene.add(burglar.scene, guard.scene)
  movers.character(burglar.scene)
  movers.character(guard.scene)
  const sack = hang('loot_sack', burglar.scene, [-0.25, 0, -0.95])
  sack.scale.setScalar(0.85)
  const actors = movers.finish(material)
  scene.add(actors)

  const sneak = moves(burglar, ['Idle', 'Walking_C', 'Cheer', 'PickUp'])
  const sleeper = moves(guard, ['Sit_Chair_Idle', 'Idle', 'Hit_A'])
  sleeper.actions.Hit_A.setLoop(THREE.LoopOnce, 1)
  const head = guard.scene.getObjectByName('head')!
  guard.scene.rotation.y = CHAIR.turn
  burglar.scene.position.copy(START)

  scene.add(new THREE.HemisphereLight('#8c8cff', '#3a2448', 1.25))
  // Moonlight through the window: its shadows are baked once, from the room alone
  const moon = new THREE.DirectionalLight('#c8d4ff', 1.5)
  moon.position.set(-8, 13, 9)
  // The chandelier: its shadow pass only ever holds the movers
  const candles = new THREE.DirectionalLight('#ffd9a0', 1.5)
  candles.position.set(1, 15, 7)
  for (const light of [moon, candles]) {
    light.castShadow = true
    light.shadow.mapSize.set(1024, 1024)
    light.shadow.radius = 6
    Object.assign(light.shadow.camera, { left: -16, right: 16, top: 13, bottom: -9, far: 42 })
    scene.add(light)
  }

  // Every soft light shares one draw call: halos, the moon's shaft, the dust in it
  const glow = new THREE.MeshBasicMaterial({ map: glowMap, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })
  const motes = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), glow, DUST + CANDLES + 5)
  motes.frustumCulled = false
  scene.add(motes)
  const SHAFT = DUST + CANDLES, POOL = SHAFT + 1, LAMP = SHAFT + 2, HALO = SHAFT + 3, GOLD = SHAFT + 4
  const place = new THREE.Object3D()
  const tint = new THREE.Color()
  const moonColor = new THREE.Color(MOON)
  const candleColor = new THREE.Color(CANDLE)
  const goldColor = new THREE.Color('#ffc94a')

  const setMote = (i: number, color: THREE.Color, strength: number) => {
    place.updateMatrix()
    motes.setMatrixAt(i, place.matrix)
    motes.setColorAt(i, tint.copy(color).multiplyScalar(strength))
  }

  const state = { along: 0, to: START.clone(), from: START.clone(), end: AT_DOOR, soft: true, stir: 0, noise: 0, dust: 0, door: 0, doorTo: 0, vault: 0, vaultTo: 0, turn: 0, turnTo: 0, standing: 0, standTo: 0, t: 0 }

  const poseRoom = () => {
    const { t, stir, noise, dust } = state
    chandelier.rotation.z = SWAY * Math.sin(t * 0.8) * (1 + 5 * noise)
    chandelier.rotation.x = SWAY * 0.5 * Math.cos(t * 0.6) * (1 + 3 * noise)
    doorLeft.rotation.y = -state.door * DOOR_OPEN
    doorRight.rotation.y = state.door * DOOR_OPEN
    vaultDoor.rotation.y = -state.vault * VAULT_OPEN
    wheel.rotation.z = state.turn
    beam.scale.set(0.55 + 0.55 * stir, 1, 0.5 + 0.8 * stir)
    place.quaternion.identity()
    for (let i = 0; i < DUST; i++) {
      const seed = i * 2.17 + 0.4
      const lift = (t * (0.05 + 0.03 * Math.abs(Math.sin(seed))) + seed) % 1
      place.position.set(-8.4 + 7.4 * Math.abs(Math.sin(seed * 3.1)) + 0.4 * Math.sin(t * 0.3 + seed), 0.5 + lift * 5.6, -2.4 + 3.6 * Math.abs(Math.cos(seed * 1.7)))
      place.scale.setScalar(0.09 + 0.05 * Math.abs(Math.sin(seed)))
      setMote(i, moonColor, Math.sin(lift * Math.PI) * (0.5 + 1.1 * dust))
    }
    for (let i = 0; i < CANDLES; i++) {
      const a = i * Math.PI / 3
      place.position.set(CHANDELIER.x + Math.cos(a) * CANDLE_RING + chandelier.rotation.z * -1.2, CHANDELIER.y - CHANDELIER.drop + 0.36, CHANDELIER.z + Math.sin(a) * CANDLE_RING)
      place.scale.setScalar(0.62)
      setMote(DUST + i, candleColor, 0.55 + 0.2 * Math.sin(t * 9.1 + i * 2.3) * Math.sin(t * 5.3 + i))
    }
    place.position.set(-4.4, 3.3, -1.2)
    place.rotation.set(0, 0, -0.62)
    place.scale.set(4.2, 12, 1)
    setMote(SHAFT, moonColor, 0.16 + 0.03 * Math.sin(t * 0.5))
    place.position.set(-2.6, 0.08, 0.2)
    place.rotation.set(-Math.PI / 2, 0, 0)
    place.scale.set(7, 3.6, 1)
    setMote(POOL, moonColor, 0.2)
    place.rotation.set(0, 0, 0)
    place.position.set(-9, 3, -2.5)
    place.scale.setScalar(3.4)
    setMote(LAMP, candleColor, 0.26)
    place.position.set(CHANDELIER.x, CHANDELIER.y - CHANDELIER.drop + 0.2, CHANDELIER.z)
    place.scale.setScalar(6.5)
    setMote(HALO, candleColor, 0.22 + 0.02 * Math.sin(t * 3.1))
    place.position.set(VAULT.x, VAULT.y, VAULT.z + 0.3)
    place.scale.setScalar(3.8)
    setMote(GOLD, goldColor, state.vault * 1.1)
    motes.instanceMatrix.needsUpdate = true
    motes.instanceColor!.needsUpdate = true
  }

  const poseGuard = () => {
    const seated = 1 - state.standing
    guard.scene.position.set(CHAIR.x, SEAT * seated, CHAIR.z + 0.05 + 0.95 * state.standing)
    head.rotateY(-0.65 * state.stir)
    head.rotateX(-0.25 * state.stir)
  }

  poseRoom()
  sneak.mixer.update(0)
  poseGuard()

  return {
    scene, camera, room, actors, moon, candles, burglar, guard, state, sneak, sleeper, poseRoom, poseGuard,
    // After the first frame has baked the room's shadow, it never pays for one again
    shadowsBaked() {
      moon.shadow.autoUpdate = false
      room.castShadow = false
    },
  }
}

export type Mansion = Awaited<ReturnType<typeof openMansion>>

let opening = 0

export async function openMansion(host: HTMLElement, reduced: boolean) {
  const mine = ++opening
  const palette = await loadPalette(`${ART}/palette.png`)
  const material = paperMaterial(palette)
  const [props, burglar, guard] = await Promise.all(['props', 'burglar', 'guard'].map(m => loadGlb(`${ART}/${m}.glb`)))
  const glowMap = glowTexture()
  const world = buildMansion(props.scene, material, burglar, guard, glowMap)
  const { scene, camera, state, sneak, sleeper, room, actors } = world
  const renderer = sharedRenderer()
  if (mine === opening) host.appendChild(renderer.domElement)
  const fit = () => {
    const { clientWidth: w, clientHeight: h } = host
    if (!w || !h) return
    // The Arcade zooms its board: draw for the pixels the canvas really covers
    renderer.setPixelRatio(Math.min(window.devicePixelRatio * host.getBoundingClientRect().width / w, MAX_PIXEL_RATIO))
    renderer.setSize(w, h)
    fitCamera(camera, w, h, STAGE_ASPECT)
    dirty = true
  }
  let dirty = true
  const resize = new ResizeObserver(fit)
  resize.observe(host)
  fit()

  // The first frame: the room alone, lit by the moon, into the shadow that never changes
  actors.visible = false
  renderer.render(scene, camera)
  actors.visible = true
  world.shadowsBaked()

  const body = burglar.scene
  const point = new THREE.Vector3()
  const ahead = new THREE.Vector3()
  let last = performance.now()
  let drawn = 0

  const snap = () => {
    body.position.copy(state.to)
    state.door = state.doorTo
    state.vault = state.vaultTo
    state.standing = state.standTo
    sneak.snap()
    sleeper.snap()
    dirty = true
  }

  const moved = () => { if (reduced) snap() }

  return {
    ...world,
    // Starting a room: back at the start, doors shut, heading for the door or the vault
    enter(boss: boolean) {
      state.end = boss ? AT_VAULT : AT_DOOR
      state.to.copy(START)
      body.position.copy(START)
      body.rotation.y = 0
      state.doorTo = state.door = 0
      state.turn = 0
      state.stir = 0
      state.standTo = 0
      sneak.set('Idle')
      sleeper.set('Sit_Chair_Idle')
      moved()
    },
    // He goes as far along the room as the notes have taken him
    advance(along: number, soft: boolean) {
      state.to.lerpVectors(START, state.end, along)
      state.soft = soft
      moved()
    },
    // Every note is heard: the louder it was, the more the guard stirs
    heard(level: number) {
      state.stir = Math.max(state.stir, level * level)
      state.dust = Math.min(1, state.dust + level * level)
    },
    noise() { state.noise = 1 },
    openDoor() { state.doorTo = 1; moved() },
    turnWheel(by: number) { state.turn = by; dirty = true },
    flinch() {
      state.stir = 1
      if (reduced) return
      sleeper.actions.Hit_A.reset().setEffectiveWeight(1).play()
    },
    alarm() {
      state.stir = 1
      state.standTo = 1
      sleeper.set('Idle')
      moved()
    },
    calm() {
      state.standTo = 0
      sleeper.set('Sit_Chair_Idle')
      moved()
    },
    openVault() {
      state.vaultTo = 1
      sneak.set('Cheer')
      moved()
    },
    // Where a label sits on screen
    labelAt(who: 'burglar' | 'guard'): { x: number; y: number } {
      const model = who === 'burglar' ? body : world.guard.scene
      point.copy(model.position)
      point.y += who === 'burglar' ? LABEL_BURGLAR : LABEL_GUARD
      point.project(camera)
      return { x: (point.x + 1) / 2 * host.clientWidth, y: (1 - point.y) / 2 * host.clientHeight }
    },
    frame(now: number) {
      if (reduced) {
        if (!dirty) return
        dirty = false
        world.poseRoom()
        renderer.render(scene, camera)
        return
      }
      if (now - drawn < FRAME_MS - FRAME_SLACK_MS) return
      drawn = now
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      state.t += dt

      ahead.copy(state.to).sub(body.position)
      const left = ahead.length()
      const speed = left * STRIDE_EASE
      const walking = speed > WALK_SPEED
      if (state.vaultTo === 0) sneak.set(walking ? 'Walking_C' : 'Idle')
      sneak.actions.Walking_C.timeScale = Math.min(1.5, (state.soft ? 0.7 : 1) + speed * 0.25)
      body.position.addScaledVector(ahead, 1 - Math.exp(-STRIDE_EASE * dt))
      if (walking) body.rotation.y = Math.atan2(ahead.x, ahead.z)
      body.scale.y = 1 - (state.soft ? CROUCH : 0)
      sneak.step(dt)

      state.stir *= Math.exp(-STIR_FADE * dt)
      state.noise *= Math.exp(-NOISE_FADE * dt)
      state.dust *= Math.exp(-NOISE_FADE * dt)
      const ease = 1 - Math.exp(-STAND_EASE * dt)
      state.door += (state.doorTo - state.door) * ease
      state.vault += (state.vaultTo - state.vault) * ease * 0.4
      state.standing += (state.standTo - state.standing) * ease
      sleeper.step(dt)
      if (sleeper.actions.Hit_A.isRunning()) sleeper.actions.Hit_A.setEffectiveWeight(0.7)
      world.poseGuard()
      world.poseRoom()
      renderer.render(scene, camera)
    },
    dispose() {
      resize.disconnect()
      sneak.mixer.stopAllAction()
      sleeper.mixer.stopAllAction()
      if (mine === opening) renderer.domElement.remove()
      disposeScene(scene)
      disposeScene(props.scene)
      room.geometry.dispose()
      glowMap.dispose()
      palette.dispose()
    },
  }
}
