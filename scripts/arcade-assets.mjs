// ── Curate Arcade art: copy only the models a world needs into public/arcade/ ──
// The raw packs are not in the repository. Usage:
//   node scripts/arcade-assets.mjs [path-to-arcade-sources]
//
// Each world gets props.glb (every static model, by name), one GLB per monster,
// and palette.png: the packs' gradient atlases stacked into one strip, regraded
// for the world, plus a band of paper colours for the monsters. Models lose their
// own textures and point into that strip, so a recoloured palette restyles a world.
// Zips are extracted to a temp folder and only read as data.
import { execFileSync } from 'node:child_process'
import { deflateSync, crc32 } from 'node:zlib'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import * as THREE from 'three'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

const PNG = createRequire(import.meta.url)('png-js')
const sources = process.argv[2] ?? 'arcade-sources'
const KAYKIT = join(sources, 'art/kaykit')

// Browser bits three reaches for that Node doesn't have
globalThis.ProgressEvent ??= class { constructor(type, init) { Object.assign(this, { type }, init) } }
globalThis.FileReader ??= class { readAsArrayBuffer(blob) { void blob.arrayBuffer().then(b => { this.result = b; this.onloadend() }) } }

const STRIP_W = 256
const BAND_H = 256
const BANDS = 4
const SWATCH_W = 16

// Every pack's atlas is one band of the strip; the last band holds monster colours
const HOLLOW = {
  dir: 'hollow',
  packs: [
    {
      atlas: 'KayKit-Halloween-Bits-1.0/addons/kaykit_halloween_bits/Assets/gltf',
      png: 'halloweenbits_texture.png',
      models: ['tree_dead_large', 'tree_dead_medium', 'tree_dead_small', 'gravestone', 'gravemarker_A', 'grave_A', 'lantern_standing', 'post_lantern', 'pumpkin_orange_jackolantern', 'pumpkin_yellow_small', 'fence', 'fence_broken'],
    },
    {
      atlas: 'KayKit-Medieval-Hexagon-Pack-1.0/addons/kaykit_medieval_hexagon_pack/Assets/gltf',
      png: 'buildings/blue/hexagons_medieval.png',
      models: ['tiles/base/hex_grass', 'tiles/roads/hex_road_A', 'buildings/blue/building_home_A_blue', 'buildings/blue/building_home_B_blue', 'buildings/blue/building_church_blue', 'buildings/blue/building_well_blue', 'decoration/nature/cloud_small', 'decoration/nature/hill_single_A', 'decoration/nature/hill_single_C'],
    },
    {
      zip: 'art/itch/kaykit-forest/KayKit_Forest_Nature_Pack_1.0_FREE.zip',
      atlas: 'KayKit_Forest_Nature_Pack_1.0_FREE/Assets/gltf',
      png: 'forest_texture.png',
      models: ['Tree_Bare_1_A_Color1', 'Tree_Bare_2_A_Color1', 'Rock_1_A_Color1', 'Bush_1_A_Color1'],
    },
  ],
  monsters: {
    zip: 'art/quaternius/animated-monster-pack.zip',
    dir: 'Animated Monster Pack by @Quaternius/FBX',
    // Clip that walks, and each material's paper colour
    list: {
      Slime: { clip: 'Slime_Walk', colors: { Body: '#7fd8a4', Eyes: '#1b1830' } },
      Skeleton: { clip: 'Skeleton_Running', colors: { Skeleton: '#ece0c6' } },
      Bat: { clip: 'Bat_Flying', colors: { Main: '#7a5cc8', Black: '#2b2350', Belly: '#f0c060', Nose: '#e88aa0', Eyes: '#14122a' } },
      Dragon: { clip: 'Dragon_Flying', colors: { Main: '#c84f5a', Wings: '#4a2748', Belly: '#f0c060', Claws: '#2b2350', Eyes: '#14122a' } },
    },
  },
}

// Moonlight: everything sinks towards indigo, except what is warm enough to glow
function night([r, g, b]) {
  const warm = Math.min(1, Math.max(0, (r - Math.max(g * 1.15, b)) / 70))
  const lum = (r * 0.3 + g * 0.6 + b * 0.1)
  const cool = [lum * 0.42 + r * 0.16 + 10, lum * 0.46 + g * 0.2 + 14, lum * 0.6 + b * 0.3 + 34]
  return cool.map((c, i) => Math.min(255, Math.round(c + ([r, g, b][i] * 1.02 - c) * warm)))
}

const decode = bytes => new Promise(done => { const png = new PNG(bytes); png.decode(pixels => done({ png, pixels })) })

async function atlasBand(strip, band, path) {
  const { png, pixels } = await decode(readFileSync(path))
  const channels = pixels.length / (png.width * png.height)
  for (let y = 0; y < BAND_H; y++) for (let x = 0; x < STRIP_W; x++) {
    const from = (Math.floor(y * png.height / BAND_H) * png.width + Math.floor(x * png.width / STRIP_W)) * channels
    strip.set(night([pixels[from], pixels[from + 1], pixels[from + 2]]), (y + band * BAND_H) * STRIP_W * 3 + x * 3)
  }
}

function pngChunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const out = Buffer.alloc(body.length + 8)
  out.writeUInt32BE(data.length, 0)
  body.copy(out, 4)
  out.writeUInt32BE(crc32(body), body.length + 4)
  return out
}

function encodePng(rgb, width, height) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header.set([8, 2], 8) // 8-bit RGB
  const rows = Buffer.alloc((width * 3 + 1) * height)
  for (let y = 0; y < height; y++) rows.set(rgb.subarray(y * width * 3, (y + 1) * width * 3), y * (width * 3 + 1) + 1)
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', header), pngChunk('IDAT', deflateSync(rows, { level: 9 })), pngChunk('IEND', Buffer.alloc(0))])
}

// Stripped of images, so the loader never needs a DOM; buffers go inline
function loadGltf(path) {
  const json = JSON.parse(readFileSync(path, 'utf8'))
  for (const buffer of json.buffers) buffer.uri = `data:application/octet-stream;base64,${readFileSync(join(path, '..', buffer.uri)).toString('base64')}`
  for (const key of ['images', 'textures', 'samplers']) delete json[key]
  for (const material of json.materials ?? []) delete material.pbrMetallicRoughness?.baseColorTexture
  return new Promise((resolve, reject) => new GLTFLoader().parse(JSON.stringify(json), '', resolve, reject))
}

function exportGlb(scene, animations, path) {
  return new Promise((resolve, reject) => new GLTFExporter().parse(scene, glb => {
    writeFileSync(path, Buffer.from(glb))
    resolve()
  }, reject, { binary: true, animations }))
}

const plain = new THREE.MeshStandardMaterial({ name: 'palette' })

// A pack's own atlas V becomes a slice of the strip
function intoBand(mesh, band) {
  const uv = mesh.geometry.attributes.uv
  for (let i = 0; i < uv.count; i++) uv.setY(i, (band + Math.min(0.995, Math.max(0.005, uv.getY(i)))) / BANDS)
  mesh.material = plain
}

async function props(world, root, out) {
  const scene = new THREE.Scene()
  for (const [band, pack] of world.packs.entries()) {
    for (const model of pack.models) {
      const { scene: part } = await loadGltf(join(root(pack), pack.atlas, `${model}.gltf`))
      part.name = basename(model)
      part.traverse(o => { if (o.isMesh) intoBand(o, band) })
      scene.add(part)
    }
  }
  await exportGlb(scene, [], join(out, 'props.glb'))
}

function swatchFor(strip, color, swatches) {
  if (!swatches.has(color)) {
    const at = swatches.size
    if ((at + 1) * SWATCH_W > STRIP_W) throw new Error('Too many monster colours for one band')
    const rgb = new THREE.Color(color).getHex(THREE.SRGBColorSpace)
    for (let y = 0; y < BAND_H; y++) for (let x = 0; x < SWATCH_W; x++) {
      strip.set([rgb >> 16, (rgb >> 8) & 255, rgb & 255], ((BANDS - 1) * BAND_H + y) * STRIP_W * 3 + (at * SWATCH_W + x) * 3)
    }
    swatches.set(color, at)
  }
  return swatches.get(color)
}

// One flat colour per material: every face of a group points at its swatch, then
// the groups go, so a monster's mesh is one draw call
function paint(mesh, colors, strip, swatches) {
  const { geometry } = mesh
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
  const groups = geometry.groups.length ? geometry.groups : [{ start: 0, count: geometry.attributes.position.count, materialIndex: 0 }]
  const uv = new Float32Array(geometry.attributes.position.count * 2)
  for (const { start, count, materialIndex } of groups) {
    const name = materials[materialIndex].name
    if (!colors[name]) throw new Error(`No paper colour for material ${name}`)
    const u = (swatchFor(strip, colors[name], swatches) + 0.5) * SWATCH_W / STRIP_W
    for (let i = start; i < start + count; i++) uv.set([u, (BANDS - 0.5) / BANDS], i * 2)
  }
  geometry.clearGroups()
  for (const unused of ['uv1', 'uv2']) geometry.deleteAttribute(unused)
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  mesh.material = plain
}

async function monsters({ monsters: { list, dir, zip } }, root, out, strip) {
  const swatches = new Map()
  for (const [name, { clip, colors }] of Object.entries(list)) {
    const bytes = readFileSync(join(root({ zip }), dir, `${name}.fbx`))
    const model = new FBXLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')
    const walk = model.animations.find(a => a.name.endsWith(clip))
    if (!walk) throw new Error(`${name} has no ${clip} animation`)
    walk.name = 'walk'
    model.traverse(o => { if (o.isMesh) paint(o, colors, strip, swatches) })
    model.animations = []
    await exportGlb(model, [walk], join(out, `${name.toLowerCase()}.glb`))
  }
}

const temp = mkdtempSync(join(tmpdir(), 'pliage-arcade-'))
const unpacked = new Map()
// shortcut: bsdtar reads zips on Windows and macOS only; use unzip on Linux
function root({ zip }) {
  if (!zip) return KAYKIT
  if (!unpacked.has(zip)) {
    const to = join(temp, String(unpacked.size))
    mkdirSync(to)
    execFileSync('tar', ['-xf', join(sources, zip), '-C', to])
    unpacked.set(zip, to)
  }
  return unpacked.get(zip)
}

for (const world of [HOLLOW]) {
  const out = join(import.meta.dirname, '../public/arcade', world.dir)
  mkdirSync(out, { recursive: true })
  const strip = new Uint8Array(STRIP_W * BAND_H * BANDS * 3)
  for (const [band, pack] of world.packs.entries()) await atlasBand(strip, band, join(root(pack), pack.atlas, pack.png))
  await props(world, root, out)
  await monsters(world, root, out, strip)
  writeFileSync(join(out, 'palette.png'), encodePng(strip, STRIP_W, BAND_H * BANDS))
  for (const file of readdirSync(out)) console.log(`${world.dir}/${file}`, `${(statSync(join(out, file)).size / 1024).toFixed(0)} KB`)
}
rmSync(temp, { recursive: true, force: true })
