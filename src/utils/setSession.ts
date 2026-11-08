// ── A set: a list of songs played back to back. Each song ends on a short score
// and counts in the next, with no menus between. Songs open the way the Library
// opens them (SettingsPanel), so a song that won't load is noted and skipped.
import { useStore, type SongCoverInfo } from '../store'
import { useFoldersPage } from '../components/SettingsPanel/foldersPage'
import { cancelCountIn, startCountIn } from './countInRunner'
import { confirmPendingImportBeforeSwitch } from './foreignFormatImport'
import { confirmDiscardDirtyNoteEdits } from './noteEditorState'
import { confirmDiscardDirtyTempoKey } from './tempoKeySave'
import { endPractice, onSongEnded } from './practiceSession'
import type { SavedPractice } from './libraryWorkspace'

const SCORE_MS = 3000
const LOAD_LIMIT_MS = 15000
// The engines pick a new song up after the render that shows it
const ENGINE_PICKUP_MS = 200
const ENCORE_AT = 90

export interface SetSong { path: string; title: string; size: number; server?: string; cover?: SongCoverInfo; sheet?: boolean; practice?: SavedPractice }
export interface SetResult { title: string; percent: number | null; state: 'played' | 'listened' | 'skipped' | 'failed'; encore: boolean }
// results[i] is songs[i]: every song that's reached leaves one result
export interface SetRun { songs: SetSong[]; index: number; stage: 'loading' | 'playing' | 'score' | 'summary'; results: SetResult[]; encore: boolean }

// Songs played to the end, each counting the same. A skipped song's few bars say
// too little, and the encore is a bonus.
export function setScore(results: SetResult[]): number | null {
  const scored = results.filter(r => r.state === 'played' && !r.encore)
  return scored.length ? Math.round(scored.reduce((sum, r) => sum + r.percent!, 0) / scored.length) : null
}

// A strong set, played to its end, can take its best song again
export function encoreSong(run: SetRun): SetSong | null {
  if (run.encore || run.results.length < run.songs.length || (setScore(run.results) ?? 0) < ENCORE_AT) return null
  const percents = run.results.map(r => (r.state === 'played' ? r.percent! : -1))
  return run.songs[percents.indexOf(Math.max(...percents))]
}

let _load = 0
let _scoreTimer: ReturnType<typeof setTimeout> | undefined
let _waitForNotes = false

const current = () => useStore.getState().setRun
const update = (patch: Partial<SetRun>) => useStore.setState({ setRun: { ...current()!, ...patch } })
const pathOf = (midi: unknown) => (midi as any)?._filePath as string | undefined

function record(percent: number | null, state: SetResult['state']) {
  const run = current()!
  update({ results: [...run.results, { title: run.songs[run.index].title, percent, state, encore: run.encore }] })
}

// The song's score, before its Results screen can show
function takeScore() {
  const percent = useStore.getState().practiceResult?.percent ?? null
  useStore.setState({ practiceResult: null })
  return percent
}

// True once the song is open. Nothing here can stop the set: a failed download,
// a bad file and a load that never comes back all end in false.
function songOpens(song: SetSong, load: number) {
  return new Promise<boolean>(done => {
    const before = useStore.getState().midi
    const finish = (opened: boolean) => { clearTimeout(limit); stopMidi(); stopFailed(); done(opened) }
    const limit = setTimeout(() => finish(false), LOAD_LIMIT_MS)
    const stopMidi = useStore.subscribe(s => { if (s.midi !== before) finish(!!s.midi?.duration) })
    useFoldersPage.setState({ failed: null })
    const stopFailed = useFoldersPage.subscribe(s => { if (s.failed) finish(false) })
    const path = song.server ? window.electronAPI.songServerDownload(song.server, song.path, song.size, song.sheet) : Promise.resolve(song.path)
    path.then(p => { if (load === _load) useStore.getState().openSong(p, song.cover) }, () => finish(false))
  })
}

async function openAt(index: number) {
  const load = ++_load
  update({ index, stage: 'loading' })
  // Its save prompt would be a menu between songs
  useStore.getState().setPendingImportedFile(null)
  const opened = await songOpens(current()!.songs[index], load)
  if (load !== _load) return
  if (!opened) { record(null, 'failed'); nextSong(); return }
  const prefs = current()!.songs[index].practice
  let start = 0
  if (prefs) {
    const state = useStore.getState(), duration = state.midi?.duration ?? 0
    const tempo = Number.isFinite(prefs.tempo) ? Math.max(10, Math.min(300, prefs.tempo)) : 100
    start = Number.isFinite(prefs.start) ? Math.min(Math.max(0, prefs.start), Math.max(0, duration - .1)) : 0
    const end = prefs.end !== null && Number.isFinite(prefs.end) ? Math.min(duration, Math.max(start + .1, prefs.end)) : null
    const wanted = prefs.hand === 'left' ? 'L' : prefs.hand === 'right' ? 'R' : null
    useStore.setState({ bpm: state.originalBpm * tempo / 100, currentTime: start, loopStart: start, loopEnd: end, loopRegionEnabled: end !== null, loopRegionActive: end !== null,
      // Hand tracks retain the accompaniment and hide/mute only an opposing
      // homogeneous hand. Mixed/unlabelled tracks remain available. Reset both
      // homogeneous sides from any previous one-hand set before applying the
      // requested side; otherwise switching left ↔ right can leave the chosen
      // line hidden from the previous song's practice focus.
      tracks: state.tracks.map(t => {
        const notes = state.midi?.tracks.find(p => p.index === t.index)?.notes ?? []
        const hands = new Set(notes.map(n => n.hand).filter(Boolean))
        if (!wanted || hands.size !== 1) return t
        if (hands.has(wanted)) return { ...t, muted: false, visible: true }
        return { ...t, muted: true, visible: false }
      }) })
  }
  update({ stage: 'playing' })
  await new Promise(r => setTimeout(r, ENGINE_PICKUP_MS))
  if (load !== _load) return
  if (!startCountIn(true)) useStore.setState({ playbackState: 'playing', currentTime: start })
}

function nextSong() {
  const run = current()!
  if (run.index + 1 < run.songs.length) void openAt(run.index + 1)
  else update({ stage: 'summary' })
}

// Skip or End, whatever the song was doing. A song already scored has nothing left to do.
function leaveSong() {
  _load++
  clearTimeout(_scoreTimer)
  const { stage } = current()!
  if (stage === 'score') return
  cancelCountIn()
  if (stage === 'playing') endPractice()
  record(takeScore(), 'skipped')
  update({ stage: 'score' })
  useStore.setState({ playbackState: 'stopped' })
}

export async function playSet(songs: SetSong[]) {
  if (!await confirmDiscardDirtyNoteEdits('Save changes before starting this set?')) return
  if (!await confirmDiscardDirtyTempoKey('Save tempo/key changes before starting this set?')) return
  if (!await confirmPendingImportBeforeSwitch(songs[0].path)) return
  const s = useStore.getState()
  if (s.setRun) return
  cancelCountIn()
  _waitForNotes = s.waitForNotes
  // A set keeps moving, so nothing waits for a note. Its count-in is forced, not borrowed.
  useStore.setState({ setRun: { songs, index: 0, stage: 'loading', results: [], encore: false }, waitForNotes: false, homeOpen: false })
  void openAt(0)
}

export function skipSong() {
  if (!current() || current()!.stage === 'summary') return
  leaveSong()
  nextSong()
}

export function endSet() {
  if (!current() || current()!.stage === 'summary') return
  leaveSong()
  update({ stage: 'summary' })
}

export function playEncore() {
  const run = current()
  const song = run && encoreSong(run)
  if (!song) return
  update({ songs: [...run.songs, song], encore: true })
  void openAt(run.songs.length)
}

// Off the summary, and back to the menu with the settings as they were
export function closeSet() {
  const run = current()
  if (!run) return
  _load++
  useStore.setState({ setRun: null, waitForNotes: _waitForNotes, homeOpen: true })
  // Downloads join the Library once the set is over: a rescan between songs could be slow
  const { libraryFolder, setLibraryFiles } = useStore.getState()
  if (libraryFolder && run.songs.some(s => s.server)) void window.electronAPI.scanMidiFolder(libraryFolder).then(setLibraryFiles)
}

onSongEnded(() => {
  if (current()?.stage !== 'playing') return
  const percent = takeScore()
  record(percent, percent === null ? 'listened' : 'played')
  update({ stage: 'score' })
  _scoreTimer = setTimeout(nextSong, SCORE_MS)
})

// Another song opened by hand, or the song closed, is the end of the set
useStore.subscribe((s, prev) => {
  const stage = s.setRun?.stage
  if ((stage === 'playing' || stage === 'score') && pathOf(s.midi) !== pathOf(prev.midi)) endSet()
})
