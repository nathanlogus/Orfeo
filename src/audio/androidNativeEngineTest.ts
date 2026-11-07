import { androidNativeStatus } from './androidNativeEngine'

export function runAndroidNativeEngineTest(): number {
  let failures = 0
  const check = (ok: boolean, name: string) => { if (!ok) { failures++; console.error(name) } }
  const shared = androidNativeStatus({ running: true, exclusive: false, rate: 48000, burstFrames: 96, callbackFrames: 96, bufferFrames: 192, outputMs: 14 }, true)
  check(shared.mode === 'shared' && !!shared.fallbackReason, 'Report Android granting Shared even when Exclusive was requested')
  const exclusive = androidNativeStatus({ running: true, exclusive: true, rate: 48000, callbackFrames: 96, bufferFrames: 96, outputMs: 6, directMidi: true, nativeInputNotes: 20, nativeInputMs: .3, nativeHandleMs: .04 }, true)
  check(exclusive.mode === 'exclusive' && !exclusive.fallbackReason, 'Exclusive mode follows the actual granted stream')
  check(exclusive.directMidi === true && exclusive.nativeInputMs === .3 && exclusive.nativeHandleMs === .04, 'Native MIDI timings survive the engine status adapter')
  check(exclusive.bufferFrames === 96 && exclusive.reportedLatencyMs === 6, 'Report the real buffer and timestamp estimate')
  const stopped = androidNativeStatus({ running: false }, true)
  check(stopped.mode === 'none', 'A stopped stream cannot be shown as Exclusive')
  return failures
}
