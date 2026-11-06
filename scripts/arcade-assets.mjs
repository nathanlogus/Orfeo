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

// Jam rooms: lamp light, not moonlight. Atlases are only tinted; the mood comes from
// the walls and lamps, which are shapes
const tint = (...by) => rgb => rgb.map((c, i) => Math.round(c * by[i]))

const FURNITURE = { atlas: 'KayKit-Furniture-Bits-1.0/addons/kaykit_furniture_bits/Assets/gltf', png: 'furniturebits_texture.png' }
const RESTAURANT = { atlas: 'KayKit-Restaurant-Bits-1.0/addons/kaykit_restaurant_bits/Assets/gltf', png: 'restaurantbits_texture.png' }
const DUNGEON = { atlas: 'KayKit-Dungeon-Remastered-1.0/addons/kaykit_dungeon_remastered/Assets/gltf', png: '../texture/dungeon_texture.png', ext: '.gltf.glb' }
const MIXED_BAG = { zip: 'art/itch/kaykit-mixed-bag-1/KayKit_Mixed_Bag_1_FREE.zip', atlas: 'KayKit_Mixed_Bag_1_FREE/Assets/gltf', png: 'kaykit_texture_A.png' }

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d)
const rod = (r, h) => new THREE.CylinderGeometry(r, r, h, 8)
const cone = (top, bottom, h) => new THREE.CylinderGeometry(top, bottom, h, 12)
const ball = r => new THREE.SphereGeometry(r, 10, 8)
const tube = (points, r = 0.07) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(([x, y]) => new THREE.Vector3(x, y, 0))), points.length * 8, r, 6)
const pendant = (cord, shade) => [[rod(0.03, 8).translate(0, 4.3, 0), cord], [cone(0.25, 0.9, 0.7).translate(0, -0.05, 0), shade]]
const WALL_W = 70

// The cat that walks the café counter and the roadhouse bar
const cat = color => [
  [box(0.7, 0.26, 0.2).translate(0, 0.26, 0), color], [ball(0.17).translate(0.42, 0.42, 0), color],
  [cone(0.01, 0.07, 0.14).translate(0.34, 0.6, 0), color], [cone(0.01, 0.07, 0.14).translate(0.5, 0.6, 0), color],
  ...[-0.26, -0.12, 0.14, 0.28].map(x => [box(0.07, 0.2, 0.08).translate(x, 0.08, 0), color]),
  [tube([[-0.34, 0.3], [-0.5, 0.45], [-0.46, 0.68]], 0.035), color],
]
const person = color => [[ball(0.24).translate(0, 1.72, 0), color], [box(0.62, 0.86, 0.26).translate(0, 1.12, 0), color], [box(0.5, 0.74, 0.22).translate(0, 0.36, 0), color]]

const STUDIO = {
  dir: 'jam/studio',
  grade: tint(0.8, 0.82, 0.9),
  packs: [
    { ...FURNITURE, models: ['couch_pillows', 'lamp_standing', 'lamp_table', 'rug_rectangle_stripes_A', 'cabinet_small', 'cactus_medium_A'] },
    { ...MIXED_BAG, models: ['guitar_A'] },
  ],
  shapes: {
    wall: [[box(WALL_W, 20, 1).translate(0, 10, -0.5), '#3d3a52'], [box(WALL_W, 1.5, 1.1).translate(0, 0.75, -0.5), '#2c2a3e']],
    floor: [[box(WALL_W, 1, 30).translate(0, -0.5, 12), '#5a4a48']],
    foam: [[box(2.2, 2.2, 0.16), '#55506e'], [box(0.5, 0.5, 0.2).translate(-0.5, 0.5, 0), '#4a4562'], [box(0.5, 0.5, 0.2).translate(0.5, -0.5, 0), '#4a4562']],
    mic_stand: [
      [cone(0.5, 0.55, 0.1).translate(0, 0.05, 0), '#1e1d2a'],
      [rod(0.05, 4).translate(0, 2, 0), '#8a8a98'],
      [rod(0.04, 2).rotateZ(1.1).translate(-0.8, 4.4, 0), '#8a8a98'],
      [rod(0.17, 0.5).rotateZ(0.5).translate(-1.75, 4.9, 0), '#1e1d2a'],
      [ball(0.2).translate(-1.95, 5.15, 0), '#b8b8c4'],
    ],
    amp: [
      [box(2.4, 2.2, 1.1).translate(0, 1.1, 0), '#26242f'],
      [box(2.1, 1.35, 0.06).translate(0, 0.95, 0.56), '#6b5a48'],
      [box(2.1, 0.38, 0.06).translate(0, 1.88, 0.56), '#c9b078'],
      ...[-0.7, -0.25, 0.2].map(x => [rod(0.07, 0.1).rotateX(1.57).translate(x, 1.88, 0.62), '#26242f']),
      [box(0.8, 0.1, 0.2).translate(0, 2.25, 0), '#1e1d2a'],
    ],
    booth_frame: [
      [box(8.8, 0.35, 0.5).translate(0, 5.2, 0), '#1e1d2a'], [box(8.8, 0.45, 0.8).translate(0, 0, 0.1), '#1e1d2a'],
      [box(0.35, 5.2, 0.5).translate(-4.3, 2.6, 0), '#1e1d2a'], [box(0.35, 5.2, 0.5).translate(4.3, 2.6, 0), '#1e1d2a'], [box(0.14, 5.2, 0.3).translate(0, 2.6, 0), '#1e1d2a'],
    ],
    booth_inside: [
      [box(2.6, 0.9, 0.4).translate(-1.8, 0.6, 0), '#10202a'], [box(2.6, 0.9, 0.4).translate(1.8, 0.6, 0), '#10202a'],
      [ball(0.42).translate(-1.3, 2.4, 0), '#10202a'], [box(1, 1.1, 0.2).translate(-1.3, 1.5, 0), '#10202a'],
      [box(0.7, 1.2, 0.3).translate(-3.4, 3.8, 0), '#10202a'], [box(0.7, 1.2, 0.3).translate(3.4, 3.8, 0), '#10202a'],
    ],
    booth_glass: [[box(8.4, 5, 0.1).translate(0, 2.6, 0), '#2f8f8a']],
    tally: [[box(1.5, 0.5, 0.1), '#ff4a4a']],
    engineer: person('#10202a'),
    booth_lights: [-2.6, -2.2, -1.8, -1.4, -1, 1, 1.4, 1.8, 2.2, 2.6].map((x, i) => [box(0.14, 0.14, 0.1).translate(x, 0.82, 0), i % 3 ? '#8cf08c' : '#ffc060']),
  },
}

const CAFE = {
  dir: 'jam/cafe',
  grade: tint(0.92, 0.8, 0.68),
  packs: [
    { ...RESTAURANT, models: ['table_round_A_small', 'chair_A', 'chair_B', 'menu', 'jar_A_medium', 'jar_B_medium', 'jar_C_small'] },
    { ...FURNITURE, models: ['pictureframe_medium', 'cactus_small_A', 'shelf_A_big', 'book_set'] },
  ],
  shapes: {
    wall: [[box(WALL_W, 20, 1).translate(0, 10, -0.5), '#7a4a3a'], [box(WALL_W, 3, 1.1).translate(0, 1.5, -0.5), '#3e2a2a'], [box(WALL_W, 0.14, 1.2).translate(0, 3, -0.5), '#c9a26a']],
    floor: [[box(WALL_W, 1, 30).translate(0, -0.5, 12), '#4a3030']],
    pane_frame: [
      [box(7.6, 0.3, 0.5).translate(0, 5.6, 0), '#2a1c1e'], [box(7.8, 0.3, 0.8).translate(0, 0, 0.1), '#2a1c1e'],
      [box(0.3, 5.6, 0.5).translate(-3.7, 2.8, 0), '#2a1c1e'], [box(0.3, 5.6, 0.5).translate(3.7, 2.8, 0), '#2a1c1e'],
      [box(0.12, 5.6, 0.3).translate(0, 2.8, 0), '#2a1c1e'], [box(7.4, 0.12, 0.3).translate(0, 3.8, 0), '#2a1c1e'],
    ],
    pane_night: [[box(7.3, 5.5, 0.1).translate(0, 2.8, 0), '#1a2a48']],
    skyline: [[-3, 1.8], [-2, 2.8], [-0.9, 1.4], [0.3, 2.2], [1.5, 3.2], [2.8, 1.9]].map(([x, h]) => [box(1.1, h, 0.1).translate(x, h / 2 + 0.2, 0), '#121c34']),
    lamp_hanging: pendant('#1e1416', '#b8603a'),
    lamp_shine: [[cone(0.88, 0.88, 0.04), '#ffe0a0']],
    cat: cat('#1a1014'),
    cup: [[cone(0.2, 0.15, 0.3).translate(0, 0.15, 0), '#efe4d0'], [box(0.12, 0.14, 0.04).translate(0.24, 0.16, 0), '#efe4d0'], [cone(0.34, 0.34, 0.03).translate(0, 0.01, 0), '#efe4d0']],
    counter: [[box(8, 2.3, 1.4).translate(0, 1.15, 0), '#5e3c32'], [box(8.3, 0.2, 1.7).translate(0, 2.4, 0), '#c9a26a']],
  },
}

const ROADHOUSE = {
  dir: 'jam/roadhouse',
  grade: tint(0.82, 0.66, 0.62),
  packs: [
    { ...DUNGEON, models: ['keg', 'barrel_large', 'barrel_small', 'bottle_A_brown', 'bottle_A_green', 'bottle_B_brown', 'bottle_C_green', 'table_small'] },
    { ...MIXED_BAG, models: ['guitar_B'] },
  ],
  shapes: {
    wall: [
      [box(WALL_W, 20, 1).translate(0, 10, -0.5), '#3a2226'],
      ...[-14, -12, -10, -8, -6, -4, -2, 0, 2, 4, 6, 8, 10, 12, 14].map(x => [box(0.08, 20, 1.04).translate(x, 10, -0.5), '#2a181c']),
      [box(WALL_W, 1.2, 1.1).translate(0, 0.6, -0.5), '#1e1214'],
    ],
    floor: [[box(WALL_W, 1, 30).translate(0, -0.5, 12), '#2e1e1c']],
    bar: [
      [box(14, 2.6, 1.4).translate(0, 1.3, 0), '#4a2a22'],
      [box(14.4, 0.24, 1.9).translate(0, 2.7, 0), '#8a5636'],
      ...[-5.6, -2.8, 0, 2.8, 5.6].map(x => [box(0.1, 2.4, 1.44).translate(x, 1.2, 0), '#2a181c']),
      [rod(0.05, 14).rotateZ(1.5708).translate(0, 0.35, 0.8), '#c9a26a'],
    ],
    back_shelf: [[box(9, 0.14, 0.7), '#1e1214'], [box(9, 0.14, 0.7).translate(0, 1.5, 0), '#1e1214']],
    sign_board: [[box(5.4, 3.2, 0.14), '#1a0f12']],
    sign_pink: [
      [tube([[-1, -0.7], [-1.3, -0.95], [-1.65, -0.8], [-1.5, -0.5], [-1.1, -0.5], [-0.95, -0.7]]), '#ff5fa2'],
      [tube([[-0.97, -0.7], [-0.97, 0.9]]), '#ff5fa2'],
      [tube([[0.4, -0.5], [0.1, -0.75], [-0.25, -0.6], [-0.1, -0.3], [0.3, -0.3], [0.45, -0.5]]), '#ff5fa2'],
      [tube([[0.43, -0.5], [0.43, 1.1]]), '#ff5fa2'],
      [tube([[-0.97, 0.9], [-0.3, 1.2], [0.43, 1.1]], 0.1), '#ff5fa2'],
    ],
    sign_blue: [[tube([[-2.3, -1.2], [-2.45, 0], [-2.3, 1.2], [0, 1.42], [2.3, 1.2], [2.45, 0], [2.3, -1.2], [0, -1.42], [-2.3, -1.2]]), '#56d8ff']],
    lamp_hanging: pendant('#1a0f12', '#7a2a28'),
    lamp_shine: [[cone(0.88, 0.88, 0.04), '#ffc878']],
    cat: cat('#1a0f12'),
    bar_stool: [[cone(0.55, 0.55, 0.22).translate(0, 1.9, 0), '#8a2c2c'], [rod(0.07, 1.8).translate(0, 0.9, 0), '#9a9098'], [cone(0.42, 0.42, 0.06).translate(0, 0.7, 0), '#9a9098'], [cone(0.45, 0.5, 0.08).translate(0, 0.04, 0), '#1e1214']],
  },
}

const SPACE_BASE = { atlas: 'KayKit-Space-Base-Bits-1.0/addons/kaykit_space_base_bits/Assets/gltf', png: 'spacebits_texture.png' }

// Windows in rows up a building's face
const lights = (x, w, h, rows, warm, cool) => Array.from({ length: rows * 4 }, (_, i) => {
  const col = i % 4, row = (i - col) / 4
  return (i * 7) % 5 === 0 ? null : [box(0.2, 0.26, 0.06).translate(x - w / 2 + (col + 0.7) * w / 4.4, 0.7 + (row + 0.5) * (h - 0.9) / rows, 0), (i * 3) % 7 === 0 ? cool : warm]
}).filter(Boolean)
const CITY = [[-11, 3, 3.4], [-7.4, 2.6, 4.3], [-3.8, 3, 3], [-0.4, 2.4, 4.6], [3, 3, 3.6], [6.4, 2.6, 4.2], [10, 3.4, 3.2]]

const ROOFTOP = {
  dir: 'jam/rooftop',
  grade: tint(0.72, 0.76, 0.98),
  packs: [{ ...FURNITURE, models: ['couch_pillows', 'lamp_standing', 'rug_oval_A', 'table_low', 'chair_B', 'cactus_medium_A', 'cactus_medium_B'] }],
  shapes: {
    deck: [[box(WALL_W, 1, 30).translate(0, -0.5, 12), '#3a3650']],
    parapet: [[box(WALL_W, 1.1, 0.5).translate(0, 0.55, 0), '#26233c'], [box(WALL_W, 0.1, 0.62).translate(0, 1.14, 0), '#4e4a6e']],
    poles: [-11, 0, 11].map(x => [rod(0.06, 5.3).translate(x, 2.65, 0), '#1a1830']),
    sky: [[box(WALL_W, 30, 0.5).translate(0, 15, 0), '#10143a'], [box(WALL_W, 5, 0.6).translate(0, 2.5, 0), '#1e2150'], [box(WALL_W, 2.4, 0.7).translate(0, 1.2, 0), '#322a60']],
    moon: [[ball(0.9).scale(1, 1, 0.1), '#eef0ff']],
    city_far: [-13, -9.4, -5.6, -1.6, 2.2, 5, 8.6, 12].map((x, i) => [box(3.6, 3.6 + (i * 2 % 5) * 0.5, 0.3).translate(x, 1.8 + (i * 2 % 5) * 0.25, 0), '#1a1c48']),
    city_near: CITY.map(([x, w, h]) => [box(w, h, 0.3).translate(x, h / 2, 0), '#0e1030']),
    windows: CITY.flatMap(([x, w, h]) => lights(x, w, h, Math.floor(h), '#d8a858', '#6a90c8')),
    wire: [[tube([[-11, 5.2], [-8, 4.6], [-5.5, 4.2], [-3, 4.6], [0, 5.2], [3, 4.6], [5.5, 4.2], [8, 4.6], [11, 5.2]], 0.025), '#0a0a1c']],
    billboard: [[tube([[-1.2, -0.4], [-1.25, 0.5], [1.25, 0.5], [1.2, -0.4], [-1.2, -0.4]], 0.05), '#ff5fa2'], [tube([[-0.8, -0.1], [-0.3, 0.2], [0.2, -0.1], [0.7, 0.2]], 0.05), '#56d8ff']],
  },
}

const fronds = (x, y) => [[-2.4, -0.7], [-1.5, -1.5], [1.5, -1.5], [2.4, -0.7], [-1.4, 0.2], [1.4, 0.2]].map(([dx, dy]) => [tube([[x, y], [x + dx * 0.5, y + 0.45 + dy * 0.2], [x + dx, y + dy]], 0.13), '#1c1428'])

const BEACH = {
  dir: 'jam/beach',
  grade: tint(1, 0.8, 0.74),
  packs: [{ ...MIXED_BAG, models: ['umbrella_green', 'guitar_A'] }],
  shapes: {
    sand: [[box(WALL_W, 1, 30).translate(0, -0.5, 12), '#a8704e']],
    log: [[rod(0.32, 3.4).rotateZ(1.5708).translate(0, 0.3, 0), '#5a3628']],
    bonfire: [
      [rod(0.11, 1.8).rotateZ(1.2).translate(0, 0.3, 0.1), '#2e1c18'], [rod(0.11, 1.8).rotateZ(-1.2).translate(0, 0.3, -0.1), '#2e1c18'], [rod(0.11, 1.7).rotateX(1.2).translate(0, 0.3, 0), '#2e1c18'],
      ...[0, 1, 2, 3, 4, 5, 6].map(i => [ball(0.2).translate(Math.cos(i * 0.9) * 1, 0.12, Math.sin(i * 0.9) * 0.8), '#6a4a4e']),
    ],
    coals: [[box(0.8, 0.1, 0.5).translate(0, 0.22, 0), '#ff7a30'], [box(0.5, 0.1, 0.7).translate(0, 0.28, 0), '#f8b460']],
    rock_low: [[ball(0.8).scale(1.3, 0.6, 1).translate(0, 0.35, 0), '#6a4a4e'], [ball(0.5).scale(1.2, 0.7, 1).translate(0.9, 0.22, 0.2), '#6a4a4e']],
    dusk: [
      [box(WALL_W, 30, 0.5).translate(0, 15, 0), '#2a2050'], [box(WALL_W, 6.4, 0.6).translate(0, 3.2, 0), '#5e3470'], [box(WALL_W, 5, 0.7).translate(0, 2.5, 0), '#a64a68'],
      [box(WALL_W, 3.9, 0.8).translate(0, 1.95, 0), '#e07a4e'], [box(WALL_W, 3, 0.9).translate(0, 1.5, 0), '#f8b460'],
    ],
    sun: [[ball(1.5).scale(1, 1, 0.1), '#ffe6a0']],
    sea: [[box(WALL_W, 2.5, 0.2).translate(0, 1.25, 0), '#2a3a68'], [box(WALL_W, 1.7, 0.3).translate(0, 0.85, 0), '#223058'], [box(WALL_W, 0.9, 0.4).translate(0, 0.45, 0), '#e07a4e']],
    palms: [[tube([[0.8, -0.2], [0.4, 2], [0.5, 4.2], [1.1, 6.2]], 0.2), '#1c1428'], ...fronds(1.1, 6.2)],
    gull: [[tube([[-0.5, 0.2], [-0.22, 0.27], [0, 0.06], [0.22, 0.27], [0.5, 0.2]], 0.035), '#1c1428']],
  },
}

const CONCERT = {
  dir: 'jam/stage',
  grade: tint(0.76, 0.74, 0.96),
  packs: [{ ...MIXED_BAG, models: ['guitar_A'] }],
  shapes: {
    curtain: [
      [box(WALL_W, 20, 1).translate(0, 10, -0.5), '#17141f'],
      ...[-14, -12, -10, -8, -6, -4, -2, 0, 2, 4, 6, 8, 10, 12, 14].map(x => [box(0.5, 20, 1.08).translate(x, 10, -0.5), '#211c2e']),
      [box(WALL_W, 1, 30).translate(0, -0.5, 12), '#100e18'],
    ],
    riser: [[box(26, 1.1, 3.4).translate(0, 0.55, 1.7), '#26222f'], [box(26, 0.1, 3.5).translate(0, 1.12, 1.7), '#46405a']],
    amp_stack: [
      [box(2.2, 1.5, 1).translate(0, 0.75, 0), '#14121a'], [box(1.9, 1.2, 0.05).translate(0, 0.75, 0.52), '#3a3442'],
      [box(2.2, 1.3, 1).translate(0, 2.15, 0), '#14121a'], [box(1.9, 0.9, 0.05).translate(0, 2.05, 0.52), '#3a3442'], [box(1.9, 0.2, 0.05).translate(0, 2.65, 0.52), '#b89a60'],
    ],
    drums: [
      [rod(0.62, 0.5).rotateX(1.5708).translate(0, 0.62, 0), '#7a2238'], [rod(0.3, 0.26).translate(-0.9, 0.82, 0.2), '#d8d0c8'], [rod(0.3, 0.26).translate(0.9, 0.82, 0.2), '#7a2238'],
      [rod(0.4, 0.05).translate(-1.5, 1.5, 0), '#b89a60'], [rod(0.4, 0.05).translate(1.5, 1.4, 0), '#b89a60'], [rod(0.03, 1.5).translate(-1.5, 0.75, 0), '#6a6474'], [rod(0.03, 1.4).translate(1.5, 0.7, 0), '#6a6474'],
    ],
    mic_stand: [[rod(0.05, 4).translate(0, 2, 0), '#6a6474'], [rod(0.04, 2).rotateZ(1.1).translate(-0.8, 4.4, 0), '#6a6474'], [rod(0.17, 0.5).rotateZ(0.5).translate(-1.75, 4.9, 0), '#14121a']],
    truss: [[box(25, 0.1, 0.1), '#6a6474'], ...Array.from({ length: 13 }, (_, i) => [box(0.06, 0.66, 0.06).translate(-12 + i * 2, -0.33, 0), '#6a6474'])],
    logo_wall: [[tube([[-2, 2.7], [-1, 4.3], [0, 2.7], [1, 4.3], [2, 2.7]], 0.05), '#46405a']],
    can: [[cone(0.2, 0.28, 0.5).translate(0, -0.05, 0), '#ece6ff']],
    fan: [[ball(0.3).translate(0, 1.42, 0), '#07060c'], [box(0.86, 1.15, 0.3).translate(0, 0.6, 0), '#07060c']],
    roadie: person('#07060c'),
  },
}

const SPACE = {
  dir: 'jam/space',
  grade: tint(0.74, 0.8, 0.96),
  packs: [
    { ...SPACE_BASE, models: ['containers_A', 'cargo_A'] },
    { ...FURNITURE, models: ['couch_pillows', 'rug_rectangle_A', 'cactus_medium_B'] },
  ],
  shapes: {
    hull: [
      [box(WALL_W, 13, 1).translate(0, 13.5, -0.5), '#2c3048'], [box(WALL_W, 0.9, 1).translate(0, 0.45, -0.5), '#2c3048'],
      [box(23, 20, 1).translate(-24.5, 10, -0.5), '#2c3048'], [box(23, 20, 1).translate(24.5, 10, -0.5), '#2c3048'],
    ],
    floor: [[box(WALL_W, 1, 30).translate(0, -0.5, 12), '#3e4258']],
    void: [[box(80, 40, 0.4).translate(0, 16, 0), '#060818']],
    porthole: [[box(0.22, 6.2, 0.4).translate(-6.5, 3.9, 0), '#10121e'], [box(0.22, 6.2, 0.4).translate(6.5, 3.9, 0), '#10121e'], [box(26, 0.14, 0.3).translate(0, 4.6, 0), '#10121e']],
    desk: [[box(2.6, 1.4, 1).translate(0, 0.7, 0), '#232638'], [box(2.2, 0.8, 0.1).rotateX(-0.5).translate(0, 1.7, -0.1), '#14162a']],
    desk_lights: [-0.8, -0.4, 0, 0.4, 0.8].flatMap((x, i) => [[box(0.2, 0.08, 0.04).translate(x, 1.5, 0.2), i % 2 ? '#4fe3cf' : '#ffb04f'], [box(0.2, 0.08, 0.04).translate(x, 1.84, 0.1), i % 3 ? '#7fa0ff' : '#ff6f8f']]),
    planet: [
      [ball(2.6), '#3a70c8'],
      ...[[0.2, 1.2, 2.2, 1.4], [-1.8, 0.3, 1.8, 1.1], [1.9, -0.6, 1.5, 1], [-0.4, -1.5, 2, 1], [-1, 0.8, -2.2, 1.2], [1.2, 0.2, -2.2, 1], [0.2, -1, -2.3, 1.3], [2.3, 0.6, -0.8, 0.8], [-2.4, -0.5, -0.7, 0.8]]
        .map(([x, y, z, r], i) => [ball(r).translate(x, y, z).scale(0.98, 0.98, 0.98), i % 2 ? '#d8c890' : '#5aa86a']),
      [new THREE.TorusGeometry(3.7, 0.14, 6, 40).rotateX(1.5708), '#c8b8e0'],
    ],
    satellite: [[box(0.5, 0.36, 0.3), '#c8ccd8'], [box(1, 0.3, 0.04).translate(-0.82, 0, 0), '#3a5ab0'], [box(1, 0.3, 0.04).translate(0.82, 0, 0), '#3a5ab0']],
  },
}

// ── The worlds after Monster Hollow ─────────────────────────────────────────────
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

const WORLDS = [HOLLOW, STUDIO, CAFE, ROADHOUSE, ROOFTOP, BEACH, CONCERT, SPACE, DEEP_SONG, KITE_FESTIVAL, ORBIT_STATION, MIDNIGHT_JOB, SUMMIT]
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
