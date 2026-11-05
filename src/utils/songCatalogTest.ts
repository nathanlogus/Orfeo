import { NO_FILTERS, artSource, buildCards, facets, filterCards, formatDuration, genreLabel, relativeToLibrary, sortCards } from './songCatalog'

export function runSongCatalogTest(): number {
  console.group('[songCatalog] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }

  const lib = 'D:\\Music\\Orfeo MIDI'
  const f = (rel: string) => ({ name: rel.split('/').pop()!, path: `${lib}\\${rel.replace(/\//g, '\\')}` })
  const files = [
    f('Brazilian/Kauffmann/asa-branca.mid'), f('Brazilian/Kauffmann/carinhoso.mid'),
    f('Jazz/Weimar/solo.mid'), f('Jazz/McKenzie/Satin.mid'), f('Loose Song.mid'),
  ]
  const catalog = {
    songs: {
      'Brazilian/Kauffmann/asa-branca.mid': {
        title: 'Asa Branca', composers: ['Luiz Gonzaga', 'Humberto Teixeira'], key: 'C major', bpm: 86, duration: 163.3,
        arrangement: 'band', busyness: 5, genres: [{ name: 'forro', guessed: true }, { name: 'festa-junina', guessed: false }],
        art: { url: 'https://img.example/a.jpg' },
      },
      'Brazilian/Kauffmann/carinhoso.mid': {
        title: 'Carinhoso', composers: ['Pixinguinha'], key: 'F major', bpm: 220, arrangement: 'solo-piano',
        difficulty: 2, busyness: 2, classic: true, genres: [{ name: 'choro', guessed: true }], art: { url: '_art/c.jpg' },
      },
      'Jazz/Weimar/solo.mid': { title: 'Solo', performer: 'Art Pepper', arrangement: 'solo-line', genres: [{ name: 'jazz', guessed: false }] },
      'Jazz/McKenzie/Satin.mid': { title: 'Satin Doll', composers: ['Duke Ellington'], performer: 'Doug McKenzie', difficulty: 4, genres: [{ name: 'jazz', guessed: false }] },
    },
  }
  const cards = buildCards(files, lib, catalog)
  const titles = (l: { title: string }[]) => l.map(c => c.title).join('|')

  // joining files to the catalog
  check(cards[0].title === 'Asa Branca' && cards[0].folder === 'Brazilian', 'windows paths join catalog keys')
  check(cards[4].title === 'Loose Song' && cards[4].genres.length === 0 && cards[4].folder === null, 'unlisted file still gets a card')
  check(buildCards(files, lib, null).length === 5, 'no catalog: a card per file')
  check(buildCards(files, lib, 'nonsense')[0].title === 'asa-branca', 'garbage catalog is ignored')
  check(buildCards(files, lib, { songs: { 'Loose Song.mid': { title: 7, composers: 'x', genres: [{}], bpm: 'fast' } } })[4].title === 'Loose Song', 'bad field types are ignored')
  check(buildCards([{ name: 'constructor', path: `${lib}\\constructor` }], lib, { songs: {} })[0].title === 'constructor', 'inherited object keys are not entries')
  check(relativeToLibrary('D:/Music/Orfeo MIDI Extra/x.mid', 'D:/Music/Orfeo MIDI').startsWith('D:'), 'a sibling folder is not inside the library')

  // image sources
  check(artSource('https://a/b.jpg', lib) === 'https://a/b.jpg', 'https passes')
  check(artSource('_art/c.jpg', lib)!.startsWith('file:///D:/Music/Orfeo%20MIDI/_art/'), 'relative art resolves into the library')
  check(artSource('../../secret.jpg', lib) === null, 'no climbing out of the library')
  check(artSource('C:/Windows/x.jpg', lib) === null && artSource('file:///c:/x.jpg', lib) === null, 'no absolute paths')
  check(artSource('http://a/b.jpg', lib) === null && artSource('javascript:alert(1)', lib) === null, 'other schemes refused')
  check(artSource('a.jpg', null) === null && artSource(42, lib) === null, 'no library or no string: no image')

  // filtering
  check(titles(filterCards(cards, NO_FILTERS)).split('|').length === 4, 'single-line solos hidden by default')
  check(filterCards(cards, { ...NO_FILTERS, showSoloLines: true }).length === 5, 'solos can be shown')
  check(titles(filterCards(cards, { ...NO_FILTERS, query: 'GONZÁGA' })) === 'Asa Branca', 'search ignores case and accents')
  check(titles(filterCards(cards, { ...NO_FILTERS, query: 'teixeira branca' })) === 'Asa Branca', 'every word must match')
  check(titles(filterCards(cards, { ...NO_FILTERS, genre: 'forro' })) === 'Asa Branca', 'genre filter')
  check(filterCards(cards, { ...NO_FILTERS, genre: 'forro', includeGuessed: false }).length === 0, 'guessed genres can be excluded')
  check(titles(filterCards(cards, { ...NO_FILTERS, person: 'Pixinguinha' })) === 'Carinhoso', 'person filter')
  check(titles(filterCards(cards, { ...NO_FILTERS, classicOnly: true })) === 'Carinhoso', 'classic filter')
  check(titles(filterCards(cards, { ...NO_FILTERS, difficulty: '4' })) === 'Satin Doll', 'difficulty filter')
  check(titles(filterCards(cards, { ...NO_FILTERS, key: 'F major', arrangement: 'solo-piano' })) === 'Carinhoso', 'filters combine')

  // sorting leaves songs without the value at the end
  check(sortCards(cards, 'easiest')[0].title === 'Carinhoso', 'easiest first')
  check(sortCards(cards, 'tempo').map(c => c.bpm).slice(0, 2).join() === '86,220', 'tempo ascending')
  check(sortCards(cards, 'person').at(-1)!.title === 'Loose Song', 'no composer sorts last')
  check(cards[0].title === 'Asa Branca', 'sorting leaves the input alone')

  // facets ignore their own filter, so another genre stays reachable
  const fa = facets(cards, { ...NO_FILTERS, genre: 'forro' })
  check(fa.genres.some(g => g.value === 'jazz' && g.count === 1), 'a genre list ignores the chosen genre')
  check(fa.people.map(p => p.value).join() === 'Humberto Teixeira,Luiz Gonzaga', 'people narrow to the chosen genre')
  check(facets(cards, { ...NO_FILTERS, includeGuessed: false }).genres.every(g => g.value !== 'forro'), 'excluded guesses leave the genre list')

  check(formatDuration(163.3) === '2:43' && formatDuration(59.6) === '1:00' && formatDuration(null) === null, 'durations')

  check(genreLabel('forro') === 'Forró' && genreLabel('mpb') === 'MPB' && genreLabel('early-popular') === 'Early popular', 'genre names')

  console.log(`${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
