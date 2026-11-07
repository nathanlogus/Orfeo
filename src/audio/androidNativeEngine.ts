import { androidPianoBridge, type AndroidPianoStatus } from './androidPiano'
import type { NativeStatus } from './nativeClient'
import { useMidiSettings } from '../store/midiSettings'
import { useStore } from '../store'

type Options = { soundfonts: string[]; exclusive: boolean }
let sequence = Promise.resolve()
let generation = 0, timer: ReturnType<typeof setInterval> | null = null
let options: Options | null = null
let restart: (() => void) | null = null
let statusSink: ((status: NativeStatus) => void) | null = null
let errorSink: ((error: string) => void) | null = null
let restarting = false
let cancelHandoff: (() => void) | null = null
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => {
  if (document.hidden && options && useStore.getState().playbackState === 'playing') useStore.getState().setPlaybackState('paused')
})

export function androidNativeStatus(s: AndroidPianoStatus, wantedExclusive: boolean): NativeStatus {
  return {
    position: s.position ?? 0, playing: s.playing ?? false,
    mode: s.running ? s.exclusive ? 'exclusive' : 'shared' : 'none',
    rate: s.rate ?? 0, periodFrames: s.callbackFrames ?? s.burstFrames ?? 0,
    bufferFrames: s.bufferFrames ?? 0, reportedLatencyMs: Math.max(0, s.outputMs ?? 0),
    lateWakeups: s.xruns ?? 0, reopens: 0, periodStep: 0, worstRenderMs: 0,
    deviceName: 'Android audio output', fallbackReason: wantedExclusive && !s.exclusive ? 'Android did not grant exclusive access; using shared output.' : null,
    channelPeaks: [], masterPeak: s.peak ?? 0, compReductionDb: 0,
    format: `${s.rate ?? 0} Hz · AAudio · ${s.exclusive ? 'exclusive' : 'shared'}`,
    liveNotes: s.notes ?? 0, liveWaitAvgMs: 0, liveWaitMaxMs: 0, liveQueuedAvgMs: 0,
    directMidi: s.directMidi, nativeInputNotes: s.nativeInputNotes,
    nativeInputMs: s.nativeInputMs, nativeInputWorstMs: s.nativeInputWorstMs, nativeHandleMs: s.nativeHandleMs, nativeHandleWorstMs: s.nativeHandleWorstMs,
  }
}

export async function startAndroidNative(opts: Options, onStatus: (s: NativeStatus) => void, onError: (error: string) => void, onRestart: () => void): Promise<boolean> {
  const api = androidPianoBridge()!
  const ticket = ++generation
  cancelHandoff?.()
  options = opts; statusSink = onStatus; errorSink = onError; restart = onRestart
  if (timer) { clearInterval(timer); timer = null }
  let ok = false
  sequence = sequence.catch(() => {}).then(async () => {
    if (ticket !== generation) return
    try {
      const { drainAndroidPiano } = await import('../hooks/useAndroidPiano')
      await drainAndroidPiano()
      if (ticket !== generation) return
      // The native song renderer now owns all practice audio. Release Web
      // Audio outputs so they cannot prevent Android granting exclusivity.
      const samples = await import('../hooks/useSamplesEngine')
      const gm = await import('../hooks/useAudioEngine')
      const metro = await import('../hooks/useMetronome')
      await samples.releaseSamplesOutput()
      const soundfonts = await import('../hooks/useSoundfonts')
      soundfonts.useSoundfontState.setState({ samplesStatus: 'idle', samplesProgress: 0 })
      await gm.releaseGmOutput()
      await metro.releaseMetronomeOutput()
      if (ticket !== generation) return
      const path = opts.soundfonts.length > 1 ? opts.soundfonts.at(-1)! : ''
      if (path && !/\.sf2$/i.test(path)) throw new Error('Android Native requires an SF2 sound set. Use Studio for SF3.')
      opts.exclusive = useMidiSettings.getState().nativeExclusive
      await api.start(path, .5, 0, opts.exclusive)
      if (opts.exclusive && !api.status().exclusive) {
        // Chromium closes its Android stream on a delayed cleanup task even
        // after AudioContext.close() resolves. Retry once after that lease.
        api.stop()
        await new Promise<void>(resolve => {
          const finish = () => { cancelHandoff = null; resolve() }
          const timeout = setTimeout(finish, 5500)
          cancelHandoff = () => { clearTimeout(timeout); finish() }
        })
        if (ticket !== generation) return
        await api.start(path, .5, 0, true)
      }
      if (ticket !== generation) { api.stop(); return }
      api.midi(0xc0, useMidiSettings.getState().liveProgram, 0)
      onStatus(androidNativeStatus(api.status(), opts.exclusive)); ok = true
      timer = setInterval(poll, 100)
    } catch (error) {
      api.stop(); if (ticket === generation) onError(error instanceof Error ? error.message : String(error))
    }
  })
  await sequence
  return ok
}
function poll() {
  if (!options || restarting || document.hidden) return
  try {
    const s = androidPianoBridge()!.status()
    if (s.running) statusSink?.(androidNativeStatus(s, options.exclusive))
    else if (!s.suspended) {
      restarting = true
      void startAndroidNative(options, statusSink!, errorSink!, restart!).then(ok => { if (ok) restart?.() }).finally(() => { restarting = false })
    }
  } catch (error) { errorSink?.(String(error)) }
}
export async function stopAndroidNative() {
  ++generation; options = null
  cancelHandoff?.()
  if (timer) { clearInterval(timer); timer = null }
  sequence = sequence.catch(() => {}).then(() => { androidPianoBridge()?.stop() })
  await sequence
}
export function callAndroidNative(method: string, args: unknown[]) {
  if (method === 'setExclusive') {
    if (!options || options.exclusive === args[0]) return
    void startAndroidNative({ ...options, exclusive: !!args[0] }, statusSink!, errorSink!, restart!).then(ok => { if (ok) restart?.() })
    return
  }
  // Typed arrays do not serialize as JSON arrays by default.
  androidPianoBridge()!.command(method, args.map(a => ArrayBuffer.isView(a) ? Array.from(a as unknown as ArrayLike<number>) : a))
}

export async function playAndroidNativePreview(bytes: Uint8Array, onEnd: () => void): Promise<() => void> {
  const api = androidPianoBridge()!
  if (!api.status().running) throw new Error('Native audio is still starting')
  const { Midi } = await import('@tonejs/midi')
  const { restoreNativeSongPlayback } = await import('./useNativeEngine')
  const midi = new Midi(bytes)
  const events: { time: number; track: number; status: number; a: number; b: number; order: number }[] = []
  midi.tracks.forEach((track, index) => {
    const ch = track.channel & 15
    events.push({ time: 0, track: index, status: 0xc0 | ch, a: track.instrument.number, b: 0, order: 1 })
    for (const note of track.notes) {
      events.push({ time: note.time, track: index, status: 0x90 | ch, a: note.midi, b: Math.max(1, Math.round(note.velocity * 127)), order: 2 })
      events.push({ time: note.time + note.duration, track: index, status: 0x80 | ch, a: note.midi, b: 0, order: 0 })
    }
    for (const pedal of track.controlChanges[64] ?? []) events.push({ time: pedal.time, track: index, status: 0xb0 | ch, a: 64, b: Math.round(pedal.value * 127), order: 1 })
  })
  events.sort((a, b) => a.time - b.time || a.order - b.order)
  const first = events.find(e => (e.status & 0xf0) === 0x90)?.time ?? 0
  callAndroidNative('pause', [])
  callAndroidNative('loadSong', [events.map(e => e.time), events.map(e => e.track), events.flatMap(e => [e.status, e.a, e.b]), midi.tracks.length, midi.duration])
  callAndroidNative('setSongClicks', [[], []])
  callAndroidNative('setAudibleTracks', [midi.tracks.map(() => true)])
  for (let ch = 0; ch < 16; ch++) {
    callAndroidNative('setChannelProgram', [ch, -1])
    callAndroidNative('setChannel', [ch, 1, 0, 0, 0])
  }
  callAndroidNative('setTempoRatio', [1]); callAndroidNative('setTranspose', [0])
  callAndroidNative('setMetronome', [false, 0]); callAndroidNative('seek', [first]); callAndroidNative('play', [])
  let stopped = false
  const stop = () => {
    if (stopped) return
    stopped = true; clearTimeout(timer)
    callAndroidNative('pause', []); restoreNativeSongPlayback()
  }
  const timer = setTimeout(() => { stop(); onEnd() }, Math.min(30, Math.max(.1, midi.duration - first)) * 1000)
  return stop
}
