import { menuTap, songsInProgress, weakestPhrase } from './homeMenu'

export function runHomeMenuTest(): number {
  let failures = 0
  const eq = (name: string, got: unknown, want: unknown) => {
    const a = JSON.stringify(got), b = JSON.stringify(want)
    if (a !== b) { console.error(`FAIL ${name}: got ${a}, want ${b}`); failures++ }
  }
  const phrase = (best: number) => ({ level: 1, wins: 0, best })

  eq('no progress, no phrase', weakestPhrase(undefined), null)
  eq('lowest best wins', weakestPhrase([phrase(0.8), phrase(0.3), phrase(0.5)]), 1)
  eq('the first of a tie', weakestPhrase([phrase(0.3), phrase(0.3)]), 0)
  eq('unplayed phrases are skipped', weakestPhrase([phrase(0), phrase(0.4)]), 1)
  eq('a learned phrase needs no fixing', weakestPhrase([phrase(0.9), phrase(1)]), null)
  eq('a gap in saved phrases', weakestPhrase([null as never, phrase(0.4)]), 1)

  const mastery: Record<string, number> = { a: 40, b: 100, c: 0, d: 80, e: 10 }
  const songs = ['a', 'b', 'c', 'd', 'e'].map(path => ({ path }))
  eq('best first, without learned or unstarted', songsInProgress(songs, p => mastery[p], 2).map(s => s.path), ['d', 'a'])
  eq('leaves the list alone', songs[0].path, 'a')

  // Every action a run of held-key changes ends up with
  const play = (...steps: number[][]) => {
    const actions: unknown[] = []
    let alone: number | null = null, before = new Set<number>()
    for (const step of steps) {
      const held = new Set(step), tap = menuTap(alone, held, before)
      alone = tap.alone
      before = held
      if (tap.action) actions.push(tap.action)
    }
    return actions
  }
  eq('C moves up', play([60], []), ['up'])
  eq('D moves down', play([62], []), ['down'])
  eq('E selects', play([64], []), ['select'])
  eq('nothing until the key lifts', play([60]), [])
  eq('other keys do nothing', play([61], []), [])
  eq('a chord does nothing, first note included', play([64], [60, 64], [60, 64, 67], [60, 67], [60], []), [])
  eq('nor legato from key to key', play([60], [60, 62], [62], []), [])
  eq('a key already held when another lifts', play([60, 62], [62], []), [])
  eq('tap after tap', play([62], [], [62], [], [64], []), ['down', 'down', 'select'])
  return failures
}
