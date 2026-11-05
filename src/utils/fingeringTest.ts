import { fingerEvents } from './fingering'

export function runFingeringTest(): number {
  console.group('[fingering] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }
  const line = (hand: 'L' | 'R', notes: number[]) => fingerEvents(hand, notes.map(n => [n])).flat().join('')

  const cScale = [60, 62, 64, 65, 67, 69, 71, 72]
  check(line('R', cScale) === '12312345', `right hand C scale up, got ${line('R', cScale)}`)
  check(line('R', [...cScale].reverse()) === '54321321', `right hand C scale down, got ${line('R', [...cScale].reverse())}`)
  check(line('L', cScale) === '54321321', `left hand C scale up, got ${line('L', cScale)}`)
  check(line('L', [...cScale].reverse()) === '12312345', `left hand C scale down, got ${line('L', [...cScale].reverse())}`)
  check(line('R', [60, 62, 64, 65, 67]) === '12345', 'five notes in reach need no crossing')

  check(fingerEvents('R', [[60, 64, 67]]).flat().join() === '1,3,5', 'right hand C triad')
  check(fingerEvents('L', [[48, 52, 55]]).flat().join() === '5,3,1', 'left hand C triad')
  check(fingerEvents('R', [[67, 60, 64]]).flat().join() === '5,1,3', 'fingers follow the notes in the order given')

  check(!line('R', [61, 63, 65]).startsWith('1'), 'the thumb stays off a black key when it can')
  check(fingerEvents('L', [[48, 52, 55], [53, 57, 60]]).map(c => c.join()).join(' ') === '5,3,1 5,3,1', 'a chord shape moves whole')
  const pinned = fingerEvents('R', [[60], [62], [64]], [[3]]).flat()
  check(pinned[0] === 3 && pinned[1] !== 1, 'a printed finger stays and the next notes plan around it')
  const out = fingerEvents('R', [[60, 62, 64, 65, 67, 69], [60]])
  check(out[0].length === 0 && out[1].length === 1, 'six notes in one hand stay unmarked')
  check(fingerEvents('R', []).length === 0, 'an empty staff has nothing to do')

  console.log(`fingering: ${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
