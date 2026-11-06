// ── Curate SundayLicks (MIT) into src/arcade/library/licks.ts as alphaTex ─────
// The source is not in the repository. Usage:
//   node scripts/arcade-licks.mjs [path-to-arcade-sources]
//
// seed-licks.ts is parsed, never run. Only the right-hand line is kept, and only
// licks that fit whole bars of 4/4 on a sixteenth or triplet grid. A lick whose
// text names an artist or a song stays out, whatever else it has going for it.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Note } from 'tonal'
import ts from 'typescript'

const sources = process.argv[2] ?? 'arcade-sources'
const FROM = join(sources, 'music/sundaylicks/src/data/seed-licks.ts')
const TO = join(import.meta.dirname, '../src/arcade/library/licks.ts')

const GENRES = ['blues', 'jazz', 'rock']
const MAX_BEATS = 16
const KEYS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
const SHARP_KEYS = ['G', 'D', 'A', 'E', 'B']

// Why each stayed out. Read by hand; libraryTest guards the words.
const LEFT_OUT = {
  'jazz-rhythm-changes-turnaround': 'names rhythm changes, after a song',
  'jazz-dominant-chain-c': 'names rhythm changes, after a song',
  'jazz-modal-run-d': 'names So What',
  'jazz-coltrane-turnaround-c': 'names Coltrane and Giant Steps',
  'jazz-block-chords-eb': 'names Shearing',
  'jazz-quartal-modal-dm': 'names McCoy Tyner',
  'jazz-latin-vamp-dm': 'names McCoy Tyner',
  'jazz-garland-comp-c': 'names Red Garland',
  'jazz-basie-ending-c': 'names Basie',
  'jazz-ballad-reharm-eb': 'names Bill Evans',
  'jazz-bebop-head-f': 'a whole head, too close to a tune to vouch for',
  'blues-rumba-c': 'names Professor Longhair',
}

// English names; the source's are Norwegian
const NAMES = {
  'run-blues-bb': 'Blues run in Bb',
  'two-five-one-minor': 'Minor ii-V-i',
  'jazz-ii-v-i-bebop': 'Bebop ii-V-I',
  'jazz-walking-comp': 'Walking bass comp',
  'jazz-bebop-scale-run': 'Bebop scale run',
  'jazz-1235-pattern': '1-2-3-5 pattern',
  'blues-turnaround-e': 'Blues turnaround in E',
  'blues-scale-lick-a': 'Blues scale lick in A',
  'blues-slow-comp-g': 'Slow blues comp in G',
  'pop-anthem-c': 'Pop anthem in C',
  'rock-riff-e': 'Rock riff in E',
  'jazz-2-5-1-beginner-c': 'Simple ii-V-I',
  'jazz-intro-c': 'Jazz intro vamp',
  'jazz-fill-turn-f': 'Enclosure fill',
  'jazz-blues-f-comp': 'Jazz blues comp in F',
  'jazz-turnaround-1625-eb': 'Turnaround in Eb',
  'blues-intro-c': 'Blues intro in C',
  'blues-boogie-shuffle-g': 'Blues shuffle in G',
  'blues-fast-run-c': 'Fast blues run in C',
  'blues-slow-12-line-a': 'Slow blues line in A',
  'rock-ballad-c': 'Rock ballad in C',
  'rock-intro-a': 'Rock intro in A',
  'rock-riff-a-adv': 'Advanced rock riff in A',
  'rock-fill-e': 'Rock fill in E',
  'rock-anthem-d': 'Rock anthem in D',
  'jazz-triplet-run-c': 'Triplet jazz line',
  'blues-triplet-lick-a': 'Blues triplet lick in A',
  'jazz-bebop-blues-f': 'Bebop blues in F',
  'jazz-altered-251-c': 'Altered ii-V-I',
  'jazz-minor-251-cm': 'Minor ii-V-i in C minor',
  'jazz-enclosure-etude-c': 'Enclosure etude',
  'blues-triplet-rolls-a': 'Triplet rolls in A',
  'blues-contrary-turnaround-e': 'Contrary motion turnaround',
  'blues-dim-connector-bb': 'Diminished bridge IV to I',
  'blues-stop-time-c': 'Stop-time fills',
  'blues-slow-128-g': 'Slow blues in 12/8 feel',
  'blues-tremolo-e': 'Tremolo crescendo in E',
  'blues-jump-riff-bb': 'Jump blues riff in Bb',
  'blues-slowdrag-a': 'Slow drag in A',
  'blues-full-chorus-g': 'Full blues chorus',
  'rock-gospel-run-c': 'Arena octave run',
  'rock-piano-hook-c': 'Arena hook in C',
  'rock-ballad-build-g': 'Ballad build in G',
  'rock-roadhouse-e': 'Roadhouse shuffle in E',
  'rock-syncop-riff-d': 'Syncopated riff in D',
  'jazz-two-feel-f': 'Two-feel comp in F',
}

const CONCEPTS = { run: 'scale run', turnaround: 'turnaround', comp: 'comping', 'two-five-one': 'ii-V-I', groove: 'groove', fill: 'fill', intro: 'intro', ending: 'ending' }

function value(node) {
  if (ts.isStringLiteralLike(node)) return node.text
  if (ts.isNumericLiteral(node)) return Number(node.text)
  if (ts.isPrefixUnaryExpression(node)) return -value(node.operand)
  if (ts.isArrayLiteralExpression(node)) return node.elements.map(value)
  if (ts.isObjectLiteralExpression(node)) return Object.fromEntries(node.properties.map(p => [p.name.text, value(p.initializer)]))
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false
  throw new Error(`Not plain data: ${node.getText().slice(0, 60)}`)
}

function seedLicks() {
  const file = ts.createSourceFile('seed.ts', readFileSync(FROM, 'utf8'), ts.ScriptTarget.Latest, true)
  let licks
  file.forEachChild(function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.text === 'SEED_LICKS') licks = value(node.initializer)
    node.forEachChild(visit)
  })
  return licks
}

// Twelfths of a beat -> alphaTex length. 4 and 8 are triplets.
const PLAIN = [[48, '1'], [36, '2{d}'], [24, '2'], [18, '4{d}'], [12, '4'], [9, '8{d}'], [6, '8'], [3, '16']]
const TWELFTHS = 12
const BAR = 48

// The note, then rests for whatever is left of its slot
function slots(gap) {
  const out = []
  for (let left = gap; left > 0;) {
    const fit = PLAIN.find(([size]) => size <= left)
    if (!fit) return null
    out.push(fit[1])
    left -= fit[0]
  }
  return out
}

function barTex(events, name) {
  const out = []
  let at = 0
  const rest = gap => { const parts = slots(gap); if (!parts) return false; out.push(...parts.map(p => `r.${p}`)); return true }
  if (events.length && events[0].at > 0 && !rest(events[0].at)) return null
  if (!events.length && !rest(BAR)) return null
  for (let i = 0; i < events.length; i++) {
    const next = events[i + 1]?.at ?? BAR
    const gap = next - events[i].at
    at = events[i].at
    if ((gap === 4 || gap === 8) && at % (gap * 3) === 0 && (events.slice(i, i + 3).every((e, n) => e.at === at + n * gap)) && (events[i + 3]?.at ?? BAR) >= at + gap * 3) {
      const size = gap === 4 ? 8 : 4
      for (const e of events.slice(i, i + 3)) out.push(`${name(e.notes)}.${size}{tu 3}`)
      i += 2
      const after = (events[i + 1]?.at ?? BAR) - (at + gap * 3)
      if (after && !rest(after)) return null
      continue
    }
    const parts = slots(gap)
    if (!parts) return null
    out.push(`${name(events[i].notes)}.${parts[0]}`, ...parts.slice(1).map(p => `r.${p}`))
  }
  return out.join(' ')
}

function toTex(lick, key) {
  const sharps = SHARP_KEYS.includes(key)
  const line = lick.notes.filter(n => n.h === 'R')
  const name = notes => {
    const names = [...new Set(notes)].sort((a, b) => a - b).map(p => Note.fromMidi(p, { sharps }))
    return names.length > 1 ? `(${names.join(' ')})` : names[0]
  }
  const onsets = new Map()
  for (const n of line) {
    const at = n.t * TWELFTHS
    if (Math.abs(at - Math.round(at)) > 0.01) return null
    const slot = Math.round(at)
    onsets.set(slot, [...(onsets.get(slot) ?? []), n.p])
  }
  const events = [...onsets].sort((a, b) => a[0] - b[0]).map(([at, notes]) => ({ at, notes }))
  const bars = []
  for (let b = 0; b < lick.beats / 4; b++) {
    const tex = barTex(events.filter(e => Math.floor(e.at / BAR) === b).map(e => ({ ...e, at: e.at - b * BAR })), name)
    if (tex === null) return null
    bars.push(tex)
  }
  return `\\title "${NAMES[lick.slug]}" \\tempo ${lick.default_bpm} \\ts (4 4) \\hideDynamics\n\\track "Piano" { instrument 0 } \\staff { score } \\clef G2\n${bars.join(' | ')}`
}

const skipped = []
const riffs = []
for (const lick of seedLicks()) {
  if (!GENRES.includes(lick.genre) || LEFT_OUT[lick.slug]) continue
  const key = KEYS[lick.original_key]
  const tex = lick.time_signature === '4/4' && lick.beats % 4 === 0 && lick.beats <= MAX_BEATS && lick.notes.some(n => n.h === 'R') && NAMES[lick.slug] ? toTex(lick, key) : null
  if (!tex) { skipped.push(lick.slug); continue }
  riffs.push({
    id: `sl-${lick.slug}`, kind: 'riff', name: NAMES[lick.slug], genre: lick.tags.includes('pop') ? 'pop' : lick.genre,
    concept: CONCEPTS[lick.category], difficulty: lick.difficulty, key, source: 'SundayLicks', license: 'MIT', tex,
  })
}

writeFileSync(TO, `// Generated by scripts/arcade-licks.mjs from SundayLicks (MIT, see THIRD_PARTY_LICENSES.md). Do not edit.
import type { Riff } from './types'

export const LICKS: Riff[] = ${JSON.stringify(riffs, null, 2)}
`)
const count = {}
for (const r of riffs) count[r.genre] = (count[r.genre] ?? 0) + 1
console.log(count, 'did not fit:', skipped.join(' '))
