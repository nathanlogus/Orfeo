import { recordNote, getStats, clearDiagnostics, buildPerformanceLog, getDelayBreakdown } from './midiDiagnostics'
import { useAndroidPiano } from '../audio/androidPiano'
import { useStore } from '../store'
import { useNativeAudio } from '../audio/nativeClient'
import { androidNativeStatus } from '../audio/androidNativeEngine'

export function runMidiDiagnosticsTest(): number {
  console.group('[midiDiagnostics] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }

  clearDiagnostics()
  recordNote(1000, 1001.5, 1002, 60, 80, 'usb')    // USB: stamped 1.5 ms before the handler
  recordNote(2000, 2002.5, 2003, 62, 80, 'usb')
  recordNote(0, 3000, 3001, 64, 80, 'usb')          // no stamp
  recordNote(3100, 3000, 3001, 64, 80, 'usb')       // stamp after the handler started
  recordNote(1000, 4200, 4201, 65, 80, 'ble')       // 3.2 s "before": a stale stamp
  let s = getStats()
  check(s.notes === 5, `every note counted, got ${s.notes}`)
  check(s.avgInputMs === 2 && s.worstInputMs === 2.5, `average/worst from usable stamps only, got ${s.avgInputMs}/${s.worstInputMs}`)
  check(s.implausibleInputs === 1, `one stale stamp, got ${s.implausibleInputs}`)
  check(s.lastInputMs === null, 'last note unusable → no last input time')
  check(buildPerformanceLog().notes[4].inputMs === 3200, 'log keeps the raw value')

  // Bluetooth on macOS, as logged: every note carries the stamp of the first,
  // so "input" grows with the time played — under a second at first
  clearDiagnostics()
  recordNote(9000, 9002, 9003, 60, 80, 'usb')
  recordNote(9100, 9109.5, 9110, 62, 80, 'usb')     // a real 9.5 ms wait stays in
  recordNote(5000, 5000.5, 5001, 60, 80, 'ble')
  recordNote(5000, 5893, 5894, 62, 80, 'ble')
  s = getStats()
  check(s.worstInputMs === 893, `under a second it can't be told apart yet, got ${s.worstInputMs}`)
  recordNote(5000, 7000, 7001, 64, 80, 'ble')
  s = getStats()
  check(s.avgInputMs === 5.75 && s.worstInputMs === 9.5, `one stale stamp drops all of that keyboard's, got ${s.avgInputMs}/${s.worstInputMs}`)
  check(s.implausibleInputs === 3, `three Bluetooth notes left out, got ${s.implausibleInputs}`)
  check(s.notes === 5 && s.avgHandleMs === 0.8, `every note still counted and its handling measured, got ${s.notes}/${s.avgHandleMs}`)
  clearDiagnostics()

  const previousAndroid = useAndroidPiano.getState(), previousEngine = useStore.getState().audioEngine
  try {
    useStore.setState({ audioEngine: 'samples' })
    useAndroidPiano.setState({ phase: 'running', status: { running: true, rate: 48000, callbackFrames: 96, outputMs: 14 } })
    const android = getDelayBreakdown()
    check(android.synthBlockMs === 2 && android.chainMs === 0 && android.outputMs === 14, 'Native Android live path uses its own callback and output timings')
    check(buildPerformanceLog().androidPiano.status?.running === true, 'Performance log includes the native Android output')
    useAndroidPiano.setState({ phase: 'failed', status: null })
    check(getDelayBreakdown().outputMs !== 14, 'A failed Android output reports the fallback engine timing')
  } finally {
    useStore.setState({ audioEngine: previousEngine })
    useAndroidPiano.setState(previousAndroid)
  }

  const previousNative = useNativeAudio.getState()
  try {
    useStore.setState({ audioEngine: 'native' })
    useNativeAudio.setState({ phase: 'running', status: androidNativeStatus({ running: true, exclusive: true, directMidi: true, nativeInputNotes: 8, nativeInputMs: .2, nativeInputWorstMs: .7, nativeHandleMs: .03, nativeHandleWorstMs: .1 }, true) })
    const direct = getStats()
    check(direct.notes === 8 && direct.avgInputMs === .2 && direct.avgHandleMs === .03, 'Direct MIDI timing excludes the later WebView/scoring notification')
  } finally {
    useStore.setState({ audioEngine: previousEngine })
    useNativeAudio.setState(previousNative)
  }

  console.log(`midiDiagnostics: ${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
