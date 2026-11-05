// ── A lesson in progress: its steps, the settings it borrows, and its scoring ──
// Hear and Play run on the real score view and transport, so an exercise is
// loaded like a song. Its path names no file: nothing here is saved to disk.
import { useStore } from '../store'
import { parseMidiBuffer } from '../utils/midiParser'
import { detectKeyFromTracks, parseKeySignature } from '../utils/keyDetection'
import { convertForeignFileToMidiBuffer } from '../utils/foreignFormatImport'
import { confirmDiscardDirtyNoteEdits } from '../utils/noteEditorState'
import { confirmDiscardDirtyTempoKey } from '../utils/tempoKeySave'
import { FULL_LEVEL, type Press } from '../utils/practiceScore'
import { WINDOW_SEC } from '../utils/practiceSession'
import { playableSteps } from '../utils/stepThrough'
import { COURSE, lessonById, lessonScore, pieceScore } from './courseData'
import { CLEAN_RUNS, PASS, afterPass, afterRun, playScore } from './progress'
import type { Lesson } from './course'

export type LessonStep = 'hear' | 'learn' | 'drill' | 'wait' | 'time' | 'done'

const LESSON_PATH = 'lesson/'

export function stepsOf(lesson: Lesson): LessonStep[] {
  const music = !!(lesson.tex || lesson.file)
  const sight = lesson.mode === 'sight'
  return [
    ...(music && !sight && lesson.mode !== 'no-hear' ? ['hear' as const] : []),
    ...(lesson.learn ? ['learn' as const] : []),
    ...(lesson.check ? ['drill' as const] : []),
    ...(music && !sight ? ['wait' as const] : []),
    ...(music ? ['time' as const] : []),
  ]
}

let _borrowed: { waitForNotes: boolean; scoreViewMode: 'roll' | 'both' | 'score'; countInEnabled: boolean; practiceLevel: number; song: string | null } | null = null
let _presses: Press[] = []
// The scores behind this pass, for the Lesson passed page
let _drillScore: number | null = null
let _runScores: number[] = []

export const lessonScores = () => ({ drill: _drillScore, runs: _runScores })
export function drillPassed(percent: number) { _drillScore = percent }

const hideBar = (on: boolean) => document.documentElement.classList.toggle('lesson-hide-bar', on)

function enterStep(lesson: Lesson, step: LessonStep) {
  _presses = []
  if (step === 'time') _runScores = []
  hideBar(step === 'time' && lesson.mode === 'hide-bar')
  useStore.setState({
    lessonRun: { id: lesson.id, step, percent: null, clean: 0 },
    waitForNotes: step === 'wait',
    countInEnabled: step === 'time',
  })
}

async function loadScore(bytes: Uint8Array, title: string, path: string) {
  const store = useStore.getState()
  const buffer = await convertForeignFileToMidiBuffer(bytes, 'musicxml')
  store.setScoreSource({ midiPaths: [path], bytes })
  const parsed = parseMidiBuffer(buffer, title, path)
  store.setMidi(parsed)
  const key = (parsed as any)._keySignature
  store.setDetectedKey(key != null ? parseKeySignature(key.key, key.scale) : detectKeyFromTracks(parsed.tracks))
}

// A piece from the shelf is just a song: no steps, nothing to pass
export async function openPiece(file: string, title: string) {
  if (!await confirmDiscardDirtyNoteEdits('Save changes before opening this piece?')) return
  if (!await confirmDiscardDirtyTempoKey('Save tempo/key changes before opening this piece?')) return
  const bytes = await pieceScore(file)
  if (!bytes) return
  await loadScore(bytes, title, `${LESSON_PATH}${file}`)
  useStore.setState({ scoreViewMode: 'score', homeOpen: false })
}

export async function startLesson(id: string) {
  const lesson = lessonById(id)
  if (!lesson) return
  if (!await confirmDiscardDirtyNoteEdits('Save changes before starting this lesson?')) return
  if (!await confirmDiscardDirtyTempoKey('Save tempo/key changes before starting this lesson?')) return
  const store = useStore.getState()
  if (!_borrowed) {
    const song = (store.midi as any)?._filePath as string | undefined
    _borrowed = {
      waitForNotes: store.waitForNotes, scoreViewMode: store.scoreViewMode, countInEnabled: store.countInEnabled,
      practiceLevel: store.practiceLevel, song: song && !song.startsWith(LESSON_PATH) ? song : null,
    }
  }
  const bytes = await lessonScore(lesson)
  if (bytes) await loadScore(bytes, lesson.title, `${LESSON_PATH}${lesson.id}.score`)
  useStore.setState({ scoreViewMode: 'score', practiceLevel: FULL_LEVEL, homeOpen: false, presentationMode: false })
  _drillScore = null
  _runScores = []
  enterStep(lesson, stepsOf(lesson)[0])
}

export function beginAttempt() {
  _presses = []
}

export function nextStep() {
  const run = useStore.getState().lessonRun
  const lesson = run && lessonById(run.id)
  if (!lesson) return
  const steps = stepsOf(lesson)
  const next = steps[steps.indexOf(run.step) + 1]
  if (next) enterStep(lesson, next)
  else finishLesson(lesson)
}

function finishLesson(lesson: Lesson) {
  const passed = afterPass(COURSE, useStore.getState().lessonPassed, lesson.id)
  useStore.setState({ lessonPassed: passed })
  void window.electronAPI.setPrefs({ lessonPassed: passed })
  enterStep(lesson, 'done')
}

export function exitLesson() {
  const borrowed = _borrowed
  _borrowed = null
  hideBar(false)
  const store = useStore.getState()
  useStore.setState({ lessonRun: null, homeOpen: true })
  if (!borrowed) return
  useStore.setState({
    waitForNotes: borrowed.waitForNotes, scoreViewMode: borrowed.scoreViewMode,
    countInEnabled: borrowed.countInEnabled, practiceLevel: borrowed.practiceLevel,
  })
  if ((store.midi as any)?._filePath?.startsWith(LESSON_PATH)) {
    store.setScoreSource(null)
    store.setMidi(null)
    if (borrowed.song) store.openSong(borrowed.song)
  }
}

function attemptEnded() {
  const s = useStore.getState()
  const run = s.lessonRun
  if (!run) return
  if (run.step === 'wait') { nextStep(); return }
  if (run.step !== 'time') return
  const speed = s.bpm / s.originalBpm || 1
  const score = playScore(playableSteps(), _presses, WINDOW_SEC * speed)
  _presses = []
  const clean = score >= PASS ? run.clean + 1 : 0
  _runScores = afterRun(_runScores, Math.round(score * 100), score >= PASS)
  if (clean >= CLEAN_RUNS) { nextStep(); return }
  useStore.setState({ lessonRun: { ...run, percent: Math.round(score * 100), clean } })
}

useStore.subscribe((s, prev) => {
  if (s.lessonRun?.step !== 'time' && s.lessonRun?.step !== 'wait') return
  const counting = s.playbackState === 'playing' || !!s.countIn
  if (s.midiHeldKeys !== prev.midiHeldKeys && counting) {
    const transpose = s.detectedKey?.transpose ?? 0
    for (const key of s.midiHeldKeys) if (!prev.midiHeldKeys.has(key)) _presses.push({ midi: key - transpose, time: s.currentTime })
  }
  // The engine can end a song by putting the clock back to 0, so go by where it was
  if (s.playbackState === 'stopped' && prev.playbackState !== 'stopped' && prev.currentTime >= (playableSteps().at(-1)?.time ?? Infinity)) attemptEnded()
})
