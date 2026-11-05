// Main piano part of every one-part song, in the exact order Orfeo's parser keeps notes.
import { createRequire } from 'node:module'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
const REPO = resolve(import.meta.dirname, '../..')
const DATA = process.env.ORFEO_DATA
if (!DATA) { console.error('Set ORFEO_DATA to the private folder that holds the catalog data'); process.exit(1) }
const { Midi } = createRequire(join(REPO, 'package.json'))('@tonejs/midi')
const LIB = process.argv[2]
const hands = JSON.parse(readFileSync(join(DATA, 'hands.json'), 'utf8'))
const out = []
mkdirSync(join(DATA, 'hands'), { recursive: true })
for (const [rel, e] of Object.entries(hands)) {
  if (e.kind !== 'one-stream' || /Weimar Solos/.test(rel)) continue
  const b = readFileSync(join(LIB, rel))
  const midi = new Midi(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength))
  const parsed = midi.tracks.filter(t => t.notes.length > 0)  // Orfeo's index counts only tracks with notes
  const pianos = parsed.map((t, index) => ({ t, index })).filter(({ t }) => t.channel !== 9 && t.instrument.number <= 7)
  if (!pianos.length) continue
  const { t, index } = pianos.sort((a, c) => c.t.notes.length - a.t.notes.length)[0]
  if (t.notes.length < 20) continue
  out.push({ rel, trackIndex: index, tpb: midi.header.ppq, notes: t.notes.map(n => [n.ticks, n.ticks + Math.max(1, n.durationTicks), n.midi]) })
}
writeFileSync(join(DATA, 'hands', 'parts.json'), JSON.stringify(out))
console.log('songs', out.length, 'notes', out.reduce((s, x) => s + x.notes.length, 0))
