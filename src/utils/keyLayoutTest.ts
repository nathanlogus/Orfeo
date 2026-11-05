import { fitKeyRange } from './keyLayout'

export function runKeyLayoutTest(): number {
  let failures = 0
  const same = (low: number, high: number, min: number, max: number, why: string) => {
    const got = fitKeyRange(low, high)
    if (got.min !== min || got.max !== max) { failures++; console.error(`${why}: got ${got.min}-${got.max}`) }
  }
  same(50, 83, 48, 84, 'snaps out to the Cs around the notes')
  same(48, 84, 48, 84, 'a C at the edge stays')
  same(60, 64, 48, 72, 'a thin melody still gets two octaves')
  same(21, 108, 21, 108, 'never past the 88 keys')
  same(100, 106, 84, 108, 'grows down at the top of the piano')
  same(22, 26, 21, 48, 'grows up at the bottom of the piano')
  return failures
}
