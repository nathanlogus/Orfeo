// ── Calls that finish later: Java answers through window.__pliage(id, …) ──────
const B = (window as any).PliageBridge
let nextId = 1
const waiting = new Map<number, (...a: any[]) => void>()
;(window as any).__pliage = (id: number, ...a: any[]) => waiting.get(id)?.(...a)

export function ask<T>(start: (id: number) => void): Promise<T> {
  const id = nextId++
  return new Promise<T>((res) => {
    waiting.set(id, (v: T) => { waiting.delete(id); res(v) })
    start(id)
  })
}

// https.get for main.ts's sound set download. Desktop streams into the file in
// JS; a WebView can't (GitHub release assets send no CORS headers), so Java
// does the transfer and this reports it in the shape main.ts reads.
export function httpGet(url: string, onResponse: (res: any) => void) {
  const id = nextId++
  const data: Function[] = []
  let file: any = null
  let onError: (e: Error) => void = () => {}
  const res = {
    statusCode: 0, headers: {} as Record<string, string>,
    on: (ev: string, fn: Function) => { if (ev === 'data') data.push(fn); return res },
    resume() {},
    pipe(f: any) { file = f; B.httpSave(id, f.path) },
  }
  const request = {
    on(ev: string, fn: (e: Error) => void) { if (ev === 'error') onError = fn; return request },
    setTimeout() { return request }, // Java sets the timeouts
    destroy() {},
  }
  waiting.set(id, (kind: string, a: any, b: any) => {
    if (kind === 'head') { res.statusCode = a; res.headers['content-length'] = String(b); onResponse(res) }
    else if (kind === 'data') data.forEach(f => f({ length: a }))
    else if (kind === 'done') { waiting.delete(id); file.emit('finish') }
    else { waiting.delete(id); const e = new Error(a); if (file) file.emit('error', e); else onError(e) }
  })
  B.httpOpen(id, url)
  return request
}
