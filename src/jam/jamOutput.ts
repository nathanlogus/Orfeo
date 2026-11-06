// ── Where the band's MIDI goes, per engine ───────────────────────────────────
// Samples takes each message with its time and plays it on the audio thread
// (to within one 128-sample block). General MIDI and Native have no way to take
// a time (Tiny's own clock is private, and the Native add-on plays a message
// when it arrives), so they get each message when it is due, off a worker's
// pulse. Page timers would not do: Chromium slows them to once a second as soon
// as another window covers Pliage, and a worker's are left alone.

import { useStore } from '../store'
import { samplesClock, samplesSendAt } from '../hooks/useSamplesEngine'
import { initJZZ, liveSend } from '../hooks/useAudioEngine'
import { isNativeRunning, nativeCall } from '../audio/nativeClient'
import type { JamOutput } from './scheduler'

export const PULSE_MS = 2
// The engine releases a Native note by itself after this long if the page dies
const NATIVE_SAFETY_SEC = 8

const perfClock = () => performance.now() / 1000

export interface PulsedOutput extends JamOutput { pulse(): void }

// Messages held until due, for an engine that plays what it gets right away
export function dueQueue(now: () => number, deliver: (bytes: number[]) => void): PulsedOutput {
  let queue: { bytes: number[]; when: number }[] = []
  return {
    now,
    send(bytes, when) {
      let i = queue.length
      while (i > 0 && queue[i - 1].when > when) i--
      queue.splice(i, 0, { bytes, when })
    },
    pulse() {
      const t = now()
      let due = 0
      while (due < queue.length && queue[due].when <= t) deliver(queue[due++].bytes)
      if (due) queue = queue.slice(due)
    },
    // A note-on that hasn't gone out never sounds; an off or a controller still must
    flush() {
      for (const q of queue) if ((q.bytes[0] & 0xf0) !== 0x90) deliver(q.bytes)
      queue = []
    },
  }
}

function nativeDeliver([status, d1, d2]: number[]) {
  if ((status & 0xf0) === 0x90) nativeCall('noteFor', status & 0x0f, d1, d2, NATIVE_SAFETY_SEC)
  else nativeCall('midi', status, d1, d2)
}

/** The active engine's output, or null if its sound isn't ready yet */
export async function openJamOutput(): Promise<PulsedOutput | null> {
  const engine = useStore.getState().audioEngine
  if (engine === 'native') return isNativeRunning() ? dueQueue(perfClock, nativeDeliver) : null
  if (engine === 'samples') {
    if (samplesClock() === null) return null
    return {
      now: () => samplesClock() ?? 0,
      send: samplesSendAt,
      pulse() {},
      flush() {}, // already with the worklet, and that can't be recalled
    }
  }
  await initJZZ()
  return dueQueue(perfClock, liveSend)
}

// A timer the browser leaves alone behind other windows
export function startPulse(fn: () => void): () => void {
  const url = URL.createObjectURL(new Blob([`setInterval(() => postMessage(0), ${PULSE_MS})`]))
  const worker = new Worker(url)
  worker.onmessage = fn
  return () => { worker.terminate(); URL.revokeObjectURL(url) }
}
