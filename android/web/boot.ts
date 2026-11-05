// Android entry: the desktop main process and preload, then the app, in one page
import './globals'
import fs from './fs'
import { httpGet } from './native'
import { disableUpdates, windowReady } from './electron'

;(globalThis as any).require = (id: string) => (/^https?$/.test(id) ? { get: httpGet } : fs)

async function start() {
  await import('../../electron/main')
  await import('../../electron/preload')
  disableUpdates()
  // After the demo songs are in place, so the first library scan finds them
  await windowReady
  await import('../../src/main')
}
void start()
