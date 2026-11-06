/// <reference types="node" />
// Run: node --import ./scripts/ts-esbuild-hooks.mjs src/runAllTests.ts --file src/arcade/progressTest.ts
import { afterMisses, afterRun, isOpen, levelOf, offersAssist, weakConcept, weakItems, xpFor } from './progress'

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
  const one = { stars: 1, best: 0, fails: 0 }
  if (!isOpen(order, { inversions: one }, 'sevenths') || !isOpen(order, { inversions: one }, 'boss')) fail('a Placement star opens what it skipped and what follows')
  if (isOpen(order, { inversions: one }, 'endless')) fail('Endless still waits for the boss')

  // Saves from before XP and misses keep working: only their absence, nothing to migrate
  if (levelOf(0).level !== 1 || levelOf(0).into !== 0) fail('a new player is level 1')
  const seven = levelOf(3340)
  if (seven.level !== 7 || seven.into !== 340 || seven.of !== 500) fail('level and progress come from XP alone')
  if (xpFor({ cleared: true, stars: 3, score: 1 }, true) <= xpFor({ cleared: true, stars: 1, score: 1 }, false)) fail('more stars and a best earn more')
  if (xpFor({ cleared: false, stars: 3, score: 1 }, false) >= xpFor({ cleared: true, stars: 1, score: 1 }, false)) fail('a lost run earns no stars')

  let misses = afterMisses({}, 'sevenths', { Dm7: 3, G7: 1 })
  if (weakItems(misses, 'sevenths').join() !== 'Dm7,G7') fail('worst first')
  if (weakConcept(misses, () => true) !== 'sevenths') fail('a concept with misses is weak')
  if (weakConcept({}, () => true) !== null) fail('a first-time player has no weak spot')
  if (weakConcept(misses, () => false) !== null) fail('a weak spot needs somewhere to play it')
  misses = afterMisses(misses, 'sevenths', {})
  if (misses.sevenths.Dm7 !== 2 || misses.sevenths.G7 !== undefined) fail('a clean run heals one')
  misses = afterMisses(afterMisses(misses, 'sevenths', {}), 'sevenths', {})
  if (misses.sevenths) fail('a healed concept is gone')
  return failures
}
