#!/usr/bin/env node
// Serves a folder of songs to Orfeo on the home network, read-only:
//   node android/song-server.mjs <folder> [port]
//
// GET /api/songs?q=&genre=&artist=&offset=&limit=
//     { total, songs: [{ path, title, artist, genre, size }], genres, artists }
//     genres ignores the genre filter and artists the artist filter, so either can be changed.
// GET /api/file?path=<path from the list>
// GET /api/art?path=<art from the list>
// UDP port 8765: answers "orfeo-songs?" with "orfeo-songs:<port>", so the app can find this server
//
// Genre, artist and title come from Genre/Artist/Title.mid paths. A catalog.json in
// the folder fills in more (see src/utils/songCatalog.ts), and an optional
// metadata.json overrides anything, keyed by path:
//   { "Jazz/Doug McKenzie/afine-1.mid": { "title": "A Fine Romance", "artist": "Doug McKenzie", "genre": "Jazz" } }
import { createSocket } from 'node:dgram'
import { createServer } from 'node:http'
import { createReadStream, readFileSync, realpathSync, statSync, readdirSync } from 'node:fs'
import { networkInterfaces } from 'node:os'
import { extname, join, relative, resolve, sep } from 'node:path'

const SONG = /\.(mid|midi|kar|musicxml|xml|mxl|gp|gp3|gp4|gp5|gpx|cap)$/i
// Plain HTTP with no login, so strangers get nothing even through a forwarded port
const HOME = /^(::ffff:)?(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)|^::1$/
const IMAGE = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }
const SCAN_SECONDS = 15
const MAX_PAGE = 200
const DISCOVERY_PORT = 8765

const [folder, port = '8765'] = process.argv.slice(2)
if (!folder) { console.error('Usage: node android/song-server.mjs <folder> [port]'); process.exit(1) }
const root = realpathSync(resolve(folder))

function readJson(name) {
  try { return JSON.parse(readFileSync(join(root, name), 'utf8')) } catch (e) {
    if (e.code !== 'ENOENT') console.warn(`${name} ignored: ${e.message}`)
    return {}
  }
}

// A catalog entry in the list's terms. Only what it really has, so the rest stays
// what the path said.
function fromCatalog(e) {
  if (!e) return {}
  const people = e.composers?.length ? e.composers : e.performer ? [e.performer] : []
  const fields = {
    title: e.title, artist: people[0], genre: e.genres?.[0]?.name, people, genres: e.genres,
    key: e.key, bpm: e.bpm, meter: e.meter, duration: e.duration, arrangement: e.arrangement,
    difficulty: e.difficulty, busyness: e.busyness, classic: e.classic,
    art: e.art?.url && `/api/art?path=${encodeURIComponent(e.art.url)}`,
  }
  return Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined && v !== null))
}

// ArtPepper, JJJohnson, amor-e-sexo. A name with spaces already keeps its dashes.
const words = (s) => s.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
  .replace(/\s/.test(s) ? /_+/g : /[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
const capitalised = (s) => (s === s.toLowerCase() ? s.replace(/(^|\s)\p{L}/gu, c => c.toUpperCase()) : s)

function describe(path) {
  const parts = path.split('/')
  const stem = parts.at(-1).replace(/\.[^.]+$/, '')
  let artist = parts.length > 2 ? parts[1] : ''
  let title = stem
  // ArtPepper_Anthropology_FINAL.mid; Artist - Title.mid only with no artist folder,
  // since in one it's Title - duet.mid
  const named = /^([^_]+)_(.+)_FINAL$/i.exec(stem) ?? (artist ? null : /^(.+?)\s+-\s+(.+)$/.exec(stem))
  if (named) [artist, title] = [words(named[1]), named[2]]
  return { title: capitalised(words(title)), artist, genre: parts.length > 1 ? parts[0] : '' }
}

function scan(metadata, catalog, dir = root, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name)
    // Demo and Orfeo in a library root are the app's own folders
    if (e.name.startsWith('.') || (dir === root && /^(demo|orfeo)$/i.test(e.name))) continue
    if (e.isDirectory()) scan(metadata, catalog, full, out)
    else if (e.isFile() && SONG.test(e.name)) {
      const path = relative(root, full).split(sep).join('/')
      out.push({ path, size: statSync(full).size, ...describe(path), ...fromCatalog(catalog[path]), ...metadata[path] })
    }
  }
  return out
}

// The folder may be changing under us, and every search asks: rescan at most this often
let catalog = null
let scannedAt = 0
function songs() {
  if (!catalog || Date.now() - scannedAt > SCAN_SECONDS * 1000) {
    catalog = scan(readJson('metadata.json'), readJson('catalog.json').songs ?? {}).sort((a, b) => a.title.localeCompare(b.title))
    scannedAt = Date.now()
  }
  return catalog
}

const plain = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
const counts = (list, key) => [...list.reduce((m, s) => (s[key] ? m.set(s[key], (m.get(s[key]) ?? 0) + 1) : m), new Map())]
  .map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name))

function query(params) {
  const q = plain(params.get('q') ?? '').split(/\s+/).filter(Boolean)
  const genre = params.get('genre')
  const artist = params.get('artist')
  const found = songs().filter(s => {
    const text = plain(`${s.title} ${s.artist} ${s.genre} ${s.people?.join(' ') ?? ''} ${s.key ?? ''}`)
    return q.every(w => text.includes(w))
  })
  const inGenre = found.filter(s => !genre || s.genre === genre)
  const matching = inGenre.filter(s => !artist || s.artist === artist)
  const offset = Math.max(0, Number(params.get('offset')) || 0)
  const limit = Math.min(MAX_PAGE, Math.max(1, Number(params.get('limit')) || 100))
  return {
    total: matching.length,
    songs: matching.slice(offset, offset + limit),
    genres: counts(found.filter(s => !artist || s.artist === artist), 'genre'),
    artists: counts(inGenre, 'artist'),
  }
}

// realpath, so neither ../ nor a symlink can reach outside the folder
function find(rel, allowed) {
  try {
    const p = realpathSync(resolve(root, rel))
    return p.startsWith(root + sep) && allowed(p) && statSync(p).isFile() ? p : null
  } catch { return null }
}

const discovery = createSocket('udp4')
discovery.on('message', (msg, from) => {
  if (HOME.test(from.address) && msg.toString() === 'orfeo-songs?') discovery.send(`orfeo-songs:${port}`, from.port, from.address)
})
discovery.on('error', (e) => console.warn(`Apps can't find this server by themselves: ${e.message}`))
discovery.bind(DISCOVERY_PORT)

createServer((req, res) => {
  const url = new URL(req.url, 'http://x')
  if (!HOME.test(req.socket.remoteAddress ?? '')) { res.writeHead(403).end(); return }
  if (req.method === 'GET' && url.pathname === '/api/songs') {
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(query(url.searchParams)))
    return
  }
  const rel = url.searchParams.get('path') ?? ''
  const file = req.method === 'GET' && (
    url.pathname === '/api/file' ? find(rel, p => SONG.test(p))
      : url.pathname === '/api/art' ? find(rel, p => extname(p).toLowerCase() in IMAGE) : null)
  if (!file) { res.writeHead(404).end(); return }
  const type = IMAGE[extname(file).toLowerCase()]
  res.writeHead(200, { 'content-length': statSync(file).size, ...(type && url.pathname === '/api/art' ? { 'content-type': type } : {}) })
  createReadStream(file).on('error', () => res.destroy()).pipe(res)
}).listen(Number(port), () => {
  const ips = Object.values(networkInterfaces()).flat().filter(n => n.family === 'IPv4' && !n.internal).map(n => n.address)
  console.log(`Serving ${songs().length} songs from ${root}`)
  console.log(`In Orfeo, open Home server. If it isn't found, enter ${ips.map(ip => `${ip}:${port}`).join(' or ')}`)
})
