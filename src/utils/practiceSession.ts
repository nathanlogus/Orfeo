// ── The practice session: what you've played in this phrase, and the song's
// saved progress. Notes come from the MIDI keyboard through stepThrough.ts, and
// a phrase is scored as the playhead leaves it. A phrase with no keys played is
// listening, not a bad result, so it doesn't count.
import { useStore } from '../store'
import { accuracy, afterPhrase, mastery, phraseOf, phraseStarts, type PhraseProgress, type Press, type ScoredStep } from './practiceScore'
import { lastPlayedAt, movedLastPlayed } from './homeSongs'

export const WINDOW_SEC = 0.25
const FIRST_AUTO_LEVEL = 1
// A loop that goes back near a phrase's end has played it
const NEARLY_DONE = 0.9
// Clocks wobble: only a real jump back is a seek
const SEEK_SEC = 0.25

export const AUTO_LEVEL = 0

export const songKey = (name: string) => name.split(/[\\/]/).pop() ?? name

let _song: unknown = null
let _phrase = 0
let _now = 0
let _presses: Press[] = []
let _progress: PhraseProgress[] = []
let _load = 0
let _stepsAt: () => ScoredStep[] = () => []

export function setPracticeSteps(stepsAt: () => ScoredStep[]) { _stepsAt = stepsAt }

const fresh = (): PhraseProgress => ({ level: FIRST_AUTO_LEVEL, wins: 0, best: 0 })
const starts = () => phraseStarts(useStore.getState().midi?._barTimes ?? [])

export function phraseLevelAt(time: number): number {
  return _progress[phraseOf(starts(), time)]?.level ?? FIRST_AUTO_LEVEL
}

function publish() {
  useStore.setState({ phraseLevels: _progress.map(p => p.level) })
}

function syncSong() {
  const { midi } = useStore.getState()
  if (midi === _song) return
  _song = midi
  _phrase = 0
  _now = 0
  _presses = []
  _progress = []
  publish()
  if (!midi) return
  const load = ++_load
  const key = songKey(midi.fileName)
  void window.electronAPI.getPrefs().then(p => {
    if (load !== _load) return
    const saved = p.practiceProgress?.[key]?.phrases
    if (Array.isArray(saved)) { _progress = saved; publish() }
  })
}

function save() {
  const { midi } = useStore.getState()
  if (!midi) return
  const key = songKey(midi.fileName)
  const phrases = _progress
  const percent = mastery(phrases.filter(Boolean), starts().length)
  useStore.setState({ phraseResult: { ...useStore.getState().phraseResult!, mastery: percent } })
  void window.electronAPI.getPrefs().then(p => window.electronAPI.setPrefs({
    practiceProgress: { ...p.practiceProgress, [key]: { phrases, mastery: percent } },
  }))
}

function finishPhrase() {
  const s = useStore.getState()
  const list = starts()
  const from = list[_phrase] ?? 0
  const to = list[_phrase + 1] ?? s.midi?.duration ?? 0
  const presses = _presses
  _presses = []
  if (!presses.length) return
  const auto = s.practiceLevel === AUTO_LEVEL
  const phraseSteps = _stepsAt().filter(step => step.time >= from - 1e-4 && step.time < to)
  const speed = s.bpm / s.originalBpm || 1
  const played = accuracy(phraseSteps, presses, WINDOW_SEC * speed)
  if (played === null) return
  const before = _progress[_phrase] ?? fresh()
  const level = auto ? before.level : s.practiceLevel
  while (_progress.length <= _phrase) _progress.push(fresh())
  _progress[_phrase] = afterPhrase(before, played, level, auto)
  useStore.setState({ phraseResult: { percent: Math.round(played * 100), level: _progress[_phrase].level, mastery: 0 } })
  publish()
  save()
}

// ── Keep going: the song and bar to go back to ──
let _resumeAt: { path: string; time: number } | null = null

// Continue playing: the next time this song opens, it opens where it was left
export function resumeSong(path: string, time: number) { _resumeAt = { path, time } }

function saveLastPlayed(time: number) {
  const { midi, practiceLevel } = useStore.getState()
  const path = (midi as any)?._filePath as string | undefined
  // A lesson's path names no file, so there's nothing to come back to
  if (!midi || !path || path.startsWith('lesson/')) return
  // The end of the song: going back means starting again
  const at = time >= midi.duration - 1 ? 0 : time
  void window.electronAPI.getPrefs().then(p => {
    const saved = p.practiceProgress?.[songKey(midi.fileName)]?.phrases?.[phraseOf(phraseStarts(midi._barTimes ?? []), at)]?.level
    const level = practiceLevel === AUTO_LEVEL ? saved ?? FIRST_AUTO_LEVEL : practiceLevel
    return window.electronAPI.setPrefs({ lastPlayed: lastPlayedAt(path, midi.fileName, midi._barTimes, at, level) })
  })
}

export function moveLastPlayed(pairs: { oldPath: string; newPath: string }[]) {
  void window.electronAPI.getPrefs().then(p => {
    if (p.lastPlayed) void window.electronAPI.setPrefs({ lastPlayed: movedLastPlayed(p.lastPlayed, pairs) })
  })
}

// Every frame of playback, and every key
export function practiceClock(now: number) {
  syncSong()
  const list = starts()
  const phrase = phraseOf(list, now)
  if (now < _now - SEEK_SEC) {
    const from = list[_phrase] ?? 0
    const to = list[_phrase + 1] ?? useStore.getState().midi?.duration ?? from
    if (to > from && (_now - from) / (to - from) >= NEARLY_DONE) finishPhrase()
    _presses = []
  } else if (phrase !== _phrase) finishPhrase()
  _phrase = phrase
  _now = now
}

useStore.subscribe((s, prev) => {
  const path = (s.midi as any)?._filePath as string | undefined
  if (path !== (prev.midi as any)?._filePath && path) {
    const resume = _resumeAt?.path === path ? _resumeAt.time : 0
    _resumeAt = null
    if (resume) useStore.setState({ currentTime: resume })
    saveLastPlayed(resume)
  }
  // The engine can end a song by putting the clock back to 0, so go by where it was
  if (s.playbackState !== 'playing' && prev.playbackState === 'playing') saveLastPlayed(prev.currentTime)
  // A key that's newly down is a press, however often it's the same key
  if (s.midiHeldKeys !== prev.midiHeldKeys) {
    syncSong()
    const transpose = s.detectedKey?.transpose ?? 0
    for (const key of s.midiHeldKeys) if (!prev.midiHeldKeys.has(key)) _presses.push({ midi: key - transpose, time: s.currentTime })
  }
  // The last phrase has no next one to cross into
  if (s.playbackState === 'stopped' && prev.playbackState === 'playing' && s.midi && s.currentTime >= s.midi.duration - 0.01) finishPhrase()
})
