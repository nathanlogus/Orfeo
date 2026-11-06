// ── Curate Frontier Express: public/arcade/frontier/props.glb and palette.png ──
// The raw packs are not in the repository. Usage:
//   node scripts/arcade-frontier.mjs [path-to-arcade-sources]
//
// Same recipe as arcade-assets.mjs and the paper kit, with one difference: this
// world has no atlases. Every part wears one flat swatch of a small palette, so pack
// models and folded card sit together as one sheet of paper. The stagecoach and the
// tumbleweed come from Low Poly Wild West, rocks from KayKit; the rest is folded here.
// The coach's wheels are cut off its body so the game can roll them.
import { deflateSync, crc32 } from 'node:zlib'
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, mkdtempSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as THREE from 'three'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

const sources = process.argv[2] ?? 'arcade-sources'
const OUT = join(import.meta.dirname, '../public/arcade/frontier')
const ROCKS = join(sources, 'art/kaykit/KayKit-Medieval-Hexagon-Pack-1.0/addons/kaykit_medieval_hexagon_pack/Assets/gltf/decoration/nature')
const WILD_WEST = 'art/itch/low-poly-wild-west/Low Poly Wild West.zip'
const CM = 0.01

globalThis.ProgressEvent ??= class { constructor(type, init) { Object.assign(this, { type }, init) } }
globalThis.FileReader ??= class { readAsArrayBuffer(blob) { void blob.arrayBuffer().then(b => { this.result = b; this.onloadend() }) } }
globalThis.window ??= globalThis

const SWATCH = 16
const COLUMNS = 32
const C = {
  sand: '#f1cf9e', dune: '#e8b98a', clay: '#e9a874', rust: '#d9865a', strata: '#c2703f', canyon: '#9c4f34', gorge: '#6e3424',
  cactus: '#3f8a5c', cactusDark: '#2f6f49', sun: '#ffde3b', ray: '#f0b93a', red: '#c84f5a', ink: '#26242f', paper: '#fbf8f5',
  horse: '#8a5436', weed: '#a9774a', dust: '#f4e2c4', rock: '#b98a68', outlaw: '#3a3640',
}
const swatches = Object.keys(C)
if (swatches.length > COLUMNS) throw new Error('Too many colours for the palette')

function flat(geometry) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry
  g.computeVertexNormals()
  g.setIndex([...Array(g.attributes.position.count).keys()])
  for (const name of Object.keys(g.attributes)) if (!['position', 'normal'].includes(name)) g.deleteAttribute(name)
  return g
}

const box = (w, h, d) => flat(new THREE.BoxGeometry(w, h, d))
const rod = (r, h, sides = 6) => flat(new THREE.CylinderGeometry(r, r, h, sides))
const cone = (top, bottom, h, sides = 7) => flat(new THREE.CylinderGeometry(top, bottom, h, sides))
const disc = (r, sides = 18) => flat(new THREE.CylinderGeometry(r, r, 0.12, sides).rotateX(Math.PI / 2))
const gem = r => flat(new THREE.IcosahedronGeometry(r, 0))
const card = (points, depth = 0.3) => flat(new THREE.ExtrudeGeometry(new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y))), { depth, bevelEnabled: false }).translate(0, 0, -depth / 2))
const at = (g, [x, y, z] = [0, 0, 0], [rx, ry, rz] = [0, 0, 0]) => g.rotateX(rx).rotateY(ry).rotateZ(rz).translate(x, y, z)

// A flat-topped hill of creased card, with a stripe of darker rock round it
function mesa(radius, height, tone, sides = 6) {
  const top = radius * 0.62
  const stripe = radius - (radius - top) * 0.55
  return [
    [cone(top, radius, height, sides).scale(1, 1, 0.62).translate(0, height / 2, 0), tone],
    [cone(stripe * 0.985, stripe * 1.03, height * 0.1, sides).scale(1, 1, 0.62).translate(0, height * 0.55, 0), 'strata'],
  ]
}

function cactus(height, arms, tone) {
  const r = height * 0.09
  return [
    [cone(r * 0.9, r, height).translate(0, height / 2, 0), tone],
    ...arms.flatMap(([side, y, up]) => [
      [at(rod(r * 0.6, height * 0.2), [side * height * 0.11, y * height, 0], [0, 0, Math.PI / 2]), tone],
      [cone(r * 0.5, r * 0.6, up * height).translate(side * height * 0.2, (y + up / 2) * height, 0), tone],
    ]),
  ]
}

// Side-on cut-outs, nose to +x, feet on the ground
const HORSE = [[-1.5, 1], [-1.6, 1.7], [-1.2, 2], [0.5, 2], [0.95, 2.9], [1.15, 3], [1.75, 2.45], [1.6, 2.25], [1.05, 2.4], [0.95, 1.5], [0.8, 1.1], [0.9, 0], [0.6, 0], [0.35, 1], [-0.6, 1], [-0.9, 0], [-1.2, 0]]
const horse = [
  [card(HORSE, 0.42), 'horse'],
  [at(card([[0, 0], [0.7, 0.7], [0.5, 1], [-0.1, 0.25]], 0.46), [0.3, 1.9, 0]), 'ink'],
  [at(card([[0, 0], [-0.5, -0.9], [-0.25, -0.95], [0.15, -0.1]], 0.2), [-1.5, 1.8, 0]), 'ink'],
]
const rider = [
  [box(0.62, 1, 0.5).translate(0, 2.55, 0), 'outlaw'],
  [gem(0.3).translate(0, 3.3, 0), 'paper'],
  [box(0.5, 0.2, 0.46).translate(0, 3.15, 0), 'red'],
  [cone(0.2, 0.26, 0.28).translate(0, 3.6, 0), 'ink'],
  [box(0.95, 0.06, 0.72).translate(0, 3.47, 0), 'ink'],
]
const rays = [...Array(14).keys()].map(i => [at(card([[-0.42, 3.2], [0.42, 3.2], [0, 4.1]], 0.1), [0, 0, 0], [0, 0, i / 14 * Math.PI * 2]), 'ray'])

const TILE = 48          // the land repeats every this many units; src/arcade/sightLine/frontier.ts agrees
const scallop = (from, to, bumps = 3, height = 1.3) => {
  const edge = [...Array(49).keys()].map(i => [-TILE / 2 + i * TILE / 48, to + Math.sin(i / 48 * Math.PI * 2 * bumps) * height])
  return [[TILE / 2, from], [-TILE / 2, from], ...edge]
}

const SHAPES = {
  plain: [[box(3000, 1, 1400).translate(0, -0.56, -500), 'dune']],
  dune: [[at(card(scallop(40, 3, 3, 1.1), 0.06), [0, 0, 0], [Math.PI / 2, 0, 0]), 'sand']],
  drift: [[at(card(scallop(-150, -112, 2, 5), 0.06), [0, 0.02, 0], [Math.PI / 2, 0, 0]), 'sand']],
  mesa_a: mesa(9, 7, 'clay'), mesa_b: mesa(7, 9, 'rust'), mesa_c: mesa(11, 5, 'clay', 7), butte: mesa(3.4, 8, 'rust', 5),
  cactus_a: cactus(3.6, [[1, 0.45, 0.28], [-1, 0.6, 0.22]], 'cactus'), cactus_b: cactus(2.6, [[-1, 0.5, 0.26]], 'cactusDark'),
  // Boss: the bridge's deck, its trestles, and the gorge under them
  deck: [[box(3000, 0.5, 80).translate(0, -0.25, -40), 'strata']],
  trestle: [
    ...[-3, 3].flatMap(x => [[box(0.5, 16, 0.5).translate(x, -8, 0), 'strata']]),
    [at(box(0.34, 12, 0.34), [0, -5.6, 0], [0, 0, 0.82]), 'strata'], [at(box(0.34, 12, 0.34), [0, -5.6, 0], [0, 0, -0.82]), 'strata'],
  ],
  gorge: [[box(3000, 1, 1400).translate(0, -16.5, -500), 'gorge']],
  far_rim: [[box(3000, 22, 900).translate(0, -11, -600), 'canyon']],
  // Actors: one skinned mesh, so these all stay at the origin of their own bone
  horse, rider,
  sun: [[disc(3), 'sun'], ...rays],
  puff: [[gem(0.5), 'dust']],
}

const paint = (geometry, color) => {
  if (!swatches.includes(color)) throw new Error(`No colour ${color}`)
  const u = (swatches.indexOf(color) + 0.5) / COLUMNS
  const uv = new Float32Array(geometry.attributes.position.count * 2)
  for (let i = 0; i < uv.length; i += 2) uv.set([u, 0.5], i)
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  return geometry
}

const plain = new THREE.MeshStandardMaterial({ name: 'palette' })
function shape(name, parts) {
  const group = new THREE.Group()
  group.name = name
  for (const [geometry, color] of parts) group.add(new THREE.Mesh(paint(geometry, color), plain))
  return group
}

function fbx(root, path) {
  const bytes = readFileSync(join(root, 'Low Poly Wild West', `${path}.fbx`))
  const model = new FBXLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')
  model.updateMatrixWorld(true)
  let mesh
  model.traverse(o => { if (o.isMesh) mesh = o })
  return { geometry: mesh.geometry.clone().applyMatrix4(mesh.matrixWorld).toNonIndexed(), materials: [mesh.material].flat().map(m => m.name), groups: mesh.geometry.groups }
}

// Triangles sharing a corner are one island: the pack's wheels are loose parts
function islands(geometry) {
  const p = geometry.attributes.position
  const ids = new Map()
  const corner = i => {
    const key = `${p.getX(i).toFixed(2)},${p.getY(i).toFixed(2)},${p.getZ(i).toFixed(2)}`
    if (!ids.has(key)) ids.set(key, ids.size)
    return ids.get(key)
  }
  const up = []
  const find = x => { up[x] ??= x; while (up[x] !== x) x = up[x] = up[up[x]]; return x }
  for (let i = 0; i < p.count; i += 3) { const a = find(corner(i)); up[find(corner(i + 1))] = a; up[find(corner(i + 2))] = a }
  const out = new Map()
  for (let i = 0; i < p.count; i += 3) {
    const root = find(corner(i))
    out.set(root, [...(out.get(root) ?? []), i])
  }
  return [...out.values()]
}

function pick(geometry, triangles) {
  const from = geometry.attributes.position
  const position = new Float32Array(triangles.length * 9)
  triangles.forEach((t, n) => { for (let k = 0; k < 9; k++) position[n * 9 + k] = from.array[t * 3 + k] })
  return new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(position, 3))
}

// The coach: nose to +x, in metres, a body and one wheel centred on its axle
function coachParts(root) {
  const { geometry, materials, groups } = fbx(root, 'Transportation/Stagecoach')
  const COLORS = { 'Dark Red': 'red', 'Brown 3': 'outlaw', 'Dark Grey': 'ink' }
  const colorOf = t => COLORS[materials[groups.find(g => t >= g.start && t < g.start + g.count).materialIndex]]
  const loose = islands(geometry)
  const xOf = t => geometry.attributes.position.getX(t)
  const zOf = t => geometry.attributes.position.getZ(t)
  const wheelSide = list => list.every(t => xOf(t) > 140)
  const oneWheel = loose.filter(list => wheelSide(list) && list.every(t => zOf(t) < 0))
  const bodyParts = loose.filter(list => !list.every(t => Math.abs(xOf(t)) > 140))
  const byColor = lists => {
    const colors = new Map()
    for (const t of lists.flat()) colors.set(colorOf(t), [...(colors.get(colorOf(t)) ?? []), t])
    return [...colors].map(([color, tris]) => [pick(geometry, tris), color])
  }
  const AXLE = new THREE.Vector3(0, 82, -130)
  const sized = (g, centre) => flat(g.translate(-centre.x, -centre.y, -centre.z).rotateY(-Math.PI / 2).scale(CM, CM, CM))
  return {
    coach: byColor(bodyParts).map(([g, color]) => [sized(g, new THREE.Vector3()), color]),
    wheel: byColor(oneWheel).map(([g, color]) => [sized(g, AXLE.clone().setX(148)), color]),
  }
}

function tumbleweed(root) {
  const { geometry } = fbx(root, 'Nature/Tumbleweed')
  return [[flat(geometry.translate(0, -38, 0).scale(CM, CM, CM)), 'weed']]
}

function rock(name) {
  const json = JSON.parse(readFileSync(join(ROCKS, `${name}.gltf`), 'utf8'))
  for (const buffer of json.buffers) buffer.uri = `data:application/octet-stream;base64,${readFileSync(join(ROCKS, buffer.uri)).toString('base64')}`
  for (const key of ['images', 'textures', 'samplers']) delete json[key]
  for (const material of json.materials ?? []) delete material.pbrMetallicRoughness?.baseColorTexture
  return new Promise((resolve, reject) => new GLTFLoader().parse(JSON.stringify(json), '', ({ scene }) => {
    scene.updateMatrixWorld(true)
    const parts = []
    scene.traverse(o => { if (o.isMesh) parts.push([flat(o.geometry.clone().applyMatrix4(o.matrixWorld)), 'rock']) })
    resolve(parts)
  }, reject))
}

function pngChunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const out = Buffer.alloc(body.length + 8)
  out.writeUInt32BE(data.length, 0)
  body.copy(out, 4)
  out.writeUInt32BE(crc32(body), body.length + 4)
  return out
}

function palettePng() {
  const width = COLUMNS * SWATCH
  const rows = Buffer.alloc((width * 3 + 1) * SWATCH)
  for (let y = 0; y < SWATCH; y++) for (let x = 0; x < width; x++) {
    const hex = new THREE.Color(C[swatches[Math.min(swatches.length - 1, Math.floor(x / SWATCH))]]).getHex(THREE.SRGBColorSpace)
    rows.set([hex >> 16, (hex >> 8) & 255, hex & 255], y * (width * 3 + 1) + 1 + x * 3)
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(SWATCH, 4)
  header.set([8, 2], 8)
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', header), pngChunk('IDAT', deflateSync(rows, { level: 9 })), pngChunk('IEND', Buffer.alloc(0))])
}

// shortcut: Expand-Archive is Windows only, as arcade-assets.mjs's tar is; use unzip on Linux
const temp = mkdtempSync(join(tmpdir(), 'pliage-frontier-'))
execFileSync('powershell', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${join(sources, WILD_WEST)}' -DestinationPath '${temp}' -Force`])

const scene = new THREE.Scene()
const all = { ...SHAPES, ...coachParts(temp), tumbleweed: tumbleweed(temp), rock_a: await rock('rock_single_A'), rock_b: await rock('rock_single_C') }
for (const [name, parts] of Object.entries(all)) scene.add(shape(name, parts))

mkdirSync(OUT, { recursive: true })
await new Promise((resolve, reject) => new GLTFExporter().parse(scene, glb => { writeFileSync(join(OUT, 'props.glb'), Buffer.from(glb)); resolve() }, reject, { binary: true }))
writeFileSync(join(OUT, 'palette.png'), palettePng())
for (const file of readdirSync(OUT)) console.log(`arcade/frontier/${file}`, `${(statSync(join(OUT, file)).size / 1024).toFixed(0)} KB`)
rmSync(temp, { recursive: true, force: true })
