import { create } from 'zustand'

export interface AndroidPianoStatus {
  running: boolean
  suspended?: boolean
  rate?: number
  burstFrames?: number
  bufferFrames?: number
  callbackFrames?: number
  outputMs?: number
  xruns?: number
  dropped?: number
  notes?: number
  errorCode?: number
  lowLatency?: boolean
  voices?: number
  peak?: number
  exclusive?: boolean
  position?: number
  playing?: boolean
  directMidi?: boolean
  directDevices?: string[]
  nativeInputNotes?: number
  nativeInputMs?: number | null
  nativeInputWorstMs?: number
  nativeHandleMs?: number
  nativeHandleWorstMs?: number
}
export interface AndroidPianoBridge {
  start(path: string, gain: number, rate: number, exclusive?: boolean): Promise<void>
  stop(): void
  midi(status: number, a: number, b: number): void
  gain(value: number): void
  status(): AndroidPianoStatus
  command(method: string, args: unknown[]): void
  configureMidi(config: unknown): void
  ownsDevice(key: string): boolean
  rescanMidi(): void
  resetMidi(): void
}
export const androidPianoBridge = (): AndroidPianoBridge | undefined =>
  typeof window === 'undefined' ? undefined : (window as any).androidPiano

export const useAndroidPiano = create<{
  phase: 'off' | 'starting' | 'running' | 'failed'
  status: AndroidPianoStatus | null
  error: string | null
}>(() => ({ phase: 'off', status: null, error: null }))

/** Returns false while unavailable so the existing keyboard engine can play. */
export function androidPianoMidi(status: number, a = 0, b = 0): boolean {
  if (useAndroidPiano.getState().phase !== 'running') return false
  try { androidPianoBridge()!.midi(status, a, b); return true }
  catch (error) {
    try { androidPianoBridge()?.stop() } catch {}
    useAndroidPiano.setState({ phase: 'failed', status: null, error: String(error) })
    return false
  }
}
export function resetAndroidPiano() {
  androidPianoMidi(0xb0, 120, 0)
  androidPianoMidi(0xb0, 121, 0)
}
