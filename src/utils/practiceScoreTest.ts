import { accuracy, afterPhrase, mastery, phraseOf, phraseStarts } from './practiceScore'

export function runPracticeScoreTest(): number {
  let failures = 0
  const eq = (name: string, got: unknown, want: unknown) => {
    const a = JSON.stringify(got), b = JSON.stringify(want)
    if (a !== b) { console.error(`FAIL ${name}: got ${a}, want ${b}`); failures++ }
  }

  const starts = phraseStarts([0, 2, 4, 6, 8, 10, 12, 14, 16])
  eq('a phrase every four bars', starts, [0, 8, 16])
  eq('phrase of a time', [phraseOf(starts, 0), phraseOf(starts, 7.9), phraseOf(starts, 8), phraseOf(starts, 99)], [0, 0, 1, 2])
  eq('no bars', phraseStarts([]), [0])

  const steps = [{ time: 1, notes: [{ midi: 60 }, { midi: 64 }] }, { time: 2, notes: [{ midi: 67 }] }]
  eq('all played', accuracy(steps, [{ midi: 60, time: 1 }, { midi: 64, time: 1.1 }, { midi: 67, time: 1.9 }], 0.25), 1)
  eq('half a chord misses that step', accuracy(steps, [{ midi: 60, time: 1 }, { midi: 67, time: 2 }], 0.25), 0.5)
  eq('too late misses', accuracy(steps, [{ midi: 67, time: 2.3 }], 0.25), 0)
  eq('extra keys cost nothing', accuracy(steps.slice(1), [{ midi: 67, time: 2 }, { midi: 61, time: 2 }], 0.25), 1)
  eq('nothing to play', accuracy([], [], 0.25), null)

  const start = { level: 2, wins: 0, best: 0 }
  const once = afterPhrase(start, 0.95, 2, true)
  eq('one clean pass waits', [once.level, once.wins], [2, 1])
  const twice = afterPhrase(once, 0.95, 2, true)
  eq('two clean passes go up', [twice.level, twice.wins], [3, 0])
  eq('a middling pass starts over', afterPhrase(once, 0.7, 2, true).wins, 0)
  eq('a poor pass goes down', afterPhrase(start, 0.3, 2, true).level, 1)
  eq('never below 1', afterPhrase({ level: 1, wins: 0, best: 0 }, 0, 1, true).level, 1)
  eq('never above 5', afterPhrase({ level: 5, wins: 1, best: 0 }, 1, 5, true).level, 5)
  eq('a chosen level stays', afterPhrase({ level: 2, wins: 1, best: 0 }, 1, 4, false).level, 2)
  eq('best counts the level', afterPhrase(start, 1, 4, false).best, 0.8)
  eq('best never falls', afterPhrase({ level: 3, wins: 0, best: 0.8 }, 0.2, 3, false).best, 0.8)

  eq('mastery over the whole song', mastery([{ level: 5, wins: 0, best: 1 }], 2), 50)
  eq('no phrases', mastery([], 0), 0)
  return failures
}
