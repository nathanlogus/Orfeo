// Songs whose own hand tracks Orfeo's engine gets wrong: adds the " RH"/" LH" track
// names Orfeo treats as authoritative. Only track names change, and a file is
// replaced only if every note survives. Originals go to a sibling folder first.
// Run: node fix_hands.mjs <library> <backup-dir> [--apply]   (without --apply: dry run)
import { createRequire } from 'node:module'
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import assert from 'node:assert'

const REPO = resolve(import.meta.dirname, '../..')
const DATA = process.env.ORFEO_DATA
if (!DATA) { console.error('Set ORFEO_DATA to the private folder that holds the catalog data'); process.exit(1) }
const require = createRequire(join(REPO, 'package.json'))
const { Midi } = require('@tonejs/midi')
const { parseMidi, writeMidi } = require('midi-file')

const [LIB, BACKUP] = process.argv.slice(2)
const APPLY = process.argv.includes('--apply')
const THRESHOLD = 0.95

const sha = b => createHash('sha256').update(b).digest('hex')
const notesOf = raw => raw.filter(e => e.type === 'noteOn' && e.velocity > 0).map(e => e.noteNumber)
const fingerprint = midi => JSON.stringify(midi.tracks.map(t => t.notes.map(n => [n.midi, +n.time.toFixed(3), +n.duration.toFixed(3)])))

export function withHand(name, hand) {
  return `${(name ?? '').replace(/\s+(LH|RH)\s*$/i, '').trim() || 'Piano'} ${hand}H`
}

export function nameTrack(raw, hand) {
  const named = raw.find(e => e.type === 'trackName')
  if (named) named.text = withHand(named.text, hand)
  else raw.unshift({ deltaTime: 0, meta: true, type: 'trackName', text: withHand('Piano', hand) })
}

// @tonejs/midi may split or drop tracks, so match by notes rather than by index.
function rawTrackFor(parsed, track) {
  const want = JSON.stringify([...track.notes].sort((a, b) => a.ticks - b.ticks || a.midi - b.midi).map(n => n.midi))
  const sorted = raw => { let tick = 0; const on = []; for (const e of raw) { tick += e.deltaTime; if (e.type === 'noteOn' && e.velocity > 0) on.push([tick, e.noteNumber]) } return on.sort((a, b) => a[0] - b[0] || a[1] - b[1]).map(x => x[1]) }
  const hits = parsed.tracks.filter(raw => JSON.stringify(sorted(raw)) === want)
  return hits.length === 1 ? hits[0] : null
}

assert.equal(withHand('piano mao esquerda', 'L'), 'piano mao esquerda LH')
assert.equal(withHand('Piano RH', 'L'), 'Piano LH')
assert.equal(withHand('', 'R'), 'Piano RH')
{
  const raw = [{ deltaTime: 0, type: 'noteOn', noteNumber: 60, velocity: 80 }]
  nameTrack(raw, 'R')
  assert.equal(raw[0].text, 'Piano RH')
  assert.deepEqual(notesOf(raw), [60])
}

const hands = JSON.parse(readFileSync(join(DATA, 'hands.json'), 'utf8'))
const targets = Object.entries(hands).filter(([, e]) => (e.kind === 'named' || e.kind === 'split') && e.engineAgrees < THRESHOLD)
const rekey = {}, skipped = []
let fixed = 0
for (const [rel, e] of targets) {
  const path = join(LIB, rel)
  const before = readFileSync(path)
  const ab = before.buffer.slice(before.byteOffset, before.byteOffset + before.byteLength)
  const midi = new Midi(ab)
  const parsed = parseMidi(new Uint8Array(ab))
  if (parsed.header.format === 0) { skipped.push([rel, 'single-track format']); continue }
  const edits = [...e.rightTracks.map(i => [i, 'R']), ...e.leftTracks.map(i => [i, 'L'])]
  const raws = edits.map(([i]) => rawTrackFor(parsed, midi.tracks[i]))
  if (raws.some(r => !r) || new Set(raws).size !== raws.length) { skipped.push([rel, 'track could not be matched']); continue }
  edits.forEach(([, hand], n) => nameTrack(raws[n], hand))
  const after = Buffer.from(writeMidi(parsed))
  const check = new Midi(after.buffer.slice(after.byteOffset, after.byteOffset + after.byteLength))
  if (fingerprint(check) !== fingerprint(midi)) { skipped.push([rel, 'notes changed on rewrite']); continue }
  const named = edits.every(([i, hand]) => check.tracks[i]?.name?.endsWith(` ${hand}H`))
  if (!named) { skipped.push([rel, 'names did not stick']); continue }
  if (APPLY) {
    const copy = join(BACKUP, rel)
    mkdirSync(dirname(copy), { recursive: true })
    if (!existsSync(copy)) copyFileSync(path, copy)
    assert.equal(sha(readFileSync(copy)), sha(before), `backup differs: ${rel}`)
    writeFileSync(path + '.part', after)
    renameSync(path + '.part', path)
    rekey[sha(before).slice(0, 16)] = sha(after).slice(0, 16)
  }
  fixed++
}
if (APPLY) {
  // Song ids are content hashes, so pictures and authors must follow the new bytes.
  for (const name of ['art.json', 'authors.json']) {
    const file = join(DATA, name), data = JSON.parse(readFileSync(file, 'utf8'))
    for (const [from, to] of Object.entries(rekey)) if (data[from]) { data[to] = data[from]; delete data[from] }
    writeFileSync(file, JSON.stringify(data))
  }
}
console.log(`${APPLY ? 'applied' : 'dry run'}: ${fixed} of ${targets.length} fixable`)
for (const s of skipped) console.log('skipped', s[0].split(/[\\/]/).pop(), '-', s[1])
