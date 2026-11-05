// ── Step through a song one played event at a time (→ / ←) ────────────────────
// → jumps to the next moment any note on the roll starts — a single note or a
// whole chord — sounds it, lights it and moves the playhead there; ← goes
// back one. No tempo, no loop: the player's own pace. Shift + arrow jumps a
// bar. Built for learning fast solos and transcribing, including MIDI made
// from audio, whose "chords" start a few ms apart: notes starting within
// CHORD_GRACE_SEC of the first note of a step count as that one step.

import { useStore } from '../store'
import { NES } from './noteEditorState'
import { amberHex } from './hitEffectQueue'
import { isShown } from './trackShown'
import { CHORD_GRACE_SEC } from './midiParser'
import { inPracticeLevel } from './practiceLevels'
import { practiceClock, setPracticeSteps } from './practiceSession'

const EPS = 1e-4
const MIN_MS = 120
const MAX_MS = 2500

interface StepNote { midi: number; velocity: number; duration: number; channel: number; color: string }
interface Step { time: number; notes: StepNote[] }

function activeMidi(): any {
  return (NES.dirty && NES.editMidi) ? NES.editMidi : useStore.getState().midi
}

// ── Steps for the current song + mute/solo/eye state, rebuilt only when either
// changes. Steps follow what's on the roll (trackShown.ts): a hidden, muted or
// soloed-out track — the bass and drums under Focus, a melody you play along
// to — never lands a step. Drums are left out anyway: they'd turn every
// hi-hat into a step. ─────────────────────────────────────────────────────
let _cache: { midi: unknown; sig: string; steps: Step[] } | null = null

function shownSignature(): string {
  const s = useStore.getState()
  return s.practiceLevel + s.phraseLevels.join() + s.tracks.map(t => (t.muted ? 'm' : t.solo ? 's' : '.') + (t.visible ? 'v' : 'h')).join('')
}

export function buildSteps(
  midi: any,
  tracks: ReturnType<typeof useStore.getState>['tracks'],
  inLevel: (trackIndex: number, midi: number, time: number) => boolean = () => true,
): Step[] {
  const hasSolo = tracks.some(t => t.solo)
  const all: (StepNote & { time: number })[] = []
  for (const track of midi?.tracks ?? []) {
    if (track.isDrum) continue
    const ts = tracks.find(t => t.index === track.index)
    if (!ts || !isShown(ts, hasSolo)) continue
    for (const n of track.notes) {
      if (!inLevel(track.index, n.midi, n.time)) continue
      all.push({ time: n.time, midi: n.midi, velocity: n.velocity, duration: n.duration, channel: track.channel, color: ts.color ?? amberHex() })
    }
  }
  all.sort((a, b) => a.time - b.time)
  const steps: Step[] = []
  for (const n of all) {
    const last = steps[steps.length - 1]
    if (last && n.time - last.time <= CHORD_GRACE_SEC) last.notes.push(n)
    else steps.push({ time: n.time, notes: [n] })
  }
  return steps
}

export function playableSteps(): Step[] {
  return steps()
}

function steps(): Step[] {
  const midi = activeMidi()
  const sig = shownSignature()
  if (!_cache || _cache.midi !== midi || _cache.sig !== sig) {
    _cache = { midi, sig, steps: buildSteps(midi, useStore.getState().tracks, inPracticeLevel) }
  }
  return _cache.steps
}

setPracticeSteps(steps)

// First step at or after `t` (binary search; steps are time-ordered)
function indexAtOrAfter(list: Step[], t: number): number {
  let lo = 0, hi = list.length
  while (lo < hi) { const mid = (lo + hi) >> 1; if (list[mid].time < t) lo = mid + 1; else hi = mid }
  return lo
}

// ── Which step an arrow press lands on, from the playhead at `now` ──────────
export function targetStep(list: Step[], barStarts: number[], now: number, dir: 1 | -1, byBar: boolean): Step | null {
  if (!list.length) return null
  if (byBar && barStarts.length) {
    // Next bar: the first event of the next bar that has one. Previous bar:
    // the first event of the bar before the one the playhead is in.
    const barIdx = (() => { let i = 0; while (i + 1 < barStarts.length && barStarts[i + 1] <= now + EPS) i++; return i })()
    if (dir === 1) {
      for (let b = barIdx + 1; b < barStarts.length; b++) {
        const s = list[indexAtOrAfter(list, barStarts[b] - EPS)]
        if (s) return s
      }
      return null
    }
    const firstInBar = list[indexAtOrAfter(list, barStarts[barIdx] - EPS)]
    const startOfBar = firstInBar && firstInBar.time < now - EPS ? barIdx : barIdx - 1
    if (startOfBar < 0) return list[0].time < now - EPS ? list[0] : null
    return list[indexAtOrAfter(list, barStarts[startOfBar] - EPS)] ?? null
  }
  if (dir === 1) return list[indexAtOrAfter(list, now + EPS)] ?? null
  const i = indexAtOrAfter(list, now - EPS) - 1
  return i >= 0 ? list[i] : null
}

// ── Wait for notes ───────────────────────────────────────────────────────────
// Playing, the song runs in time and holds at each step until the keys cover it.
// Paused, a covered step moves the playhead on, one at a time. Keys are compared
// as the score and roll show them.
const covered = (step: Step, held: Set<number>, transpose: number) => step.notes.every(n => held.has(n.midi + transpose))

// The step playback must stop at on its way from `from` to `now`, null if none:
// keys already down when the song arrives let it through.
export function stepToHoldAt(list: Step[], from: number, now: number, held: Set<number>, transpose: number): Step | null {
  for (let i = indexAtOrAfter(list, from); i < list.length && list[i].time <= now; i++) {
    if (!covered(list[i], held, transpose)) return list[i]
  }
  return null
}

// Where the song moves once `held` covers the step it's waiting on, null while
// it isn't
export function nextWaitTime(list: Step[], now: number, held: Set<number>, transpose: number, end: number): number | null {
  const i = indexAtOrAfter(list, now - EPS)
  const step = list[i]
  if (!step || !covered(step, held, transpose)) return null
  return list[i + 1]?.time ?? end
}

// Steps from here on are still to be played. Moved on by every hold and start.
let _waitFrom = 0
let _holding = false
let _resuming = false

// Play pressed during a hold skips that step; any other start owes the one it's on
export function waitPlaybackStarted(now: number): void {
  if (_resuming) { _resuming = false; return }
  _waitFrom = _holding ? now + EPS : now - EPS
  _holding = false
}

// Called by the playback clock with the time it's about to show. True when it
// stopped the song there instead.
export function holdForNotes(now: number): boolean {
  const s = useStore.getState()
  if (!s.waitForNotes || !s.midi) { practiceClock(now); return false }
  const step = stepToHoldAt(steps(), _waitFrom, now, s.midiHeldKeys, s.detectedKey?.transpose ?? 0)
  practiceClock(step ? step.time : now)
  if (!step) { _waitFrom = Math.max(_waitFrom, now + EPS); return false }
  _holding = true
  _waitFrom = step.time
  useStore.setState({ currentTime: step.time, playbackState: 'paused' })
  return true
}

export function advanceIfPlayed(): void {
  const s = useStore.getState()
  practiceClock(s.currentTime)
  if (!s.waitForNotes || !s.midi || s.playbackState === 'playing') return
  if (_holding) {
    const list = steps()
    const step = list[indexAtOrAfter(list, _waitFrom)]
    if (!step || !covered(step, s.midiHeldKeys, s.detectedKey?.transpose ?? 0)) return
    _holding = false
    _resuming = true
    _waitFrom = step.time + EPS
    useStore.setState({ playbackState: 'playing' })
    return
  }
  const next = nextWaitTime(steps(), s.currentTime, s.midiHeldKeys, s.detectedKey?.transpose ?? 0, s.midi.duration)
  if (next !== null) useStore.setState({ currentTime: next })
}

// ── Prepare General MIDI's track instruments once per song (Samples sets
// each channel's instrument itself on the first note) ─────────────────────
let _warmedFor: unknown = null

export function stepEvents(dir: 1 | -1, byBar = false): boolean {
  const s = useStore.getState()
  if (!s.midi) return false
  const list = steps()
  const step = targetStep(list, s.barStarts, s.currentTime, dir, byBar)
  if (!step) return false

  if (s.audioEngine === 'gm' && _warmedFor !== s.midi) {
    _warmedFor = s.midi
    ;(window as any).__orfeoWarmupEditChannels?.()
  }

  // Playing: stop there (the song continues from this step on Play)
  useStore.setState(s.playbackState === 'playing'
    ? { currentTime: step.time, playbackState: 'paused' }
    : { currentTime: step.time })

  const ratio = s.bpm / s.originalBpm || 1
  const transpose = s.detectedKey?.transpose ?? 0
  const play = (window as any).__orfeoPlayNote as ((m: number, v: number, d: number, ch?: number, visual?: boolean, color?: string) => void) | undefined
  for (const n of step.notes) {
    const durMs = Math.max(MIN_MS, Math.min(MAX_MS, (n.duration / ratio) * 1000))
    play?.(n.midi + transpose, n.velocity, durMs, n.channel, true, n.color)
  }
  return true
}
