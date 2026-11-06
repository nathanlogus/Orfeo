import { beatPulse } from './useCountInPulse'

export function runCountInPulseTest(): number {
  console.group('[useCountInPulse] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-9

  // Pulses land on the real click times at any tempo
  for (const bpm of [40, 120, 240]) {
    const beat = 60 / bpm
    const clicks = [1, 2, 3, 4].map((n, i) => ({ rel: 0.1 + i * beat, n }))
    const total = 0.1 + 4 * beat
    check(beatPulse(clicks, total, 0.05).pulse === 0, `${bpm}: nothing before the first click`)
    check(near(beatPulse(clicks, total, clicks[0].rel).pulse, 1), `${bpm}: first beat is full strength`)
    check(near(beatPulse(clicks, total, clicks[1].rel).pulse, 0.7), `${bpm}: other beats are softer`)
    check(beatPulse(clicks, total, clicks[1].rel - 0.001).pulse < 0.1, `${bpm}: the pulse has fallen by the next beat`)
    check(beatPulse(clicks, total, clicks[2].rel).exit === 0, `${bpm}: no exit before the last beat`)
    check(beatPulse(clicks, total, clicks[3].rel).exit === 0, `${bpm}: the last beat still hits`)
    check(near(beatPulse(clicks, total, clicks[3].rel + beat).exit, 1), `${bpm}: fully open one beat after the last click`)
  }
  check(beatPulse([{ rel: 0, n: 1 }], 0.5, 0).pulse === 1, 'a lone click (a pickup) still pulses')

  console.log(`${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
