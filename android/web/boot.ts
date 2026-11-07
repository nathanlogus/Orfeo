// Android entry: the desktop main process and preload, then the app, in one page
import './globals'
import './touch'
import fs from './fs'
import { ask, httpGet } from './native'
import { disableUpdates, windowReady } from './electron'

;(globalThis as any).require = (id: string) => (/^https?$/.test(id) ? { get: httpGet } : fs)

// Only Android exposes this optional live-keyboard output. Desktop builds
// never import this adapter or call the Java bridge.
const bridge = (window as any).PliageBridge
;(window as any).androidPiano = {
  start: (path: string, gain: number, rate: number, exclusive = false) => ask<string | null>(id => bridge.pianoStart(id, path, gain, rate, exclusive)).then(error => { if (error) throw new Error(error) }),
  stop: () => bridge.pianoStop(),
  midi: (status: number, a: number, b: number) => bridge.pianoMidi(status, a, b),
  gain: (gain: number) => bridge.pianoGain(gain),
  status: () => JSON.parse(bridge.pianoStatus()),
  command: (method: string, args: unknown[]) => bridge.pianoCommand(JSON.stringify({ method, args })),
  configureMidi: (config: unknown) => bridge.pianoMidiConfig(JSON.stringify(config)),
  ownsDevice: (key: string) => bridge.pianoOwnsDevice(key),
  rescanMidi: () => bridge.pianoMidiRescan(),
  resetMidi: () => bridge.pianoMidiReset(),
}

async function start() {
  await import('../../electron/main')
  await import('../../electron/preload')
  disableUpdates()
  // After the demo songs are in place, so the first library scan finds them
  await windowReady
  await import('../../src/main')
}
void start()
