import { create } from 'zustand'
import { Midi } from '@tonejs/midi'

export interface RecordedEvent { time: number; status: number; a: number; b: number }
export interface PerformanceTake { id: string; songPath: string; songTitle: string; name: string; createdAt: number; duration: number; notes: number; midi: string }
export const usePerformanceRecorder = create<{ active: boolean; started: number; songPath: string; songTitle: string; events: RecordedEvent[]; notes: number }>(() => ({ active: false, started: 0, songPath: '', songTitle: '', events: [], notes: 0 }))
export function capturePerformanceMidi(status: number, a: number, b: number, now = performance.now()) {
  const state = usePerformanceRecorder.getState()
  if (!state.active || status < 0x80 || status >= 0xf0) return
  if (state.events.length >= 100000) { usePerformanceRecorder.setState({ active: false }); return }
  const event = { time: Math.max(0, (now - state.started) / 1000), status, a, b }
  // The mutable buffer is private to the recorder; publish only the note count.
  state.events.push(event)
  if ((status & 0xf0) === 0x90 && b > 0) usePerformanceRecorder.setState({ notes: state.notes + 1 })
}
export function startPerformanceRecording(songPath: string, songTitle: string) {
  usePerformanceRecorder.setState({ active: true, started: performance.now(), songPath, songTitle, events: [], notes: 0 })
}
export function recordedMidi(events: RecordedEvent[], duration: number): Uint8Array {
  const midi = new Midi(); midi.header.setTempo(120)
  const tracks = new Map<number, ReturnType<Midi['addTrack']>>()
  const held = new Map<string, { time: number; velocity: number }[]>()
  const track = (ch: number) => { if (!tracks.has(ch)) { const t = midi.addTrack(); t.channel = ch; tracks.set(ch, t) } return tracks.get(ch)! }
  const release = (ch: number, note: number, end: number) => {
    const notes = held.get(`${ch}:${note}`), start = notes?.shift()
    if (start) track(ch).addNote({ midi: note, time: start.time, duration: Math.max(.01, end - start.time), velocity: start.velocity })
  }
  for (const e of events) {
    const ch = e.status & 15, kind = e.status & 0xf0
    if (kind === 0x90 && e.b > 0) { const key = `${ch}:${e.a}`; if (!held.has(key)) held.set(key, []); held.get(key)!.push({ time: e.time, velocity: e.b / 127 }) }
    else if (kind === 0x80 || kind === 0x90) release(ch, e.a, e.time)
    else if (kind === 0xb0) track(ch).addCC({ number: e.a, time: e.time, value: e.b / 127 })
    else if (kind === 0xe0) track(ch).addPitchBend({ time: e.time, value: ((e.b << 7 | e.a) - 8192) / 8192 })
    else if (kind === 0xc0) track(ch).instrument.number = e.a
  }
  for (const [key, starts] of held) { const [ch, note] = key.split(':').map(Number); while (starts.length) release(ch, note, duration) }
  for (const t of tracks.values()) t.addCC({ number: 64, time: duration, value: 0 })
  return midi.toArray()
}
export async function finishPerformanceRecording() {
  const state = usePerformanceRecorder.getState(); usePerformanceRecorder.setState({ active: false })
  if (!state.events.length || !state.notes) throw new Error('No MIDI notes were recorded. Connect and play your keyboard first.')
  const duration = Math.max(.01, (performance.now() - state.started) / 1000), bytes = recordedMidi(state.events, duration)
  let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte)
  const take: PerformanceTake = { id: crypto.randomUUID(), songPath: state.songPath, songTitle: state.songTitle, name: `${state.songTitle} · ${new Date().toLocaleString()}`, createdAt: Date.now(), duration, notes: state.notes, midi: btoa(binary) }
  await window.electronAPI.savePerformanceTake(take)
  usePerformanceRecorder.setState({ events: [], notes: 0 })
  return take
}
export function compareTakes(a: Pick<PerformanceTake, 'duration' | 'notes'>, b: Pick<PerformanceTake, 'duration' | 'notes'>) {
  return { durationChange: +(b.duration - a.duration).toFixed(2), noteChange: b.notes - a.notes, densityChange: +(b.notes / Math.max(.01, b.duration) - a.notes / Math.max(.01, a.duration)).toFixed(2) }
}
