import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const fold = value => String(value ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
export function matchingArtwork(data, title, artist) {
  const name = fold(title), person = fold(artist)
  if (!name || !person) return []
  const seen = new Set()
  return (data.tracks?.items ?? []).filter(t => {
    const image = t.album?.images?.[0]?.url
    if (!image?.startsWith('https://') || !fold(t.name).includes(name) || !t.artists?.some(a => fold(a.name) === person) || seen.has(image)) return false
    seen.add(image); return true
  }).slice(0, 5).map(t => ({ title: t.name, artist: t.artists.map(a => a.name).join(', '), album: t.album.name, url: t.album.images[0].url }))
}
let token = '', expires = 0, retryAt = 0
const cache = new Map()
export async function spotifyArtwork(title, artist) {
  if (!title?.trim() || !artist?.trim() || title.length > 240 || artist.length > 240) return []
  const key = `${fold(title)}|${fold(artist)}`
  if (cache.has(key)) return cache.get(key)
  if (Date.now() < retryAt) throw new Error('Spotify is busy. Please try again later.')
  if (Date.now() >= expires) {
    let keys
    try { keys = JSON.parse(readFileSync(process.env.PLIAGE_SPOTIFY_KEYS || join(homedir(), '.pliage-spotify.json'), 'utf8')) } catch { return [] }
    if (!keys.client_id || !keys.client_secret) return []
    const response = await fetch('https://accounts.spotify.com/api/token', { method: 'POST', headers: { Authorization: `Basic ${Buffer.from(`${keys.client_id}:${keys.client_secret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=client_credentials', signal: AbortSignal.timeout(15000) })
    if (!response.ok) throw new Error('Spotify authentication failed.')
    const result = await response.json(); token = result.access_token; expires = Date.now() + Math.max(60, result.expires_in - 60) * 1000
  }
  const query = new URLSearchParams({ q: `${title} ${artist}`, type: 'track', limit: '10' })
  const response = await fetch(`https://api.spotify.com/v1/search?${query}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) })
  if (response.status === 429) { retryAt = Date.now() + Math.max(1, Number(response.headers.get('retry-after')) || 30) * 1000; throw new Error('Spotify is busy. Please try again later.') }
  if (!response.ok) throw new Error('Spotify artwork search is unavailable.')
  const result = matchingArtwork(await response.json(), title, artist)
  if (cache.size >= 500) cache.delete(cache.keys().next().value)
  cache.set(key, result); return result
}
