// ── What main.ts expects from Node: runs before any other module ─────────────
const { files, resources } = JSON.parse((window as any).OrfeoBridge.dirs())

class AndroidBuffer extends Uint8Array {
  static from(v: any, enc?: any): any {
    if (typeof v !== 'string') return new AndroidBuffer(v)
    if (enc === 'base64') return new AndroidBuffer(Uint8Array.from(atob(v), c => c.charCodeAt(0)))
    return new AndroidBuffer(new TextEncoder().encode(v))
  }
  toString(enc?: any): string {
    if (enc !== 'base64') return new TextDecoder().decode(this)
    let s = ''
    for (let i = 0; i < this.length; i += 0x8000) s += String.fromCharCode(...this.subarray(i, i + 0x8000))
    return btoa(s)
  }
}

const g = globalThis as any
g.Buffer = AndroidBuffer
g.process = { platform: 'android', env: {}, resourcesPath: resources, windowsStore: false }
g.__orfeoFilesDir = files

// The desktop layout needs ~1100 px; a phone lays it out at that width and scales it down
const BASE_WIDTH = Math.max(1100, window.innerWidth)
export function setPageZoom(factor: number) {
  document.querySelector('meta[name=viewport]')?.setAttribute('content', `width=${Math.round(BASE_WIDTH / factor)}, user-scalable=no`)
}
setPageZoom(1)
