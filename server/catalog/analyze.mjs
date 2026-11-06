// Reads every MIDI file and writes one JSON line per file. Key, tempo and meter
// come from Pliage's own parseMidiMetadata, so they match what the app shows.
// Run: node --import <repo>/scripts/ts-esbuild-hooks.mjs analyze.mjs <library> [out]
// Safe to re-run: files whose size and mtime are unchanged are skipped.
import { createRequire } from 'node:module'
import { appendFileSync, existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import assert from 'node:assert'

const REPO = resolve(import.meta.dirname, '../..')
const DATA = process.env.PLIAGE_DATA
if (!DATA) { console.error('Set PLIAGE_DATA to the private folder that holds the catalog data'); process.exit(1) }
const { Midi } = createRequire(join(REPO, 'package.json'))('@tonejs/midi')
const { parseMidiMetadata } = await import(pathToFileURL(join(REPO, 'src/utils/midiMetadata.ts')).href)
const { detectKeyFromTracks } = await import(pathToFileURL(join(REPO, 'src/utils/keyDetection.ts')).href)

const LIB = process.argv[2]
const OUT = process.argv[3] ?? join(DATA, 'analysis.jsonl')
const CHORD_WINDOW = 0.03 // onsets this close count as one chord

export function noteStats(tracks, duration) {
  const pitched = tracks.filter(t => t.channel !== 9 && t.notes.length > 0)
  const notes = pitched.flatMap(t => t.notes).sort((a, b) => a.time - b.time)
  if (notes.length === 0) return null
  const span = Math.max(duration, 0.001)
  let groups = 1, last = notes[0].time, poly = 0
  const ends = []
  for (const n of notes) {
    if (n.time - last > CHORD_WINDOW) { groups++; last = n.time }
    while (ends.length && ends[0] <= n.time + 0.001) ends.shift()
    ends.push(n.time + n.duration); ends.sort((a, b) => a - b)
    poly = Math.max(poly, ends.length)
  }
  const midis = notes.map(n => n.midi)
  return {
    notes: notes.length,
    low: Math.min(...midis),
    high: Math.max(...midis),
    nps: +(notes.length / span).toFixed(3),
    maxTrackNps: +(Math.max(...pitched.map(t => t.notes.length)) / span).toFixed(3),
    notesPerOnset: +(notes.length / groups).toFixed(3),
    maxPolyphony: poly,
    pitchedTracks: pitched.length,
    pianoShare: +(pitched.filter(t => t.instrument.number <= 7).reduce((s, t) => s + t.notes.length, 0) / notes.length).toFixed(3),
    programs: [...new Set(pitched.map(t => t.instrument.number))].sort((a, b) => a - b),
  }
}

// A lone 120 is the MIDI default, not a stated tempo. Otherwise the tempo the
// song spends the most time at, since the first event is often a placeholder.
export function mainTempo(spans) {
  if (spans.length === 0 || (spans.length === 1 && Math.round(spans[0].bpm) === 120)) return null
  const time = new Map()
  for (const { bpm, seconds } of spans) time.set(Math.round(bpm), (time.get(Math.round(bpm)) ?? 0) + seconds)
  return [...time].sort((a, b) => b[1] - a[1])[0][0]
}

const isKeys = t => t.instrument.number <= 7 || (t.instrument.number >= 16 && t.instrument.number <= 23)
const isBass = t => t.instrument.number >= 32 && t.instrument.number <= 39

// The part a pianist would learn: the keyboard tracks if the song has real ones,
// otherwise the likeliest melody. shortcut: melody is a guess from pitch and
// chordiness; use a named vocal/lead track if files ever label them reliably.
export function learnablePart(tracks) {
  const pitched = tracks.filter(t => t.channel !== 9 && t.notes.length > 0)
  const total = pitched.reduce((n, t) => n + t.notes.length, 0)
  const keys = pitched.filter(isKeys)
  const keyNotes = keys.reduce((n, t) => n + t.notes.length, 0)
  if (keyNotes >= 30 && keyNotes >= total * 0.15) {
    // One instrument at most, two tracks at most: left and right hand. Band files
    // double keyboards across tracks, and nobody plays those parts at once.
    const byProgram = new Map()
    for (const t of keys) byProgram.set(t.instrument.number, [...(byProgram.get(t.instrument.number) ?? []), t])
    const count = l => l.reduce((n, t) => n + t.notes.length, 0)
    const main = [...byProgram.values()].sort((a, b) => count(b) - count(a))[0]
    const hands = [...main].sort((a, b) => b.notes.length - a.notes.length).slice(0, 2)
    return { kind: 'keys', notes: hands.flatMap(t => t.notes) }
  }
  const lines = pitched.filter(t => !isBass(t) && t.notes.length >= 20)
  if (lines.length === 0) return pitched.length ? { kind: 'melody', notes: pitched.flatMap(t => t.notes) } : null
  const single = t => new Set(t.notes.map(n => Math.round(n.time * 33))).size / t.notes.length
  const mean = t => t.notes.reduce((n, x) => n + x.midi, 0) / t.notes.length
  const best = [...lines].sort((a, b) => (single(b) >= 0.85) - (single(a) >= 0.85) || mean(b) - mean(a))[0]
  return { kind: 'melody', notes: best.notes }
}

export function playStats(part) {
  const notes = [...part.notes].sort((a, b) => a.time - b.time)
  const onsets = []
  for (const n of notes) {
    const last = onsets.at(-1)
    if (last && n.time - last.time <= CHORD_WINDOW) last.pitches.push(n.midi)
    else onsets.push({ time: n.time, pitches: [n.midi] })
  }
  // Hand actions over a sliding 4 seconds: the hard passage matters, not the
  // average, and a chord is one action however many notes it holds.
  const WINDOW = 4
  const counts = []
  let from = 0
  for (let i = 0; i < onsets.length; i++) {
    while (onsets[i].time - onsets[from].time > WINDOW) from++
    counts.push((i - from + 1) / WINDOW)
  }
  counts.sort((a, b) => a - b)
  const spans = onsets.map(o => Math.max(...o.pitches) - Math.min(...o.pitches)).sort((a, b) => a - b)
  let leaps = 0
  for (let i = 1; i < onsets.length; i++) {
    if (Math.abs(Math.max(...onsets[i].pitches) - Math.max(...onsets[i - 1].pitches)) >= 12) leaps++
  }
  const midis = notes.map(n => n.midi)
  return {
    partKind: part.kind,
    partNotes: notes.length,
    peakNps: +counts[Math.floor(counts.length * 0.9)].toFixed(3),
    partNotesPerOnset: +(notes.length / onsets.length).toFixed(3),
    chordSpan: spans[Math.floor(spans.length * 0.9)],
    leapRate: +(leaps / Math.max(1, onsets.length - 1)).toFixed(4),
    partRange: Math.max(...midis) - Math.min(...midis),
  }
}

function* midiFiles(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) yield* midiFiles(p)
    else if (/\.(mid|midi|kar)$/i.test(e.name)) yield p
  }
}

function analyze(path) {
  const b = readFileSync(path)
  const buf = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)
  const meta = parseMidiMetadata(buf, path.split(/[\\/]/).pop())
  const midi = new Midi(buf)
  const tempos = midi.header.tempos
  const end = Number.isFinite(midi.duration) ? midi.duration : 0
  const spans = tempos.map((t, i) => {
    const from = midi.header.ticksToSeconds(t.ticks)
    const to = i + 1 < tempos.length ? midi.header.ticksToSeconds(tempos[i + 1].ticks) : Math.max(end, from)
    return { bpm: t.bpm, seconds: Math.max(0, to - from) }
  })
  // Sequencers write C major as a default, so a stated C proves nothing: read it from the notes.
  const part = learnablePart(midi.tracks)
  const stated = meta.key
  const keyRaw = !stated || (stated.semitone === 0 && !stated.isMinor)
    ? detectKeyFromTracks(midi.tracks.map(t => ({ isDrum: t.channel === 9, notes: t.notes })))
    : stated
  return {
    keyRaw,
    keyFromNotes: keyRaw !== stated,
    bpm: mainTempo(spans),
    timeSignature: meta.timeSignature,
    trackCount: meta.trackCount,
    midiCopyright: meta.copyright,
    duration: +midi.duration.toFixed(2),
    hasDrums: midi.tracks.some(t => t.channel === 9 && t.notes.length > 0),
    tempoChanges: midi.header.tempos.length,
    ...noteStats(midi.tracks, midi.duration),
    ...(part ? playStats(part) : {}),
  }
}

{
  const s = noteStats([
    { channel: 0, instrument: { number: 0 }, notes: [{ midi: 60, time: 0, duration: 1 }, { midi: 64, time: 0.01, duration: 1 }, { midi: 67, time: 2, duration: 1 }] },
    { channel: 9, instrument: { number: 0 }, notes: [{ midi: 36, time: 0, duration: 0.1 }] },
  ], 3)
  assert.deepEqual([s.notes, s.low, s.high, s.nps, s.notesPerOnset, s.maxPolyphony, s.pitchedTracks, s.pianoShare], [3, 60, 67, 1, 1.5, 2, 1, 1])
}

assert.equal(mainTempo([{ bpm: 120, seconds: 90 }]), null)
assert.equal(mainTempo([{ bpm: 96, seconds: 90 }]), 96)
assert.equal(mainTempo([{ bpm: 120, seconds: 1 }, { bpm: 70, seconds: 80 }, { bpm: 90, seconds: 20 }]), 70)
assert.equal(mainTempo([]), null)
{
  const notes = (n, midi, step) => Array.from({ length: n }, (_, i) => ({ midi, time: i * step, duration: step }))
  const piano = { channel: 0, instrument: { number: 0 }, notes: notes(40, 60, 0.5) }
  const organ = { channel: 3, instrument: { number: 16 }, notes: notes(30, 72, 0.5) }
  assert.equal(learnablePart([piano, organ]).notes.length, 40)
  const left = { channel: 4, instrument: { number: 0 }, notes: notes(35, 48, 0.5) }
  assert.equal(learnablePart([piano, left]).notes.length, 75)
  const flute = { channel: 1, instrument: { number: 73 }, notes: notes(200, 84, 0.25) }
  const bass = { channel: 2, instrument: { number: 33 }, notes: notes(200, 36, 0.25) }
  assert.equal(learnablePart([piano, flute]).kind, 'keys')
  const lead = learnablePart([bass, flute])
  assert.deepEqual([lead.kind, lead.notes[0].midi], ['melody', 84])
  assert.equal(learnablePart([]), null)
  const st = playStats({ kind: 'keys', notes: [{ midi: 60, time: 0 }, { midi: 67, time: 0.01 }, { midi: 84, time: 1 }, { midi: 60, time: 2 }] })
  assert.deepEqual([st.partNotes, st.partNotesPerOnset, st.chordSpan, st.partRange], [4, 4 / 3, 7, 24].map((v, i) => i === 1 ? +v.toFixed(3) : v))
  assert.equal(st.leapRate, 1)
}

const done = new Set()
if (existsSync(OUT)) {
  for (const l of readFileSync(OUT, 'utf8').split('\n')) {
    if (l) { const r = JSON.parse(l); done.add(`${r.path}|${r.size}|${r.mtime}`) }
  }
}

let ok = 0, failed = 0, skipped = 0
for (const p of midiFiles(LIB)) {
  const st = statSync(p), rel = relative(LIB, p), id = `${rel}|${st.size}|${Math.round(st.mtimeMs)}`
  if (done.has(id)) { skipped++; continue }
  const base = { path: rel, size: st.size, mtime: Math.round(st.mtimeMs) }
  try { appendFileSync(OUT, JSON.stringify({ ...base, ...analyze(p) }) + '\n'); ok++ }
  catch (e) { appendFileSync(OUT, JSON.stringify({ ...base, error: String(e.message ?? e).slice(0, 200) }) + '\n'); failed++ }
  if ((ok + failed) % 500 === 0) console.log(`analyzed ${ok + failed} failed=${failed}`)
}
console.log(`finished analyzed=${ok} failed=${failed} skipped=${skipped}`)
