/// <reference types="node" />
// Run: node --import ./scripts/ts-esbuild-hooks.mjs src/runAllTests.ts --file src/arcade/gamesTest.ts
import { existsSync } from 'node:fs'
import { GAMES, STARS_PER_WORLD, ratedStages } from './games'
import { sharedChords } from './findInLibrary'

const onDisk = (url: string) => existsSync(url.replace(/^\.\//, 'public/'))

// The registry is the contract other games plug into: check every entry keeps it
export function runArcadeGamesTest(): number {
  let failures = 0
  const fail = (m: string) => { console.error(`FAIL  ${m}`); failures++ }

  if (GAMES.length !== 7 || GAMES.length * STARS_PER_WORLD !== 84) fail('seven worlds, 84 stars')
  if (new Set(GAMES.map(g => g.id)).size !== GAMES.length) fail('world ids are unique')
  if (GAMES[0].id !== 'hollow') fail('Monster Hollow keeps its saved progress key')
  if (!GAMES.some(g => g.Game)) fail('at least one game is playable')

  for (const def of GAMES) {
    if (!onDisk(def.art)) fail(`${def.id}: no card art at ${def.art}`)
    if (!def.Game) continue
    if (!onDisk(def.scene)) fail(`${def.id}: no scene at ${def.scene}`)
    if (def.figure && !onDisk(def.figure.art)) fail(`${def.id}: no figure art`)
    if (ratedStages(def).length * 3 !== STARS_PER_WORLD) fail(`${def.id}: three stages and a boss make twelve stars`)
    if (def.stages.map(s => s.kind).join() !== 'stage,stage,stage,boss,endless') fail(`${def.id}: stage order`)
    if (new Set(def.stages.map(s => s.id)).size !== def.stages.length) fail(`${def.id}: stage ids are unique`)
    for (const stage of def.stages) {
      const { cards, tryIt } = stage.meet
      if (!cards.length) fail(`${stage.id}: Meet it needs something to hear`)
      if (!tryIt.fits(tryIt.keys)) fail(`${stage.id}: the keys Try one now lights must pass it`)
      if (tryIt.fits([])) fail(`${stage.id}: nothing held is not an answer`)
    }
  }

  const c = { name: 'C', pcs: [0, 4, 7] }, g = { name: 'G', pcs: [7, 11, 2] }
  const span = (time: number, notes: string[]) => ({ time, notes })
  const end = (time: number) => span(time, ['C'])
  if (sharedChords([span(0, ['C', 'E', 'G']), span(4, ['G', 'B', 'D']), end(8)], [c, g])?.length !== 2) fail('a song built on two of the chords matches')
  if (sharedChords([span(0, ['C', 'E', 'G']), span(4, ['A', 'C', 'E']), end(8)], [c, g]) !== null) fail('one shared chord is not enough to say so')
  if (sharedChords([span(0, ['C', 'E', 'G']), span(1, ['G', 'B', 'D']), span(2, ['A', 'C', 'E']), end(40)], [c, g]) !== null) fail('a passing mention is not leaning on them')
  if (sharedChords([], [c, g]) !== null) fail('no analysis, no match')
  return failures
}
