// ── Paper kit: the Arcade models no free pack has, folded from three.js shapes ──
// Same recipe as the Jam rooms' shapes in arcade-assets.mjs: every part is
// [geometry, colour], already moved into place, and each colour becomes one swatch
// of the world's palette band. Parts are cut and folded like card: thin sheets,
// creased folds and few facets, so they sit beside KayKit models under the paper
// material and read as part of the same diorama.
import * as THREE from 'three'

// Pliage colours, plus the paper tones the worlds share
export const PAPER = {
  sun: '#ffde3b', paper: '#fbf8f5', linen: '#f1e8de', ink: '#26242f',
  pink: '#ff5fc8', blue: '#5b7cff', lime: '#c0f02c', coral: '#ff7a5c', teal: '#2fb8a8',
  kraft: '#c9a26a', card: '#e6dccd', shadow: '#3d3a52', rock: '#9a9cb4', rockDark: '#7e8199',
}

// Crisp facets: every face keeps its own normal, the way a fold catches light.
// Indexed again afterwards, because merged props must all be indexed
function flat(geometry) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry
  g.computeVertexNormals()
  g.setIndex([...Array(g.attributes.position.count).keys()])
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2))
  return g
}

const SHEET = 0.04   // card thickness

// A flat cut-out: an outline in x/y, given a card's thickness along z
function card(points, depth = SHEET) {
  const outline = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)))
  return flat(new THREE.ExtrudeGeometry(outline, { depth, bevelEnabled: false }).translate(0, 0, -depth / 2))
}

// A ring of card, like a strip of paper taped into a loop: few sides, square edges
function band(radius, width, sides = 12, thickness = 0.12) {
  const profile = [[radius - thickness, -width / 2], [radius, -width / 2], [radius, width / 2], [radius - thickness, width / 2], [radius - thickness, -width / 2]]
  return flat(new THREE.LatheGeometry(profile.map(([x, y]) => new THREE.Vector2(x, y)), sides))
}

// A lathed body with few sides, so it reads as folded rather than turned
function folded(profile, sides = 6) {
  return flat(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), sides))
}

const box = (w, h, d) => flat(new THREE.BoxGeometry(w, h, d))
const rod = (r, h, sides = 6) => flat(new THREE.CylinderGeometry(r, r, h, sides))
const cone = (top, bottom, h, sides = 8) => flat(new THREE.CylinderGeometry(top, bottom, h, sides))
const gem = (r, detail = 0) => flat(new THREE.IcosahedronGeometry(r, detail))

// Move and turn a part; rotations are [x, y, z] in radians
function at(geometry, [x, y, z] = [0, 0, 0], [rx, ry, rz] = [0, 0, 0]) {
  return geometry.rotateX(rx).rotateY(ry).rotateZ(rz).translate(x, y, z)
}

// Two halves of a sheet bent along a crease through the origin (the y axis)
function crease(left, right, angle) {
  return [at(card(left), [0, 0, 0], [0, -angle, 0]), at(card(right), [0, 0, 0], [0, angle, 0])]
}

// A string of little paper bows, hanging from `from` and trailing down
function tail(from, count, step, color, sway = 0.12) {
  return [...Array(count).keys()].flatMap(i => {
    const [x, y, z] = [from[0] + Math.sin(i * 1.3) * sway, from[1] - step * (i + 1), from[2]]
    return [
      [at(card([[0, 0], [-0.16, 0.08], [-0.16, -0.08]]), [x, y, z]), color],
      [at(card([[0, 0], [0.16, 0.08], [0.16, -0.08]]), [x, y, z]), color],
    ]
  }).concat([[at(rod(0.008, step * count, 3), [from[0], from[1] - step * count / 2, from[2]]), PAPER.ink]])
}

// ── Deep Song: the listener's submarine and the reef it drifts through ─────────
const DEEP_SONG = {
  submarine: [
    // Hull: a folded capsule, nose to +x
    [at(folded([[0, -2.1], [0.55, -1.7], [0.85, -0.9], [0.9, 0.4], [0.75, 1.4], [0.35, 2], [0, 2.15]], 7), [0, 1.1, 0], [0, 0, -Math.PI / 2]), PAPER.sun],
    // Paper stripe round the middle
    [at(band(0.93, 0.32, 7, 0.06), [0.15, 1.1, 0], [0, 0, Math.PI / 2]), PAPER.coral],
    // Conning tower and its cap
    [at(folded([[0.5, 0], [0.48, 0.6], [0.36, 0.75], [0, 0.78]], 6), [-0.15, 1.85, 0], [0, Math.PI / 6, 0]), PAPER.sun],
    [at(box(0.9, 0.08, 0.5), [-0.15, 2.66, 0]), PAPER.coral],
    // Periscope
    [at(rod(0.05, 0.7), [-0.35, 3, 0]), PAPER.ink],
    [at(box(0.24, 0.12, 0.12), [-0.27, 3.34, 0]), PAPER.ink],
    // Portholes down the side, both sides
    ...[-0.9, 0, 0.9].flatMap(x => [1, -1].map(side => [at(rod(0.2, 0.06, 8), [x, 1.2, side * 0.86], [Math.PI / 2, 0, 0]), PAPER.paper])),
    ...[-0.9, 0, 0.9].flatMap(x => [1, -1].map(side => [at(rod(0.13, 0.08, 8), [x, 1.2, side * 0.88], [Math.PI / 2, 0, 0]), PAPER.blue])),
    // Fins: flat card, cut as triangles
    [at(card([[0, 0], [-0.7, 0.75], [-0.85, 0.75], [-0.6, 0]]), [-1.55, 1.75, 0]), PAPER.coral],
    [at(card([[0, 0], [-0.6, 0.55], [-0.75, 0.55], [-0.55, 0]]), [-1.55, 1.1, 0.75], [Math.PI / 2, 0, 0]), PAPER.coral],
    [at(card([[0, 0], [-0.6, 0.55], [-0.75, 0.55], [-0.55, 0]]), [-1.55, 1.1, -0.75], [-Math.PI / 2, 0, 0]), PAPER.coral],
    // Headlamp
    [at(cone(0.12, 0.22, 0.2, 8), [2.15, 1.05, 0], [0, 0, -Math.PI / 2]), PAPER.ink],
  ],
  // The propeller is its own model so the game can spin it; it sits at the tail
  submarine_propeller: [
    [at(rod(0.08, 0.3), [0, 0, 0], [0, 0, Math.PI / 2]), PAPER.ink],
    // Four card blades round the x axis, each pitched like a pinwheel
    ...[0, 1, 2, 3].map(i => [card([[0, -0.07], [0.55, -0.16], [0.6, 0.04], [0, 0.07]]).rotateX(0.5).rotateZ(Math.PI / 2).rotateX(i * Math.PI / 2), PAPER.coral]),
  ],
  // A cone of light the lamp throws: the game fades it
  submarine_beam: [[at(cone(0.15, 1.4, 4, 8), [2, 0, 0], [0, 0, Math.PI / 2]), '#fff2b8']],
  // Kelp: a ribbon of card folded in a zigzag, sized to sway from its root
  kelp_tall: [[zigzag(6, 0.5, 0.42, 0.6), PAPER.teal]],
  kelp_short: [[zigzag(4, 0.4, 0.34, 0.5), '#1f8f86']],
  // Sea fan: a flat cut-out on a short stem
  coral_fan: [
    [card(fan(9, 1.1)), PAPER.pink],
    [at(rod(0.06, 0.35), [0, -0.15, 0]), PAPER.pink],
  ],
  coral_branch: [
    [at(cone(0.07, 0.12, 0.9, 5), [0, 0.45, 0]), PAPER.coral],
    [at(cone(0.05, 0.08, 0.6, 5), [0.22, 0.75, 0], [0, 0, -0.7]), PAPER.coral],
    [at(cone(0.05, 0.08, 0.55, 5), [-0.2, 0.7, 0.05], [0.2, 0, 0.75]), PAPER.coral],
    [at(cone(0.04, 0.06, 0.4, 5), [0.05, 1.05, 0.1], [0.4, 0, 0.2]), PAPER.coral],
  ],
  shell: [[at(folded([[0.35, 0], [0.3, 0.12], [0.16, 0.2], [0, 0.22]], 7), [0, 0, 0], [0, 0, 0]).scale(1, 1, 0.8), PAPER.linen]],
  bubble: [[gem(0.18), '#cfe9ff']],
  // Sandy floor, cut as one wide card with a scalloped edge
  seabed: [[at(card(scallop(9, 3.6, 0.25)), [0, -0.02, 0], [-Math.PI / 2, 0, 0]).scale(1, 1, 1), '#d9c38f']],
}

// A ribbon of card pleated as it rises: `folds` panels, w wide and h tall each,
// swaying a little sideways. Both faces are built, so it reads from either side
function zigzag(folds, w, h, sway) {
  const rows = [...Array(folds + 1).keys()].map(i => {
    const y = i * h, z = (i % 2 ? 1 : -1) * h * 0.35, x = Math.sin(i * 0.8) * sway * 0.3 * i / folds
    const half = w / 2 * (1 - 0.6 * i / folds)
    return [[x - half, y, z], [x + half, y, z]]
  })
  const position = []
  for (let i = 0; i < folds; i++) {
    const [a, b] = rows[i], [c, d] = rows[i + 1]
    position.push(...a, ...b, ...d, ...a, ...d, ...c)   // front
    position.push(...a, ...d, ...b, ...a, ...c, ...d)   // back
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(position, 3))
  return flat(g)
}

// A fan's outline: ribs spread over half a circle
function fan(ribs, r) {
  const points = [[0, 0]]
  for (let i = 0; i <= ribs * 2; i++) {
    const a = Math.PI * (0.1 + 0.8 * i / (ribs * 2))
    const rr = i % 2 ? r * 0.82 : r
    points.push([Math.cos(a) * rr, Math.sin(a) * rr])
  }
  return points
}

// A disc with a wavy rim
function scallop(waves, r, depth) {
  return [...Array(waves * 6).keys()].map(i => {
    const a = i / (waves * 6) * Math.PI * 2
    const rr = r + Math.sin(a * waves) * depth
    return [Math.cos(a) * rr, Math.sin(a) * rr]
  })
}

function merge(geometries) {
  const out = new THREE.BufferGeometry()
  const position = [], normal = [], uv = []
  for (const g of geometries) {
    const n = g.toNonIndexed()
    position.push(...n.attributes.position.array)
    normal.push(...n.attributes.normal.array)
    uv.push(...(n.attributes.uv?.array ?? new Float32Array(n.attributes.position.count * 2)))
  }
  out.setAttribute('position', new THREE.Float32BufferAttribute(position, 3))
  out.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3))
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  out.setIndex([...Array(position.length / 3).keys()])
  return out
}

// ── Kite Festival: kites, a box kite, a windsock and bunting ────────────────────
// Kites face +z, nose up; the string ties on at the origin, a little below centre
function diamondKite(left, right) {
  return [
    ...crease([[0, 0.9], [0, -0.75], [-0.6, 0.25]], [[0, 0.9], [0.6, 0.25], [0, -0.75]], 0.18).map((g, i) => [g, i ? right : left]),
    [at(rod(0.015, 1.65, 4), [0, 0.08, -0.05]), PAPER.kraft],
    [at(rod(0.015, 1.2, 4), [0, 0.25, -0.05], [0, 0, Math.PI / 2]), PAPER.kraft],
    ...tail([0, -0.75, 0], 6, 0.28, left),
  ]
}

const KITE_FESTIVAL = {
  kite_diamond_sun: diamondKite(PAPER.sun, '#ffc21a'),
  kite_diamond_pink: diamondKite(PAPER.pink, '#ff3fae'),
  kite_diamond_blue: diamondKite(PAPER.blue, '#3f5fef'),
  // Delta: a wide triangle creased down the spine, with a keel underneath
  kite_delta: [
    ...crease([[0, 0.7], [0, -0.55], [-1.1, -0.55]], [[0, 0.7], [1.1, -0.55], [0, -0.55]], 0.22).map((g, i) => [g, i ? PAPER.lime : '#a6d81c']),
    [at(card([[0, 0.35], [0.45, -0.15], [0, -0.45]]), [0, 0, 0], [0, Math.PI / 2, 0]), '#a6d81c'],
    ...tail([-0.9, -0.55, 0], 3, 0.22, PAPER.pink, 0.05),
    ...tail([0.9, -0.55, 0], 3, 0.22, PAPER.pink, 0.05),
  ],
  // Box kite: two square paper bands on four sticks
  kite_box: [
    ...[0.55, -0.45].map(y => [at(band(0.45, 0.42, 4, 0.03), [0, y, 0], [0, Math.PI / 4, 0]), y > 0 ? PAPER.coral : PAPER.sun]),
    ...[[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([x, z]) => [at(rod(0.018, 1.6, 4), [x * 0.3, 0.05, z * 0.3]), PAPER.kraft]),
  ],
  // Fish windsock: an open folded tube, tapering to a forked tail, with paper fins
  windsock_fish: [
    [at(folded([[0.42, 0], [0.4, 0.5], [0.3, 1.2], [0.16, 1.7]], 8), [0, 0, 0], [0, 0, -Math.PI / 2]), PAPER.blue],
    [at(band(0.43, 0.14, 8, 0.03), [0.02, 0, 0], [0, 0, Math.PI / 2]), PAPER.sun],
    [at(card([[0, 0], [0.55, 0.35], [0.4, 0], [0.55, -0.35]]), [1.68, 0, 0]), PAPER.blue],
    ...[0.45, 0.95].map(x => [at(card([[0, 0], [0.25, 0.2], [0.3, 0]]), [x, 0.38 - x * 0.12, 0]), PAPER.sun]),
    ...[[-0.25, 0.22], [-0.25, -0.22]].map(([y, z]) => [at(rod(0.08, 0.04, 8), [0.22, y + 0.35, z], [Math.PI / 2, 0, 0]), PAPER.paper]),
  ],
  // A line of little flags, 4 units wide, hanging in a gentle curve
  bunting: [
    [at(rod(0.012, 4.1, 3), [0, 0, 0], [0, 0, Math.PI / 2]), PAPER.ink],
    ...[...Array(9).keys()].map(i => {
      const x = -1.8 + i * 0.45
      const sag = -0.25 * (1 - (x / 2) ** 2)
      return [at(card([[-0.16, 0], [0.16, 0], [0, -0.32]], 0.02), [x, sag, 0]), [PAPER.sun, PAPER.pink, PAPER.blue, PAPER.lime, PAPER.coral][i % 5]]
    }),
  ],
  // The flyer's string winder
  kite_spool: [
    [at(rod(0.09, 0.3, 6), [0, 0, 0], [0, 0, Math.PI / 2]), PAPER.kraft],
    ...[-0.16, 0.16].map(x => [at(rod(0.2, 0.03, 6), [x, 0, 0], [0, 0, Math.PI / 2]), '#8a6038']),
    [at(rod(0.04, 0.25, 4), [0, -0.2, 0]), '#8a6038'],
  ],
}

// ── Orbit Station: the rings that keep turning, and a paper sky ─────────────────
// Rings turn about y; the game spins each one at its own rate
const ORBIT_STATION = {
  station_hub: [
    [folded([[0, -0.9], [0.55, -0.75], [0.8, -0.3], [0.8, 0.3], [0.55, 0.75], [0, 0.9]], 8), PAPER.paper],
    [at(band(0.82, 0.22, 8, 0.05), [0, 0, 0]), PAPER.sun],
    [at(rod(0.12, 1.2, 6), [0, 1.4, 0]), PAPER.card],
    [at(gem(0.18), [0, 2.05, 0]), PAPER.pink],
    // Folded solar wings, either side: accordion card
    ...[1, -1].map(side => [at(accordion(5, 0.42, 0.9), [side * 1.25, 0, 0], [0, 0, 0]).scale(side, 1, 1), PAPER.blue]),
    ...[1, -1].map(side => [at(rod(0.04, 0.5, 4), [side * 0.98, 0, 0], [0, 0, Math.PI / 2]), PAPER.ink]),
  ],
  ring_inner: [
    [band(2.2, 0.38, 12, 0.18), PAPER.paper],
    [at(band(2.23, 0.1, 12, 0.04), [0, 0.12, 0]), PAPER.sun],
    ...spokes(3, 2.05, PAPER.ink),
  ],
  ring_outer: [
    [band(3.6, 0.5, 16, 0.22), PAPER.linen],
    [at(band(3.63, 0.12, 16, 0.04), [0, -0.14, 0]), PAPER.coral],
    // Window pods around the rim
    ...[...Array(8).keys()].map(i => [at(box(0.42, 0.34, 0.34), [Math.cos(i * Math.PI / 4) * 3.7, 0, Math.sin(i * Math.PI / 4) * 3.7], [0, -i * Math.PI / 4, 0]), PAPER.paper]),
    ...[...Array(8).keys()].map(i => [at(box(0.2, 0.14, 0.36), [Math.cos(i * Math.PI / 4) * 3.72, 0.02, Math.sin(i * Math.PI / 4) * 3.72], [0, -i * Math.PI / 4, 0]), PAPER.sun]),
    ...spokes(4, 3.4, PAPER.ink, Math.PI / 4),
  ],
  // A drifting-out-of-orbit warning ring, for when timing slips
  ring_warning: [[band(3.65, 0.06, 16, 0.05), PAPER.coral]],
  planet_paper: [
    [gem(1.6, 1), PAPER.coral],
    [at(band(2.5, 0.06, 12, 0.5), [0, 0, 0], [0.35, 0, 0.2]), PAPER.sun],
  ],
  moon_paper: [[gem(0.6, 0), PAPER.card]],
  star_paper: [[card(star(5, 0.3, 0.13)), PAPER.sun]],
  comet: [
    [gem(0.22, 0), PAPER.paper],
    ...[0, 1, 2].map(i => [at(card([[0, 0.1], [1.4 - i * 0.3, 0], [0, -0.1]], 0.02), [0.1, 0, 0], [i * 0.9, 0, (i - 1) * 0.12]), [PAPER.sun, PAPER.pink, PAPER.blue][i]]),
  ],
}

// Spokes from the hub out to a ring of radius r, lying flat in x/z
function spokes(count, r, color, offset = 0) {
  return [...Array(count).keys()].map(i => {
    const a = offset + i * Math.PI * 2 / count
    const g = rod(0.035, r, 4).rotateZ(Math.PI / 2).translate(r / 2, 0, 0).rotateY(a)
    return [g, color]
  })
}

// Accordion: `folds` panels pleated along x, h tall, total width w
function accordion(folds, w, h) {
  const step = w / folds
  return merge([...Array(folds).keys()].map(i =>
    at(card([[0, -h / 2], [step * 1.05, -h / 2], [step * 1.05, h / 2], [0, h / 2]], 0.02), [i * step * 0.94 - w / 2, 0, (i % 2) * 0.08], [0, (i % 2 ? 1 : -1) * 0.35, 0])))
}

// One sheet pleated into vertical folds, standing on y = 0: w wide, h tall,
// each crease pushed out by up to `depth`, with a ragged top edge
function pleat(w, h, folds, depth) {
  const xs = [...Array(folds + 1).keys()].map(i => -w / 2 + i * w / folds)
  const z = i => (i % 2 ? depth : 0) * (0.7 + 0.3 * Math.sin(i * 2.3))
  const top = i => h * (0.9 + 0.1 * Math.sin(i * 1.7))
  const position = []
  for (let i = 0; i < folds; i++) {
    const a = [xs[i], 0, z(i)], b = [xs[i + 1], 0, z(i + 1)], c = [xs[i + 1], top(i + 1), z(i + 1)], d = [xs[i], top(i), z(i)]
    position.push(...a, ...b, ...c, ...a, ...c, ...d)   // front
    position.push(...a, ...c, ...b, ...a, ...d, ...c)   // back
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(position, 3))
  return flat(g)
}

function star(points, outer, inner) {
  return [...Array(points * 2).keys()].map(i => {
    const a = Math.PI / 2 + i * Math.PI / points
    const r = i % 2 ? inner : outer
    return [Math.cos(a) * r, Math.sin(a) * r]
  })
}

// ── The Midnight Job: a mansion's rooms, from wallpaper to the vault ─────────────
// Walls face +z and are 4 wide, matching the dungeon's 4-unit grid
const WALL = 4
const MIDNIGHT_JOB = {
  mansion_wall: [
    [at(box(WALL, 5, 0.2), [0, 2.5, -0.1]), '#4a3d6e'],
    ...[...Array(8).keys()].map(i => [at(box(0.12, 3.4, 0.22), [-WALL / 2 + 0.25 + i * 0.5, 3.1, -0.1]), '#5a4d80']),
    [at(box(WALL, 1.4, 0.26), [0, 0.7, -0.07]), '#2e2440'],
    ...[-1.3, 0, 1.3].map(x => [at(box(1.05, 0.9, 0.28), [x, 0.7, -0.06]), '#3a2e52']),
    [at(box(WALL, 0.14, 0.32), [0, 1.42, -0.04]), PAPER.kraft],
    [at(box(WALL, 0.26, 0.36), [0, 4.9, -0.02]), PAPER.kraft],
  ],
  mansion_window: [
    [at(box(1.7, 2.9, 0.24), [0, 2.75, -0.08]), '#2e2440'],
    [at(card([[-0.7, 0], [0.7, 0], [0.7, 2.1], [0, 2.6], [-0.7, 2.1]], 0.1), [0, 1.4, 0.02]), '#1a2a48'],
    [at(box(0.06, 2.6, 0.12), [0, 2.65, 0.08]), '#2e2440'],
    [at(box(1.4, 0.06, 0.12), [0, 2.9, 0.08]), '#2e2440'],
    // Moon in the pane
    [at(rod(0.22, 0.04, 10), [0.36, 3.5, 0.1], [Math.PI / 2, 0, 0]), PAPER.paper],
    // Curtains: pleated card, gathered at the sides
    ...[-1, 1].map(side => [at(accordion(4, 0.55, 3.2), [side * 0.98, 2.75, 0.2]), '#a03048']),
    [at(box(2.4, 0.12, 0.12), [0, 4.4, 0.25]), PAPER.kraft],
  ],
  mansion_door: [
    [at(box(2.2, 3.6, 0.22), [0, 1.8, -0.06]), '#2e2440'],
    ...[-0.5, 0.5].map(x => [at(box(0.94, 3.3, 0.14), [x, 1.65, 0.06]), '#8a2c40']),
    ...[-0.5, 0.5].flatMap(x => [0.95, 2.35].map(y => [at(box(0.6, 0.9, 0.06), [x, y, 0.15]), '#a03048'])),
    ...[-0.1, 0.1].map(x => [at(gem(0.06), [x, 1.65, 0.2]), PAPER.sun]),
  ],
  // The vault: a round door in a thick frame, with a wheel the burglar turns
  vault_frame: [
    [at(box(3.4, 3.4, 0.5), [0, 1.9, -0.25]), '#5a5868'],
    [at(band(1.35, 0.5, 12, 0.25), [0, 1.9, 0], [Math.PI / 2, 0, 0]), '#8a8898'],
  ],
  vault_door: [
    [at(rod(1.12, 0.36, 12), [0, 0, 0], [Math.PI / 2, 0, 0]), '#b0aec0'],
    ...[...Array(8).keys()].map(i => [at(gem(0.07), [Math.cos(i * Math.PI / 4) * 0.95, Math.sin(i * Math.PI / 4) * 0.95, 0.2]), PAPER.ink]),
  ],
  vault_wheel: [
    [at(band(0.42, 0.08, 10, 0.06), [0, 0, 0], [Math.PI / 2, 0, 0]), PAPER.sun],
    ...[0, 1, 2].map(i => [at(rod(0.03, 0.84, 4), [0, 0, 0], [0, 0, i * Math.PI / 3]), PAPER.sun]),
    [at(rod(0.08, 0.12, 8), [0, 0, 0], [Math.PI / 2, 0, 0]), PAPER.ink],
  ],
  rug_grand: [
    [at(box(4.4, 0.04, 2.8), [0, 0.02, 0]), '#8a2c40'],
    [at(box(3.8, 0.05, 2.2), [0, 0.03, 0]), '#a03048'],
    [at(box(2.2, 0.06, 1.1), [0, 0.04, 0]), PAPER.kraft],
  ],
  chandelier: [
    [at(rod(0.025, 1.4, 4), [0, 0.7, 0]), PAPER.ink],
    [at(band(0.7, 0.08, 8, 0.05), [0, 0, 0]), PAPER.kraft],
    ...[...Array(6).keys()].map(i => [at(cone(0.04, 0.06, 0.24, 5), [Math.cos(i * Math.PI / 3) * 0.66, 0.16, Math.sin(i * Math.PI / 3) * 0.66]), PAPER.paper]),
    ...[...Array(6).keys()].map(i => [at(gem(0.06), [Math.cos(i * Math.PI / 3) * 0.66, 0.33, Math.sin(i * Math.PI / 3) * 0.66]), PAPER.sun]),
  ],
  // A guard's lamp beam, laid on the floor: the alarm zone the game tints
  lamp_beam: [[at(card([[0, 0], [3, -1.1], [3.2, 0], [3, 1.1]], 0.02), [0, 0.03, 0], [-Math.PI / 2, 0, 0]), '#fff2b8']],
  // The burglar's loot sack
  loot_sack: [
    [folded([[0, 0], [0.42, 0.05], [0.5, 0.35], [0.38, 0.7], [0.12, 0.82], [0.18, 0.95], [0, 0.98]], 6), PAPER.kraft],
    [at(band(0.15, 0.06, 6, 0.04), [0, 0.84, 0]), PAPER.ink],
  ],
}

// ── The Summit: a folded-paper mountain, its climbing face, flags and ropes ──────
const SUMMIT = {
  summit_flag: [
    [at(rod(0.04, 2.4, 5), [0, 1.2, 0]), PAPER.kraft],
    [at(card([[0, 0], [1.1, -0.28], [0, -0.6]]), [0.03, 2.35, 0]), PAPER.sun],
    [at(card([[0, 0], [0.5, -0.1], [0, -0.22]]), [0.05, 2.18, 0.03]), PAPER.coral],
    [at(rod(0.3, 0.12, 6), [0, 0.06, 0]), '#7a7a88'],
  ],
  rope_coil: [
    ...[0, 1, 2].map(i => [at(band(0.36 - i * 0.03, 0.08, 8, 0.07), [0, 0.05 + i * 0.08, 0]), PAPER.coral]),
  ],
  // An anchor bolt with a ring, for the rope between handholds
  piton: [
    [at(cone(0.02, 0.05, 0.3, 4), [0, 0, 0], [Math.PI / 2, 0, 0]), '#8a8898'],
    [at(band(0.09, 0.03, 6, 0.025), [0, 0, 0.18], [0, 0, 0]), PAPER.ink],
  ],
  // Handholds bolted to a cliff, in three sizes
  hold_small: [[gem(0.12, 0), PAPER.pink]],
  hold_medium: [[gem(0.18, 0).scale(1.3, 0.8, 0.7), PAPER.blue]],
  hold_large: [[gem(0.26, 0).scale(1.4, 0.7, 0.6), PAPER.lime]],
  // The mountain itself: creased card with a cut-paper snow cap. KayKit's
  // hexagon mountains stay for the foothills; these are the peaks
  paper_peak_A: peak(4.6, 8.4, 6, 1),
  paper_peak_B: peak(3.4, 5.6, 5, 2),
  paper_peak_C: peak(2.6, 4.2, 5, 3),
  // The face the climber works up: card pleated in tall folds, 4 wide and 7 high
  cliff_face: [
    [pleat(4.2, 7, 9, 0.35), PAPER.rock],
    [at(box(4.6, 0.3, 0.9), [0, 0.15, 0.1]), PAPER.rockDark],
    [at(card([[-2.15, 0], [-1.2, -0.5], [-0.3, -0.15], [0.6, -0.6], [1.5, -0.2], [2.15, -0.45], [2.15, 0.35], [-2.15, 0.35]], 0.12), [0, 6.25, 0.42]), PAPER.paper],
  ],
  // A lone cut-paper snow cap, for the tops of KayKit's own mountains
  snowcap: [[snowcap(0.62, 0.48, 7), PAPER.paper]],
  // A pup tent: one sheet folded over a ridge, with a darker door flap
  basecamp_tent: [
    [at(card([[-0.8, 0], [0.8, 0], [0, 0.95]], 1.7), [0, 0, 0]), PAPER.sun],
    [at(card([[-0.42, 0], [0.42, 0], [0, 0.6]], 0.03), [0, 0, 0.87]), PAPER.coral],
    [at(rod(0.025, 1.9, 4), [0, 0.96, 0], [Math.PI / 2, 0, 0]), PAPER.kraft],
  ],
}

// A creased-card mountain: a few-sided cone nudged out of true, rock below and
// snow above. `seed` picks which way each crease leans
function peak(radius, height, sides, seed) {
  const g = new THREE.ConeGeometry(radius, height, sides, 3)
  const position = g.attributes.position
  for (let i = 0; i < position.count; i++) {
    const y = position.getY(i)
    if (y > height / 2 - 1e-3 || y < -height / 2 + 1e-3) continue
    // Keyed on the vertex's place, not its index, so the cone's seam stays shut
    const a = Math.round(Math.atan2(position.getZ(i), position.getX(i)) * 100), h = Math.round(y * 100)
    const wobble = Math.sin(a * 12.9898 + h * 4.1414 + seed * 78.233) * 0.5 + 0.5
    position.setX(i, position.getX(i) * (0.8 + 0.4 * wobble))
    position.setZ(i, position.getZ(i) * (0.85 + 0.3 * (1 - wobble)))
  }
  g.translate(0, height / 2, 0)
  const cap = snowcap(radius * 0.42, height * 0.36, sides + 1).translate(0, height * 0.82, 0)
  return [[flat(g), seed % 2 ? PAPER.rock : PAPER.rockDark], [cap, PAPER.paper]]
}

// A cone of snow with a ragged, cut-paper hem
function snowcap(r, h, teeth) {
  const g = new THREE.ConeGeometry(r, h, teeth * 2, 1, true)
  const position = g.attributes.position
  for (let i = 0; i < position.count; i++) {
    if (position.getY(i) > -h / 2 + 1e-3) continue
    const a = Math.atan2(position.getZ(i), position.getX(i))
    const notch = Math.round(a / (Math.PI / teeth)) % 2 ? 0.18 * h : 0
    position.setY(i, position.getY(i) + notch)
  }
  return flat(g)
}

// The folding recipe, for the Jam rooms' own kit
export const FOLDS = { flat, card, band, folded, box, rod, cone, gem, at }

export const PAPER_KIT = { deepSong: DEEP_SONG, kiteFestival: KITE_FESTIVAL, orbitStation: ORBIT_STATION, midnightJob: MIDNIGHT_JOB, summit: SUMMIT }

// ── A climbing cycle for KayKit's humanoid rig, which ships without one ─────────
// Each limb bone is aimed at a direction in world space, then converted back to
// the rig's local rotations, so the cycle doesn't depend on how the bones' own
// axes point. The character faces +z, toward the cliff; `side` is +1 for the
// limb on its left (+x). One cycle: left hand reaches while the right foot steps
// up, then the other pair.
const CLIMB_SECONDS = 1.2
const CLIMB_KEYS = 13
const CLIMB_BOB = 0.14   // the body lifts as each pull finishes
const mix = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k)

// [bone, the bone it points at, aim(side, reach, step)]: reach and step run 0 to 1
// KayKit bodies are chibi: arms too short to clear the head, so a reach goes wide
// and high, and a pull tucks the hand in at the chest
const CLIMB_LIMBS = [
  ['upperarm', 'lowerarm', (side, reach) => mix([0.45 * side, -0.65, 0.6], [side, 0.5, 0.1], reach)],
  ['lowerarm', 'wrist', (side, reach) => mix([-0.1 * side, 0.55, 0.85], [0.45 * side, 1, 0], reach)],
  ['upperleg', 'lowerleg', (side, reach, step) => mix([0.15 * side, -1, 0.1], [0.55 * side, -0.05, 0.8], step)],
  ['lowerleg', 'foot', (side, reach, step) => mix([0.05 * side, -1, 0.05], [0.15 * side, -1, 0.05], step)],
]

export function climbClip(model) {
  model.updateMatrixWorld(true)
  // glTF loading drops the dots: upperarm.l arrives as upperarml
  const bone = name => {
    const found = model.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(name))
    if (!found) throw new Error(`Rig has no bone ${name}`)
    return found
  }
  const restWorld = new Map()
  model.traverse(o => restWorld.set(o, o.getWorldQuaternion(new THREE.Quaternion())))
  const limbs = ['l', 'r'].flatMap(hand => CLIMB_LIMBS.map(([name, next, aim]) => {
    const b = bone(`${name}.${hand}`)
    const from = b.getWorldPosition(new THREE.Vector3())
    const to = bone(`${next}.${hand}`).getWorldPosition(new THREE.Vector3())
    return { bone: b, rest: to.sub(from).normalize(), side: Math.sign(from.x) || 1, aim, hand }
  }))
  const times = [...Array(CLIMB_KEYS).keys()].map(i => i / (CLIMB_KEYS - 1) * CLIMB_SECONDS)
  const values = new Map(limbs.map(l => [l, []]))
  const chest = bone('chest'), hips = bone('hips')
  const chestKeys = [], hipKeys = []
  for (const time of times) {
    const wave = Math.sin(time / CLIMB_SECONDS * Math.PI * 2)
    const posed = new Map()   // limb bone -> its world rotation this frame
    const world = o => posed.get(o) ?? (o.parent ? world(o.parent).clone().multiply(o.quaternion) : o.quaternion.clone())
    // The chest turns toward the reaching hand and leans into the cliff
    const twist = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.12, 0.18 * wave, -0.06 * wave))
    const chestWorld = twist.multiply(world(chest))
    posed.set(chest, chestWorld)
    const chestLocal = world(chest.parent).clone().invert().multiply(chestWorld)
    chestKeys.push(chestLocal.x, chestLocal.y, chestLocal.z, chestLocal.w)
    hipKeys.push(hips.position.x, hips.position.y + CLIMB_BOB * Math.abs(wave), hips.position.z)
    for (const limb of limbs) {
      const lead = limb.hand === 'l' ? wave : -wave
      const target = new THREE.Vector3(...limb.aim(limb.side, Math.max(0, lead), Math.max(0, -lead))).normalize()
      const parent = world(limb.bone.parent)
      // The bone as its parent now carries it, and where that leaves it pointing
      const carried = parent.clone().multiply(limb.bone.quaternion)
      const pointing = limb.rest.clone().applyQuaternion(carried.clone().multiply(restWorld.get(limb.bone).clone().invert()))
      const aimed = new THREE.Quaternion().setFromUnitVectors(pointing, target).multiply(carried)
      posed.set(limb.bone, aimed)
      const local = parent.clone().invert().multiply(aimed)
      values.get(limb).push(local.x, local.y, local.z, local.w)
    }
  }
  const tracks = limbs.map(l => new THREE.QuaternionKeyframeTrack(`${l.bone.name}.quaternion`, times, values.get(l)))
  tracks.push(new THREE.QuaternionKeyframeTrack(`${chest.name}.quaternion`, times, chestKeys))
  tracks.push(new THREE.VectorKeyframeTrack(`${hips.name}.position`, times, hipKeys))
  return new THREE.AnimationClip('climb', CLIMB_SECONDS, tracks)
}
