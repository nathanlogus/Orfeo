// ── Home page: the songs already on this device, in the server's terms ──────
import type { LibraryFile, SongServerSong } from '../types'
import { buildCards, type SongCard, type SongSort } from './songCatalog'

export interface FilterOption { name: string; count: number }

// Where a song was left, for Keep going. time is what Continue goes back to.
export interface LastPlayed { path: string; name: string; time: number; bar: number | null; bars: number | null; level?: number }

export function lastPlayedAt(path: string, name: string, barTimes: number[] | undefined, time: number, level?: number): LastPlayed {
  const bars = barTimes?.length || null
  const bar = bars && Math.max(1, barTimes!.filter(start => start <= time + 1e-6).length)
  return { path, name, time, bar, bars, level }
}

export const movedLastPlayed = (last: LastPlayed, pairs: { oldPath: string; newPath: string }[]): LastPlayed => {
  const moved = pairs.find(p => p.oldPath === last.path)
  return moved ? { ...last, path: moved.newPath, name: moved.newPath.split(/[\\/]/).pop() ?? last.name } : last
}

const plain = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
export const matchesSearch = (text: string, q: string) => {
  const hay = plain(text)
  return plain(q).split(/\s+/).filter(Boolean).every(w => hay.includes(w))
}

// A library's top-level folders do the job of genres here
export function deviceSongs(files: LibraryFile[], libraryFolder: string | null, catalog: unknown = null): SongServerSong[] {
  const root = libraryFolder?.replace(/\\/g, '/').replace(/\/$/, '')
  const cards = new Map(buildCards(files, libraryFolder, catalog).map(c => [c.path, c]))
  return files.map(f => {
    const path = f.path.replace(/\\/g, '/')
    const rel = root && path.startsWith(`${root}/`) ? path.slice(root.length + 1) : ''
    const folders = rel.split('/').slice(0, -1)
    // Downloads keep the server's folders, one level down
    if (folders[0] === 'Home Server') folders.shift()
    const c = cards.get(f.path)!
    return {
      path: f.path, title: c.title, artist: c.people[0] ?? folders.slice(1).join(' / '), genre: c.genres[0]?.name ?? folders[0] ?? '',
      size: 0, local: true, art: c.art, people: c.people.length ? c.people : undefined, genres: c.genres.length ? c.genres : undefined,
      key: c.key ?? undefined, bpm: c.bpm ?? undefined, meter: c.meter ?? undefined, duration: c.duration ?? undefined,
      arrangement: c.arrangement ?? undefined, difficulty: c.difficulty ?? undefined, busyness: c.busyness ?? undefined, classic: c.classic,
      hands: c.hands ?? undefined,
    }
  }).sort((a, b) => a.title.localeCompare(b.title))
}

// The song browser's card, for a song as the home page lists it
export function songCard(s: SongServerSong): SongCard {
  return {
    path: s.path, title: s.title,
    people: s.people ?? (s.artist ? [s.artist] : []),
    genres: s.genres ?? (s.genre ? [{ name: s.genre, guessed: false }] : []),
    art: s.art ?? null, key: s.key ?? null, bpm: s.bpm ?? null, meter: s.meter ?? null,
    duration: s.duration ?? null, arrangement: s.arrangement ?? null, difficulty: s.difficulty ?? null,
    busyness: s.busyness ?? null, hands: s.hands ?? null, classic: !!s.classic, soloLine: s.arrangement === 'solo-line',
    folder: s.genre || null, search: '',
  }
}

// ── The filters the home server applies, for the songs on this device ───────
export interface SongFilters { q: string; genre: string; artist: string; arrangement: string; difficulty: string; key: string; hands: string; classic: boolean }
type Filter = 'genre' | 'artist' | 'arrangement' | 'difficulty' | 'key' | 'hands'

const peopleOf = (s: SongServerSong) => s.people ?? (s.artist ? [s.artist] : [])
const FILTER_VALUES: Record<Filter, (s: SongServerSong) => (string | number | undefined)[]> = {
  genre: s => [s.genre], artist: peopleOf, arrangement: s => [s.arrangement], difficulty: s => [s.difficulty], key: s => [s.key], hands: s => [s.hands],
}

export function filterSongs(songs: SongServerSong[], f: SongFilters, leaveOut?: Filter): SongServerSong[] {
  const active = (Object.keys(FILTER_VALUES) as Filter[]).filter(k => f[k] && k !== leaveOut)
  return songs.filter(s => (!f.classic || s.classic)
    && matchesSearch(`${s.title} ${s.artist} ${s.genre} ${peopleOf(s).join(' ')} ${s.key ?? ''}`, f.q)
    && active.every(k => FILTER_VALUES[k](s).some(v => String(v) === f[k])))
}

// Each list ignores its own filter, so any filter can still be changed
export function songFacets(songs: SongServerSong[], f: SongFilters) {
  const list = (k: Filter): FilterOption[] => {
    const seen = new Map<string, number>()
    for (const s of filterSongs(songs, f, k)) {
      for (const v of new Set(FILTER_VALUES[k](s))) if (v !== undefined && v !== '') seen.set(String(v), (seen.get(String(v)) ?? 0) + 1)
    }
    return [...seen].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name))
  }
  return {
    genres: list('genre'), artists: list('artist'), arrangements: list('arrangement'), difficulties: list('difficulty'), keys: list('key'), hands: list('hands'),
    classics: songs.filter(s => s.classic).length,
  }
}

const byNumber = (a?: number, b?: number) => (a ?? Infinity) - (b ?? Infinity)
const byPerson = (a: SongServerSong, b: SongServerSong) => (+!peopleOf(a)[0] - +!peopleOf(b)[0]) || (peopleOf(a)[0] ?? '').localeCompare(peopleOf(b)[0] ?? '')
const SORTS: Record<SongSort, ((a: SongServerSong, b: SongServerSong) => number) | null> = {
  title: null,
  person: byPerson,
  easiest: (a, b) => byNumber(a.difficulty, b.difficulty) || byNumber(a.busyness, b.busyness),
  tempo: (a, b) => byNumber(a.bpm, b.bpm),
  length: (a, b) => byNumber(a.duration, b.duration),
}
export const sortSongs = (songs: SongServerSong[], sort: SongSort) => (SORTS[sort] ? [...songs].sort(SORTS[sort]!) : songs)
