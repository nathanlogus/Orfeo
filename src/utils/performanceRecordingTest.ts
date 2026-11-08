import { Midi } from '@tonejs/midi'
import { capturePerformanceMidi, compareTakes, recordedMidi, startPerformanceRecording, usePerformanceRecorder } from './performanceRecording'

export function runPerformanceRecordingTest(): number {
  let failed = 0, checks = 0
  const check = (ok: boolean, name: string) => { checks++; if (!ok) { failed++; console.error('FAIL:', name) } }
  const bytes = recordedMidi([
    { time: 0, status: 0x90, a: 60, b: 100 },
    { time: .1, status: 0xb0, a: 64, b: 127 },
    { time: .2, status: 0x91, a: 67, b: 80 },
    { time: .5, status: 0x90, a: 60, b: 0 },
    { time: .6, status: 0xe1, a: 0, b: 96 },
    { time: .7, status: 0xc1, a: 4, b: 0 },
  ], 1)
  const midi = new Midi(bytes), left = midi.tracks.find(t => t.channel === 0)!, right = midi.tracks.find(t => t.channel === 1)!
  check(midi.tracks.length === 2 && left.notes[0].midi === 60 && right.notes[0].midi === 67, 'channels and notes survive MIDI serialization')
  check(Math.abs(left.notes[0].duration - .5) < .01, 'velocity zero releases a note')
  check(Math.abs(right.notes[0].duration - .8) < .01, 'held notes close when recording stops')
  check(left.controlChanges[64][0].value === 1 && left.controlChanges[64].at(-1)!.value === 0, 'sustain captured and released at end')
  check(right.instrument.number === 4 && right.pitchBends.length === 1, 'program and pitch bend preserved')
  const repeated = new Midi(recordedMidi([{ time: 0, status: 0x90, a: 60, b: 90 }, { time: .1, status: 0x90, a: 60, b: 80 }, { time: .3, status: 0x80, a: 60, b: 0 }], .6))
  check(repeated.tracks[0].notes.length === 2 && repeated.tracks[0].notes.every(n => n.duration > 0), 'overlapping repeated notes are not lost')
  startPerformanceRecording('song.mid', 'Song'); const started = usePerformanceRecorder.getState().started
  capturePerformanceMidi(0x90, 60, 100, started + 100); capturePerformanceMidi(0xf8, 0, 0, started + 200); capturePerformanceMidi(0x80, 60, 0, started + 300)
  check(usePerformanceRecorder.getState().notes === 1 && usePerformanceRecorder.getState().events.length === 2, 'only played channel messages are captured')
  usePerformanceRecorder.setState({ active: false, events: [], notes: 0 })
  const delta = compareTakes({ duration: 10, notes: 20 }, { duration: 8, notes: 24 })
  check(delta.durationChange === -2 && delta.noteChange === 4 && delta.densityChange === 1, 'comparison describes recorded changes without invented accuracy')
  console.log(`performance recording: ${checks - failed} passed, ${failed} failed`); return failed
}
