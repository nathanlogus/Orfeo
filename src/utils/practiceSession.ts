// ── The practice session: what you've played in this phrase, and the song's
// saved progress. Notes come from the MIDI keyboard through stepThrough.ts, and
// a phrase is scored as the playhead leaves it. A phrase with no keys played is
// listening, not a bad result, so it doesn't count. A phrase stays open for the
// timing window after its end, so a late last note is still in it, and each note
// is marked hit or missed on the roll as it happens, by the same rule as the score.
import { useStore } from '../store'
import { accuracy, accuracyByBar, accuracyByHand, afterMemoryRun, afterPhrase, LEVEL_UP, mastery, MEMORY_GONE, memoryMap, missedNotes, phraseOf, phraseStarts, pressHits, type PhraseProgress, type Press, type ScoredStep } from './practiceScore'
import { buildPracticeResult, type PhraseRun } from './practiceResult'
import { lastPlayedAt, movedLastPlayed } from './homeSongs'
import { pushPracticeMark } from './hitEffectQueue'

export const WINDOW_SEC = 0.25
const FIRST_AUTO_LEVEL = 1
// A loop that goes back near a phrase's end has played it
const NEARLY_DONE = 0.9
// Clocks wobble: only a real jump back is a seek
const SEEK_SEC = 0.25
// A frame can stall; a skip forward is a seek too, and says nothing of the phrase left
const SKIP_SEC = 1

export const AUTO_LEVEL = 0

export const songKey = (name: string) => name.split(/[\\/]/).pop() ?? name

let _song: unknown = null
let _phrase = 0
let _now = 0
// Steps up to here have had their miss marks
let _swept = 0
let _presses: Press[] = []
let _progress: PhraseProgress[] = []
let _load = 0
let _stepsAt: () => ScoredStep[] = () => []
// Since the last summary: one result a phrase, the latest
let _runs = new Map<number, PhraseRun>()
let _masteryBefore = 0
let _adaptiveCeiling = 0

export function setPracticeSteps(stepsAt: () => ScoredStep[]) { _stepsAt = stepsAt }
let _songEnded = () => {}
export function onSongEnded(fn: () => void) { _songEnded = fn }

const fresh = (): PhraseProgress => ({ level: FIRST_AUTO_LEVEL, wins: 0, best: 0 })
// Asked for every note of every frame, so kept per song
let _startsOf: number[] | undefined
let _starts = phraseStarts([])
function starts() {
  const bars = useStore.getState().midi?._barTimes
  if (bars !== _startsOf) { _startsOf = bars; _starts = phraseStarts(bars ?? []) }
  return _starts
}

type Tempo = { bpm: number; originalBpm: number }
const speedOf = (s: Tempo) => s.bpm / s.originalBpm || 1
const windowOf = (s: Tempo) => WINDOW_SEC * speedOf(s)
const fullSpeed = (s: Tempo) => Math.round(speedOf(s) * 100) >= 100

// Why a phrase's run doesn't count, if it doesn't
const notCounted = (presses: Press[]) => presses.some(p => p.waited) ? 'wait' as const : presses.some(p => p.slow) ? 'slow' as const : undefined

export function phraseLevelAt(time: number): number {
  return _progress[phraseOf(starts(), time)]?.level ?? FIRST_AUTO_LEVEL
}

// How far the notes at `time` have faded, 0 when Memory isn't on
export function memoryStepAt(time: number): number {
  const s = useStore.getState()
  if (!s.memoryMode || s.lessonRun || s.noteEditorActive) return 0
  return _progress[phraseOf(starts(), time)]?.memory ?? 0
}

function publish() {
  useStore.setState({ phraseLevels: _progress.map(p => p.level) })
  useStore.setState({ phraseMemory: memoryMap(starts(), _stepsAt(), _progress) })
}

function syncSong() {
  const state = useStore.getState()
  const { midi } = state
  if (midi === _song) return
  _song = midi
  _phrase = 0
  _now = 0
  _swept = 0
  _presses = []
  _progress = []
  _runs = new Map()
  _masteryBefore = 0
  _adaptiveCeiling = Math.max(state.originalBpm, state.bpm)
  useStore.setState({ phraseResult: null })
  publish()
  if (!midi) return
  const load = ++_load
  const key = songKey(midi.fileName)
  void window.electronAPI.getPrefs().then(p => {
    if (load !== _load) return
    const saved = p.practiceProgress?.[key]?.phrases
    if (Array.isArray(saved)) { _progress = saved; _masteryBefore = mastery(saved.filter(Boolean), starts().length); publish() }
  })
}

function save(memorized = false) {
  const { midi } = useStore.getState()
  if (!midi) return
  const key = songKey(midi.fileName)
  const phrases = _progress
  const percent = mastery(phrases.filter(Boolean), starts().length)
  const runHands = [..._runs.values()].flatMap(run => run.hands ? [run.hands] : [])
  const handUpdate = (hand: 'left' | 'right') => {
    const scores = runHands.map(row => row[hand]).filter(row => row.accuracy !== null && row.steps > 0)
    const count = scores.reduce((sum, row) => sum + row.steps, 0)
    return count ? Math.round(scores.reduce((sum, row) => sum + row.accuracy! * row.steps, 0) / count * 100) : null
  }
  const hands = { left: handUpdate('left'), right: handUpdate('right') }
  useStore.setState({ phraseResult: { ...useStore.getState().phraseResult!, mastery: percent } })
  void window.electronAPI.getPrefs().then(p => {
    const saved = p.practiceProgress?.[key]
    const previous = saved?.handProgress ?? {}
    const keep = (hand: 'left' | 'right') => hands[hand] === null ? previous[hand] : {
      latest: hands[hand], best: Math.max(previous[hand]?.best ?? 0, hands[hand]!), updatedAt: Date.now(),
    }
    return window.electronAPI.setPrefs({
      practiceProgress: { ...p.practiceProgress, [key]: { ...saved, phrases, mastery: percent,
        handProgress: { left: keep('left'), right: keep('right') },
        ...(memorized && !saved?.memorized ? { memorized: Date.now() } : {}) } },
    })
  })
}

function adaptTempo(played: number, uncounted: 'wait' | 'slow' | undefined) {
  const s = useStore.getState()
  if (!s.adaptiveTempoEnabled || uncounted === 'wait' || !Number.isFinite(s.originalBpm) || s.originalBpm <= 0) return
  const floor = Math.max(1, s.originalBpm * 0.4)
  const ceiling = Math.max(_adaptiveCeiling, s.originalBpm)
  const step = played >= LEVEL_UP ? Math.max(1, s.originalBpm * 0.03) : played < 0.6 ? Math.max(1, s.originalBpm * 0.08) : 0
  if (!step) return
  const next = played >= LEVEL_UP ? Math.min(ceiling, s.bpm + step) : Math.max(floor, s.bpm - step)
  if (Math.abs(next - s.bpm) > 0.01) useStore.setState({ bpm: next })
}

function finishPhrase() {
  const s = useStore.getState()
  const list = starts()
  const from = list[_phrase] ?? 0
  const to = list[_phrase + 1] ?? s.midi?.duration ?? 0
  const win = windowOf(s)
  const presses = _presses
  // Early for the next phrase's first note, or still waiting on a miss mark
  _presses = presses.filter(p => p.time >= to - 2 * win)
  const own = presses.filter(p => p.time >= from && p.time < to)
  if (!own.length) return
  const auto = s.practiceLevel === AUTO_LEVEL
  const phraseSteps = _stepsAt().filter(step => step.time >= from - 1e-4 && step.time < to)
  const played = accuracy(phraseSteps, presses, win)
  if (played === null) return
  const before = _progress[_phrase] ?? fresh()
  const level = auto ? before.level : s.practiceLevel
  const uncounted = notCounted(own)
  // Wait lands every note on time, so a run under it changes nothing
  const after = uncounted === 'wait' ? before : afterPhrase(before, played, level, auto, uncounted !== 'slow')
  const handScores = accuracyByHand(phraseSteps, presses, win)
  const barScores = accuracyByBar(phraseSteps, presses, s.midi?._barTimes ?? [], s.midi?.duration ?? 0, win)
  const memory = before.memory ?? 0
  const memoryOn = s.memoryMode && !s.lessonRun
  while (_progress.length <= _phrase) _progress.push(fresh())
  _progress[_phrase] = memoryOn ? { ...after, memory: afterMemoryRun(memory, played, level, !uncounted) } : after
  const { level: levelAfter, wins } = after
  const unseen = memoryOn && !uncounted && memory >= MEMORY_GONE && played >= LEVEL_UP
  _runs.set(_phrase, { phrase: _phrase, steps: phraseSteps.length, played, levelBefore: level, levelAfter: auto ? levelAfter : level, wins, auto, partway: false, uncounted, unseen, hands: handScores, bars: barScores })
  adaptTempo(played, uncounted)
  useStore.setState({ phraseResult: { percent: Math.round(played * 100), level: levelAfter, mastery: 0, moved: levelAfter - before.level } })
  publish()
  save()
}

// A phrase left partway counts in the summary, never for its level
function scorePartway() {
  const s = useStore.getState()
  const list = starts()
  const from = list[_phrase] ?? 0
  const to = list[_phrase + 1] ?? s.midi?.duration ?? from
  if (to > from && (_now - from) / (to - from) >= NEARLY_DONE) { finishPhrase(); return }
  const presses = _presses
  _presses = []
  if (!presses.some(p => p.time >= from) || _runs.has(_phrase)) return
  const phraseSteps = _stepsAt().filter(step => step.time >= from - 1e-4 && step.time <= _now)
  const played = accuracy(phraseSteps, presses, windowOf(s))
  if (played === null) return
  const auto = s.practiceLevel === AUTO_LEVEL
  const level = auto ? (_progress[_phrase] ?? fresh()).level : s.practiceLevel
  _runs.set(_phrase, { phrase: _phrase, steps: phraseSteps.length, played, levelBefore: level, levelAfter: level, wins: 0, auto, partway: true, uncounted: notCounted(presses), hands: accuracyByHand(phraseSteps, presses, windowOf(s)), bars: accuracyByBar(phraseSteps, presses, s.midi?._barTimes ?? [], s.midi?.duration ?? 0, windowOf(s)) })
}

function showResult() {
  const s = useStore.getState()
  const list = starts()
  // Every phrase with notes, played clean with none of them showing
  if (_runs.size && s.phraseMemory.every((step, i) => step === null || _runs.get(i)?.unseen)) save(true)
  const result = s.midi && !s.lessonRun ? buildPracticeResult({
    song: s.midi.fileName.replace(/\.[^.]+$/, ''), level: s.practiceLevel, tempoPercent: Math.round(s.bpm / s.originalBpm * 100) || 100,
    runs: [..._runs.values()], progress: _progress, starts: list, barCount: s.midi._barTimes?.length ?? 0, duration: s.midi.duration, masteryBefore: _masteryBefore,
  }) : null
  if (result && _runs.size) save()
  _runs = new Map()
  _masteryBefore = mastery(_progress.filter(Boolean), list.length)
  if (result) useStore.setState({ practiceResult: result })
}

// The End tile: nothing shows if you were only listening
export function endPractice() {
  syncSong()
  scorePartway()
  showResult()
}

// ── Keep going: the song and bar to go back to ──
let _resumeAt: { path: string; time: number; phrase?: number } | null = null

// Continue playing: the next time this song opens, it opens where it was left
export function resumeSong(path: string, time: number) { _resumeAt = { path, time } }

// Fix a phrase: the same, from a phrase whose time is only known once the song has loaded
export function resumePhrase(path: string, phrase: number) { _resumeAt = { path, time: 0, phrase } }

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

// A silent phrase is listening, so it's marked for nothing
function sweepMisses(to: number, win: number, wait: boolean) {
  const from = _swept
  _swept = Math.max(_swept, to)
  const last = _presses.at(-1)
  if (wait || !last || last.time < starts()[phraseOf(starts(), to)]) return
  const transpose = useStore.getState().detectedKey?.transpose ?? 0
  for (const midi of missedNotes(_stepsAt(), from, to, _presses, win)) pushPracticeMark(midi + transpose, false)
}

// Every frame of playback, and every key
export function practiceClock(now: number) {
  syncSong()
  const s = useStore.getState()
  const list = starts()
  const win = windowOf(s)
  if (now < _now - SEEK_SEC || now > _now + SKIP_SEC) {
    const from = list[_phrase] ?? 0
    const to = list[_phrase + 1] ?? s.midi?.duration ?? from
    if (to > from && (_now - from) / (to - from) >= NEARLY_DONE) finishPhrase()
    _presses = []
    _phrase = phraseOf(list, now)
    _swept = now
  } else {
    sweepMisses(now - win, win, s.waitForNotes)
    const phrase = Math.max(_phrase, phraseOf(list, now - win))
    if (phrase !== _phrase) finishPhrase()
    _phrase = phrase
  }
  _now = now
}

useStore.subscribe((s, prev) => {
  if (s.midi !== prev.midi) syncSong()
  const path = (s.midi as any)?._filePath as string | undefined
  if (path !== (prev.midi as any)?._filePath && path) {
    const resume = _resumeAt?.path !== path ? 0 : _resumeAt.phrase !== undefined ? phraseStarts(s.midi?._barTimes ?? [])[_resumeAt.phrase] ?? 0 : _resumeAt.time
    _resumeAt = null
    if (resume) useStore.setState({ currentTime: resume })
    saveLastPlayed(resume)
  }
  // The engine can end a song by putting the clock back to 0, so go by where it was
  if (s.playbackState !== 'playing' && prev.playbackState === 'playing') saveLastPlayed(prev.currentTime)
  // A key that's newly down is a press, however often it's the same key. On the
  // home pages it's the menu or noodling, not this phrase.
  if (s.midiHeldKeys !== prev.midiHeldKeys && !s.homeOpen) {
    syncSong()
    const transpose = s.detectedKey?.transpose ?? 0
    const holding = s.waitForNotes && s.playbackState !== 'playing'
    for (const key of s.midiHeldKeys) {
      if (prev.midiHeldKeys.has(key)) continue
      const press: Press = { midi: key - transpose, time: s.currentTime, waited: holding, slow: !fullSpeed(s) }
      _presses.push(press)
      if ((holding || s.playbackState === 'playing') && pressHits(_stepsAt(), press, windowOf(s))) pushPracticeMark(key, true)
    }
  }
  // The last phrase has no next one to cross into. The engine can end a song by
  // putting the clock back to 0, so go by where it was.
  if (s.playbackState === 'stopped' && prev.playbackState === 'playing' && s.midi
    && Math.max(s.currentTime, prev.currentTime) >= (_stepsAt().at(-1)?.time ?? s.midi.duration - 0.01)) { finishPhrase(); showResult(); _songEnded() }
})
