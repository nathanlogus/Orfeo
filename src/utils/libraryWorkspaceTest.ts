import { cleanSongEdit, editSong, isNewSong, librarySongKey, moveSetEntry, normalizeWorkspace } from './libraryWorkspace'
import { filterSongs, sortSongs } from './homeSongs'
import type { SongServerSong } from '../types'

export function runLibraryWorkspaceTest(): number {
  let failed = 0, checks = 0
  const check = (ok: boolean, name: string) => { checks++; if (!ok) { failed++; console.error('FAIL:', name) } }
  const song: SongServerSong = { path: 'Brazilian/a.mid', title: 'Old', artist: 'Old artist', genre: 'mpb', size: 10, local: false, addedAt: 100, art: 'https://example.com/cover.jpg' }
  const edited = editSong(song, cleanSongEdit({ title: ' New title ', artist: ' New artist ', genre: ' Bossa Nova ' }))
  check(edited.title === 'New title' && edited.genre === 'bossa-nova', 'metadata is cleaned for display and filters')
  check(edited.art === song.art && song.title === 'Old', 'editing text preserves cover and original metadata')
  check(editSong(song, { title: 'x', artist: '', genre: '', art: null }).art === null, 'an explicit cleared cover stays cleared')
  let rejected = false; try { cleanSongEdit({ title: '', artist: '', genre: '' }) } catch { rejected = true }; check(rejected, 'empty titles rejected')
  rejected = false; try { cleanSongEdit({ title: 'x', artist: '', genre: '', art: 'file:///private' }) } catch { rejected = true }; check(rejected, 'arbitrary local artwork rejected')
  const filters = { q: 'new artist', genre: 'brazilian', artist: '', arrangement: '', difficulty: '', key: '', hands: '', classic: false }
  check(filterSongs([edited], filters).length === 1, 'edits participate in search and Brazilian parent filter')
  check(filterSongs([edited], { ...filters, genre: 'soul' }).length === 0, 'genre families do not absorb unrelated genres')
  check(sortSongs([song, { ...song, title: 'Latest', addedAt: 200 }], 'recent')[0].title === 'Latest', 'recent ordering uses dates')
  check(isNewSong(100, 101) && !isNewSong(100, 100 + 8 * 86400000) && !isNewSong(200, 100), 'new badges have bounded dates')
  check(librarySongKey('a\\b.mid', 'server/') === librarySongKey('a/b.mid', 'server'), 'keys are stable across path separators')
  const entries = ['a', 'b', 'c']; check(moveSetEntry(entries, 0, 2).join('') === 'bca' && entries.join('') === 'abc', 'set ordering does not mutate source')
  check(moveSetEntry(entries, 0, 9) === entries, 'out of range moves are harmless')
  const restored = normalizeWorkspace({ edits: { a: { title: 'Kept', artist: 'A', genre: 'jazz' }, b: null }, sets: [{ id: 'set', name: 'Week', songs: [{ id: 'entry', song, server: 'home' }, null] }], offline: { a: { song, server: 'home', remotePath: song.path, downloadedAt: 200 } } })
  check(restored.edits.a.title === 'Kept' && !restored.edits.b, 'one malformed edit does not break restoration')
  check(restored.sets[0].songs.length === 1 && restored.sets[0].songs[0].practice.tempo === 100, 'sets regain missing practice defaults')
  check(restored.offline.a.song.title === 'Old' && normalizeWorkspace(null).sets.length === 0, 'offline metadata and absent preferences restore')
  console.log(`library workspace: ${checks - failed} passed, ${failed} failed`); return failed
}
