// Writes Pliage's PLIAGE_HAND_MAP hint. Only a text event is added: a file is replaced
// only if Pliage's real parser, reading the result, keeps every note and restores every
// hand. Originals are backed up first. Without --apply it writes nothing.
// Run from the repo: node --import ./scripts/ts-esbuild-hooks.mjs apply_hand_map.mjs <library> <backup-dir> [--apply] [--limit N]
import { createRequire } from 'node:module'
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const REPO = resolve(import.meta.dirname, '../..')
const DATA = process.env.PLIAGE_DATA
if (!DATA) { console.error('Set PLIAGE_DATA to the private folder that holds the catalog data'); process.exit(1) }

// The minimum Pliage's store modules read at load time, as in src/runAllTests.ts.
const g = globalThis
const mem = new Map()
g.localStorage ??= { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k), clear: () => mem.clear(), key: () => null, length: 0 }
const style = { setProperty() {}, removeProperty() {}, getPropertyValue: () => '' }
g.document ??= {
  documentElement: { style, setAttribute() {}, getAttribute: () => null, classList: { add() {}, remove() {}, toggle() {}, contains: () => false } },
  body: { style, appendChild() {}, removeChild() {}, addEventListener() {}, removeEventListener() {} },
  createElement: () => ({ style: { ...style }, setAttribute() {}, addEventListener() {}, removeEventListener() {} }),
  getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, removeEventListener() {},
}
g.matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
g.window ??= {
  addEventListener() {}, removeEventListener() {}, dispatchEvent() {}, document: g.document, localStorage: g.localStorage,
  matchMedia: g.matchMedia, navigator: g.navigator, innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1,
  setTimeout, clearTimeout, setInterval, clearInterval, fetch: g.fetch,
}

const require = createRequire(join(REPO, 'package.json'))
const { parseMidi, writeMidi } = require('midi-file')
const { parseMidiBuffer } = await import(pathToFileURL(join(REPO, 'src/utils/midiParser.ts')).href)
const { encodeHandMapMeta } = await import(pathToFileURL(join(REPO, 'src/utils/handMetadata.ts')).href)

const [LIB, BACKUP] = process.argv.slice(2)
const APPLY = process.argv.includes('--apply')
const limitAt = process.argv.indexOf('--limit')
const LIMIT = limitAt > 0 ? Number(process.argv[limitAt + 1]) : Infinity

const sha = b => createHash('sha256').update(b).digest('hex')
const buf = b => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)
const fingerprint = p => JSON.stringify(p.tracks.map(t => t.notes.map(n => [n.midi, +n.time.toFixed(3), +n.duration.toFixed(3)])))

// Tracks with the file's own hand layout that could not take a name: whole-track hints.
function wholeTrackLabels() {
  const hands = JSON.parse(readFileSync(join(DATA, 'hands.json'), 'utf8'))
  const fixed = readFileSync(join(DATA, 'hands_fix.log'), 'utf8')
  const skipped = new Set([...fixed.matchAll(/^skipped (.+?) - /gm)].map(m => m[1]))
  return Object.entries(hands).filter(([rel, e]) => (e.kind === 'named' || e.kind === 'split') && e.engineAgrees < 0.95 && skipped.has(rel.split(/[\\/]/).pop()))
}

const labels = JSON.parse(readFileSync(join(DATA, 'hands', 'labels.json'), 'utf8'))
const jobs = []
for (const [rel, e] of Object.entries(labels)) jobs.push({ rel, edits: [{ index: e.trackIndex, hands: [...e.hands] }] })
if (existsSync(join(DATA, 'hands_fix.log'))) for (const [rel, e] of wholeTrackLabels()) jobs.push({ rel, whole: e })

const rekey = {}, problems = {}
let done = 0, seen = 0
const problem = (why, rel) => { (problems[why] ??= []).push(rel) }
for (const job of jobs) {
  if (seen++ >= LIMIT) break
  const path = join(LIB, job.rel)
  const before = readFileSync(path)
  const base = parseMidiBuffer(buf(before), 'x.mid', '')
  let edits = job.edits
  if (job.whole) {
    edits = [...job.whole.rightTracks.map(i => ['R', i]), ...job.whole.leftTracks.map(i => ['L', i])].map(([h, i]) => ({ raw: i, hand: h }))
    const { Midi } = require('@tonejs/midi')
    const m = new Midi(buf(before))
    const nonEmpty = m.tracks.filter(t => t.notes.length > 0)
    edits = edits.map(({ raw, hand }) => { const index = nonEmpty.indexOf(m.tracks[raw]); return { index, hands: Array(nonEmpty[index]?.notes.length ?? 0).fill(hand) } })
    if (edits.some(x => x.index < 0)) { problem('track not found', job.rel); continue }
  }
  const parsed = parseMidi(new Uint8Array(buf(before)))
  parsed.tracks[0] = parsed.tracks[0].filter(e => !(e.type === 'text' && /^(PLIAGE|ORFEO)_HAND_MAP:/.test(String(e.text))))
  for (const x of [...edits].reverse()) parsed.tracks[0].unshift({ deltaTime: 0, meta: true, type: 'text', text: encodeHandMapMeta(x.index, x.hands).text })
  const after = Buffer.from(writeMidi(parsed))
  let check
  try { check = parseMidiBuffer(buf(after), 'x.mid', '') } catch (err) { problem('unreadable after writing', job.rel); continue }
  if (fingerprint(check) !== fingerprint(base)) { problem('notes changed', job.rel); continue }
  if (!check._handTagsRestored) { problem('hint not restored', job.rel); continue }
  const wrong = edits.some(x => check.tracks[x.index]?.notes.length !== x.hands.length || check.tracks[x.index].notes.some((n, i) => n.hand !== x.hands[i]))
  if (wrong) { problem('hands differ after reading', job.rel); continue }
  if (APPLY) {
    const copy = join(BACKUP, job.rel)
    mkdirSync(dirname(copy), { recursive: true })
    if (!existsSync(copy)) copyFileSync(path, copy)
    writeFileSync(path + '.part', after)
    renameSync(path + '.part', path)
    rekey[sha(before).slice(0, 16)] = sha(after).slice(0, 16)
  }
  done++
  if (done % 500 === 0) console.log('verified', done, 'of', jobs.length)
}
if (APPLY) {
  // Song ids are content hashes, so pictures and authors must follow the new bytes.
  for (const name of ['art.json', 'authors.json']) {
    const file = join(DATA, name), data = JSON.parse(readFileSync(file, 'utf8'))
    for (const [from, to] of Object.entries(rekey)) if (data[from]) { data[to] = data[from]; delete data[from] }
    writeFileSync(file + '.part', JSON.stringify(data))
    renameSync(file + '.part', file)
  }
}
console.log(`${APPLY ? 'applied' : 'dry run'}: ${done} of ${Math.min(jobs.length, LIMIT)} verified`)
for (const [why, list] of Object.entries(problems)) console.log(why, list.length, list.slice(0, 4).map(x => x.split(/[\\/]/).pop()).join(', '))
