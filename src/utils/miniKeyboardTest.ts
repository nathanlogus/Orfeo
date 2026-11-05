import { miniKeyboardRange, miniKeyboardLayout } from './miniKeyboard'

export function runMiniKeyboardTest(): number {
  console.group('[miniKeyboard] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }

  const c = miniKeyboardRange([60, 64, 67])
  check(c.low === 60 && c.high === 84, 'a C chord shows two octaves from its C')
  const a = miniKeyboardRange([57, 60, 64])
  check(a.low === 48 && a.high === 72, 'starts on the C below the lowest note')
  const wide = miniKeyboardRange([40, 47, 52, 56, 63, 67, 70, 73])
  check(wide.low === 36 && wide.high === 84, 'a wide chord widens the keyboard')
  check(miniKeyboardRange([]).low === 48, 'nothing lit: the Explorers\' home octave')

  const { whites, blacks } = miniKeyboardLayout([60])
  check(whites.length === 14 && blacks.length === 10, 'two octaves are 14 white and 10 black keys')
  check(blacks[0].midi === 61 && Math.abs(blacks[0].x - 100 / 14) < 1e-9, 'C sharp sits on the line after C')
  check(blacks.every(k => k.x > 0 && k.x < 100), 'every black key sits inside the keyboard')
  check([...whites, ...blacks].length === 24 && new Set([...whites, ...blacks].map(k => k.midi)).size === 24, 'every semitone once')

  console.log(`${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
