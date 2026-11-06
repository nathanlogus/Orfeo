// ── One jam: starts the band, keeps it listening, puts everything back ───────
// The band borrows channels 10, 13 and 14 (9, 12 and 13 counted from zero; 14 and
// 15 stay the preview and live channels). A song may be loaded behind Jam, so
// those channels' instruments and volumes go back to the song's on the way out.

import { create } from 'zustand'
import { useStore } from '../store'
import { outputLatencySec, setChannelVolume } from '../audio/engine'
import { nativeCall } from '../audio/nativeClient'
import { sendTrackState } from '../audio/useNativeEngine'
import { onLiveNote } from '../hooks/useMidiInput'
import { BAND_CHANNELS, BASS_CH, COMP_CH, DRUM_CH, STYLES, createBand, lowChord, stepSeconds, tonicChord, type JamChord, type JamPart, type JamStyle } from './band'
import { openJamOutput, startPulse, PULSE_MS, type PulsedOutput } from './jamOutput'
import { createReaction, type BandLevel } from './reaction'
import { TICK_MS, createScheduler } from './scheduler'

export const SPLIT_NOTE = 60 // C4: below this the left hand leads
export const MIN_BPM = 50
export const MAX_BPM = 200
const START_DELAY_SEC = 0.15
const CHORD_SETTLE_MS = 50 // a rolled chord isn't read through its first notes
const UI_EVERY_MS = 120

export interface JamPrograms { bass: number; comp: number }

export interface JamSettings {
  style: JamStyle
  keyPc: number
  bpm: number
  leftHand: boolean
  parts: Record<JamPart, boolean>
  programs: JamPrograms
}

interface JamState extends JamSettings {
  live: boolean
  chord: JamChord | null
  nextChord: JamChord | null
  beat: number
  loud: number
  busy: number
  level: BandLevel
  held: number[]
}

export const useJam = create<JamState>(() => ({
  style: 'blues', keyPc: 0, bpm: STYLES.blues.bpm, leftHand: true,
  parts: { drums: true, bass: true, comp: true },
  programs: { bass: STYLES.blues.bassProgram, comp: STYLES.blues.compProgram },
  live: false, chord: null, nextChord: null, beat: 0, loud: 0.5, busy: 0.25, level: 1, held: [],
}))

const PART_CHANNEL: Record<JamPart, number> = { drums: DRUM_CH, bass: BASS_CH, comp: COMP_CH }

let session: { stop(): void; follow(chord: JamChord): void; release(part: JamPart): void; program(part: keyof JamPrograms, program: number): void } | null = null

function borrowChannels(out: PulsedOutput, programs: JamPrograms) {
  const { audioEngine, playbackState } = useStore.getState()
  if (playbackState === 'playing') {
    ;(window as any).__pliagePlayer?.pause?.()
    useStore.setState({ playbackState: 'paused' })
  }
  const now = out.now()
  for (const ch of BAND_CHANNELS) {
    out.send([0xb0 | ch, 121, 0], now)
    if (audioEngine === 'native') setChannelVolume(ch, 1)
    else out.send([0xb0 | ch, 7, 127], now)
  }
  out.send([0xc0 | BASS_CH, programs.bass, 0], now)
  out.send([0xc0 | COMP_CH, programs.comp, 0], now)
  // a muted song track must not mute the band that borrows its channel
  if (audioEngine === 'native') nativeCall('setAudibleTracks', [])
}

function returnChannels(out: PulsedOutput, after: number) {
  const { audioEngine, tracks, midi } = useStore.getState()
  for (const ch of BAND_CHANNELS) {
    const song = (midi as any)?.tracks?.find((t: any) => t.channel === ch)
    const mix = song && tracks.find(t => t.index === song.index)
    if (ch !== DRUM_CH) out.send([0xc0 | ch, mix?.program ?? 0, 0], after)
    if (audioEngine === 'gm') out.send([0xb0 | ch, 7, 100], after)
    else setChannelVolume(ch, mix?.volume ?? 1)
  }
  if (audioEngine === 'native') sendTrackState(tracks)
}

/** false: the sound engine isn't ready yet */
export async function startJam(): Promise<boolean> {
  if (session) return true
  const out = await openJamOutput()
  if (!out) return false

  const reaction = createReaction()
  let timers: ReturnType<typeof setTimeout>[] = []
  const atHeard = (at: number, fn: () => void) => {
    timers.push(setTimeout(fn, Math.max(0, (at - out.now() + outputLatencySec()) * 1000)))
    if (timers.length > 64) timers = timers.slice(-32)
  }
  const band = createBand({
    settings: () => useJam.getState(),
    listening: () => reaction,
    play: n => scheduler.play(n),
    releaseAt: (chs, at) => scheduler.releaseAt(chs, at),
    chordChanged: (chord, at) => atHeard(at, () => useJam.setState({ chord, nextChord: band.pending })),
    beat: (beat, at) => atHeard(at, () => useJam.setState({ beat })),
  })
  const scheduler = createScheduler(out, () => stepSeconds(useJam.getState().bpm), band.plan)

  borrowChannels(out, useJam.getState().programs)

  let lastAdvance = out.now()
  let sinceTick = TICK_MS
  let sinceUi = 0
  const stopPulse = startPulse(() => {
    out.pulse()
    sinceTick += PULSE_MS
    if (sinceTick < TICK_MS) return
    sinceTick = 0
    const now = out.now()
    reaction.advance(now - lastAdvance)
    lastAdvance = now
    scheduler.tick()
    out.pulse()
    sinceUi += TICK_MS
    if (sinceUi >= UI_EVERY_MS) {
      sinceUi = 0
      useJam.setState({ loud: reaction.loud, busy: reaction.busy, level: reaction.level })
    }
  })

  const stopListening = onLiveNote((_note, vel) => reaction.noteOn(vel / 127))

  // The left hand: read a moment after the keys stop moving
  let settle: ReturnType<typeof setTimeout> | null = null
  const stopHeld = useStore.subscribe((s, p) => {
    if (s.midiHeldKeys === p.midiHeldKeys) return
    useJam.setState({ held: [...s.midiHeldKeys] })
    if (settle) clearTimeout(settle)
    settle = setTimeout(() => {
      const chord = useJam.getState().leftHand ? lowChord(useStore.getState().midiHeldKeys, SPLIT_NOTE) : null
      if (chord) session?.follow(chord)
    }, CHORD_SETTLE_MS)
  })

  // Leaving the engine or the window behind ends the jam, with its notes
  const stopEngineWatch = useStore.subscribe((s, p) => { if (s.audioEngine !== p.audioEngine) stopJam() })
  const onHidden = () => { if (document.hidden) stopJam() }
  document.addEventListener('visibilitychange', onHidden)

  session = {
    stop() {
      stopPulse()
      stopListening()
      stopHeld()
      stopEngineWatch()
      document.removeEventListener('visibilitychange', onHidden)
      if (settle) clearTimeout(settle)
      timers.forEach(clearTimeout)
      returnChannels(out, scheduler.stop(BAND_CHANNELS))
      // nothing pulses a queue any more: what's left goes straight out
      out.flush()
    },
    follow(chord) {
      band.follow(chord)
      useJam.setState({ nextChord: band.pending })
    },
    release(part) { scheduler.releaseAt([PART_CHANNEL[part]], out.now()) },
    program(part, program) { out.send([0xc0 | PART_CHANNEL[part], program, 0], out.now()) },
  }
  useJam.setState({ live: true, chord: band.chord, nextChord: null, beat: 0, held: [...useStore.getState().midiHeldKeys] })
  scheduler.start(out.now() + START_DELAY_SEC)
  return true
}

export function stopJam() {
  session?.stop()
  session = null
  useJam.setState({ live: false, chord: null, nextChord: null })
}

export function setPart(part: JamPart, on: boolean) {
  useJam.setState(s => ({ parts: { ...s.parts, [part]: on } }))
  if (!on) session?.release(part)
}

export function setKey(keyPc: number) {
  useJam.setState({ keyPc })
  const { style, leftHand } = useJam.getState()
  if (leftHand) session?.follow(tonicChord(style, keyPc))
}

export const setBpm = (bpm: number) => useJam.setState({ bpm: Math.max(MIN_BPM, Math.min(MAX_BPM, Math.round(bpm))) })
export const setStyle = (style: JamStyle) => useJam.setState({ style, bpm: STYLES[style].bpm, programs: { bass: STYLES[style].bassProgram, comp: STYLES[style].compProgram } })

export function setProgram(part: keyof JamPrograms, program: number) {
  useJam.setState(s => ({ programs: { ...s.programs, [part]: program } }))
  session?.program(part, program)
}
export const setLeftHand = (leftHand: boolean) => useJam.setState({ leftHand })
