import { androidPianoBridge, androidPianoMidi, resetAndroidPiano, useAndroidPiano } from './androidPiano'

export function runAndroidPianoTest(): number {
  let failures = 0
  const check = (ok: boolean, message: string) => { if (!ok) { failures++; console.error(message) } }
  const before = useAndroidPiano.getState()
  const w = (globalThis as any).window
  const messages: number[][] = []
  let stops = 0
  try {
    ;(globalThis as any).window = {}
    check(androidPianoBridge() === undefined, 'Desktop has no Android bridge')
    useAndroidPiano.setState({ phase: 'off' })
    check(!androidPianoMidi(0x90, 60, 80), 'Disabled native output leaves notes to the current engine')
    ;(globalThis as any).window.androidPiano = {
      midi: (...data: number[]) => messages.push(data), stop: () => { stops++ },
    }
    useAndroidPiano.setState({ phase: 'starting' })
    check(!androidPianoMidi(0x90, 60, 80) && messages.length === 0, 'Loading does not swallow keyboard notes')
    useAndroidPiano.setState({ phase: 'running' })
    check(androidPianoMidi(0x90, 60, 80), 'Ready native output takes the note')
    androidPianoMidi(0x80, 60)
    resetAndroidPiano()
    check(JSON.stringify(messages) === JSON.stringify([[0x90, 60, 80], [0x80, 60, 0], [0xb0, 120, 0], [0xb0, 121, 0]]), 'Notes, note-offs and reset retain MIDI values')
    ;(globalThis as any).window.androidPiano.midi = () => { throw new Error('disconnected') }
    check(!androidPianoMidi(0x90, 62, 90), 'A broken native output falls back for the same note')
    check(stops === 1 && useAndroidPiano.getState().phase === 'failed', 'A broken output is stopped and surfaced')
  } finally {
    useAndroidPiano.setState(before)
    ;(globalThis as any).window = w
  }
  return failures
}
