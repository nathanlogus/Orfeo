import { ipcMain, dialog } from 'electron'
import { join, dirname, basename } from 'path'
import { mkdirSync, existsSync, readFileSync, writeFileSync, readdirSync, renameSync, unlinkSync, statSync } from 'fs'
import type { PerformanceTake } from '../src/utils/performanceRecording'

const MEDIA = /\.(mid|midi|kar|mxl|musicxml|xml|gp|gp3|gp4|gp5|gpx|cap)$/i
const clean = (name: string) => name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').replace(/[. ]+$/, '').slice(0, 160) || 'Untitled'
const objectFile = (path: string, fallback: any) => { try { return JSON.parse(readFileSync(path, 'utf8')) } catch { return fallback } }
const atomicJson = (path: string, data: unknown) => { writeFileSync(path + '.part', JSON.stringify(data)); renameSync(path + '.part', path) }
export function registerLibraryTools(userData: () => string, getPrefs: () => any, savePrefs: (data: any) => void, homeDir: () => string) {
  const takesDir = () => { const dir = join(userData(), 'Performances'); mkdirSync(dir, { recursive: true }); return dir }
  const takePath = (id: string) => { if (!/^[\da-f-]{36}$/i.test(id)) throw new Error('Invalid recording'); return join(takesDir(), `${id}.json`) }
  ipcMain.handle('performance:list', () => readdirSync(takesDir()).filter(f => /^[\da-f-]{36}\.json$/i.test(f)).map(f => objectFile(join(takesDir(), f), null)).filter(Boolean).sort((a, b) => b.createdAt - a.createdAt))
  ipcMain.handle('performance:save', (_e, take: PerformanceTake) => {
    if (!take || typeof take.midi !== 'string' || take.midi.length > 16_000_000 || !Number.isFinite(take.duration) || take.duration <= 0) throw new Error('Invalid recording')
    const bytes = Buffer.from(take.midi, 'base64')
    if (String.fromCharCode(...bytes.subarray(0, 4)) !== 'MThd') throw new Error('Invalid MIDI recording')
    if (existsSync(takePath(take.id))) throw new Error('Recording already exists')
    atomicJson(takePath(take.id), take)
  })
  ipcMain.handle('performance:delete', (_e, id: string) => { const p = takePath(id); if (existsSync(p)) unlinkSync(p) })
  ipcMain.handle('performance:export', async (_e, id: string) => {
    const take = objectFile(takePath(id), null)
    if (!take) throw new Error('Recording not found')
    const result = await dialog.showSaveDialog({ defaultPath: `${clean(take.songTitle)}-${take.createdAt}.mid`, filters: [{ name: 'MIDI', extensions: ['mid'] }] })
    if (result.canceled || !result.filePath) return null
    writeFileSync(result.filePath, Buffer.from(take.midi, 'base64')); return result.filePath
  })

  ipcMain.handle('inbox:choose', async (_e, kind: 'source' | 'target') => {
    const result = await dialog.showOpenDialog({ title: kind === 'source' ? 'Choose a folder to watch for songs' : 'Choose the collection folder', properties: ['openDirectory'] })
    return result.canceled ? null : result.filePaths[0] ?? null
  })
  ipcMain.handle('inbox:scan', () => {
    const config = getPrefs().libraryWorkspace?.inbox
    if (!config?.source || !config?.target || config.source === config.target) return []
    const catalog = objectFile(join(config.target, 'catalog.json'), { songs: {} })
    const known = Object.values(catalog.songs ?? {}).map((s: any) => s.sourceHash).filter(Boolean)
    return readdirSync(config.source, { withFileTypes: true }).filter(e => e.isFile() && MEDIA.test(e.name)).map(e => {
      const path = join(config.source, e.name), stat = statSync(path)
      return { path, name: e.name, size: stat.size, mtime: stat.mtimeMs, known }
    }).filter(f => f.size > 0 && f.size < 64 * 1024 * 1024 && Date.now() - f.mtime > 2000)
  })
  ipcMain.handle('inbox:commit', async (_e, payload: { source: string; sourceHash: string; midi: string; title: string; artist: string; genre: string; art: string | null }) => {
    const config = getPrefs().libraryWorkspace?.inbox
    if (!config?.source || !config?.target || dirname(payload.source) !== config.source || !MEDIA.test(payload.source)) throw new Error('File is outside the watched folder')
    if (!/^[a-f0-9]{64}$/.test(payload.sourceHash) || !payload.title.trim() || payload.midi.length > 32_000_000) throw new Error('Invalid song data')
    const midi = Buffer.from(payload.midi, 'base64')
    if (String.fromCharCode(...midi.subarray(0, 4)) !== 'MThd') throw new Error('Not a MIDI file')
    if (statSync(payload.source).size > 64 * 1024 * 1024) throw new Error('This source file is too large to import.')
    const sourceBytes = readFileSync(payload.source)
    const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(sourceBytes).buffer)
    const actualHash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
    if (actualHash !== payload.sourceHash) throw new Error('This file changed after review. Check the inbox and review it again.')
    const cp = join(config.target, 'catalog.json')
    const catalog = existsSync(cp) ? JSON.parse(readFileSync(cp, 'utf8')) : { version: 1, songs: {} }
    if (!catalog || typeof catalog !== 'object' || (catalog.songs && typeof catalog.songs !== 'object')) throw new Error('The collection catalog needs repair before adding songs.')
    catalog.songs ??= {}
    if (Object.values(catalog.songs).some((s: any) => s.sourceHash === payload.sourceHash)) return { duplicate: true, path: null }
    const folder = join(config.target, clean(payload.genre || 'Imported'), 'Imports'); mkdirSync(folder, { recursive: true })
    const stem = clean(basename(payload.source).replace(/\.[^.]+$/, '')); let name = `${stem}.mid`, count = 2
    while (existsSync(join(folder, name))) name = `${stem} (${count++}).mid`
    const dest = join(folder, name), relative = `${clean(payload.genre || 'Imported')}/Imports/${name}`
    const sheet = /\.(mxl|musicxml|xml|gp|gp3|gp4|gp5|gpx|cap)$/i.test(payload.source)
    catalog.songs[relative] = { title: payload.title.trim(), performer: payload.artist.trim(), composers: [], genres: payload.genre ? [{ name: payload.genre, guessed: false }] : [], sourceHash: payload.sourceHash, addedAt: Date.now(), sheet, art: payload.art ? { url: payload.art, kind: 'album' } : null, source: 'watched-folder' }
    try {
      writeFileSync(dest, midi)
      if (sheet) writeFileSync(dest + '.sheet', sourceBytes)
      atomicJson(cp, catalog)
    } catch (error) { if (existsSync(dest)) unlinkSync(dest); if (sheet && existsSync(dest + '.sheet')) unlinkSync(dest + '.sheet'); throw error }
    return { duplicate: false, path: dest }
  })

  let token = '', expires = 0
  ipcMain.handle('library:artwork', async (_e, title: string, artist: string) => {
    if (!title.trim() || !artist.trim()) return []
    const keys = objectFile(join(homeDir(), '.pliage-spotify.json'), null)
    if (!keys?.client_id || !keys?.client_secret) return []
    if (Date.now() > expires) {
      const result = await fetch('https://accounts.spotify.com/api/token', { method: 'POST', headers: { Authorization: `Basic ${Buffer.from(`${keys.client_id}:${keys.client_secret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=client_credentials', signal: AbortSignal.timeout(15000) })
      if (!result.ok) throw new Error('Spotify authentication failed')
      const data = await result.json(); token = data.access_token; expires = Date.now() + Math.max(60, data.expires_in - 60) * 1000
    }
    const query = new URLSearchParams({ q: `${title} ${artist}`, type: 'track', limit: '10' })
    const response = await fetch(`https://api.spotify.com/v1/search?${query}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) })
    if (!response.ok) throw new Error(`Spotify search failed (${response.status})`)
    const data = await response.json()
    const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
    return (data.tracks?.items ?? []).filter((t: any) => fold(t.name).includes(fold(title)) && t.artists?.some((a: any) => fold(a.name) === fold(artist)) && t.album?.images?.length).slice(0, 5).map((t: any) => ({ title: t.name, artist: t.artists.map((a: any) => a.name).join(', '), album: t.album.name, url: t.album.images[0].url }))
  })
}
