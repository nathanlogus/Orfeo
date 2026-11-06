import { useStore } from '../store'
import { useFoldersPage } from '../components/SettingsPanel/foldersPage'
import { closeSet, encoreSong, endSet, playEncore, playSet, setScore, skipSong, type SetResult, type SetRun } from './setSession'

const song = (path: string) => ({ path, title: path, size: 0 })
const result = (percent: number | null, state: SetResult['state'], encore = false): SetResult => ({ title: '', percent, state, encore })

export async function runSetSessionTest(): Promise<number> {
  let failures = 0
  const eq = (name: string, got: unknown, want: unknown) => {
    const a = JSON.stringify(got), b = JSON.stringify(want)
    if (a !== b) { console.error(`FAIL ${name}: got ${a}, want ${b}`); failures++ }
  }
  eq('only songs played through count', setScore([result(80, 'played'), result(100, 'skipped'), result(null, 'listened'), result(null, 'failed'), result(100, 'played', true)]), 80)
  eq('nothing played has no score', setScore([result(null, 'failed')]), null)
  const run = (over: Partial<SetRun>): SetRun => ({ songs: [song('a'), song('b')], index: 1, stage: 'summary', results: [result(90, 'played'), result(95, 'played')], encore: false, ...over })
  eq('a strong set takes its best song', encoreSong(run({}))?.path, 'b')
  eq('a weak set has no encore', encoreSong(run({ results: [result(60, 'played'), result(95, 'played')] })), null)
  eq('a set ended early has no encore', encoreSong(run({ results: [result(100, 'played')] })), null)
  eq('one encore only', encoreSong(run({ encore: true })), null)

  // The SettingsPanel's end of a load, and timers that fire when told to
  ;(globalThis as any).window = { electronAPI: { getPrefs: async () => ({}), setPrefs: async () => {}, songServerDownload: async () => { throw new Error('offline') } } }
  let timers: (() => void)[] = []
  ;(globalThis as any).setTimeout = (fn: () => void) => { timers.push(fn); return timers.length }
  const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve() }
  const fire = async () => { const due = timers; timers = []; due.forEach(fn => fn()); await settle() }
  const S = () => useStore.getState()
  let opened: string[] = []
  useStore.subscribe(s => {
    if (!s.songToOpen) return
    const path = s.songToOpen
    opened.push(path)
    useStore.setState({ songToOpen: null })
    if (path.startsWith('bad')) useFoldersPage.setState({ failed: path })
    else useStore.setState({ midi: { fileName: path, _filePath: path, duration: 10, tracks: [] } as any, currentTime: 0, playbackState: 'stopped' })
  })
  const states = () => S().setRun?.results.map(r => r.state)

  useStore.setState({ waitForNotes: true, countInEnabled: false })
  await playSet([song('one'), song('bad'), { ...song('gone'), server: 'http://x' }, song('two'), song('three')])
  await settle()
  eq('the set opens its first song', [opened, S().setRun?.stage], [['one'], 'playing'])
  eq('nothing waits for notes in a set', S().waitForNotes, false)
  await fire()
  eq('the song starts by itself', S().playbackState, 'playing')

  useStore.setState({ currentTime: 10, playbackState: 'stopped' })
  eq('a song ends on the short score', [S().setRun?.stage, S().practiceResult], ['score', null])
  await fire()
  await settle()
  eq('files and downloads that fail are skipped', [states(), S().setRun?.index, opened], [['listened', 'failed', 'failed'], 3, ['one', 'bad', 'two']])
  await fire()

  skipSong()
  await settle()
  eq('skip moves on with no score to wait through', [states()?.[3], S().setRun?.stage, S().setRun?.index], ['skipped', 'playing', 4])
  await fire()
  useStore.setState({ currentTime: 10, playbackState: 'stopped' })
  await fire()
  eq('the last song leads to the summary', S().setRun?.stage, 'summary')

  closeSet()
  eq('the settings are as they were', [S().setRun, S().waitForNotes, S().countInEnabled, S().homeOpen], [null, true, false, true])

  await playSet([song('one'), song('two')])
  await settle()
  await fire()
  endSet()
  eq('ending early still summarises', [S().setRun?.stage, states(), S().playbackState], ['summary', ['skipped'], 'stopped'])
  closeSet()

  await playSet([song('one'), song('two')])
  await settle()
  await fire()
  useStore.setState({ midi: { fileName: 'other', _filePath: 'other', duration: 10, tracks: [] } as any })
  eq('another song opened by hand ends the set', S().setRun?.stage, 'summary')
  closeSet()

  // An encore: one more turn, then back to the summary
  useStore.setState({ setRun: run({}), waitForNotes: false })
  playEncore()
  await settle()
  eq('the encore is the best song', S().setRun?.songs.at(-1)?.path, 'b')
  await fire()
  useStore.setState({ practiceResult: { percent: 70 } as any, currentTime: 10, playbackState: 'stopped' })
  await fire()
  eq('the encore leaves the set score alone', [S().setRun?.stage, setScore(S().setRun!.results), S().setRun?.results.at(-1)?.encore], ['summary', 93, true])
  closeSet()

  return failures
}
