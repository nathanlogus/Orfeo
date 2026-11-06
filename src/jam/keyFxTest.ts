// Self-check: the band's keys light when their note is heard, and clear when it ends
// Run: node --import ./scripts/ts-esbuild-hooks.mjs src/runAllTests.ts --file src/jam/keyFxTest.ts
import { soundingAt } from './keyFx'

export function runKeyFxTest(): number {
  let failures = 0
  const fail = (m: string) => { console.error(`FAIL  ${m}`); failures++ }

  const notes = [{ midi: 60, at: 100, until: 200 }, { midi: 64, at: 150, until: 300 }]
  if (soundingAt(50, notes).length !== 0) fail('a planned note waits until it is heard')
  if (notes.length !== 2) fail('a planned note stays queued')
  if (soundingAt(120, notes).map(n => n.midi).join() !== '60') fail('only the note already heard lights')
  if (soundingAt(250, notes).map(n => n.midi).join() !== '64') fail('a finished note clears')
  if (notes.length !== 1) fail('a finished note leaves the list')
  return failures
}
