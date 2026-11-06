import { buildPracticeResult, type PhraseRun } from './practiceResult'
import type { PhraseProgress } from './practiceScore'

export function runPracticeResultTest(): number {
  let failures = 0
  const eq = (name: string, got: unknown, want: unknown) => {
    const a = JSON.stringify(got), b = JSON.stringify(want)
    if (a !== b) { console.error(`FAIL ${name}: got ${a}, want ${b}`); failures++ }
  }
  const run = (phrase: number, played: number, over: Partial<PhraseRun> = {}): PhraseRun =>
    ({ phrase, steps: 10, played, levelBefore: 2, levelAfter: 2, wins: 0, auto: true, partway: false, ...over })
  const progress: PhraseProgress[] = [{ level: 3, wins: 0, best: 0.95 }, { level: 2, wins: 1, best: 0.4 }]
  const base = { song: 'S', level: 0, tempoPercent: 80, progress, starts: [0, 8, 16, 24], barCount: 14, duration: 30, masteryBefore: 30 }

  eq('listening has no result', buildPracticeResult({ ...base, runs: [] }), null)

  const r = buildPracticeResult({ ...base, runs: [run(1, 0.8, { steps: 30, wins: 0 }), run(0, 0.95, { levelAfter: 3 })] })!
  eq('phrases in song order', r.rows.map(x => x.bars), ['Bars 1–4', 'Bars 5–8'])
  eq('weighted by what there was to play', r.percent, 84)
  eq('title', r.title, 'Bars 1–8, played through.')
  eq('moving up', [r.rows[0].tag, r.rows[0].note, r.rows[0].moved], ['Moves up to level 3', 'Over 90% twice in a row', true])
  eq('staying', [r.rows[1].tag, r.rows[1].note, r.rows[1].moved], ['Stays on level 2', 'Reach 90% twice to move up', false])
  eq('whole song map', r.map.map(m => m.state), ['learned', 'started', 'none', 'none'])
  eq('played phrases are marked', r.map.map(m => m.played), [true, true, false, false])
  eq('mastery from saved progress', [r.mastery, r.masteryBefore], [34, 30])
  eq('again', [r.again.label, r.again.time, r.again.end], ['Bars 1–8', 0, 16])
  eq('next is as long, and stops at the last bar', [r.next?.label, r.next?.time, r.next?.end], ['Bars 9–14', 16, 30])

  const down = buildPracticeResult({ ...base, runs: [run(0, 0.4, { levelBefore: 3, levelAfter: 2 })] })!
  eq('moving down', down.rows[0].tag, 'Moves down to level 2')
  const once = buildPracticeResult({ ...base, runs: [run(0, 0.92, { wins: 1 })] })!
  eq('one clean pass', once.rows[0].note, 'Once more over 90% to move up')
  const top = buildPracticeResult({ ...base, runs: [run(0, 0.95, { levelBefore: 5, levelAfter: 5 })] })!
  eq('top level', top.rows[0].note, 'This phrase is at the top level')
  const chosen = buildPracticeResult({ ...base, runs: [run(0, 0.95, { auto: false, levelBefore: 4, levelAfter: 4 })] })!
  eq('a level you chose', [chosen.rows[0].tag, chosen.rows[0].note], ['Level 4', 'You chose this level'])
  const part = buildPracticeResult({ ...base, runs: [run(2, 0.5, { partway: true })] })!
  eq('stopped partway', [part.title, part.rows[0].tag], ['Bars 9–12, so far.', 'Not finished'])
  const gap = buildPracticeResult({ ...base, runs: [run(0, 1), run(2, 1)] })!
  eq('phrases with a gap', gap.title, '2 phrases, played through.')
  const last = buildPracticeResult({ ...base, runs: [run(3, 1)] })!
  eq('nothing after the last phrase', [last.next, last.rows[0].bars], [null, 'Bars 13–14'])

  eq('every run counted', chosen.notCounted, null)
  const waited = buildPracticeResult({ ...base, runs: [run(0, 1, { uncounted: 'wait' })] })!
  eq('a run under Wait', [waited.rows[0].tag, waited.rows[0].moved, waited.notCounted?.startsWith('Notes played while Wait')], ['Not counted', false, true])
  const slower = buildPracticeResult({ ...base, runs: [run(0, 0.95, { levelAfter: 3, uncounted: 'slow' })] })!
  eq('a slower run still moves up', [slower.rows[0].tag, slower.rows[0].note], ['Moves up to level 3', 'Over 90% twice in a row · under 100% tempo, so mastery stays'])

  if (!failures) console.log('[practiceResult] all passed')
  return failures
}
