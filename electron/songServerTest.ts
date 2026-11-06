import { join } from 'path'
import { discoveredAddress, percentCounter, safeSongPath, serverUrl, songServerDest } from './songServer'

export function runSongServerTest(): number {
  let failures = 0
  const eq = (name: string, got: unknown, want: unknown) => {
    if (got !== want) { console.error(`FAIL ${name}: got ${got}, want ${want}`); failures++ }
  }

  eq('bare address', serverUrl(' 192.168.1.5 '), 'http://192.168.1.5:8765')
  eq('own port', serverUrl('192.168.1.5:9000/'), 'http://192.168.1.5:9000')
  eq('scheme kept', serverUrl('http://nas.local'), 'http://nas.local:8765')
  eq('https keeps its port', serverUrl('https://nas.example'), 'https://nas.example')

  for (const ok of ['a.mid', 'Bach/100% a.MID', 'x/y/z.gp5', "DizzyGillespie_Groovin'High_FINAL.mid"]) eq(ok, safeSongPath(ok), true)
  for (const bad of ['../a.mid', 'a/../../b.mid', '/a.mid', 'a//b.mid', 'a\\b.mid', 'C:/a.mid', 'a.exe', 'a.mid\0', '', 7, null]) eq(String(bad), safeSongPath(bad), false)

  eq('reply', discoveredAddress('pliage-songs:9000', '192.168.0.35'), '192.168.0.35:9000')
  for (const bad of ['pliage-songs:', 'pliage-songs:99999', 'hello', 'pliage-songs:1;rm']) eq(bad, discoveredAddress(bad, '1.2.3.4'), null)

  eq('kept folders', songServerDest('/lib', 'Jazz/Bill/a.mid'), join('/lib', 'Home Server', 'Jazz', 'Bill', 'a.mid'))

  const percents: number[] = []
  const count = percentCounter(1000, p => percents.push(p))
  for (const bytes of [1, 1, 498, 250, 250]) count(bytes)
  eq('each percent once', percents.join(), '0,50,75,100')
  const unknown: number[] = []
  const blind = percentCounter(0, p => unknown.push(p))
  blind(500)
  eq('no length, no percent', unknown.length, 0)
  return failures
}
