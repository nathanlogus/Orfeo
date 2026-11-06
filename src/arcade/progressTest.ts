/// <reference types="node" />
// Run: node --import ./scripts/ts-esbuild-hooks.mjs src/runAllTests.ts --file src/arcade/progressTest.ts
import { afterRun, isOpen, offersAssist } from './progress'

export function runArcadeProgressTest(): number {
  let failures = 0
  const fail = (m: string) => { console.error(`FAIL  ${m}`); failures++ }
  const order = ['triads', 'sevenths', 'inversions', 'boss', 'endless']

  const lost = afterRun(undefined, { cleared: false, stars: 0, score: 500 })
  if (lost.stars !== 0 || lost.best !== 500 || lost.fails !== 1) fail('a failed run keeps its best and counts')
  if (offersAssist(lost)) fail('one failed run offers nothing')
  const twice = afterRun(lost, { cleared: false, stars: 0, score: 100 })
  if (!offersAssist(twice) || twice.best !== 500) fail('two failed runs offer Assist')
  const won = afterRun(twice, { cleared: true, stars: 1, score: 900 })
  if (won.stars !== 1 || won.fails !== 0 || offersAssist(won)) fail('a clear earns stars and clears the fails')
  if (afterRun({ stars: 3, best: 2000, fails: 0 }, { cleared: true, stars: 1, score: 10 }).stars !== 3) fail('stars never go down')

  if (!isOpen(order, {}, 'triads')) fail('first stage is open')
  if (isOpen(order, {}, 'sevenths')) fail('second stage waits')
  if (!isOpen(order, { triads: { stars: 1, best: 0, fails: 0 } }, 'sevenths')) fail('one star opens the next')
  if (isOpen(order, { inversions: { stars: 0, best: 0, fails: 3 } }, 'boss')) fail('the boss waits for a Stage 3 clear')
  if (!isOpen(order, { boss: { stars: 1, best: 0, fails: 0 } }, 'endless')) fail('Endless opens after the boss')
  return failures
}
