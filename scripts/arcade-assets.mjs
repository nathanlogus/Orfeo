// ── Curate Arcade art: copy only the models a world needs into public/arcade/ ──
// The raw packs are not in the repository. Usage:
//   node scripts/arcade-assets.mjs [path-to-arcade-sources] [world folder ...]
// e.g. node scripts/arcade-assets.mjs arcade-sources arcade/kites rebuilds one world.
//
// Each world gets props.glb (every static model, by name), one GLB per monster,
// and palette.png: the packs' gradient atlases stacked into one strip, regraded
// for the world, plus a band of paper colours for the monsters. Models lose their
// own textures and point into that strip, so a recoloured palette restyles a world.
// Jam rooms follow the same recipe under public/jam/: no monsters, and whatever the
// packs lack is built here from three.js shapes painted out of the swatch band.
// The worlds after Monster Hollow add what no free pack has (kites, a submarine,
// orbit rings, mansion rooms, a climbing cycle) from arcade-paper-kit.mjs, painted
// the same way. Characters keep their skins and the clips a world asks for.
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
import { PAPER_KIT, climbClip } from './arcade-paper-kit.mjs'
import { JAM_ROOMS } from './jam-rooms-kit.mjs'

const PNG = createRequire(import.meta.url)('png-js')
const sources = process.argv[2] ?? 'arcade-sources'
const only = process.argv.slice(3)
const KAYKIT = join(sources, 'art/kaykit')

// Browser bits three reaches for that Node doesn't have
globalThis.ProgressEvent ??= class { constructor(type, init) { Object.assign(this, { type }, init) } }
globalThis.FileReader ??= class { readAsArrayBuffer(blob) { void blob.arrayBuffer().then(b => { this.result = b; this.onloadend() }) } }

const STRIP_W = 256
const BAND_H = 256
// Bands in the palette strip: one per pack or character, then the swatch band.
// Set per world as it is built; the first worlds all use 4
let BANDS = 4
const SWATCH_W = 16

// Moonlight: everything sinks towards indigo, except what is warm enough to glow
function night([r, g, b]) {
  const warm = Math.min(1, Math.max(0, (r - Math.max(g * 1.15, b)) / 70))
  const lum = (r * 0.3 + g * 0.6 + b * 0.1)
  const cool = [lum * 0.42 + r * 0.16 + 10, lum * 0.46 + g * 0.2 + 14, lum * 0.6 + b * 0.3 + 34]
  return cool.map((c, i) => Math.min(255, Math.round(c + ([r, g, b][i] * 1.02 - c) * warm)))
}

// Every pack's atlas is one band of the strip; the last band holds monster colours
const HOLLOW = {
  dir: 'arcade/hollow',
  grade: night,
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

// Worlds and models further down share these packs and this light regrade
const tint = (...by) => rgb => rgb.map((c, i) => Math.round(c * by[i]))

const FURNITURE = { atlas: 'KayKit-Furniture-Bits-1.0/addons/kaykit_furniture_bits/Assets/gltf', png: 'furniturebits_texture.png' }
const DUNGEON = { atlas: 'KayKit-Dungeon-Remastered-1.0/addons/kaykit_dungeon_remastered/Assets/gltf', png: '../texture/dungeon_texture.png', ext: '.gltf.glb' }
const MIXED_BAG = { zip: 'art/itch/kaykit-mixed-bag-1/KayKit_Mixed_Bag_1_FREE.zip', atlas: 'KayKit_Mixed_Bag_1_FREE/Assets/gltf', png: 'kaykit_texture_A.png' }
const SPACE_BASE = { atlas: 'KayKit-Space-Base-Bits-1.0/addons/kaykit_space_base_bits/Assets/gltf', png: 'spacebits_texture.png' }

const HEXAGON = { atlas: 'KayKit-Medieval-Hexagon-Pack-1.0/addons/kaykit_medieval_hexagon_pack/Assets/gltf', png: 'buildings/blue/hexagons_medieval.png' }
const FOREST = { zip: 'art/itch/kaykit-forest/KayKit_Forest_Nature_Pack_1.0_FREE.zip', atlas: 'KayKit_Forest_Nature_Pack_1.0_FREE/Assets/gltf', png: 'forest_texture.png' }
const PLATFORMER = { zip: 'art/itch/kaykit-platformer/KayKit_Platformer_Pack_1.0_FREE.zip', atlas: 'KayKit_Platformer_Pack_1.0_FREE/Assets/gltf', png: 'blue/platformer_texture.png' }
const MIXED_BAG_2 = { zip: 'art/itch/kaykit-mixed-bag-2/KayKit_Mixed_Bag_2_FREE.zip', atlas: 'KayKit_Mixed_Bag_2_FREE/Assets/gltf', png: 'kaykit_texture_A.png' }
const ADVENTURERS = 'KayKit-Character-Pack-Adventures-1.0/addons/kaykit_character_pack_adventures'
const adventurer = (name, png, keep, clips, climb = false) => ({ glb: `${ADVENTURERS}/Characters/gltf/${name}.glb`, png: `${ADVENTURERS}/Assets/gltf/${png}`, keep, clips, climb })
const FISH = 'art/quaternius/animated-fish-pack.zip'

// Under water: everything cools towards teal, warm paper keeps a little of itself
const sea = ([r, g, b]) => [Math.round(r * 0.62 + 6), Math.round(g * 0.82 + 22), Math.round(b * 0.9 + 40)]

const DEEP_SONG = {
  dir: 'arcade/deepsong',
  grade: sea,
  packs: [{ ...FOREST, models: ['Rock_1_A_Color1', 'Rock_1_D_Color1', 'Rock_2_A_Color1', 'Rock_3_A_Color1', 'Rock_3_E_Color1', 'Grass_2_A_Color1'] }],
  shapes: PAPER_KIT.deepSong,
  monsters: {
    zip: FISH,
    dir: 'Animated Fish Pack by @Quaternius/FBX',
    list: {
      Whale: { clip: 'Swim', colors: { Top: '#5b7cff', Bottom: '#f1e8de' } },
      Fish1: { clip: 'Swim', colors: { Top: '#ff7a5c', Bottom: '#fbf8f5', Fins: '#ffde3b' } },
      Fish3: { clip: 'Swim', colors: { Body: '#ff5fc8', Stripes: '#fbf8f5', Outline: '#26242f' } },
    },
  },
}

const KITE_FESTIVAL = {
  dir: 'arcade/kites',
  grade: tint(1.02, 1, 0.96),
  packs: [
    { ...HEXAGON, models: ['tiles/base/hex_grass', 'tiles/base/hex_water', 'tiles/coast/hex_coast_A', 'tiles/coast/hex_coast_B', 'tiles/coast/hex_coast_C', 'tiles/roads/hex_road_A', 'buildings/blue/building_home_A_blue', 'buildings/blue/building_home_B_blue', 'buildings/blue/building_windmill_blue', 'buildings/blue/building_tavern_blue', 'buildings/blue/building_market_blue', 'decoration/nature/tree_single_A', 'decoration/nature/cloud_big', 'decoration/nature/cloud_small'] },
    { ...PLATFORMER, models: ['blue/flag_A_blue', 'blue/flag_C_blue'] },
  ],
  shapes: PAPER_KIT.kiteFestival,
}

const ORBIT_STATION = {
  dir: 'arcade/orbit',
  grade: tint(0.78, 0.8, 1),
  packs: [{ ...SPACE_BASE, models: ['basemodule_A', 'basemodule_C', 'roofmodule_solarpanels', 'solarpanel', 'lights', 'landingpad_small', 'lander_A', 'rock_A', 'rocks_A', 'terrain_low_curved'] }],
  shapes: PAPER_KIT.orbitStation,
}

const MIDNIGHT_JOB = {
  dir: 'arcade/midnight',
  grade: night,
  bands: 6,
  packs: [
    { ...FURNITURE, models: ['couch_pillows', 'armchair', 'lamp_standing', 'cabinet_medium_decorated', 'shelf_B_large_decorated', 'pictureframe_large_A', 'table_medium', 'rug_oval_A', 'book_set'] },
    { ...MIXED_BAG_2, models: ['haunted_manor', 'ornate_mirror', 'frame_A_large', 'cobweb_A'] },
    { ...DUNGEON, models: ['candle_lit', 'candle_triple', 'shelf_small_candles', 'coin_stack_medium', 'keyring_hanging', 'floor_wood_large'] },
  ],
  shapes: PAPER_KIT.midnightJob,
  // The guards doze; the burglar sneaks
  characters: {
    guard: adventurer('Knight', 'knight_texture.png', /^Knight_(Body|Head|Helmet|Arm|Leg)/, ['Idle', 'Sit_Chair_Idle', 'Lie_Idle', 'Lie_StandUp', 'Hit_A']),
    burglar: adventurer('Rogue_Hooded', 'rogue_texture.png', /^Rogue_/, ['Idle', 'Walking_C', 'Running_A', 'PickUp', 'Cheer']),
  },
}

const SUMMIT = {
  dir: 'arcade/summit',
  grade: tint(0.94, 0.97, 1.04),
  bands: 5,
  packs: [
    { ...HEXAGON, models: ['tiles/base/hex_grass', 'tiles/base/hex_grass_sloped_high', 'decoration/nature/mountain_A', 'decoration/nature/mountain_B', 'decoration/nature/mountain_C', 'decoration/nature/mountain_A_grass_trees', 'decoration/nature/rock_single_A', 'decoration/nature/rock_single_C', 'decoration/props/ladder', 'decoration/props/tent', 'decoration/nature/cloud_big'] },
    { ...FOREST, models: ['Rock_1_A_Color1', 'Rock_3_E_Color1', 'Tree_2_A_Color1'] },
    { ...PLATFORMER, models: ['blue/platform_2x2x1_blue', 'blue/platform_4x2x1_blue', 'neutral/platform_wood_1x1x1'] },
  ],
  shapes: PAPER_KIT.summit,
  characters: {
    climber: adventurer('Rogue', 'rogue_texture.png', /^Rogue_/, ['Idle', 'Cheer', 'Jump_Full_Short'], true),
  },
}

const decode = bytes => new Promise(done => { const png = new PNG(bytes); png.decode(pixels => done({ png, pixels })) })

async function atlasBand(strip, band, path, grade) {
  const { png, pixels } = await decode(readFileSync(path))
  const channels = pixels.length / (png.width * png.height)
  for (let y = 0; y < BAND_H; y++) for (let x = 0; x < STRIP_W; x++) {
    const from = (Math.floor(y * png.height / BAND_H) * png.width + Math.floor(x * png.width / STRIP_W)) * channels
    strip.set(grade([pixels[from], pixels[from + 1], pixels[from + 2]]), (y + band * BAND_H) * STRIP_W * 3 + x * 3)
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

function readGlb(path) {
  const bytes = readFileSync(path)
  const jsonLength = bytes.readUInt32LE(12)
  const json = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength))
  json.buffers[0].uri = `data:application/octet-stream;base64,${bytes.subarray(28 + jsonLength).toString('base64')}`
  return json
}

function readGltf(path) {
  const json = JSON.parse(readFileSync(path, 'utf8'))
  for (const buffer of json.buffers) buffer.uri = `data:application/octet-stream;base64,${readFileSync(join(path, '..', buffer.uri)).toString('base64')}`
  return json
}

// Stripped of images, so the loader never needs a DOM; buffers go inline
function loadGltf(path) {
  const json = path.endsWith('.glb') ? readGlb(path) : readGltf(path)
  for (const key of ['images', 'textures', 'samplers']) delete json[key]
  // Every texture slot goes, not only the base colour: some packs add emissive or glass maps
  for (const material of json.materials ?? []) {
    for (const holder of [material, material.pbrMetallicRoughness ?? {}]) for (const key of Object.keys(holder)) if (key.endsWith('Texture')) delete holder[key]
    delete material.extensions
  }
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

// One shape, its parts already moved into place; every part wears one flat swatch
function shape(name, parts, strip, swatches) {
  const group = new THREE.Group()
  group.name = name
  for (const [geometry, color] of parts) {
    const u = (swatchFor(strip, color, swatches) + 0.5) * SWATCH_W / STRIP_W
    const uv = geometry.attributes.uv
    for (let i = 0; i < uv.count; i++) uv.setXY(i, u, (BANDS - 0.5) / BANDS)
    group.add(new THREE.Mesh(geometry, plain))
  }
  return group
}

async function props(world, root, out, strip, swatches) {
  const scene = new THREE.Scene()
  for (const [band, pack] of world.packs.entries()) {
    for (const model of pack.models) {
      const { scene: part } = await loadGltf(join(root(pack), pack.atlas, `${model}${pack.ext ?? '.gltf'}`))
      part.name = basename(model)
      part.traverse(o => { if (o.isMesh) intoBand(o, band) })
      scene.add(part)
    }
  }
  for (const [name, parts] of Object.entries(world.shapes ?? {})) scene.add(shape(name, parts, strip, swatches))
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

async function monsters({ monsters: { list, dir, zip } }, root, out, strip, swatches) {
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

// A character keeps its rig and only the clips the world uses; its own texture
// becomes one band of the strip, after the packs'. Weapons and spare heads go
async function characters({ characters: list, packs }, out) {
  for (const [index, [name, { glb, keep, clips, climb }]] of Object.entries(list ?? {}).entries()) {
    const gltf = await loadGltf(join(KAYKIT, glb))
    const model = gltf.scene
    const drop = []
    model.traverse(o => { if (o.isMesh && !keep.test(o.name) && !keep.test(o.parent?.name ?? '')) drop.push(o) })
    for (const o of drop) o.removeFromParent()
    model.traverse(o => { if (o.isMesh) intoBand(o, packs.length + index) })
    const chosen = clips.map(clip => {
      const found = gltf.animations.find(a => a.name === clip)
      if (!found) throw new Error(`${name} has no ${clip} animation`)
      return found
    })
    if (climb) chosen.push(climbClip(model))
    await exportGlb(model, chosen, join(out, `${name}.glb`))
  }
}

const temp = mkdtempSync(join(tmpdir(), 'pliage-arcade-'))
const unpacked = new Map()
// bsdtar reads zips on Windows and macOS; GNU tar on Linux can't, so unzip there
function root({ zip }) {
  if (!zip) return KAYKIT
  if (!unpacked.has(zip)) {
    const to = join(temp, String(unpacked.size))
    mkdirSync(to)
    if (process.platform === 'linux') execFileSync('unzip', ['-q', '-o', join(sources, zip), '-d', to])
    else execFileSync('tar', ['-xf', join(sources, zip), '-C', to])
    unpacked.set(zip, to)
  }
  return unpacked.get(zip)
}

const JAM_WORLDS = Object.keys(JAM_ROOMS).map(room => ({ dir: `jam/${room}`, packs: [], shapes: JAM_ROOMS[room] }))
const WORLDS = [HOLLOW, ...JAM_WORLDS, DEEP_SONG, KITE_FESTIVAL, ORBIT_STATION, MIDNIGHT_JOB, SUMMIT]
for (const world of WORLDS.filter(w => !only.length || only.includes(w.dir))) {
  BANDS = world.bands ?? 4
  const used = world.packs.length + Object.keys(world.characters ?? {}).length + 1
  if (used > BANDS) throw new Error(`${world.dir} needs ${used} bands; set bands`)
  const out = join(import.meta.dirname, '../public', world.dir)
  mkdirSync(out, { recursive: true })
  const strip = new Uint8Array(STRIP_W * BAND_H * BANDS * 3)
  const swatches = new Map()
  for (const [band, pack] of world.packs.entries()) await atlasBand(strip, band, join(root(pack), pack.atlas, pack.png), world.grade)
  await props(world, root, out, strip, swatches)
  if (world.monsters) await monsters(world, root, out, strip, swatches)
  for (const [index, { png }] of Object.values(world.characters ?? {}).entries()) await atlasBand(strip, world.packs.length + index, join(KAYKIT, png), world.grade)
  await characters(world, out)
  writeFileSync(join(out, 'palette.png'), encodePng(strip, STRIP_W, BAND_H * BANDS))
  for (const file of readdirSync(out)) console.log(`${world.dir}/${file}`, `${(statSync(join(out, file)).size / 1024).toFixed(0)} KB`)
}
rmSync(temp, { recursive: true, force: true })
