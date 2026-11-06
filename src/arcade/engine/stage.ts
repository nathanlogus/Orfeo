// ── The Arcade's paper diorama: one renderer, one scene per world ─────────────
// Every world shares this look: flat toon shading, a little paper grain, soft
// drop shadows, a fixed camera, and one palette texture that colours everything.
// This module pulls in three.js, so it is only ever reached through import().
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export const MAX_PIXEL_RATIO = 1.5
const SHADOW_SIZE = 1024
const GRAIN = 0.07
const TOON_STEPS = [150, 205, 255]
const MERGED_ATTRIBUTES = ['position', 'normal', 'uv']

let renderer: THREE.WebGLRenderer | null = null

export function sharedRenderer(): THREE.WebGLRenderer {
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
  }
  return renderer
}

export function releaseRenderer() {
  renderer?.dispose()
  renderer?.forceContextLoss()
  renderer?.domElement.remove()
  renderer = null
}

function toonSteps(): THREE.DataTexture {
  const steps = new THREE.DataTexture(new Uint8Array(TOON_STEPS), TOON_STEPS.length, 1, THREE.RedFormat)
  steps.minFilter = steps.magFilter = THREE.NearestFilter
  steps.needsUpdate = true
  return steps
}

// The paper's grain, on any material: unlit backdrops are the same paper as the lit props
export function paperGrain<T extends THREE.Material>(material: T): T {
  material.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>', `#include <dithering_fragment>
      gl_FragColor.rgb *= 1.0 - ${GRAIN.toFixed(3)} * fract(sin(dot(floor(gl_FragCoord.xy / 2.0), vec2(12.9898, 78.233))) * 43758.5453);`)
  }
  return material
}

// One material for a whole world; a palette of null is for headless checks
export function paperMaterial(palette: THREE.Texture | null): THREE.MeshToonMaterial {
  return paperGrain(new THREE.MeshToonMaterial({ map: palette, gradientMap: toonSteps() }))
}

export function loadPalette(url: string): Promise<THREE.Texture> {
  return new THREE.TextureLoader().loadAsync(url).then(texture => {
    texture.colorSpace = THREE.SRGBColorSpace
    texture.flipY = false    // the models' UVs are glTF's, top-down
    texture.generateMipmaps = false
    texture.minFilter = THREE.LinearFilter
    return texture
  })
}

export const loadGlb = (url: string) => new GLTFLoader().loadAsync(url)

export interface Placement { model: string; x: number; z: number; turn?: number; size?: number; y?: number }

// Every static model in a world melts into one mesh: one draw call, however many trees
export function mergeProps(props: THREE.Object3D, placements: Placement[], material: THREE.Material): THREE.Mesh {
  props.updateMatrixWorld(true)
  const parts: THREE.BufferGeometry[] = []
  const place = new THREE.Matrix4()
  const rotation = new THREE.Euler()
  for (const { model, x, z, turn = 0, size = 1, y = 0 } of placements) {
    const source = props.getObjectByName(model)
    if (!source) throw new Error(`No model named ${model}`)
    const toLocal = new THREE.Matrix4().copy(source.matrixWorld).invert()
    place.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(rotation.set(0, turn, 0)), new THREE.Vector3(size, size, size))
    source.traverse(o => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      const part = mesh.geometry.clone()
      for (const name of Object.keys(part.attributes)) if (!MERGED_ATTRIBUTES.includes(name)) part.deleteAttribute(name)
      part.applyMatrix4(new THREE.Matrix4().multiplyMatrices(place, toLocal).multiply(mesh.matrixWorld))
      parts.push(part)
    })
  }
  const geometry = mergeGeometries(parts)
  parts.forEach(p => p.dispose())
  const mesh = new THREE.Mesh(geometry, material)
  mesh.castShadow = mesh.receiveShadow = true
  return mesh
}

// What one frame costs the GPU: each visible mesh once, and once more in the shadow pass
export function drawCalls(scene: THREE.Object3D): number {
  let calls = 0
  scene.traverseVisible(o => {
    if (!(o as THREE.Mesh).isMesh) return
    calls += o.castShadow ? 2 : 1
  })
  return calls
}

export function disposeScene(scene: THREE.Object3D) {
  scene.traverse(o => {
    const mesh = o as THREE.SkinnedMesh
    mesh.geometry?.dispose()
    mesh.skeleton?.dispose()
    const material = mesh.material as THREE.MeshToonMaterial | undefined
    material?.map?.dispose()
    material?.gradientMap?.dispose()
    material?.dispose()
  })
}

// Fixed camera: a wider window sees the same stage, a narrower one backs away to keep it
export function fitCamera(camera: THREE.PerspectiveCamera, width: number, height: number, stageAspect: number) {
  camera.aspect = width / height
  const base = camera.userData.fov ??= camera.fov
  camera.fov = camera.aspect >= stageAspect ? base : THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(base / 2)) * stageAspect / camera.aspect))
  camera.updateProjectionMatrix()
}
