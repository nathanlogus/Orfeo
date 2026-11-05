// ── Song Browser data: Library files plus the optional catalog.json ───────────
// catalog.json sits in the library folder and describes files by their path
// relative to it. It is optional and hand-editable, so nothing here trusts its
// shape: a missing or malformed field just leaves that card with less on it.
import type { LibraryFile } from '../types'

export interface SongGenre { name: string; guessed: boolean }

export interface SongCard {
  path: string
  title: string
  people: string[]          // composers, else the performer
  genres: SongGenre[]
  art: string | null        // ready for <img src>
  key: string | null
  bpm: number | null
  meter: string | null
  duration: number | null
  arrangement: string | null
  difficulty: number | null
  busyness: number | null
  hands: string | null      // how the file lays out the two hands
  classic: boolean
  soloLine: boolean
  folder: string | null
  search: string            // lower-case, accent-free text the search box matches
}

export interface SongFilters {
  query: string
  genre: string
  person: string
  arrangement: string
  difficulty: string
  key: string
  hands: string
  classicOnly: boolean
  includeGuessed: boolean
  showSoloLines: boolean
}

export const NO_FILTERS: SongFilters = {
  query: '', genre: '', person: '', arrangement: '', difficulty: '', key: '', hands: '',
  classicOnly: false, includeGuessed: true, showSoloLines: false,
}

export type SongSort = 'title' | 'person' | 'easiest' | 'tempo' | 'length'

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const strings = (v: unknown) => (Array.isArray(v) ? v.map(str).filter((s): s is string => !!s) : [])

// Only web images and files inside the library may load: an entry can't point
// the app at an arbitrary file on disk.
export function artSource(url: unknown, libraryFolder: string | null): string | null {
  const u = str(url)
  if (!u) return null
  if (/^https:\/\//i.test(u)) return u
  if (/^[a-z][a-z0-9+.-]*:/i.test(u) || u.startsWith('/') || u.startsWith('\\') || !libraryFolder) return null
  if (u.split(/[\\/]/).includes('..')) return null
  const root = libraryFolder.replace(/\\/g, '/').replace(/\/$/, '')
  return encodeURI(`file:///${root.replace(/^\//, '')}/${u}`).replace(/#/g, '%23').replace(/\?/g, '%3F')
}

export function relativeToLibrary(path: string, libraryFolder: string | null): string {
  const p = path.replace(/\\/g, '/')
  if (!libraryFolder) return p
  const root = libraryFolder.replace(/\\/g, '/').replace(/\/$/, '')
  return p.toLowerCase().startsWith(root.toLowerCase() + '/') ? p.slice(root.length + 1) : p
}

function fallbackTitle(name: string): string {
  return name.replace(/\.[a-z0-9]{1,8}$/i, '')
}

export function buildCards(files: LibraryFile[], libraryFolder: string | null, catalog: unknown): SongCard[] {
  const raw = (catalog as { songs?: unknown } | null)?.songs
  const songs: Record<string, any> = raw && typeof raw === 'object' ? raw as Record<string, any> : {}
  return files.map(file => {
    const rel = relativeToLibrary(file.path, libraryFolder)
    const e = Object.prototype.hasOwnProperty.call(songs, rel) && songs[rel] && typeof songs[rel] === 'object' ? songs[rel] : {}
    const title = str(e.title) ?? fallbackTitle(file.name)
    const composers = strings(e.composers)
    const performer = str(e.performer)
    const people = composers.length ? composers : performer ? [performer] : []
    const genres: SongGenre[] = (Array.isArray(e.genres) ? e.genres : [])
      .map((g: any) => ({ name: str(g?.name), guessed: !!g?.guessed }))
      .filter((g: { name: string | null }): g is SongGenre => !!g.name)
    const parts = rel.split('/')
    return {
      path: file.path, title, people, genres,
      art: artSource(e.art?.url, libraryFolder),
      key: str(e.key), bpm: num(e.bpm), meter: str(e.meter), duration: num(e.duration),
      arrangement: str(e.arrangement), difficulty: num(e.difficulty), busyness: num(e.busyness), hands: str(e.hands),
      classic: e.classic === true, soloLine: e.arrangement === 'solo-line',
      folder: parts.length > 1 ? parts[0] : null,
      search: fold([title, file.name, ...people, ...(performer ? [performer] : []), ...genres.map(g => g.name)].join(' ')),
    }
  })
}

export function filterCards(cards: SongCard[], f: SongFilters): SongCard[] {
  const words = fold(f.query).split(/\s+/).filter(Boolean)
  return cards.filter(c =>
    (f.showSoloLines || !c.soloLine) &&
    (!f.classicOnly || c.classic) &&
    (!f.person || c.people.includes(f.person)) &&
    (!f.arrangement || c.arrangement === f.arrangement) &&
    (!f.difficulty || String(c.difficulty) === f.difficulty) &&
    (!f.key || c.key === f.key) &&
    (!f.hands || c.hands === f.hands) &&
    (!f.genre || c.genres.some(g => g.name === f.genre && (f.includeGuessed || !g.guessed))) &&
    words.every(w => c.search.includes(w)))
}

const collate = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true })

// Songs with nothing to sort on go last, whichever way the sort runs.
const byNumber = (a: number | null, b: number | null) => (a ?? Infinity) - (b ?? Infinity)

export function sortCards(cards: SongCard[], sort: SongSort): SongCard[] {
  const title = (a: SongCard, b: SongCard) => collate.compare(a.title, b.title)
  const cmp: Record<SongSort, (a: SongCard, b: SongCard) => number> = {
    title,
    person: (a, b) => (+!a.people.length - +!b.people.length) || collate.compare(a.people[0] ?? '', b.people[0] ?? '') || title(a, b),
    easiest: (a, b) => byNumber(a.difficulty, b.difficulty) || byNumber(a.busyness, b.busyness) || title(a, b),
    tempo: (a, b) => byNumber(a.bpm, b.bpm) || title(a, b),
    length: (a, b) => byNumber(a.duration, b.duration) || title(a, b),
  }
  return [...cards].sort(cmp[sort])
}

export interface Facet { value: string; count: number }

// Each list counts the songs the *other* filters leave, so a choice never
// offers an option that would empty the grid.
export function facets(cards: SongCard[], f: SongFilters) {
  const tally = (without: Partial<SongFilters>, pick: (c: SongCard) => (string | number | null)[]): Facet[] => {
    const counts = new Map<string, number>()
    for (const c of filterCards(cards, { ...f, ...without })) {
      for (const v of new Set(pick(c))) if (v !== null && v !== '') counts.set(String(v), (counts.get(String(v)) ?? 0) + 1)
    }
    return [...counts].map(([value, count]) => ({ value, count }))
  }
  const byCount = (a: Facet, b: Facet) => b.count - a.count || collate.compare(a.value, b.value)
  const byName = (a: Facet, b: Facet) => collate.compare(a.value, b.value)
  return {
    genres: tally({ genre: '' }, c => c.genres.filter(g => f.includeGuessed || !g.guessed).map(g => g.name)).sort(byCount),
    people: tally({ person: '' }, c => c.people).sort(byName),
    arrangements: tally({ arrangement: '' }, c => [c.arrangement]).sort(byCount),
    difficulties: tally({ difficulty: '' }, c => [c.difficulty]).sort(byName),
    keys: tally({ key: '' }, c => [c.key]).sort(byName),
    hands: tally({ hands: '' }, c => [c.hands]).sort(byCount),
  }
}

const GENRE_NAMES: Record<string, string> = {
  forro: 'Forró', baiao: 'Baião', mpb: 'MPB', 'jovem-guarda': 'Jovem Guarda', 'rock-brasileiro': 'Rock Brasileiro',
  marchinha: 'Marchinha', 'brazilian-popular': 'Brazilian Popular', 'bossa-nova': 'Bossa Nova', 'festa-junina': 'Festa Junina',
}

export function genreLabel(genre: string): string {
  return GENRE_NAMES[genre] ?? genre.replace(/-/g, ' ').replace(/^./, c => c.toUpperCase())
}

export function formatDuration(seconds: number | null): string | null {
  if (seconds === null) return null
  const s = Math.round(seconds)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// Same genre, same placeholder colour: the grid stays readable without art.
export function placeholderHue(label: string): number {
  let h = 0
  for (const ch of label) h = (h * 31 + ch.charCodeAt(0)) % 360
  return h
}
