import assert from 'node:assert/strict'
import { matchingArtwork } from './spotify-artwork.mjs'
const track = (name, artist, image = 'https://i.scdn.co/image/cover') => ({ name, artists: [{ name: artist }], album: { name: 'Album', images: [{ url: image }] } })
assert.deepEqual(matchingArtwork({ tracks: { items: [track('Golden Hour', 'Someone Else')] } }, 'Golden Hour', 'JVKE'), [])
assert.deepEqual(matchingArtwork({ tracks: { items: [track('Another Song', 'JVKE')] } }, 'Golden Hour', 'JVKE'), [])
assert.equal(matchingArtwork({ tracks: { items: [track('Lança Perfume', 'Rita Lee')] } }, 'Lanca Perfume', 'Rita Lee').length, 1)
assert.equal(matchingArtwork({ tracks: { items: [track('Golden Hour', 'JVKE'), track('Golden Hour', 'JVKE')] } }, 'Golden Hour', 'JVKE').length, 1)
assert.deepEqual(matchingArtwork({ tracks: { items: [track('Golden Hour', 'JVKE', 'file:///private')] } }, 'Golden Hour', 'JVKE'), [])
assert.deepEqual(matchingArtwork({}, '', 'JVKE'), [])
console.log('Spotify artwork: 6 checks passed')
