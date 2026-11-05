// ── The practice session: what you've played in this phrase, and the song's
// saved progress. Notes come from the MIDI keyboard through stepThrough.ts, and
// a phrase is scored as the playhead leaves it. A phrase with no keys played is
// listening, not a bad result, so it doesn't count.
import { useStore } from '../store'
import { accuracy, afterPhrase, mastery, phraseOf, phraseStarts, type PhraseProgress, type Press, type ScoredStep } from './practiceScore'

const WINDOW_SEC = 0.25
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
  // A key that's newly down is a press, however often it's the same key
  if (s.midiHeldKeys !== prev.midiHeldKeys) {
    syncSong()
    const transpose = s.detectedKey?.transpose ?? 0
    for (const key of s.midiHeldKeys) if (!prev.midiHeldKeys.has(key)) _presses.push({ midi: key - transpose, time: s.currentTime })
  }
  // The last phrase has no next one to cross into
  if (s.playbackState === 'stopped' && prev.playbackState === 'playing' && s.midi && s.currentTime >= s.midi.duration - 0.01) finishPhrase()
})
