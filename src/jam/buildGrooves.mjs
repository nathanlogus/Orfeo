// ── Curates src/jam/grooves.ts from the Groove MIDI Dataset (CC BY 4.0) ──────
// usage: node src/jam/buildGrooves.mjs <folder holding info.csv and the .mid files>
// The dataset is not in the repository. For each style this takes every 4/4
// beat in its tags and tempo window, finds the bar lines from where the snare
// (the hi-hat foot for jazz) falls, keeps the steadiest two-bar loop of each
// file, then picks three by note count: calm, steady and building.

import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseMidi } from 'midi-file'

const DATA = resolve(process.argv[2])
const OUT = resolve(import.meta.dirname, 'grooves.ts')
const TICKS_PER_BEAT = 96 // the data file's unit; 5 ms at 120 BPM keeps the drummers' feel
const LOOP_BEATS = 8

const STYLES = {
  blues: { tags: ['blues/shuffle', 'rock/shuffle'], bpm: [70, 130], pulse: 'snare' },
  jazz:  { tags: ['jazz/swing', 'jazz', 'jazz/mediumfast'], bpm: [90, 180], pulse: 'foot' },
  pop:   { tags: ['pop', 'pop/soft', 'pop/groove7'], bpm: [70, 135], pulse: 'snare' },
  rock:  { tags: ['rock', 'rock/groove8', 'rock/indie'], bpm: [90, 135], pulse: 'snare' },
  rnb:   { tags: ['soul/groove3', 'soul/groove4', 'hiphop/groove6', 'pop/soft', 'funk/groove5'], bpm: [67, 100], pulse: 'snare' },
  soul:  { tags: ['soul', 'soul/groove9', 'soul/groove10', 'soul/motown'], bpm: [90, 150], pulse: 'snare' },
  funk:  { tags: ['funk', 'funk/groove2', 'funk/groove5', 'neworleans/funk'], bpm: [80, 120], pulse: 'snare' },
  hiphop: { tags: ['hiphop', 'hiphop/groove6'], bpm: [67, 110], pulse: 'snare' },
  alternative: { tags: ['rock/indie', 'punk', 'rock/prog'], bpm: [63, 145], pulse: 'snare' },
  ballad: { tags: ['pop/soft', 'rock/groove8', 'rock/indie'], bpm: [60, 90], pulse: 'snare' },
}

// The dataset's Roland kit, folded onto the General MIDI kit every engine has
const KIT = {
  36: 36, 38: 38, 37: 38, 40: 38, 42: 42, 22: 42, 44: 44, 46: 46, 26: 46,
  43: 43, 58: 43, 47: 47, 45: 47, 48: 50, 50: 50,
  49: 49, 52: 49, 55: 49, 57: 49, 51: 51, 53: 51, 59: 51,
}
const TOMS = new Set([43, 47, 50])

function hits(file) {
  const midi = parseMidi(readFileSync(file))
  const out = []
  for (const track of midi.tracks) {
    let tick = 0
    for (const e of track) {
      tick += e.deltaTime
      if (e.type === 'noteOn' && e.velocity > 0 && KIT[e.noteNumber]) {
        out.push({ beat: tick / midi.header.ticksPerBeat, note: KIT[e.noteNumber], vel: e.velocity })
      }
    }
  }
  return out.sort((a, b) => a.beat - b.beat)
}

const near = (beat, whole) => Math.abs(beat - Math.round(beat)) < 0.2 && ((Math.round(beat) % 4) + 4) % 4 === whole

// Which beat of the file is a bar's beat 1: the one putting the pulse on 2 and 4
function barOffset(all, pulse) {
  const marks = all.filter(h => h.note === (pulse === 'foot' ? 44 : 38) && h.vel > 45)
  let best = 0, bestScore = -1
  for (let o = 0; o < 4; o++) {
    const score = marks.filter(h => near(h.beat - o, 1) || near(h.beat - o, 3)).length
    if (score > bestScore) { bestScore = score; best = o }
  }
  return best
}

const slice = (all, from) => all.filter(h => h.beat >= from && h.beat < from + LOOP_BEATS)
const shape = (loop, from) => new Set(loop.map(h => `${h.note}:${Math.round((h.beat - from) * 4)}`))

// A groove sits still: the steadiest two bars look like the next two, with no toms or crashes
function steadiestLoop(all, offset) {
  const last = all.length ? all[all.length - 1].beat : 0
  let best = null, bestScore = -1
  for (let from = offset; from + LOOP_BEATS * 2 <= last; from += 4) {
    const loop = slice(all, from)
    if (loop.length < 12 || loop.some(h => TOMS.has(h.note) || h.note === 49)) continue
    const a = shape(loop, from), b = shape(slice(all, from + LOOP_BEATS), from + LOOP_BEATS)
    const score = [...a].filter(k => b.has(k)).length / Math.max(a.size, b.size)
    if (score > bestScore) { bestScore = score; best = { from, loop, score } }
  }
  return best
}

const info = readFileSync(join(DATA, 'info.csv'), 'utf8').trim().split(/\r?\n/).slice(1).map(l => {
  const [drummer, , , style, bpm, beatType, timeSig, midi] = l.split(',')
  return { drummer, style, bpm: Number(bpm), beatType, timeSig, midi }
})

let body = ''
for (const [name, def] of Object.entries(STYLES)) {
  const found = []
  for (const row of info) {
    if (row.timeSig !== '4-4' || row.beatType !== 'beat' || !def.tags.includes(row.style)) continue
    if (row.bpm < def.bpm[0] || row.bpm > def.bpm[1] || !/^[\w/.-]+\.mid$/.test(row.midi)) continue
    const all = hits(join(DATA, row.midi))
    const loop = steadiestLoop(all, barOffset(all, def.pulse))
    if (loop && loop.score > 0.35) found.push({ ...loop, row })
  }
  found.sort((a, b) => a.loop.length - b.loop.length)
  if (found.length < 3) throw new Error(`${name}: only ${found.length} loops`)
  const picks = [found[Math.floor(found.length * 0.1)], found[Math.floor(found.length * 0.5)], found[Math.floor(found.length * 0.9)]]
  body += `  ${name}: [\n`
  for (const p of picks) {
    const flat = p.loop.flatMap(h => [Math.min(Math.round((h.beat - p.from) * TICKS_PER_BEAT), LOOP_BEATS * TICKS_PER_BEAT - 1), h.note, h.vel])
    body += `    // ${p.row.midi}, ${p.row.bpm} BPM, from beat ${p.from}\n    [${flat.join(',')}],\n`
  }
  body += '  ],\n'
  console.log(name, found.length, 'loops; picked', picks.map(p => `${p.row.style} ${p.row.bpm} ${p.loop.length} hits`).join(' | '))
}

writeFileSync(OUT, `// Generated by src/jam/buildGrooves.mjs. Do not hand-edit.
// Drum performances from the Groove MIDI Dataset (Magenta, Google), CC BY 4.0,
// https://magenta.tensorflow.org/datasets/groove : cut to two-bar
// loops and folded onto the General MIDI kit. See THIRD_PARTY_LICENSES.md.
// Each loop: flat [tick, GM drum note, velocity, …], ${TICKS_PER_BEAT} ticks to the beat, in time order.
// Each style: calm, steady, building.

export const GROOVE_TICKS_PER_BEAT = ${TICKS_PER_BEAT}
export const GROOVE_BEATS = ${LOOP_BEATS}

export const GROOVES = {
${body}} as const satisfies Record<string, readonly (readonly number[])[]>
`)
