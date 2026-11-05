// ── Home page: the songs already on this device, in the server's terms ──────
import type { LibraryFile, SongServerSong } from '../types'

export interface FilterOption { name: string; count: number }

const plain = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
export const matchesSearch = (text: string, q: string) => {
  const hay = plain(text)
  return plain(q).split(/\s+/).filter(Boolean).every(w => hay.includes(w))
}

// A library's top-level folders do the job of genres here
export function deviceSongs(files: LibraryFile[], libraryFolder: string | null): SongServerSong[] {
  const root = libraryFolder?.replace(/\\/g, '/').replace(/\/$/, '')
  return files.map(f => {
    const path = f.path.replace(/\\/g, '/')
    const rel = root && path.startsWith(`${root}/`) ? path.slice(root.length + 1) : ''
    const folders = rel.split('/').slice(0, -1)
    return { path: f.path, title: f.name.replace(/\.[^.]+$/, ''), artist: folders.slice(1).join(' / '), genre: folders[0] ?? '', size: 0, local: true }
  }).sort((a, b) => a.title.localeCompare(b.title))
}

export function folderCounts(songs: SongServerSong[]): FilterOption[] {
  const seen = new Map<string, number>()
  for (const s of songs) if (s.genre) seen.set(s.genre, (seen.get(s.genre) ?? 0) + 1)
  return [...seen].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name))
}
