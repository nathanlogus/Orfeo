/// <reference types="node" />
// Run: node --import ./scripts/ts-esbuild-hooks.mjs src/runAllTests.ts --file src/arcade/library/libraryTest.ts
import { createRequire } from 'node:module'
import { Scale } from 'tonal'
import { PROGRESSIONS } from '../../utils/explorerShared'
import { chordOf, chordsOf, fits, tonicOf } from './chords'
import { LIBRARY } from './index'
import type { Genre, ProgressionItem } from './types'

// Words from licks left out on purpose: none may come back in, by any route
const NAMED = /coltrane|giant steps|so what|shearing|mccoy|garland|basie|evans|longhair|pinetop|meade|fats domino|rhythm changes/i
const SONGLESS_LICENSES = ['MIT', 'GPL-3.0', 'Public domain']
const GENRES: Genre[] = ['blues', 'jazz', 'pop', 'rock']

export function runLibraryTest(): number {
  let failures = 0
  const fail = (m: string) => { console.error(`FAIL  ${m}`); failures++ }
  const eq = (a: unknown, b: unknown, m: string) => { if (JSON.stringify(a) !== JSON.stringify(b)) fail(`${m}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`) }

  const ids = LIBRARY.map(i => i.id)
  if (new Set(ids).size !== ids.length) fail('duplicate library ids')
  for (const item of LIBRARY) {
    if (!item.genre || !item.concept || !item.difficulty || !item.key || !item.source) fail(`${item.id} is missing a tag`)
    if (!SONGLESS_LICENSES.includes(item.license)) fail(`${item.id}: license ${item.license}`)
    if (NAMED.test(item.name) || (item.kind === 'riff' && NAMED.test(item.tex))) fail(`${item.id} names an artist or song`)
  }
  for (const genre of GENRES) {
    if (LIBRARY.filter(i => i.genre === genre && i.kind === 'riff').length < 5) fail(`${genre}: too few riffs`)
    if (!LIBRARY.some(i => i.genre === genre && i.kind === 'riff' && i.difficulty === 1)) fail(`${genre}: no beginner riff`)
    if (LIBRARY.filter(i => i.genre === genre && i.kind === 'progression').length < 5) fail(`${genre}: too few progressions`)
  }

  // Every chord of every progression resolves, in every key
  const progressions = LIBRARY.filter((i): i is ProgressionItem => i.kind === 'progression')
  for (const item of progressions) for (const key of ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']) chordsOf(item, key)

  // The twenty Explorer progressions all come through, and land on the same roots
  for (const p of PROGRESSIONS) {
    const item = progressions.find(i => i.name === p.name)
    if (!item) { fail(`${p.name} is missing`); continue }
    const tonic = tonicOf(item, item.key)
    const roots = chordsOf(item).map(c => c.pcs[0])
    const want = p.offsets.map(o => (chordOf('I', tonic).pcs[0] + o) % 12)
    eq(roots, want, `${p.name} roots`)
  }

  eq(chordOf('V^1', 'C').name, 'G/B', 'first inversion name')
  eq(chordOf('V^1', 'C').bass, 11, 'first inversion bass')
  eq(chordOf('iiø7', 'A', true).name, 'Bm7b5', 'half-diminished')
  eq(chordOf('bVII', 'C').name, 'Bb', 'borrowed chord')
  eq(chordOf('Imaj7', 'Eb').pcs, [3, 7, 10, 2], 'major seventh')
  eq(chordOf('i', 'A', true).keys, [57, 60, 64], 'voicing climbs from the low root')

  const g = chordOf('I', 'G')
  if (!fits(g, [55, 59, 62])) fail('root position')
  if (!fits(g, [59, 62, 67, 71])) fail('any voicing counts when no bass is asked for')
  if (fits(g, [55, 59])) fail('a missing note')
  if (fits(g, [55, 59, 62, 64])) fail('an extra note')
  const slash = chordOf('V^1', 'C')
  if (!fits(slash, [59, 62, 67])) fail('inversion on its bass')
  if (fits(slash, [55, 59, 62])) fail('inversion on the wrong bass')

  // Scales are tonal's, and riffs are alphaTex that alphaTab reads
  for (const item of LIBRARY) if (item.kind === 'scale' && Scale.get(`${item.key} ${item.tonal}`).empty) fail(`${item.tonal} is not a tonal scale`)
  const stubbed = (globalThis as any).window
  delete (globalThis as any).window
  const at = createRequire(import.meta.url)('@coderline/alphatab')
  ;(globalThis as any).window = stubbed
  for (const item of LIBRARY) {
    if (item.kind !== 'riff') continue
    try {
      const score = at.importer.ScoreLoader.loadScoreFromBytes(new TextEncoder().encode(item.tex), new at.Settings())
      if (!score.masterBars.length) fail(`${item.id} has no bars`)
      const bars = score.tracks[0].staves[0].bars
      for (const bar of bars) {
        const beats = bar.voices[0].beats
        const ticks = beats.reduce((sum: number, b: any) => sum + b.playbackDuration, 0)
        if (ticks !== 960 * 4) fail(`${item.id}: bar ${bar.index} holds ${ticks} ticks`)
      }
    } catch (e) { fail(`${item.id}: ${(e as Error).message}`) }
  }
  return failures
}
