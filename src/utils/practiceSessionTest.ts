import { useStore } from '../store'
import type { ParsedMidi } from '../types'
import { endPractice, memoryStepAt, practiceClock, setPracticeSteps } from './practiceSession'
import { drainPracticeMarks } from './hitEffectQueue'

// When the Results screen comes up: a song's end or End, keys played, never mid-song
function fakeMidi(): ParsedMidi {
  return {
    fileName: 'session.mid', duration: 20, bpm: 60, timeSignatureNumerator: 4, timeSignatureDenominator: 4,
    tracks: [], noteCount: 0, _barTimes: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19],
  } as ParsedMidi
}

export async function runPracticeSessionTest(): Promise<number> {
  let failures = 0
  const eq = (name: string, got: unknown, want: unknown) => {
    const a = JSON.stringify(got), b = JSON.stringify(want)
    if (a !== b) { console.error(`FAIL ${name}: got ${a}, want ${b}`); failures++ }
  }
  ;(globalThis as any).window = { electronAPI: { getPrefs: async () => ({}), setPrefs: async () => {} } }
  const S = () => useStore.getState()
  setPracticeSteps(() => [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19].map(time => ({ time, notes: [{ midi: 60 }] })))
  const press = (time: number) => {
    useStore.setState({ currentTime: time, midiHeldKeys: new Set([60]) })
    useStore.setState({ midiHeldKeys: new Set() })
  }
  const load = () => {
    useStore.setState({ midi: fakeMidi() as any, practiceResult: null, practiceLevel: 5, currentTime: 0, playbackState: 'playing', bpm: 60, originalBpm: 60 })
    practiceClock(0)
  }
  const reachEnd = (clock = 20) => useStore.setState({ currentTime: clock, playbackState: 'stopped' })

  load()
  for (let time = 0.5; time < 20; time += 0.5) practiceClock(time)
  reachEnd()
  eq('listening to the end shows nothing', S().practiceResult, null)

  load()
  for (let time = 0; time <= 4; time += 0.5) { practiceClock(time); if (Number.isInteger(time) && time < 4) press(time) }
  eq('a phrase finishing mid-song interrupts nothing', S().practiceResult, null)
  for (let time = 4.5; time < 20; time += 0.5) practiceClock(time)
  reachEnd()
  eq('the song ends: the played phrase, whole', [S().practiceResult?.rows.length, S().practiceResult?.percent, S().practiceResult?.title], [1, 100, 'Bars 1–4, played through.'])
  eq('its level is counted in the map', S().practiceResult?.map[0], { state: 'learned', played: true })

  load()
  for (let time = 0.5; time < 20; time += 0.5) practiceClock(time)
  reachEnd()
  eq('each song end starts afresh', S().practiceResult, null)

  load()
  practiceClock(1)
  press(1)
  practiceClock(9)
  practiceClock(9.5)
  endPractice()
  eq('skipping ahead scores nothing for the phrase left', S().practiceResult, null)

  load()
  practiceClock(16)
  for (let time = 16; time < 20; time += 0.5) { practiceClock(time); if (Number.isInteger(time)) press(time) }
  useStore.setState({ currentTime: 19.9 })
  reachEnd(0)
  eq('the engine ends a song by going back to 0', S().practiceResult?.title, 'Bars 17–20, played through.')

  load()
  practiceClock(1)
  press(1)
  useStore.setState({ currentTime: 2 })
  reachEnd(0)
  eq('Stop mid-song shows nothing', S().practiceResult, null)
  endPractice()

  load()
  practiceClock(1)
  press(1)
  practiceClock(2)
  endPractice()
  eq('End mid-phrase: shown, marked unfinished', [S().practiceResult?.rows[0].tag, S().practiceResult?.title, S().practiceResult?.percent], ['Not finished', 'Bars 1–4, so far.', 33])

  load()
  practiceClock(2)
  endPractice()
  eq('End with no keys played shows nothing', S().practiceResult, null)

  load()
  useStore.setState({ lessonRun: { id: 'l', step: {} as any, percent: null, clean: 0 } })
  practiceClock(1)
  press(1)
  practiceClock(2)
  endPractice()
  eq('a lesson keeps its own ending', S().practiceResult, null)

  useStore.setState({ lessonRun: null })

  // ── Hit and miss, as it happens ──
  const marks = () => drainPracticeMarks().map(m => (m.hit ? 'hit' : 'miss'))
  load()
  drainPracticeMarks()
  for (let time = 0.5; time < 8; time += 0.5) practiceClock(time)
  eq('listening is marked for nothing', marks(), [])

  load()
  useStore.setState({ detectedKey: { transpose: 2 } as any })
  const pressKey = (time: number) => { useStore.setState({ currentTime: time, midiHeldKeys: new Set([62]) }); useStore.setState({ midiHeldKeys: new Set() }) }
  pressKey(0.1)
  eq('a hit shows as it is played, on the key pressed', drainPracticeMarks(), [{ midi: 62, hit: true }])
  for (let time = 0.5; time <= 1.5; time += 0.5) practiceClock(time)
  eq('a miss shows once the window has passed, on the key to play', drainPracticeMarks(), [{ midi: 62, hit: false }])
  useStore.setState({ detectedKey: null })

  load()
  useStore.setState({ waitForNotes: true })
  press(0)
  drainPracticeMarks()
  for (let time = 0.5; time <= 2; time += 0.5) practiceClock(time)
  eq('Wait has no misses', marks(), [])
  useStore.setState({ waitForNotes: false })

  // ── Phrase edges: the score goes by the same window as the marks ──
  setPracticeSteps(() => [1, 3.9, 4, 6].map(time => ({ time, notes: [{ midi: 60 }] })))
  load()
  for (const [clock, key] of [[1, 1], [2, 0], [3, 0], [3.5, 0], [4, 4.1], [4.3, 0], [4.5, 0], [5, 0], [6, 6], [7, 0], [7.9, 0]]) { practiceClock(clock); if (key) press(key) }
  endPractice()
  eq('a late last note and an early first note both land', S().practiceResult?.rows.map(r => r.percent), [100, 100])

  load()
  for (const [clock, key] of [[1, 1], [2, 0], [3, 0], [3.5, 3.9], [4, 0], [5, 0], [6, 0], [7, 0], [8, 0], [8.5, 0], [9, 0]]) { practiceClock(clock); if (key) press(key) }
  eq('stopping before a phrase marks no misses in it', marks().filter(m => m === 'miss'), [])
  endPractice()
  eq('a key at the end of one phrase never scores the next', S().practiceResult?.rows.length, 1)

  // ── What counts, and what's saved ──
  const song = { fileName: 'counts.mid', duration: 8, _barTimes: [0, 1, 2, 3, 4, 5, 6, 7] }
  await new Promise(resolve => setTimeout(resolve, 0))
  const kept = { phrases: [{ level: 2, wins: 0, best: 0.1 }], mastery: 5, other: 'kept' }
  let prefs: any = { practiceProgress: { 'counts.mid': kept, 'other.mid': { phrases: [], mastery: 9 } } }
  ;(globalThis as any).window = { electronAPI: { getPrefs: async () => prefs, setPrefs: async (p: any) => { prefs = { ...prefs, ...p } } } }
  setPracticeSteps(() => [0, 1, 2, 3, 4, 5, 6, 7].map(time => ({ time, notes: [{ midi: 60 }] })))
  const settle = () => new Promise(resolve => setTimeout(resolve, 0))
  const open = async (over: object) => {
    useStore.setState({ midi: { ...fakeMidi(), ...song } as any, practiceResult: null, practiceLevel: 0, currentTime: 0, playbackState: 'playing', bpm: 60, originalBpm: 60, waitForNotes: false, memoryMode: false, phraseResult: null, ...over })
    await settle()
    practiceClock(0)
  }
  // Keys on every step of the first phrase, then on past its end
  const run = async (hold = false) => {
    practiceClock(4.5)
    practiceClock(0)
    for (let time = 0; time < 4; time++) {
      practiceClock(time)
      useStore.setState({ playbackState: hold ? 'paused' : 'playing' })
      press(time)
      useStore.setState({ playbackState: 'playing' })
    }
    practiceClock(4); practiceClock(4.5)
    await settle()
  }
  const first = () => prefs.practiceProgress['counts.mid'].phrases[0]

  await open({ waitForNotes: true })
  eq('saved progress loads as it was', S().phraseLevels, [2])
  await run(true)
  await run(true)
  eq('a run held by Wait moves nothing', first(), { level: 2, wins: 0, best: 0.1 })
  eq('nor does it say the level moved', S().phraseResult?.moved, 0)
  endPractice()
  eq('Results says it did not count', S().practiceResult?.rows[0].tag, 'Not counted')

  await open({ waitForNotes: true })
  await run(false)
  eq('Wait on, but played in time: it counts', first().wins, 1)

  await open({ bpm: 30 })
  await run()
  eq('a slower run moves the level, not mastery', [first().level, first().best], [3, 0.4])
  eq('the level change is shown', S().phraseResult?.moved, 1)
  eq('the rest of the saved song is left alone', [prefs.practiceProgress['counts.mid'].other, prefs.practiceProgress['other.mid'].mastery], ['kept', 9])

  await open({ memoryMode: true, practiceLevel: 5 })
  eq('nothing has faded yet', memoryStepAt(1), 0)
  await run()
  eq('a clean run at the full level starts the fade', [memoryStepAt(1), first().memory], [1, 1])
  eq('only for that phrase', memoryStepAt(5), 0)
  useStore.setState({ memoryMode: false })
  eq('Memory off shows every note', memoryStepAt(1), 0)
  useStore.setState({ memoryMode: true, lessonRun: { id: 'l', step: {} as any, percent: null, clean: 0 } })
  eq('a lesson shows every note', memoryStepAt(1), 0)
  useStore.setState({ lessonRun: null })
  useStore.setState({ bpm: 50 })
  await run()
  eq('a slower run does not fade', first().memory, 1)
  useStore.setState({ bpm: 60 })
  await run(); await run()
  eq('gone', [memoryStepAt(1), S().phraseMemory], [3, [3, 0]])
  practiceClock(0); press(0)
  for (const time of [1, 2, 3, 4, 4.5]) practiceClock(time)
  await settle()
  eq('a rough run brings the notes back', memoryStepAt(1), 0)
  eq('never memorized so far', prefs.practiceProgress['counts.mid'].memorized, undefined)

  // The whole song, from memory
  const short = { fileName: 'whole.mid', duration: 4, _barTimes: [0, 1, 2, 3] }
  prefs = { practiceProgress: { 'whole.mid': { phrases: [{ level: 5, wins: 0, best: 1, memory: 3 }], mastery: 100 } } }
  setPracticeSteps(() => [0, 1, 2, 3].map(time => ({ time, notes: [{ midi: 60 }] })))
  const wholeSong = async (over: object) => {
    useStore.setState({ midi: { ...fakeMidi(), ...short } as any, practiceResult: null, practiceLevel: 5, currentTime: 0, playbackState: 'playing', bpm: 60, originalBpm: 60, waitForNotes: false, ...over })
    await settle()
    for (let time = 0; time < 4; time++) { practiceClock(time); press(time) }
    useStore.setState({ currentTime: 3.9 })
    reachEnd(4)
    await settle()
  }
  await wholeSong({ memoryMode: false })
  eq('with the notes showing, nothing is recorded', prefs.practiceProgress['whole.mid'].memorized, undefined)
  await wholeSong({ memoryMode: true })
  const at = prefs.practiceProgress['whole.mid'].memorized
  eq('played with no notes showing, it is recorded', typeof at, 'number')
  await wholeSong({ memoryMode: true })
  eq('the first time stays', prefs.practiceProgress['whole.mid'].memorized, at)
  useStore.setState({ memoryMode: false, midi: null, playbackState: 'stopped' })

  if (!failures) console.log('[practiceSession] all passed')
  return failures
}
