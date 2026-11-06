// ── Node's fs on top of the Android bridge (MainActivity.Bridge) ─────────────
// Sync on purpose: main.ts is written against the sync API and files are small.
const B = (window as any).PliageBridge

export function statSync(p: string) {
  const s = B.stat(p)
  if (!s) throw Object.assign(new Error(`ENOENT: ${p}`), { code: 'ENOENT' })
  const { dir, size, mtime } = JSON.parse(s)
  return { size, mtimeMs: mtime, isFile: () => !dir, isDirectory: () => dir }
}

export const existsSync = (p: string) => !!B.stat(p)
export const mkdirSync = (p: string, _o?: unknown) => B.mkdir(p)
export const unlinkSync = (p: string) => B.remove(p)
export const renameSync = (a: string, b: string) => B.rename(a, b)
export const copyFileSync = (a: string, b: string) => B.copy(a, b)

export function readdirSync(p: string, o?: { withFileTypes?: boolean }): any[] {
  const list = JSON.parse(B.list(p)) as { name: string; dir: boolean }[]
  if (!o?.withFileTypes) return list.map(e => e.name)
  return list.map(e => ({ name: e.name, isFile: () => !e.dir, isDirectory: () => e.dir }))
}

export function readFileSync(p: string, enc?: string): any {
  // A sound set is too big for the string bridge: its one caller is an IPC
  // handler, so a Promise reaches the page just as the bytes would
  if (/\.sf[23]$/i.test(p)) return fetch('/fs' + encodeURI(p)).then(r => r.ok ? r.arrayBuffer() : Promise.reject(new Error(`read failed: ${p}`)))
  const buf = (globalThis as any).Buffer.from(B.read(p), 'base64')
  return enc ? buf.toString() : buf
}

export function writeFileSync(p: string, data: string | Uint8Array, _enc?: string) {
  B.write(p, (globalThis as any).Buffer.from(data).toString('base64'))
}

// Enough of a stream for pdfkit's doc.pipe() and main.ts's download
class WriteStream {
  private chunks: Uint8Array[] = []
  private ls = new Map<string, Function[]>()
  constructor(public path: string) {}
  on(ev: string, fn: Function) { this.ls.set(ev, [...(this.ls.get(ev) ?? []), fn]); return this }
  once(ev: string, fn: Function) { const w = (...a: any[]) => { this.removeListener(ev, w); fn(...a) }; return this.on(ev, w) }
  removeListener(ev: string, fn: Function) { this.ls.set(ev, (this.ls.get(ev) ?? []).filter(f => f !== fn)); return this }
  listenerCount(ev: string) { return this.ls.get(ev)?.length ?? 0 }
  emit(ev: string, ...a: any[]) { (this.ls.get(ev) ?? []).slice().forEach(f => f(...a)); return true }
  write(c: Uint8Array) { this.chunks.push(c); return true }
  end(c?: Uint8Array) {
    if (c) this.chunks.push(c)
    try {
      const all = new Uint8Array(this.chunks.reduce((n, x) => n + x.length, 0))
      let at = 0
      for (const x of this.chunks) { all.set(x, at); at += x.length }
      writeFileSync(this.path, all)
      setTimeout(() => this.emit('finish'))
    } catch (e) { setTimeout(() => this.emit('error', e)) }
  }
  close(cb?: () => void) { cb?.() }
}
export const createWriteStream = (p: string) => new WriteStream(p)

export default { statSync, existsSync, mkdirSync, unlinkSync, renameSync, copyFileSync, readdirSync, readFileSync, writeFileSync, createWriteStream }
