import { deviceSongs, filterSongs, matchesSearch, songCard, songFacets, sortSongs, type SongFilters } from './homeSongs'

export function runHomeSongsTest(): number {
  let failures = 0
  const eq = (name: string, got: unknown, want: unknown) => {
    const a = JSON.stringify(got), b = JSON.stringify(want)
    if (a !== b) { console.error(`FAIL ${name}: got ${a}, want ${b}`); failures++ }
  }

  const songs = deviceSongs([
    { name: 'Rondo.mid', path: 'C:\\Music\\Classical\\Mozart\\Rondo.mid' },
    { name: 'Alone.mid', path: 'C:/Music/Alone.mid' },
    { name: 'Blue.mid', path: 'C:\\Music\\Jazz\\Blue.mid' },
    { name: 'Demo.mid', path: '/app/Demo/Demo.mid' },
  ], 'C:\\Music\\')
  eq('sorted by title', songs.map(s => s.title), ['Alone', 'Blue', 'Demo', 'Rondo'])
  eq('folders', songs.map(s => [s.genre, s.artist]), [['', ''], ['Jazz', ''], ['', ''], ['Classical', 'Mozart']])
  eq('path is untouched', songs[3].path, 'C:\\Music\\Classical\\Mozart\\Rondo.mid')
  eq('no library', deviceSongs([{ name: 'A.mid', path: '/x/A.mid' }], null)[0].genre, '')
  const none: SongFilters = { q: '', genre: '', artist: '', arrangement: '', difficulty: '', key: '', hands: '', classic: false }
  eq('folders are the genres', songFacets(songs, none).genres, [{ name: 'Classical', count: 1 }, { name: 'Jazz', count: 1 }])

  const lib = [{ name: 'a.mid', path: 'C:/M/Jazz/a.mid' }, { name: 'b.mid', path: 'C:/M/Jazz/b.mid' }, { name: 'c.mid', path: 'C:/M/Pop/c.mid' }]
  const catalog = { songs: {
    'Jazz/a.mid': { title: 'Blue Moon', composers: ['Rodgers', 'Hart'], genres: [{ name: 'swing', guessed: false }], key: 'C major', bpm: 90, difficulty: 3, arrangement: 'band', duration: 200, classic: true },
    'Jazz/b.mid': { title: 'Autumn', composers: [], performer: 'Bill', genres: [], key: 'A minor', bpm: 60, difficulty: 1, arrangement: 'solo-piano', duration: 100 },
  } }
  const library = deviceSongs(lib, 'C:/M', catalog)
  const titles = (l: typeof library) => l.map(s => s.title)
  eq('sorted, with catalog titles and people', library.map(s => [s.title, s.artist, s.genre]), [['Autumn', 'Bill', 'Jazz'], ['Blue Moon', 'Rodgers', 'swing'], ['c', '', 'Pop']])
  eq('by difficulty', titles(filterSongs(library, { ...none, difficulty: '1' })), ['Autumn'])
  eq('by key', titles(filterSongs(library, { ...none, key: 'C major' })), ['Blue Moon'])
  eq('by any composer', titles(filterSongs(library, { ...none, artist: 'Hart' })), ['Blue Moon'])
  eq('by arrangement', titles(filterSongs(library, { ...none, arrangement: 'solo-piano' })), ['Autumn'])
  eq('classics', titles(filterSongs(library, { ...none, classic: true })), ['Blue Moon'])
  eq('search reaches composers', titles(filterSongs(library, { ...none, q: 'hart' })), ['Blue Moon'])
  eq('filters add up', titles(filterSongs(library, { ...none, key: 'C major', difficulty: '1' })), [])
  const narrowed = songFacets(library, { ...none, key: 'C major' })
  eq('a list leaves out its own filter', narrowed.keys.map(k => k.name), ['A minor', 'C major'])
  eq('and respects the others', narrowed.arrangements, [{ name: 'band', count: 1 }])
  eq('classic count', narrowed.classics, 1)
  eq('easiest, missing last', titles(sortSongs(library, 'easiest')), ['Autumn', 'Blue Moon', 'c'])
  eq('tempo', titles(sortSongs(library, 'tempo')), ['Autumn', 'Blue Moon', 'c'])
  eq('length', titles(sortSongs(library, 'length')), ['Autumn', 'Blue Moon', 'c'])
  eq('title keeps the order', sortSongs(library, 'title'), library)

  const bare = songCard({ path: 'a.mid', title: 'A', artist: 'Bill', genre: 'Jazz', size: 1, local: false })
  eq('card from a plain song', [bare.people, bare.genres, bare.art, bare.key], [['Bill'], [{ name: 'Jazz', guessed: false }], null, null])
  const rich = songCard({ path: 'b.mid', title: 'B', artist: 'Bill', genre: 'swing', size: 1, local: true, people: ['Cole Porter'], genres: [{ name: 'swing', guessed: true }], bpm: 90, art: 'http://x/a.jpg' })
  eq('card from the catalog', [rich.people, rich.genres[0].guessed, rich.bpm, rich.art], [['Cole Porter'], true, 90, 'http://x/a.jpg'])

  eq('all words', matchesSearch('Rondo Mozart', 'mozart ron'), true)
  eq('accents', matchesSearch('Coração', 'coracao'), true)
  eq('miss', matchesSearch('Rondo', 'jazz'), false)
  eq('empty search', matchesSearch('Rondo', '  '), true)
  return failures
}
