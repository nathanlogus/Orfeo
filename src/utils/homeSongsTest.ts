import { deviceSongs, folderCounts, matchesSearch, songCard } from './homeSongs'

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
  eq('counts', folderCounts(songs), [{ name: 'Classical', count: 1 }, { name: 'Jazz', count: 1 }])

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
