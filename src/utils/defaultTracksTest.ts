import { tracksShownByDefault } from './defaultTracks'

export function runDefaultTracksTest(): number {
  let failures = 0
  const eq = (name: string, got: unknown, want: unknown) => {
    const a = JSON.stringify(got), b = JSON.stringify(want)
    if (a !== b) { console.error(`FAIL ${name}: got ${a}, want ${b}`); failures++ }
  }
  const track = (name: string, group: string, first: number | null = 1, isDrum = false) => ({ name, group, isDrum, notes: first === null ? [] : [{ time: first }] })
  const shown = (tracks: ReturnType<typeof track>[]) => tracks.filter(t => tracksShownByDefault(tracks).has(t)).map(t => t.name)

  const piano = track('Piano', 'piano'), piano2 = track('Electric', 'piano')
  const organ = track('Organ', 'organ'), accordion = track('Accordion', 'organ')
  const guitar = track('Guitar', 'guitar'), drums = track('Drums', 'drums', 1, true)

  eq('piano only', shown([guitar, piano, organ, drums]), ['Piano'])
  eq('every piano track', shown([piano, guitar, piano2]), ['Piano', 'Electric'])
  eq('organ and accordion when no piano', shown([guitar, organ, accordion, drums]), ['Organ', 'Accordion'])
  eq('neither: everything', shown([guitar, drums]), ['Guitar', 'Drums'])
  eq('an empty piano track does not count', shown([track('Empty', 'piano', null), organ]), ['Organ'])
  eq('no tracks', shown([]), [])

  // nosso-xote: accordion from 3s, piano from 87s
  eq('a piano that joins late gives way', shown([track('Accordion', 'organ', 3), track('Piano', 'piano', 87)]), ['Accordion'])
  // vamo-embolando: accordion from 3s, piano from 18s
  eq('a piano soon after the accordion stays', shown([track('Accordion', 'organ', 3), track('Piano', 'piano', 18)]), ['Piano'])
  eq('a late piano with no organ is still the piano', shown([guitar, track('Piano', 'piano', 87)]), ['Piano'])
  return failures
}
