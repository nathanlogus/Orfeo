import { Midi } from '@tonejs/midi'
import { isOutputFolder, legacyImportPath, migrateLocalStorage, upgradeMarkers } from './legacyNames'
import { nextPliageBaseName, nextPliageVersion, stripPliageSuffix } from './pliageVersioning'
import { buildRenamedFileName } from './midiMetadata'
import { findImportSource } from './scoreSource'
import { parseMidiBuffer } from './midiParser'

export function runLegacyNamesTest(): number {
  console.group('[legacyNames] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }

  // A file saved by an older version, markers as they are on disk
  const old = new Midi()
  old.addTrack().addNote({ midi: 60, ticks: 0, durationTicks: 480 })
  old.addTrack().addNote({ midi: 40, ticks: 0, durationTicks: 480 })
  const texts = ['ORFEO_TRACK_NAME:0:Lead', 'ORFEO_TRACK_COLOR:0:#ff0000', 'ORFEO_TRACK_VISIBLE:1:0', 'ORFEO_KEY:7:minor']
  ;(old.header as any).meta.push(...texts.map(text => ({ type: 'text', text, ticks: 0 })))
  const bytes = old.toArray()
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer

  const parsed = parseMidiBuffer(buffer, 'Song_ORFEO_v2.mid') as any
  check(parsed._pliageTrackNames?.[0] === 'Lead', 'old track name marker still reads')
  check(parsed._pliageTrackColors?.[0] === '#ff0000', 'old track colour marker still reads')
  check(parsed._pliageTrackVisible?.[1] === false, 'old visibility marker still reads')

  // A save after reading writes only the new word
  const resaved = upgradeMarkers(new Midi(buffer))
  const meta = (resaved.header as any).meta as { text: string }[]
  check(meta.length === texts.length, 'no marker lost')
  check(meta.every(m => m.text.startsWith('PLIAGE_')), 'every marker carries the new word after reading')
  check(meta.some(m => m.text === 'PLIAGE_TRACK_NAME:0:Lead'), 'the value after the prefix is untouched')
  const again = new Midi(resaved.toArray())
  check((again.header as any).meta.every((m: any) => m.text.startsWith('PLIAGE_')), 'a rewritten file holds no old marker')
  const song = new Midi()
  ;(song.header as any).meta.push({ type: 'text', text: 'ORFEO is a song title', ticks: 0 })
  check((upgradeMarkers(song).header as any).meta[0].text === 'ORFEO is a song title', 'plain text that is no marker stays')

  // File names
  check(stripPliageSuffix('Song_ORFEO_v3') === 'Song', 'old _vN suffix strips')
  check(stripPliageSuffix('Song_ORFEO_IMPORTED') === 'Song', 'old _IMPORTED suffix strips')
  check(stripPliageSuffix('Song_ORFEO_MERGED') === 'Song', 'old _MERGED suffix strips')
  check(stripPliageSuffix('Song_PLIAGE_v3') === 'Song', 'new suffix strips')
  check(stripPliageSuffix('Orfeo') === 'Orfeo', 'a song called Orfeo keeps its name')
  check(nextPliageVersion('Song_ORFEO_v3') === 4, 'numbering carries on from an old file')
  check(nextPliageBaseName('Song_ORFEO_v3') === 'Song_PLIAGE_v4', 'next save from an old file uses the new word')
  check(buildRenamedFileName('A_ORFEO_v2.mid', 'Abba', 'Fernando') === 'Abba - Fernando_ORFEO_v2.mid', 'renaming keeps an old suffix on an old file')

  // Folders
  check(isOutputFolder('Pliage') && isOutputFolder('orfeo') && isOutputFolder('ORFEO'), 'output folder under either name')
  check(!isOutputFolder('Orfeo Songs'), 'other folders are not')

  // The converted copy of a notation file
  const cache = 'D:/Lib/Pliage/Song_PLIAGE_IMPORTED.mid'
  check(legacyImportPath(cache) === 'D:/Lib/Orfeo/Song_ORFEO_IMPORTED.mid', 'old copy found in the old folder')
  check(legacyImportPath('D:/Pliage/Lib/Song_PLIAGE_IMPORTED.mid') === 'D:/Pliage/Lib/Song_ORFEO_IMPORTED.mid', 'only the last folder is swapped')
  const notation = { name: 'Song.gp', path: 'D:/Lib/Song.gp' }
  check(findImportSource('D:/Lib/Orfeo/Song_ORFEO_IMPORTED.mid', [notation], () => true) === notation, 'old copy still leads to its source')

  // localStorage
  const store = new Map([['orfeo-dev-tools', '1']])
  const ls = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) }
  migrateLocalStorage(ls)
  check(store.get('pliage-dev-tools') === '1' && !store.has('orfeo-dev-tools'), 'old key moves to the new one')
  store.set('orfeo-dev-tools', '0')
  migrateLocalStorage(ls)
  check(store.get('pliage-dev-tools') === '1', 'a key already set under the new name wins')

  console.log(`${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
