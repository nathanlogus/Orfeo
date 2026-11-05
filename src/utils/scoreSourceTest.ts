import { findImportSource, isScoreFor, leftHandChannels, partsToShow, stavesToShow, staffHands, transposeKeySignature, withTextEvents } from './scoreSource'

export function runScoreSourceTest(): number {
  console.group('[scoreSource] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }
  check(transposeKeySignature(0, 2) === 2, 'up 2 from C is D')
  check(transposeKeySignature(0, 1) === -5, 'up 1 from C is Db')
  check(transposeKeySignature(0, -1) === 5, 'down 1 from C is B')
  check(transposeKeySignature(-3, 12) === -3, 'an octave keeps the key')
  const part = (primaryChannel: number) => ({ playbackInfo: { primaryChannel, secondaryChannel: primaryChannel + 1 } })
  const parts = [part(0), part(2)]
  check(partsToShow(parts, [{ channel: 0, visible: false }, { channel: 2, visible: true }])[0] === parts[1], 'hidden part is left out')
  check(partsToShow(parts, [{ channel: 1, visible: true }]).length === 1, 'secondary channel counts')
  check(partsToShow(parts, [{ channel: 0, visible: false }]).length === 2, 'nothing shown keeps every part')

  const staff = { isPercussion: false }
  const piano = { staves: [staff, staff], playbackInfo: { program: 0, primaryChannel: 0, secondaryChannel: 1 } }
  const flute = { staves: [staff], playbackInfo: { program: 73, primaryChannel: 2, secondaryChannel: 3 } }
  const harp = { staves: [staff, staff], playbackInfo: { program: 46, primaryChannel: 4, secondaryChannel: 5 } }
  const left = leftHandChannels([piano, flute, harp])
  check(left.get(piano)?.join() === '6,7', 'the left hand takes the first free channels')
  check(!left.has(flute) && !left.has(harp), 'only a keyboard on two staves is two hands')
  const crowded = [...Array(8).keys()].map(i => ({ staves: [staff, staff], playbackInfo: { program: 0, primaryChannel: i * 2, secondaryChannel: i * 2 + 1 } }))
  check(leftHandChannels(crowded).size === 0, 'no spare channels leaves the part whole')
  check(leftHandChannels([piano]).get(piano)?.join() === '2,3', 'channels never land on drums')
  check(staffHands(piano).join() === 'R,L', 'the top staff is the right hand')
  check(staffHands(flute).length === 0, 'a flute has no hands to mark')
  check(staffHands({ ...piano, staves: [staff] }).join() === 'R', 'one staff is fingered as the right hand')
  const hands = (r: boolean, l: boolean) => [{ channel: 0, visible: r }, { channel: 6, visible: l }]
  check(stavesToShow(piano, [6, 7], hands(true, false)).join() === 'true,false', 'hiding the left hand hides the bottom staff')
  check(stavesToShow(piano, [6, 7], hands(false, true)).join() === 'false,true', 'hiding the right hand hides the top staff')
  check(stavesToShow(piano, [6, 7], hands(false, false)).join() === 'true,true', 'both hidden keeps the part drawn')
  check(stavesToShow(piano, [6, 7], [{ channel: 0, visible: true }]).join() === 'true,true', 'an older import has no left hand track')
  const smf = new Uint8Array([...new TextEncoder().encode('MThd'), 0, 0, 0, 6, 0, 0, 0, 1, 1, 0xE0, ...new TextEncoder().encode('MTrk'), 0, 0, 0, 2, 0xAA, 0xBB])
  const tagged = withTextEvents(smf, ['AB'])
  check(new DataView(tagged.buffer).getUint32(18) === 8, 'the track length grows with the text')
  check([...tagged.subarray(22)].join() === '0,255,1,2,65,66,170,187', 'text goes first, the events follow')

  const source = { midiPaths: ['D:/Lib/Song.mxl', 'D:/Lib/Orfeo/Song_ORFEO_IMPORTED.mid'], bytes: new Uint8Array(1) }
  check(isScoreFor(source, 'D:/Lib/Song.mxl'), 'the source itself has its score')
  check(isScoreFor(source, 'D:/Lib/Orfeo/Song_ORFEO_IMPORTED.mid'), 'its saved copy keeps the score')
  check(!isScoreFor(source, 'D:/Lib/Other.mid'), 'another song never shows this score')
  check(!isScoreFor(source, undefined), 'a song with no path has no score')
  check(!isScoreFor(null, 'D:/Lib/Song.mxl'), 'no source, no score')

  const notation = (p: string) => /\.(mxl|gp5)$/.test(p)
  const files = [
    { name: 'Song.mid', path: 'D:/Lib/Song.mid' },
    { name: 'Song.mxl', path: 'D:/Lib/Song.mxl' },
    { name: 'Song 2.gp5', path: 'D:/Lib/Song 2.gp5' },
  ]
  check(findImportSource('D:\\Lib\\Orfeo\\Song_ORFEO_IMPORTED.mid', files, notation)?.path === 'D:/Lib/Song.mxl', 'copy finds its notation source, not a same-named MIDI')
  check(findImportSource('D:/Lib/Orfeo/Gone_ORFEO_IMPORTED.mid', files, notation) === null, 'source no longer in the library')
  check(findImportSource('D:/Lib/Song.mid', files, notation) === null, 'an ordinary MIDI is not a copy')

  console.log(`${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
