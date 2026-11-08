import { create } from 'zustand'
import type { SongServerSong } from '../types'

export interface SongEdit { title: string; artist: string; genre: string; art?: string | null }
export interface SavedPractice { tempo: number; hand: 'both' | 'left' | 'right'; start: number; end: number | null }
export interface SetEntry { id: string; song: SongServerSong; server: string; practice: SavedPractice }
export interface SavedSet { id: string; name: string; songs: SetEntry[] }
export interface OfflineSong { song: SongServerSong; server: string; remotePath: string; downloadedAt: number }
export interface WorkspaceData {
  edits: Record<string, SongEdit>
  offline: Record<string, OfflineSong>
  sets: SavedSet[]
  inbox: { source: string; target: string; enabled: boolean; dismissed: string[] }
}
const empty = (): WorkspaceData => ({ edits: {}, offline: {}, sets: [], inbox: { source: '', target: '', enabled: false, dismissed: [] } })
export const librarySongKey = (path: string, server = '') => `${server.replace(/\/$/, '')}|${path.replace(/\\/g, '/')}`
export const newLibraryId = () => crypto.randomUUID()
export const defaultPractice = (): SavedPractice => ({ tempo: 100, hand: 'both', start: 0, end: null })
export const isNewSong = (addedAt?: number, now = Date.now()) => !!addedAt && addedAt <= now && now - addedAt < 7 * 86400000
export function editSong(song: SongServerSong, edit?: SongEdit): SongServerSong {
  return edit ? { ...song, ...edit, art: edit.art === undefined ? song.art : edit.art,
    people: edit.artist === song.artist ? song.people : edit.artist ? [edit.artist] : [],
    genres: edit.genre === song.genre ? song.genres : edit.genre ? [{ name: edit.genre, guessed: false }] : [] } : song
}
export function moveSetEntry<T>(items: T[], from: number, to: number): T[] {
  if (from < 0 || to < 0 || from >= items.length || to >= items.length) return items
  const next = [...items], [item] = next.splice(from, 1); next.splice(to, 0, item); return next
}
export function cleanSongEdit(value: SongEdit): SongEdit {
  const title = value.title.trim().slice(0, 240)
  if (!title) throw new Error('A song needs a title.')
  const art = value.art === undefined ? undefined : value.art?.trim() || null
  if (art && !/^https:\/\//i.test(art)) throw new Error('Use an HTTPS image URL, or clear the cover.')
  return { title, artist: value.artist.trim().slice(0, 240), genre: value.genre.trim().toLowerCase().replace(/\s+/g, '-').slice(0, 80), art }
}
export function normalizeWorkspace(raw: unknown): WorkspaceData {
  const out = empty()
  if (!raw || typeof raw !== 'object') return out
  const data = raw as Partial<WorkspaceData>
  if (data.edits && typeof data.edits === 'object') for (const [key, edit] of Object.entries(data.edits)) {
    try { out.edits[key] = cleanSongEdit(edit) } catch { /* one broken edit doesn't hide the library */ }
  }
  if (data.offline && typeof data.offline === 'object') for (const [key, entry] of Object.entries(data.offline)) {
    if (entry?.song && typeof entry.song.path === 'string' && typeof entry.song.title === 'string' && typeof entry.server === 'string') out.offline[key] = entry
  }
  if (Array.isArray(data.sets)) out.sets = data.sets.filter(s => typeof s?.id === 'string' && typeof s.name === 'string' && Array.isArray(s.songs)).map(s => ({ ...s, songs: s.songs.filter(e => e?.song && typeof e.song.path === 'string' && typeof e.server === 'string').map(e => ({ ...e, practice: { ...defaultPractice(), ...e.practice } })) }))
  if (data.inbox && typeof data.inbox.source === 'string' && typeof data.inbox.target === 'string') out.inbox = { ...out.inbox, ...data.inbox, dismissed: Array.isArray(data.inbox.dismissed) ? data.inbox.dismissed.filter(x => typeof x === 'string') : [] }
  return out
}
export const useLibraryWorkspace = create<WorkspaceData & { ready: boolean }>(() => ({ ...empty(), ready: false }))
let loading: Promise<void> | null = null
export function loadLibraryWorkspace() {
  return loading ??= window.electronAPI.getPrefs().then(p => { useLibraryWorkspace.setState({ ...normalizeWorkspace(p.libraryWorkspace), ready: true }) })
    .catch(() => { loading = null; useLibraryWorkspace.setState({ ready: true }) })
}
let writes = Promise.resolve()
export function saveLibraryWorkspace(patch: Partial<WorkspaceData>) {
  useLibraryWorkspace.setState(patch)
  const { ready: _, ...data } = useLibraryWorkspace.getState()
  writes = writes.catch(() => {}).then(() => window.electronAPI.setPrefs({ libraryWorkspace: data }))
  return writes
}

export const BRAZILIAN_GENRES = ['brazilian', 'mpb', 'brazilian-popular', 'samba', 'bossa-nova', 'choro', 'forro', 'baiao', 'frevo', 'modinha', 'marchinha', 'nordeste', 'sertanejo', 'toada', 'maracatu', 'folclore', 'jovem-guarda', 'rock-brasileiro']
