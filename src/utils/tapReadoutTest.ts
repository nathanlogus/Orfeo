import { fileBpmAt, tappedBpm } from './tapReadout'

export function runTapReadoutTest(): number {
  console.group('[tapReadout] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }

  const map = [{ time: 0, bpm: 120 }, { time: 10, bpm: 90 }]
  check(fileBpmAt(map, 0) === 120, 'tempo at the start')
  check(fileBpmAt(map, 9.9) === 120, 'still the first tempo just before the change')
  check(fileBpmAt(map, 10) === 90, 'the new tempo from its own moment')
  check(fileBpmAt([], 5) === 0, 'no tempo map reads 0, for the panel to leave out')

  const beats = [0, 0.5, 1, 1.5, 2, 2.5]
  check(tappedBpm(beats.slice(0, 2)) === null, 'too few taps: no reading yet')
  check(Math.abs((tappedBpm(beats) ?? 0) - 120) < 0.01, 'taps half a second apart are 120')
  const bars = [0, 2, 4, 6, 8]
  check(Math.abs((tappedBpm(bars, 4) ?? 0) - 120) < 0.01, 'a two-second 4/4 bar is 120')

  console.log(`${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
