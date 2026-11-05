import { useStore } from '../store'
import type { ParsedMidi } from '../types'
import { endPractice, practiceClock, setPracticeSteps } from './practiceSession'

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

  if (!failures) console.log('[practiceSession] all passed')
  return failures
}
