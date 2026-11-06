import { tagHistory, versionLabel } from './fileHistory'
import { HAND_PRESETS, DEFAULT_HAND_LH, DEFAULT_HAND_RH, isOwnPair } from './handPalette'

export function runFileHistoryTest(): number {
  let fail = 0
  const check = (c: boolean, m: string) => { if (!c) { fail++; console.error('FAIL:', m) } }
  const ev = (timestamp: number, summary: string) => ({ type: 'edit', timestamp, summary })
  const a = ev(1, 'Dropped drums'), b = ev(2, 'Split piano'), c = ev(3, 'Tempo')

  // each entry goes to the lowest version holding it, whatever order the chain arrives in
  const tags = tagHistory([a, b, c], [{ version: 2, log: [a, b, c] }, { version: 0, log: [] }, { version: 1, log: [a, b] }])
  check(tags.map(e => e.version).join() === '1,1,2', `versions ${tags.map(e => e.version)}`)
  check(tags.map(e => e.summary).join() === 'Dropped drums,Split piano,Tempo', 'keeps the log order')

  // same words at another time are another entry; an entry no chain file holds has no tag
  const again = ev(9, 'Tempo')
  const lone = tagHistory([c, again], [{ version: 1, log: [c] }])
  check(lone[0].version === 1 && lone[1].version === null, 'identity is time + type + words')
  check(tagHistory([], []).length === 0, 'no history')

  check(versionLabel(0) === 'Original' && versionLabel(3) === 'v3', 'labels')

  // Scrapbook is a ready-made pair; the default stays Pliage's and is a preset too
  const scrapbook = HAND_PRESETS.find(p => p.id === 'scrapbook')
  check(scrapbook?.lh === '#6483FF' && scrapbook.rh === '#FFDE3B', 'Scrapbook pair')
  check(DEFAULT_HAND_LH === '#6270A5' && DEFAULT_HAND_RH === '#CB636C', 'default hand colours unchanged')
  check(!isOwnPair('#6483ff', '#ffde3b') && !isOwnPair(DEFAULT_HAND_LH, DEFAULT_HAND_RH), 'presets are not your own, in any case')
  check(isOwnPair('#000000', '#ee84d5') && isOwnPair(DEFAULT_HAND_RH, DEFAULT_HAND_LH), 'other pairs are, swapped hands included')

  console.log(`file history: ${fail} failed`)
  return fail
}
