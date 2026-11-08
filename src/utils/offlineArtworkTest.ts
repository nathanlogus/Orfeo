import { offlineArtworkUrl } from './offlineArtwork'
export function runOfflineArtworkTest(): number {
  const original = 'http://192.168.0.35:8765/api/art?path=https%3A%2F%2Fi.scdn.co%2Fcover'
  const cases: [string | null | undefined, string | null][] = [
    [null, null], [undefined, null], ['https://i.scdn.co/cover', 'https://i.scdn.co/cover'],
    [original, original], [`/homeart?u=${encodeURIComponent(original)}`, original], ['/homeart?missing=url', null],
  ]
  const failures = cases.filter(([input, expected]) => offlineArtworkUrl(input) !== expected).length
  console.log(`offline artwork: ${cases.length - failures} passed, ${failures} failed`); return failures
}
