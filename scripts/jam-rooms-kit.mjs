// ── The Jam rooms, cut and folded: every model is ours, on the Arcade's paper kit ──
// Same recipe as arcade-paper-kit.mjs: every part is [geometry, colour], already moved
// into place, in Pliage colours. Thin sheets, creased folds, few facets. A model keeps
// the footprint src/jam/room/rooms.ts places it by. Mood comes from each room's lights.
import * as THREE from 'three'
import { FOLDS, PAPER as P } from './arcade-paper-kit.mjs'

const { flat, card, band, folded, box, rod, cone, gem, at } = FOLDS
const TURN = Math.PI / 2
const WIDE = 70

// A sheet folded like a fan: `panel` wide, `depth` from crease to crease, facing +z
function pleats(width, height, panel, depth) {
  const count = Math.ceil(width / panel)
  const corner = i => [-width / 2 + i * panel, i % 2 ? depth : 0]
  const position = []
  for (let i = 0; i < count; i++) {
    const [x0, z0] = corner(i), [x1, z1] = corner(i + 1)
    position.push(x0, 0, z0, x1, 0, z1, x1, height, z1, x0, 0, z0, x1, height, z1, x0, height, z0)
  }
  const sheet = new THREE.BufferGeometry()
  sheet.setAttribute('position', new THREE.Float32BufferAttribute(position, 3))
  return flat(sheet)
}

// The same fold laid flat, running from the back wall towards the camera
const floorSheet = (color, panel = 5.5) => [[pleats(WIDE, 30, panel, 0.05).rotateX(-TURN).translate(0, 0, 30), color]]

// A scissor cut across a backdrop: everything under a wavy line, on thin card
function cutBand(top, wave, seed, width = 90) {
  const steps = 34
  const edge = Array.from({ length: steps + 1 }, (_, i) => {
    const x = -width / 2 + i * width / steps
    return [x, top + wave * (Math.sin(x * 0.31 + seed) + 0.6 * Math.sin(x * 0.83 + seed * 2.3))]
  })
  return card([[-width / 2, -1], [width / 2, -1], ...edge.reverse()], 0.05)
}

// Layers back to front, each showing a pale cut edge above the colour in front of it
const layered = (layers, edge) => layers.flatMap(([top, wave, color], i) => [
  [at(cutBand(top + 0.07, wave, i * 1.9 + 0.4), [0, 0, i * 0.12 - 0.04]), edge],
  [at(cutBand(top, wave, i * 1.9 + 0.4), [0, 0, i * 0.12]), color],
])

const wallSheet = (color, wainscot, trim) => [
  [pleats(WIDE, 20, 4.2, 0.07), color],
  [at(box(WIDE, wainscot, 0.08), [0, wainscot / 2, 0.08]), trim],
]
const tube = (points, r = 0.07) => flat(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(([x, y]) => new THREE.Vector3(x, y, 0))), points.length * 4, r, 4))
const disc = (r, sides = 10, depth = 0.05) => at(rod(r, depth, sides), [0, 0, 0], [TURN, 0, 0])

// ── Furniture and small things, shared between rooms ──
const sofa = (body, cushion) => [
  [at(box(2.7, 0.42, 1.25), [0, 0.42, 0.08]), body],
  [at(box(3, 0.95, 0.16), [0, 0.84, -0.6], [-0.1, 0, 0]), body],
  ...[-1, 1].flatMap(side => [
    [at(box(0.24, 0.72, 1.45), [side * 1.38, 0.44, 0.04]), body],
    [at(cone(0.05, 0.09, 0.1, 4), [side * 1.3, 0.05, 0.62]), P.ink],
    [at(cone(0.05, 0.09, 0.1, 4), [side * 1.3, 0.05, -0.5]), P.ink],
    [at(box(0.72, 0.56, 0.13), [side * 0.74, 0.86, -0.28], [-0.42, 0, side * 0.14]), cushion],
  ]),
]

const floorLamp = shade => [
  [at(cone(0.12, 0.42, 0.1, 6), [0, 0.05, 0]), P.ink],
  [at(rod(0.035, 1.8), [0, 0.95, 0]), P.ink],
  [at(cone(0.24, 0.5, 0.72, 6), [0, 2.16, 0]), shade],
]
const tableLamp = shade => [
  [at(gem(0.22), [0, 0.22, 0]), P.blue],
  [at(rod(0.03, 0.3), [0, 0.5, 0]), P.ink],
  [at(cone(0.22, 0.46, 0.42, 6), [0, 0.8, 0]), shade],
]

const LEAF = [[0, 0], [0.17, 0.32], [0.13, 0.62], [0, 0.92], [-0.13, 0.62], [-0.17, 0.32]]
const plant = (pot, leaves = 6, size = 1) => [
  [at(cone(0.42 * size, 0.3 * size, 0.42 * size, 6), [0, 0.21 * size, 0]), pot],
  [at(rod(0.45 * size, 0.05, 6), [0, 0.43 * size, 0]), pot],
  ...Array.from({ length: leaves }, (_, i) => [
    at(card(LEAF.map(([x, y]) => [x * size, y * size])), [0, 0.4 * size, 0], [0.32 + (i % 2) * 0.32, i * 2.4, 0]),
    i % 3 === 2 ? P.lime : P.teal,
  ]),
]

const BODY = [[-0.2, -1.33], [0.2, -1.33], [0.38, -1.18], [0.42, -0.98], [0.34, -0.8], [0.24, -0.68], [0.3, -0.52], [0.26, -0.38], [0.12, -0.34], [0.08, -0.46], [-0.08, -0.4], [-0.14, -0.3], [-0.26, -0.36], [-0.3, -0.52], [-0.24, -0.68], [-0.34, -0.8], [-0.42, -0.98], [-0.38, -1.18]]
const guitar = (body, guard) => [
  [card(BODY, 0.12), body],
  [at(card([[-0.14, -1.14], [0.18, -1.14], [0.1, -0.74], [-0.06, -0.74]]), [0, 0, 0.07]), guard],
  [at(box(0.3, 0.04, 0.02), [0, -1.02, 0.1]), P.ink],
  [at(box(0.3, 0.04, 0.02), [0, -0.82, 0.1]), P.ink],
  [at(box(0.1, 1.05, 0.05), [0, 0, 0.05]), P.kraft],
  [at(card([[-0.07, 0.5], [0.07, 0.5], [0.1, 0.72], [-0.02, 0.76], [-0.1, 0.7]], 0.06), [0, 0, 0.05]), body],
]

const cafeChair = (seat, back) => [
  [at(box(0.68, 0.08, 0.68), [0, 0.56, 0]), seat],
  ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, z]) => [at(cone(0.04, 0.03, 0.54, 4), [x * 0.28, 0.27, z * 0.28]), back]),
  [at(card([[-0.34, 0], [0.34, 0], [0.3, 0.62], [0.12, 0.66], [0, 0.6], [-0.12, 0.66], [-0.3, 0.62]]), [0, 0.58, -0.34], [-0.12, 0, 0]), back],
]
const stool = (seat, leg, foot) => [
  [at(rod(0.55, 0.16, 8), [0, 1.9, 0]), seat],
  [at(band(0.56, 0.05, 8, 0.03), [0, 1.82, 0]), P.ink],
  [at(rod(0.07, 1.8), [0, 0.9, 0]), leg],
  [at(band(0.42, 0.05, 8, 0.05), [0, 0.7, 0]), leg],
  [at(cone(0.3, 0.5, 0.08, 8), [0, 0.04, 0]), foot],
]
const rugSheet = (a, b) => [
  [at(box(3, 0.05, 2), [0, 0.025, 0]), a],
  ...[-1, 0, 1].map(i => [at(box(0.34, 0.06, 2), [i * 0.9, 0.03, 0]), b]),
]
const lowTable = () => [
  [at(box(2.4, 0.08, 1.5), [0, 0.46, 0]), P.kraft],
  ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, z]) => [at(cone(0.06, 0.04, 0.42, 4), [x * 1, 0.21, z * 0.6]), P.ink]),
]
const pendant = shade => [
  [at(rod(0.025, 8, 4), [0, 4.3, 0]), P.ink],
  [at(cone(0.24, 0.9, 0.7, 6), [0, -0.05, 0]), shade],
  [at(rod(0.28, 0.06, 6), [0, 0.32, 0]), P.ink],
]
const lampShine = color => [[rod(0.86, 0.04, 6), color]]

// Cut from one card: arched back, a head, two ears, and a tail that curls
const CAT = [[-0.34, 0], [-0.3, 0.3], [-0.5, 0.48], [-0.46, 0.7], [-0.4, 0.5], [-0.24, 0.42], [0.2, 0.42], [0.26, 0.6], [0.3, 0.78], [0.38, 0.68], [0.46, 0.68], [0.54, 0.78], [0.58, 0.58], [0.5, 0.4], [0.34, 0.34], [0.3, 0], [0.2, 0], [0.16, 0.2], [-0.16, 0.2], [-0.2, 0]]
const cat = color => [[card(CAT, 0.05), color]]

const PERSON = [[-0.36, 0], [0.36, 0], [0.4, 1.3], [0.2, 1.44], [0.16, 1.5], [0.26, 1.72], [0, 1.9], [-0.26, 1.72], [-0.16, 1.5], [-0.2, 1.44], [-0.4, 1.3]]
const person = color => [[card(PERSON, 0.06), color]]

const micStand = (head, pole) => [
  ...[0, 2.1, 4.2].map(turn => [at(card([[0, -0.05], [0.55, -0.03], [0.55, 0.03], [0, 0.05]]), [0, 0.04, 0], [TURN, turn, 0]), pole]),
  [at(rod(0.04, 4), [0, 2, 0]), pole],
  [at(rod(0.035, 2), [-0.8, 4.4, 0], [0, 0, 1.1]), pole],
  [at(cone(0.17, 0.13, 0.5, 6), [-1.75, 4.9, 0], [0, 0, 0.5]), P.ink],
  [at(gem(0.22), [-1.97, 5.2, 0]), head],
]

const ampFront = (x, y, r, z) => [
  [at(disc(r, 10), [x, y, z]), P.shadow],
  [at(disc(r * 0.34, 8), [x, y, z + 0.04]), P.ink],
]
const amp = [
  [at(box(2.4, 2.2, 1.1), [0, 1.1, 0]), P.ink],
  [at(box(2.1, 1.35, 0.05), [0, 0.95, 0.57]), P.kraft],
  ...ampFront(0, 0.95, 0.58, 0.6),
  [at(box(2.1, 0.38, 0.05), [0, 1.88, 0.57]), P.card],
  ...[-0.7, -0.25, 0.2].map(x => [at(rod(0.08, 0.1), [x, 1.88, 0.62], [TURN, 0, 0]), P.ink]),
  [at(gem(0.06), [0.72, 1.88, 0.62]), P.coral],
  [at(box(0.8, 0.08, 0.2), [0, 2.25, 0]), P.shadow],
]

const shelfBoard = [
  [at(box(2, 0.08, 0.5), [0, 0.06, 0.25]), P.kraft],
  ...[-0.7, 0.7].map(x => [at(card([[0, 0], [0, -0.3], [0.04, -0.3], [0.42, 0]]), [x, 0.02, 0.02], [0, -TURN, 0]), P.ink]),
]
const books = [P.blue, P.sun, P.teal, P.coral, P.paper, P.pink].map((color, i) => [at(box(0.11, 0.42 + (i % 3) * 0.05, 0.3), [-0.3 + i * 0.12, 0.02, 0], [0, 0, i === 5 ? -0.16 : 0]), color])

// ── A curved card cut-out of a trunk with fronds, seen from the shore ──
const FROND = [[0, 0], [0.5, 0.24], [1.3, 0.3], [2.3, -0.1], [2.5, -0.5], [1.9, -0.2], [1.7, -0.5], [1.2, -0.16], [1, -0.42], [0.6, -0.1]]
const palms = color => [
  [card([[0.45, -0.2], [1.15, -0.2], [0.8, 2], [1, 4.2], [1.55, 6.2], [1.25, 6.3], [0.6, 4.2], [0.3, 2]], 0.06), color],
  ...[0.3, -0.35, -1, 2.8, 3.5, 4.2].map(turn => [at(card(FROND, 0.05), [1.4, 6.2, 0], [0, 0, turn]), color]),
  ...[[1.2, 6], [1.62, 6.04]].map(([x, y]) => [at(gem(0.2), [x, y, 0.05]), color]),
]

// ── Rooms ──
const PINK_TUBES = [
  [[-1, -0.7], [-1.3, -0.95], [-1.65, -0.8], [-1.5, -0.5], [-1.1, -0.5], [-0.95, -0.7]],
  [[-0.97, -0.7], [-0.97, 0.9]],
  [[0.4, -0.5], [0.1, -0.75], [-0.25, -0.6], [-0.1, -0.3], [0.3, -0.3], [0.45, -0.5]],
  [[0.43, -0.5], [0.43, 1.1]],
]

const barrel = (height, r, wood, hoop) => [
  [at(folded([[r * 0.8, 0], [r, height * 0.5], [r * 0.8, height]], 8), [0, 0, 0]), wood],
  [at(rod(r * 0.78, 0.04, 8), [0, height, 0]), hoop],
  ...[0.2, 0.8].map(k => [at(band(r * (k === 0.5 ? 1 : 0.96), 0.14, 8, 0.04), [0, height * k, 0]), hoop]),
]
const bottle = (r, color, label) => [
  [at(folded([[r * 0.7, 0], [r, 0.08], [r, 0.5], [r * 0.34, 0.68], [r * 0.28, 0.86]], 6), [0, 0, 0]), color],
  [at(band(r * 1.02, 0.2, 6, 0.02), [0, 0.3, 0]), label],
  [at(rod(r * 0.3, 0.06, 6), [0, 0.87, 0]), P.kraft],
]

const CITY = [[-11, 3, 3.4], [-7.4, 2.6, 4.3], [-3.8, 3, 3], [-0.4, 2.4, 4.6], [3, 3, 3.6], [6.4, 2.6, 4.2], [10, 3.4, 3.2]]
const windowsOf = (x, w, h, rows) => Array.from({ length: rows * 4 }, (_, i) => {
  const col = i % 4, row = (i - col) / 4
  return (i * 7) % 5 === 0 ? null : [at(pleats(0.22, 0.28, 0.22, 0), [x - w / 2 + (col + 0.7) * w / 4.4, 0.7 + (row + 0.5) * (h - 0.9) / rows, 0]), (i * 3) % 7 === 0 ? P.blue : P.sun]
}).filter(Boolean)

const CAFE_SKYLINE = [[-3, 1.8], [-2, 2.8], [-0.9, 1.4], [0.3, 2.2], [1.5, 3.2], [2.8, 1.9]]
const CONTINENTS = [[0.2, 1.2, 2.2, 1.4], [-1.8, 0.3, 1.8, 1.1], [1.9, -0.6, 1.5, 1], [-0.4, -1.5, 2, 1], [-1, 0.8, -2.2, 1.2], [1.2, 0.2, -2.2, 1], [0.2, -1, -2.3, 1.3], [2.3, 0.6, -0.8, 0.8], [-2.4, -0.5, -0.7, 0.8]]

export const JAM_ROOMS = {
  studio: {
    wall: wallSheet(P.shadow, 1.5, P.ink),
    floor: floorSheet(P.kraft),
    foam: [
      [box(2.2, 2.2, 0.08), P.rockDark],
      ...Array.from({ length: 16 }, (_, i) => [at(cone(0, 0.3, 0.2, 4), [-0.825 + (i % 4) * 0.55, -0.825 + Math.floor(i / 4) * 0.55, 0.12], [TURN, TURN / 2, 0]), (i + Math.floor(i / 4)) % 2 ? P.rock : P.rockDark]),
    ],
    mic_stand: micStand(P.card, P.ink),
    amp,
    mixer: [
      [at(box(4.4, 1, 1.3), [0, 0.5, 0]), P.ink],
      [at(box(4.4, 0.1, 1.5), [0, 1.08, 0], [0.32, 0, 0]), P.rockDark],
      ...Array.from({ length: 10 }, (_, i) => [at(box(0.1, 0.05, 0.42), [-1.9 + i * 0.42, 1.16, 0.12 - (i % 3) * 0.05], [0.32, 0, 0]), P.ink]),
      ...Array.from({ length: 10 }, (_, i) => [at(box(0.2, 0.08, 0.1), [-1.9 + i * 0.42, 1.2, 0.2 - (i % 4) * 0.1], [0.32, 0, 0]), [P.sun, P.paper, P.pink][i % 3]]),
    ],
    booth_frame: [
      [at(box(8.8, 0.35, 0.5), [0, 5.2, 0]), P.ink], [at(box(8.8, 0.45, 0.8), [0, 0, 0.1]), P.ink],
      [at(box(0.35, 5.2, 0.5), [-4.3, 2.6, 0]), P.ink], [at(box(0.35, 5.2, 0.5), [4.3, 2.6, 0]), P.ink], [at(box(0.14, 5.2, 0.3), [0, 2.6, 0]), P.ink],
    ],
    booth_inside: [
      [at(box(7, 0.9, 0.2), [0, 0.6, 0]), P.ink],
      [at(card(PERSON, 0.05), [-1.3, 0.9, 0], [0, 0, 0]), P.ink],
      ...[-3.4, 3.4].map(x => [at(box(0.7, 1.2, 0.2), [x, 3.8, 0]), P.ink]),
    ],
    booth_glass: [[at(box(8.4, 5, 0.1), [0, 2.6, 0]), P.teal]],
    booth_lights: [-2.6, -2.2, -1.8, -1.4, -1, 1, 1.4, 1.8, 2.2, 2.6].map((x, i) => [at(box(0.14, 0.14, 0.05), [x, 0.82, 0]), i % 3 ? P.lime : P.sun]),
    tally: [[box(1.5, 0.5, 0.06), P.coral]],
    engineer: person(P.ink),
    sofa: sofa(P.kraft, P.blue),
    lamp_standing: floorLamp(P.card),
    lamp_table: tableLamp(P.card),
    rug_stripes: rugSheet(P.sun, P.coral),
    cabinet: [
      [at(box(1, 1, 1), [0, 0.5, 0]), P.coral],
      ...[0.3, 0.72].flatMap(y => [[at(box(0.84, 0.32, 0.03), [0, y, 0.51]), P.card], [at(gem(0.05), [0, y, 0.55]), P.ink]]),
    ],
    plant: plant(P.coral),
    guitar: guitar(P.blue, P.paper),
  },
  cafe: {
    wall: [...wallSheet(P.coral, 3, P.kraft), [at(box(WIDE, 0.12, 0.1), [0, 3, 0.16]), P.paper]],
    floor: floorSheet(P.kraft),
    pane_frame: [
      [at(box(7.6, 0.3, 0.5), [0, 5.6, 0]), P.ink], [at(box(7.8, 0.3, 0.8), [0, 0, 0.1]), P.ink],
      [at(box(0.3, 5.6, 0.5), [-3.7, 2.8, 0]), P.ink], [at(box(0.3, 5.6, 0.5), [3.7, 2.8, 0]), P.ink],
      [at(box(0.12, 5.6, 0.3), [0, 2.8, 0]), P.ink], [at(box(7.4, 0.12, 0.3), [0, 3.8, 0]), P.ink],
    ],
    pane_night: [[at(box(7.3, 5.5, 0.1), [0, 2.8, 0]), P.blue]],
    skyline: CAFE_SKYLINE.map(([x, h]) => [at(box(1.1, h, 0.04), [x, h / 2 + 0.2, 0]), P.shadow]),
    lamp_hanging: pendant(P.teal),
    lamp_shine: lampShine(P.sun),
    cat: cat(P.ink),
    cup: [
      [at(rod(0.34, 0.03, 8), [0, 0.015, 0]), P.paper],
      [at(cone(0.2, 0.14, 0.3, 8), [0, 0.18, 0]), P.paper],
      [at(rod(0.17, 0.02, 8), [0, 0.33, 0]), P.kraft],
      [at(band(0.1, 0.03, 6, 0.03), [0.24, 0.18, 0], [TURN, 0, 0]), P.paper],
    ],
    counter: [
      [at(box(8, 2.3, 1.4), [0, 1.15, 0]), P.shadow],
      ...[-3, -1, 1, 3].map(x => [at(box(1.7, 1.8, 0.03), [x, 1.15, 0.71]), P.rockDark]),
      [at(box(8.3, 0.16, 1.7), [0, 2.4, 0]), P.kraft],
    ],
    jar: [[at(folded([[0.2, 0], [0.25, 0.1], [0.25, 0.5], [0.16, 0.56]], 6), [0, 0, 0]), P.paper], [at(rod(0.17, 0.09, 6), [0, 0.6, 0]), P.teal], [at(band(0.26, 0.16, 6, 0.02), [0, 0.3, 0]), P.kraft]],
    jar_wide: [[at(folded([[0.2, 0], [0.25, 0.1], [0.25, 0.5], [0.16, 0.56]], 6), [0, 0, 0]), P.linen], [at(rod(0.17, 0.09, 6), [0, 0.6, 0]), P.coral], [at(band(0.26, 0.16, 6, 0.02), [0, 0.3, 0]), P.sun]],
    jar_small: [[at(gem(0.27), [0, 0.27, 0]), P.coral]],
    plant_small: plant(P.paper, 4, 0.6),
    shelf: shelfBoard,
    books,
    frame: [
      [at(box(0.7, 0.9, 0.04), [0, 0, 0.04]), P.kraft],
      [at(box(0.56, 0.74, 0.03), [0, 0, 0.07]), P.paper],
      [at(card([[-0.26, -0.3], [-0.04, 0.12], [0.08, -0.06], [0.16, 0.04], [0.26, -0.3]]), [0, 0, 0.09]), P.blue],
      [at(gem(0.07), [0.12, 0.2, 0.09]), P.sun],
    ],
    cafe_table: [
      [at(rod(0.75, 0.06, 10), [0, 0.97, 0]), P.linen],
      [at(band(0.76, 0.05, 10, 0.02), [0, 0.92, 0]), P.ink],
      [at(rod(0.06, 0.9), [0, 0.47, 0]), P.ink],
      [at(cone(0.08, 0.42, 0.08, 8), [0, 0.04, 0]), P.ink],
    ],
    chair: cafeChair(P.teal, P.ink),
    chair_alt: cafeChair(P.sun, P.ink),
    menu: [
      [at(card([[-0.25, 0], [0.25, 0], [0.25, 0.75], [-0.25, 0.75]]), [0, 0, 0.08], [-0.2, 0, 0]), P.paper],
      [at(card([[-0.25, 0], [0.25, 0], [0.25, 0.75], [-0.25, 0.75]]), [0, 0, -0.08], [0.2, 0, 0]), P.kraft],
      [at(box(0.3, 0.03, 0.01), [0, 0.55, 0.05], [-0.2, 0, 0]), P.ink],
      [at(box(0.3, 0.03, 0.01), [0, 0.44, 0.07], [-0.2, 0, 0]), P.ink],
    ],
  },
  roadhouse: {
    wall: [
      ...wallSheet(P.coral, 1.2, P.ink),
      ...[-14, -12, -10, -8, -6, -4, -2, 0, 2, 4, 6, 8, 10, 12, 14].map(x => [at(box(0.06, 20, 0.1), [x + 0.9, 10, 0.08]), P.shadow]),
    ],
    floor: floorSheet(P.kraft),
    bar: [
      [at(box(14, 2.6, 1.4), [0, 1.3, 0]), P.shadow],
      ...[-5.6, -2.8, 0, 2.8, 5.6].map(x => [at(box(2.5, 2.1, 0.03), [x - 1.4, 1.3, 0.71]), P.kraft]),
      [at(box(14.4, 0.2, 1.9), [0, 2.7, 0]), P.kraft],
      [at(rod(0.05, 14, 5), [0, 0.35, 0.8], [0, 0, TURN]), P.sun],
    ],
    back_shelf: [[box(9, 0.1, 0.7), P.ink], [at(box(9, 0.1, 0.7), [0, 1.5, 0]), P.ink]],
    sign_board: [[box(5.4, 3.2, 0.08), P.ink]],
    sign_pink: [...PINK_TUBES.map(p => [tube(p), P.pink]), [tube([[-0.97, 0.9], [-0.3, 1.2], [0.43, 1.1]], 0.1), P.pink]],
    sign_blue: [[tube([[-2.3, -1.2], [-2.45, 0], [-2.3, 1.2], [0, 1.42], [2.3, 1.2], [2.45, 0], [2.3, -1.2], [0, -1.42], [-2.3, -1.2]]), P.teal]],
    lamp_hanging: pendant(P.coral),
    lamp_shine: lampShine(P.sun),
    cat: cat(P.ink),
    bar_stool: stool(P.pink, P.rock, P.ink),
    barrel: barrel(2, 0.9, P.kraft, P.shadow),
    barrel_small: barrel(1.02, 0.5, P.kraft, P.shadow),
    keg: [
      [at(barrel(1.7, 0.72, P.rock, P.ink)[0][0], [0.85, 0.82, 0], [0, 0, TURN]), P.rock],
      ...[0.3, 1.4].map(x => [at(band(0.74, 0.12, 8, 0.04), [x - 0.85, 0.82, 0], [0, 0, TURN]), P.ink]),
      ...[-0.6, 0.6].map(x => [at(card([[-0.1, 0], [0.1, 0], [0.5, 0.4], [-0.5, 0.4]]), [x, 0, 0], [0, TURN, 0]), P.shadow]),
    ],
    stool_table: [
      [at(box(1, 0.08, 1), [0, 0.96, 0]), P.kraft],
      ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, z]) => [at(box(0.1, 0.92, 0.1), [x * 0.38, 0.46, z * 0.38]), P.ink]),
    ],
    bottle: bottle(0.18, P.teal, P.paper),
    bottle_tall: bottle(0.18, P.coral, P.linen),
    bottle_wide: bottle(0.28, P.sun, P.ink),
    bottle_fat: bottle(0.36, P.lime, P.paper),
    guitar_alt: guitar(P.pink, P.ink),
  },
  rooftop: {
    deck: floorSheet(P.shadow),
    parapet: [[at(box(WIDE, 1.1, 0.5), [0, 0.55, 0]), P.ink], [at(box(WIDE, 0.08, 0.62), [0, 1.14, 0]), P.rockDark]],
    poles: [-11, 0, 11].map(x => [at(rod(0.05, 5.3, 4), [x, 2.65, 0]), P.ink]),
    sky: [[at(box(120, 34, 0.2), [0, 16, -0.2]), P.ink], ...layered([[7, 0.4, P.shadow]], P.blue)],
    moon: [[disc(0.9, 14), P.paper], ...[[-0.3, 0.2, 0.2], [0.26, -0.2, 0.14], [0.1, 0.44, 0.08]].map(([x, y, r]) => [at(disc(r, 6, 0.02), [x, y, 0.04]), P.card])],
    city_far: [-13, -9.4, -5.6, -1.6, 2.2, 5, 8.6, 12].map((x, i) => [at(box(3.6, 3.6 + (i * 2 % 5) * 0.5, 0.06), [x, 1.8 + (i * 2 % 5) * 0.25, 0]), P.rockDark]),
    city_near: CITY.flatMap(([x, w, h], i) => [
      [at(box(w, h, 0.06), [x, h / 2, 0]), P.ink],
      ...(i % 3 === 1 ? [[at(rod(0.03, 1, 4), [x + 0.5, h + 0.5, 0]), P.ink]] : [[at(card([[-0.4, 0], [0.4, 0], [0, 0.5]]), [x - 0.3, h, 0]), P.ink]]),
    ]),
    windows: CITY.flatMap(([x, w, h]) => windowsOf(x, w, h, Math.floor(h))),
    wire: [[tube([[-11, 5.2], [-8, 4.6], [-5.5, 4.2], [-3, 4.6], [0, 5.2], [3, 4.6], [5.5, 4.2], [8, 4.6], [11, 5.2]], 0.025), P.ink]],
    billboard: [[tube([[-1.2, -0.4], [-1.25, 0.5], [1.25, 0.5], [1.2, -0.4], [-1.2, -0.4]], 0.05), P.pink], [tube([[-0.8, -0.1], [-0.3, 0.2], [0.2, -0.1], [0.7, 0.2]], 0.05), P.teal]],
    sofa: sofa(P.coral, P.sun),
    lamp_standing: floorLamp(P.sun),
    rug_oval: [[at(rod(1.5, 0.05, 12), [0, 0.025, 0]), P.teal], [at(rod(1, 0.06, 12), [0, 0.03, 0]), P.paper]],
    table_low: lowTable(),
    chair_alt: cafeChair(P.blue, P.rock),
    plant: plant(P.coral),
  },
  beach: {
    sand: floorSheet(P.kraft),
    log: [[at(rod(0.32, 3.4, 7), [0, 0.3, 0], [0, 0, TURN]), P.shadow], ...[-1, 1].map(s => [at(disc(0.24, 7, 0.02), [s * 1.71, 0.3, 0], [0, TURN, 0]), P.kraft])],
    bonfire: [
      ...[-0.6, 0.6, 1.57].map((turn, i) => [at(rod(0.1, 1.8, 5), [0, 0.3, 0], [0, turn, 1.2 * (i % 2 ? -1 : 1)]), P.shadow]),
      ...[0, 1, 2, 3, 4, 5, 6].map(i => [at(gem(0.2), [Math.cos(i * 0.9), 0.12, Math.sin(i * 0.9) * 0.8]), P.rock]),
    ],
    coals: [[at(box(0.8, 0.1, 0.5), [0, 0.22, 0]), P.coral], [at(box(0.5, 0.1, 0.7), [0, 0.28, 0]), P.sun]],
    rock_low: [[gem(0.8).scale(1.3, 0.6, 1).translate(0, 0.35, 0), P.rock], [gem(0.5).scale(1.2, 0.7, 1).translate(0.9, 0.22, 0.2), P.rockDark]],
    umbrella: [
      [at(rod(0.05, 3.1, 4), [0, 1.55, 0], [0, 0, 0.1]), P.paper],
      [at(cone(0, 1.65, 0.58, 8), [-0.3, 2.9, 0]), P.coral],
      [at(band(1.66, 0.1, 8, 0.02), [-0.3, 2.62, 0]), P.paper],
    ],
    guitar: guitar(P.teal, P.paper),
    dusk: [[at(box(120, 34, 0.2), [0, 16, -0.2]), P.shadow], ...layered([[7.8, 0.4, P.blue], [6.4, 0.34, P.pink], [5, 0.3, P.coral], [3.7, 0.24, P.sun]], P.paper)],
    sun: [[disc(1.7, 16), P.sun], [at(disc(1.4, 16), [0, 0, 0.04]), P.paper]],
    sea: layered([[2.5, 0.05, P.blue], [1.7, 0.09, P.teal], [0.9, 0.12, P.kraft]], P.paper),
    palms: palms(P.ink),
    gull: [[at(card([[0, 0], [-0.3, 0.2], [-0.6, 0.12], [-0.3, 0.08], [0, -0.1], [0.3, 0.08], [0.6, 0.12], [0.3, 0.2]], 0.03), [0, 0.1, 0]), P.ink]],
  },
  stage: {
    curtain: [[pleats(WIDE, 20, 1.4, 0.3), P.shadow], ...floorSheet(P.ink)],
    riser: [[at(box(26, 1.1, 3.4), [0, 0.55, 1.7]), P.shadow], [at(box(26, 0.08, 3.5), [0, 1.13, 1.7]), P.rockDark]],
    amp_stack: [
      [at(box(2.2, 1.5, 1), [0, 0.75, 0]), P.ink], ...ampFront(-0.5, 0.75, 0.42, 0.52), ...ampFront(0.5, 0.75, 0.42, 0.52),
      [at(box(2.2, 1.3, 1), [0, 2.15, 0]), P.ink], ...ampFront(-0.5, 2.05, 0.38, 0.52), ...ampFront(0.5, 2.05, 0.38, 0.52),
      [at(box(1.9, 0.14, 0.04), [0, 2.65, 0.52]), P.kraft],
    ],
    drums: [
      [at(rod(0.62, 0.5, 10), [0, 0.62, 0], [TURN, 0, 0]), P.coral],
      [at(disc(0.5, 10), [0, 0.62, 0.27]), P.paper],
      [at(rod(0.3, 0.26, 8), [-0.9, 0.82, 0.2]), P.paper], [at(rod(0.3, 0.26, 8), [0.9, 0.82, 0.2]), P.coral],
      [at(rod(0.4, 0.04, 8), [-1.5, 1.5, 0], [0.12, 0, 0]), P.sun], [at(rod(0.4, 0.04, 8), [1.5, 1.4, 0], [0.12, 0, 0]), P.sun],
      [at(rod(0.025, 1.5, 4), [-1.5, 0.75, 0]), P.rock], [at(rod(0.025, 1.4, 4), [1.5, 0.7, 0]), P.rock],
    ],
    mic_stand: micStand(P.card, P.rock),
    truss: [[at(box(25, 0.08, 0.08), [0, 0, 0]), P.rock], ...Array.from({ length: 13 }, (_, i) => [at(box(0.05, 0.66, 0.05), [-12 + i * 2, -0.33, 0]), P.rock])],
    logo_wall: [[tube([[-2, 2.7], [-1, 4.3], [0, 2.7], [1, 4.3], [2, 2.7]], 0.05), P.rockDark]],
    can: [[at(cone(0.2, 0.28, 0.5, 6), [0, -0.05, 0]), P.paper]],
    fan: [[card([[-0.46, 0], [0.46, 0], [0.48, 0.84], [0.8, 1.74], [0.66, 1.78], [0.3, 1.1], [0.16, 1.16], [0.26, 1.34], [0, 1.6], [-0.26, 1.34], [-0.16, 1.16], [-0.46, 1.04]], 0.06), P.ink]],
    roadie: person(P.ink),
    guitar: guitar(P.blue, P.paper),
  },
  space: {
    hull: [
      [at(box(WIDE, 13, 0.6), [0, 13.5, -0.3]), P.shadow], [at(box(WIDE, 0.9, 0.6), [0, 0.45, -0.3]), P.shadow],
      [at(box(23, 20, 0.6), [-24.5, 10, -0.3]), P.shadow], [at(box(23, 20, 0.6), [24.5, 10, -0.3]), P.shadow],
    ],
    floor: floorSheet(P.rock),
    void: [[at(box(120, 40, 0.2), [0, 16, -0.2]), P.ink], ...layered([[3.6, 0.7, P.shadow]], P.blue)],
    porthole: [[at(box(0.22, 6.2, 0.2), [-6.5, 3.9, 0]), P.ink], [at(box(0.22, 6.2, 0.2), [6.5, 3.9, 0]), P.ink], [at(box(26, 0.14, 0.2), [0, 4.6, 0]), P.ink]],
    desk: [[at(box(2.6, 1.4, 1), [0, 0.7, 0]), P.ink], [at(box(2.2, 0.8, 0.08), [0, 1.7, -0.1], [-0.5, 0, 0]), P.shadow]],
    desk_lights: [-0.8, -0.4, 0, 0.4, 0.8].flatMap((x, i) => [[at(box(0.2, 0.08, 0.03), [x, 1.5, 0.2]), i % 2 ? P.teal : P.sun], [at(box(0.2, 0.08, 0.03), [x, 1.84, 0.1]), i % 3 ? P.blue : P.coral]]),
    planet: [
      [gem(2.6, 2), P.blue],
      ...CONTINENTS.map(([x, y, z, r], i) => {
        const reach = (2.6 - r * 0.22) / Math.hypot(x, y, z)
        return [at(gem(r * 0.8), [x * reach, y * reach, z * reach]), i % 2 ? P.sun : P.teal]
      }),
      [at(band(3.9, 0.06, 28, 0.7), [0, 0, 0]), P.rock],
    ],
    satellite: [[box(0.5, 0.36, 0.3), P.card], [at(box(1, 0.3, 0.03), [-0.82, 0, 0]), P.blue], [at(box(1, 0.3, 0.03), [0.82, 0, 0]), P.blue]],
    rug: rugSheet(P.teal, P.paper),
    sofa: sofa(P.linen, P.coral),
    crates: [
      [at(box(1, 0.8, 1), [0, 0.4, 0]), P.rockDark], [at(box(0.7, 0.6, 0.7), [0.1, 1.1, 0], [0, 0.4, 0]), P.coral],
      [at(box(1.02, 0.1, 1.02), [0, 0.4, 0]), P.sun],
    ],
    cargo: [[at(box(1.2, 1, 1), [0, 0.5, 0]), P.paper], [at(box(1.22, 0.3, 1.02), [0, 0.5, 0]), P.coral]],
    plant: plant(P.paper),
  },
}
