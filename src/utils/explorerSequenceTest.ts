import { PROGRESSIONS, progressionSteps, resolveProgressionStep } from './explorerShared'

export function runExplorerSequenceTest(): number {
  console.group('[explorerSequence] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }

  const pop = PROGRESSIONS.find(p => p.name === 'Pop')!
  const inC = progressionSteps(pop, 0)
  check(inC.map(s => s.rootPc).join() === '0,7,9,5', 'Pop in C is C G A F')
  check(inC[2].suffix === 'm' && inC[2].semis.join() === '0,3,7', 'vi is minor')
  check(progressionSteps(pop, 2).map(s => s.rootPc).join() === '2,9,11,7', 'the key moves every step')
  check(PROGRESSIONS.every(p => progressionSteps(p, 5, 'ipanema').length === p.labels.length), 'every progression resolves in a style')
  const step = resolveProgressionStep(pop, 1, 0, 'ipanema')!
  check(progressionSteps(pop, 0, 'ipanema')[1].rootPc === step.rootPc, 'a style\'s tritone substitute is what plays')

  console.log(`${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
