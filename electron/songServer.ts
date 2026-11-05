// ── Home song server (server/song-server.mjs): what may come from it ───────
// Songs land in <library>/Home Server, keeping the server's folders. A path comes
// from the network, so it has to be one plain relative path to a song.
import { join } from 'path'

const SONG = /\.(mid|midi|kar|musicxml|xml|mxl|gp|gp3|gp4|gp5|gpx|cap)$/i

export function serverUrl(text: string): string {
  const t = text.trim().replace(/\/+$/, '')
  const url = /^https?:\/\//i.test(t) ? t : `http://${t}`
  return new URL(url).port || /^https:/i.test(url) ? url : `${url}:8765`
}

// Discovery: server/song-server.mjs answers this on UDP, naming its web port
export const DISCOVERY_PORT = 8765
export const DISCOVERY_PROBE = 'orfeo-songs?'
export function discoveredAddress(reply: string, ip: string): string | null {
  const port = /^orfeo-songs:(\d{1,5})$/.exec(reply)?.[1]
  return port && Number(port) <= 65535 ? `${ip}:${port}` : null
}

export function safeSongPath(p: unknown): p is string {
  if (typeof p !== 'string' || !SONG.test(p) || /[\\:\0]/.test(p)) return false
  return !p.split('/').some(x => x === '' || x === '.' || x === '..')
}

export function songServerDest(root: string, path: string): string {
  return join(root, 'Home Server', ...path.split('/'))
}
