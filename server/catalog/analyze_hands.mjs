// Classifies how each file lays out the two hands, and checks Pliage's own hand
// engine against tracks the file itself names. Reads files only, never writes them.
// Run from the repo: node --import ./scripts/ts-esbuild-hooks.mjs analyze_hands.mjs <library> [out]
import { createRequire } from 'node:module'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import assert from 'node:assert'

const REPO = resolve(import.meta.dirname, '../..')
const DATA = process.env.PLIAGE_DATA
if (!DATA) { console.error('Set PLIAGE_DATA to the private folder that holds the catalog data'); process.exit(1) }
const { Midi } = createRequire(join(REPO, 'package.json'))('@tonejs/midi')
const { assignHands } = await import(pathToFileURL(join(REPO, 'src/utils/handAssignment.ts')).href)

const LIB = process.argv[2]
const OUT = process.argv[3] ?? join(DATA, 'hands.json')

const RIGHT = /\bright\b|\brh\b|\bmd\b|direit|\bm\W*o\W*dir/i
const LEFT = /\bleft\b|\blh\b|\bme\b|esquerd/i

export function namedHand(name) {
  const n = name ?? ''
  const r = RIGHT.test(n), l = LEFT.test(n)
  return r === l ? null : r ? 'R' : 'L'
}

const isPiano = t => t.instrument.number <= 7
const mean = t => t.notes.reduce((s, n) => s + n.midi, 0) / t.notes.length

// 'named': the file says which track is which. 'split': two piano tracks that sit
// clearly apart, so they are almost certainly hands. 'one-stream': one piano part,
// which Pliage splits itself. 'none': no piano part at all.
export function layout(tracks) {
  const notes = tracks.filter(t => t.channel !== 9 && t.notes.length > 0)
  const named = notes.filter(t => isPiano(t) && namedHand(t.name))
  const right = named.filter(t => namedHand(t.name) === 'R')
  const left = named.filter(t => namedHand(t.name) === 'L')
  if (right.length >= 1 && left.length >= 1) return { kind: 'named', right, left }
  const pianos = notes.filter(isPiano)
  if (pianos.length === 2) {
    const [hi, lo] = [...pianos].sort((a, b) => mean(b) - mean(a))
    const ratio = Math.max(hi.notes.length, lo.notes.length) / Math.min(hi.notes.length, lo.notes.length)
    if (mean(hi) - mean(lo) >= 7 && ratio <= 6 && Math.min(hi.notes.length, lo.notes.length) >= 20) return { kind: 'split', right: [hi], left: [lo] }
  }
  return { kind: pianos.length ? 'one-stream' : 'none', right: [], left: [] }
}

function engineAgreement(tracks, right, left) {
  const inputs = []
  const expect = new Map()
  const add = (t, hand, idx) => {
    for (const n of t.notes) {
      const input = { midi: n.midi, time: n.time, trackIndex: idx, channel: t.channel, group: 'piano' }
      inputs.push(input); expect.set(input, hand)
    }
  }
  right.forEach(t => add(t, 'R', tracks.indexOf(t)))
  left.forEach(t => add(t, 'L', tracks.indexOf(t)))
  const { assignments } = assignHands(inputs, { rhMaxFingers: 5, lhMaxFingers: 5 })
  let same = 0
  for (const a of assignments) if (expect.get(a.note) === a.hand) same++
  return +(same / assignments.length).toFixed(4)
}

function* midiFiles(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue
    const p = join(dir, e.name)
    if (e.isDirectory()) yield* midiFiles(p)
    else if (/\.(mid|midi|kar)$/i.test(e.name)) yield p
  }
}

{
  const t = (name, number, midi, n = 30) => ({ name, channel: 0, instrument: { number }, notes: Array.from({ length: n }, (_, i) => ({ midi, time: i })) })
  assert.equal(namedHand('piano right hand'), 'R')
  assert.equal(namedHand('Piano me - baixo'), 'L')
  assert.equal(namedHand('piano m\ufffdo esquerda'), 'L')
  assert.equal(namedHand('piano mo direita'), 'R')
  assert.equal(namedHand('Guitar'), null)
  assert.equal(layout([t('Piano right hand', 0, 72), t('Piano left hand', 0, 48)]).kind, 'named')
  assert.equal(layout([t('a', 0, 72), t('b', 0, 48)]).kind, 'split')
  assert.equal(layout([t('a', 0, 62), t('b', 0, 60)]).kind, 'one-stream')
  assert.equal(layout([t('flute', 73, 80)]).kind, 'none')
  assert.equal(layout([t('Piano right hand', 73, 72), t('Piano left hand', 73, 48)]).kind, 'none')
}

const result = {}
let failed = 0
for (const p of midiFiles(LIB)) {
  const rel = relative(LIB, p)
  try {
    const b = readFileSync(p)
    const midi = new Midi(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength))
    const { kind, right, left } = layout(midi.tracks)
    const entry = { kind }
    if (right.length) {
      entry.rightTracks = right.map(t => midi.tracks.indexOf(t))
      entry.leftTracks = left.map(t => midi.tracks.indexOf(t))
      entry.engineAgrees = engineAgreement(midi.tracks, right, left)
    }
    result[rel] = entry
  } catch { failed++ }
}
writeFileSync(OUT, JSON.stringify(result))
const kinds = {}
for (const e of Object.values(result)) kinds[e.kind] = (kinds[e.kind] ?? 0) + 1
console.log('finished', JSON.stringify(kinds), 'failed', failed)
for (const kind of ['named', 'split']) {
  const v = Object.values(result).filter(e => e.kind === kind).map(e => e.engineAgrees).sort((a, b) => a - b)
  if (v.length) console.log(kind, 'engine agreement min', v[0], 'median', v[v.length >> 1], 'under 95%:', v.filter(x => x < 0.95).length, 'under 80%:', v.filter(x => x < 0.8).length, 'of', v.length)
}
