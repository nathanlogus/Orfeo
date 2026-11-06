// ── The parts of Electron main.ts and preload.ts use, in one page ────────────
// ipcRenderer calls the ipcMain handlers directly, so both files run unchanged.
import { ask } from './native'
import { setPageZoom } from './globals'

const B = (window as any).PliageBridge
const files = (globalThis as any).__pliageFilesDir as string

const handlers = new Map<string, Function>()
const listeners = new Map<string, Function[]>()
const send = (ch: string, ...a: unknown[]) => (listeners.get(ch) ?? []).slice().forEach(f => f({ ports: [] }, ...a))

export const ipcMain = { handle: (ch: string, fn: Function) => { handlers.set(ch, fn) } }
export const ipcRenderer = {
  invoke: async (ch: string, ...a: unknown[]) => {
    const h = handlers.get(ch)
    if (!h) throw new Error(`no handler for ${ch}`)
    return h({ sender: { send } }, ...a)
  },
  on: (ch: string, fn: Function) => { listeners.set(ch, [...(listeners.get(ch) ?? []), fn]) },
  off: (ch: string, fn: Function) => { listeners.set(ch, (listeners.get(ch) ?? []).filter(f => f !== fn)) },
  removeAllListeners: (ch: string) => { listeners.delete(ch) },
}
export const contextBridge = { exposeInMainWorld: (name: string, api: unknown) => { (window as any)[name] = api } }
export const webUtils = { getPathForFile: () => '' }

let windowCreated = () => {}
export const windowReady = new Promise<void>(r => { windowCreated = r })

export class BrowserWindow {
  private ls = new Map<string, Function>()
  webContents = {
    send, on() {}, postMessage() {}, toggleDevTools() {}, setVisualZoomLevelLimits() {},
    setZoomFactor: setPageZoom,
  }
  constructor(_o: unknown) { windowCreated(); (window as any).__pliageBack = () => this.close() }
  on(ev: string, fn: Function) { this.ls.set(ev, fn) }
  once() {}
  loadFile() {}
  loadURL() {}
  maximize() {}
  show() {}
  setFullScreen() {}
  isDestroyed() { return false }
  getMinimumSize() { return [0, 0] }
  getBounds() { return { width: innerWidth, height: innerHeight } }
  close() {
    let stopped = false
    this.ls.get('close')?.({ preventDefault: () => { stopped = true } })
    if (!stopped) B.exit()
  }
}

export const app = {
  isPackaged: true,
  setName() {}, setPath() {}, quit() { B.exit() }, on() {},
  whenReady: () => Promise.resolve(),
  getName: () => 'Pliage',
  getVersion: () => __APP_VERSION__,
  getAppPath: () => files,
  getPath: (name: string) => `${files}/${name === 'userData' ? 'userData' : 'Music'}`,
}

// A picked file has no path of its own: Java copies it in first, and a folder
// comes in as a copy under Library/. The originals are never written to.
export const dialog = {
  async showOpenDialog(o: any) {
    const folder = !!o.properties?.includes('openDirectory')
    const path = await ask<string | null>(id => B.pick(id, folder))
    const exts: string[] | undefined = o.filters?.[0]?.extensions
    const ok = !!path && (folder || !exts || exts.some(x => path.toLowerCase().endsWith('.' + x)))
    return { canceled: !ok, filePaths: ok ? [path] : [] }
  },
  // shortcut: Save As keeps the suggested name beside the song; add a name prompt if people ask
  showSaveDialog: async (o: any) => ({ canceled: false, filePath: o.defaultPath }),
  async showMessageBox(_win: unknown, o: any) {
    const text = [o.message, o.detail].filter(Boolean).join('\n\n')
    return { response: await ask<number>(id => B.message(id, o.title ?? 'Pliage', text, JSON.stringify(o.buttons ?? ['OK']))) }
  },
}

export const shell = {
  openExternal: async (url: string) => B.openUrl(url),
  // Files live inside the app, so "show in folder" is the Android share sheet
  showItemInFolder: (p: string) => B.share(p),
  // shortcut: a private folder can't be opened in a file manager; files go out one at a time through the share sheet
  openPath: async (_p: string) => '',
}

export const Menu = { setApplicationMenu() {}, buildFromTemplate: () => null }
export const utilityProcess = {}
export class MessageChannelMain {}
export type UtilityProcess = unknown
export const autoUpdater = { on() {}, checkForUpdates: async () => null, quitAndInstall() {} }

// Desktop's update check would offer a Windows .exe here
export function disableUpdates() {
  handlers.set('update:info', () => ({ mode: 'store', downloadUrl: '' }))
  handlers.set('update:check', () => {})
  handlers.set('update:new-version', () => null)
  // Node's dgram has no stand-in here: Java sends the broadcast
  handlers.set('songServer:discover', () => ask<string | null>(id => B.discover(id)))
  // Song art is plain HTTP, which this secure page can't load: Java fetches it
  const query = handlers.get('songServer:query')!
  handlers.set('songServer:query', async (ev: unknown, ...args: unknown[]) => {
    const list = await query(ev, ...args)
    return { ...list, songs: list.songs.map((s: any) => ({ ...s, art: s.art && `/homeart?u=${encodeURIComponent(s.art)}` })) }
  })
}
