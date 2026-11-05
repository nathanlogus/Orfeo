// node android/songServerTest.mjs
import { strictEqual as eq, deepStrictEqual as same } from 'node:assert'
import { spawn } from 'node:child_process'
import { createSocket } from 'node:dgram'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = mkdtempSync(join(tmpdir(), 'orfeo-songs-'))
const lib = join(dir, 'lib')
const add = (path, body = 'x') => { mkdirSync(join(lib, path, '..'), { recursive: true }); writeFileSync(join(lib, path), body) }
add('Jazz/Doug McKenzie/AfterYou.mid', 'song')
add('Jazz/Weimar Solos/ArtPepper_Anthropology_FINAL.mid')
add('Brazilian/Beatriz Kauffmann/10-minutos-longe-de-voce.mid')
add('Brazilian/Beatriz Kauffmann/coração.mid')
add('Mozart - Rondo.mid')
add('Jazz/Doug McKenzie/Have You Met - duet.mid')
add('Jazz/Weimar Solos/JJJohnson_Blue_FINAL.mid')
add('Orfeo/edit.mid'); add('manifest.csv')
writeFileSync(join(dir, 'secret.mid'), 'x')
add('Jazz/Weimar Solos/Catalogued.mid')
mkdirSync(join(lib, '.art')); writeFileSync(join(lib, '.art', 'c.jpg'), 'jpeg'); writeFileSync(join(lib, '.art', 'c.txt'), 'x')
writeFileSync(join(lib, 'catalog.json'), JSON.stringify({ songs: { 'Jazz/Weimar Solos/Catalogued.mid': {
  title: 'Real Title', composers: ['Cole Porter'], performer: null, genres: [{ name: 'swing', guessed: true }],
  key: 'C major', bpm: null, difficulty: 3, art: { url: '.art/c.jpg' },
} } }))
writeFileSync(join(lib, 'metadata.json'), JSON.stringify({ 'Jazz/Doug McKenzie/AfterYou.mid': { title: 'After You, Who?' } }))

const server = spawn(process.execPath, [fileURLToPath(new URL('song-server.mjs', import.meta.url)), lib, '18765'])
await new Promise(r => server.stdout.once('data', r))
const get = (p) => fetch('http://127.0.0.1:18765' + p)
const list = async (query = '') => (await get('/api/songs?' + query)).json()
const file = (p) => get('/api/file?path=' + encodeURIComponent(p))
const titles = (r) => r.songs.map(s => s.title)
try {
  const all = await list()
  eq(all.total, 8)
  const c = all.songs.find(s => s.title === 'Real Title')
  same([c.artist, c.genre, c.key, c.difficulty, c.people], ['Cole Porter', 'swing', 'C major', 3, ['Cole Porter']])
  eq(c.bpm, undefined) // an empty catalog field leaves nothing behind
  eq(await (await get(c.art)).text(), 'jpeg')
  eq((await get(c.art)).headers.get('content-type'), 'image/jpeg')
  eq((await get('/api/art?path=' + encodeURIComponent('.art/c.txt'))).status, 404)
  eq((await get('/api/art?path=' + encodeURIComponent('../secret.mid'))).status, 404)
  same(titles(await list('q=cole')), ['Real Title'])
  same(all.genres, [{ name: 'Brazilian', count: 2 }, { name: 'Jazz', count: 4 }, { name: 'swing', count: 1 }])
  same(all.songs.find(s => s.title === 'Anthropology').artist, 'Art Pepper')
  same(all.songs.find(s => s.title === 'Rondo').artist, 'Mozart')
  same(all.songs.find(s => s.title === 'Have You Met - duet').artist, 'Doug McKenzie') // the folder names the artist
  same(all.songs.find(s => s.title === 'Blue').artist, 'JJ Johnson')
  same(all.songs.find(s => s.artist === 'Mozart').genre, '')
  same(all.songs.find(s => s.path.includes('longe')).title, '10 Minutos Longe De Voce')
  same(all.songs.find(s => s.path.includes('AfterYou')).title, 'After You, Who?') // metadata.json wins

  same(titles(await list('genre=Jazz')), ['After You, Who?', 'Anthropology', 'Blue', 'Have You Met - duet'])
  same(titles(await list('artist=Art%20Pepper')), ['Anthropology'])
  same(titles(await list('q=coracao')), ['Coração']) // accents don't matter when searching
  same(titles(await list('q=pepper%20anthro')), ['Anthropology'])
  same((await list('genre=Jazz')).artists.map(a => a.name), ['Art Pepper', 'Doug McKenzie', 'JJ Johnson'])
  // Choosing an artist still offers every genre that artist is in, and the other way round
  eq((await list('genre=Jazz')).genres.length, 3)
  same((await list('artist=Art%20Pepper')).genres, [{ name: 'Jazz', count: 1 }])

  const page = await list('limit=2&offset=1')
  eq(page.songs.length, 2); eq(page.total, 8)
  eq((await list('limit=99999')).songs.length, 8)
  eq((await list('limit=nonsense&offset=-4')).songs.length, 8)

  eq(await (await file('Jazz/Doug McKenzie/AfterYou.mid')).text(), 'song')
  eq((await file('../secret.mid')).status, 404)
  eq((await file(join(dir, 'secret.mid'))).status, 404)
  eq((await file('manifest.csv')).status, 404)
  eq((await get('/songs')).status, 404)

  // Skipped when a real server already holds the port: it would answer with its own
  const reply = await new Promise((resolve) => {
    const s = createSocket('udp4')
    const done = (v) => { clearTimeout(timer); s.close(); resolve(v) }
    const timer = setTimeout(() => done('no answer'), 1500)
    s.on('message', (m) => done(m.toString()))
    s.send('orfeo-songs?', 8765, '127.0.0.1')
  })
  if (reply !== 'orfeo-songs:8765') eq(reply, 'orfeo-songs:18765')
  console.log('ok')
} finally { server.kill() }
