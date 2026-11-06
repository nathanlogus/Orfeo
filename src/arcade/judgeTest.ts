/// <reference types="node" />
// Run: node --import ./scripts/ts-esbuild-hooks.mjs src/runAllTests.ts --file src/arcade/judgeTest.ts
import { anyKey, anyOctave, createJudge, exactly } from './judge'

export function runArcadeJudgeTest(): number {
  let failures = 0
  const fail = (m: string) => { console.error(`FAIL  ${m}`); failures++ }

  const line = createJudge([{ at: 1000, accepts: exactly(64) }, { at: 1500, accepts: exactly(67) }])
  if (line.press(64, 500) !== null) fail('a key with nothing due is nobody\'s')
  if (line.press(60, 1020)?.grade !== 'wrong') fail('a wrong key on a due note is wrong')
  if (line.left !== 2) fail('wrong leaves the note open')
  const late = line.press(64, 1100)
  if (late?.grade !== 'good' || late.offset !== 100) fail('late inside the window is good, and says how late')
  if (line.press(67, 1490)?.grade !== 'perfect') fail('close is perfect')
  if (line.left !== 0) fail('both notes judged')

  const missed = createJudge([{ at: 1000, accepts: anyKey }])
  if (missed.tick(1100).length) fail('still inside its window')
  if (missed.tick(1200)[0]?.grade !== 'miss') fail('past its window is a miss')
  if (missed.tick(1300).length) fail('a miss is reported once')

  // A stamp from before a slow frame still counts: only the key's own time matters
  const stamped = createJudge([{ at: 1000, accepts: anyOctave(60) }])
  if (stamped.press(84, 1005)?.grade !== 'perfect') fail('any octave of the pitch')

  const ordered = createJudge([{ at: 0, accepts: exactly(60) }, { at: 0, accepts: exactly(62) }], { good: Infinity })
  if (ordered.press(60, 99999)?.grade !== 'perfect') fail('no timer means no lateness')
  if (ordered.press(60, 99999)?.grade !== 'wrong') fail('the next note is the one asked for')
  if (ordered.tick(1e9).length) fail('no timer means no misses')
  return failures
}
