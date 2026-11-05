// ── Which tracks a song opens showing: the part you'd play on a piano ────────
// Piano if there is one, else organ and accordion, the closest match (General
// MIDI files them together). A piano that only joins long after the organ isn't
// the song's keyboard part: the roll would sit empty for over a minute in some
// songs. Anything else shows everything, so a song is never left blank. Hidden
// tracks still sound: this only decides what's on the roll.
const LATE_ENTRY_SEC = 20

interface TrackLike { group?: string; isDrum?: boolean; notes?: { time: number }[] }

const firstNote = (tracks: TrackLike[]) => Math.min(...tracks.map(t => t.notes?.[0]?.time ?? Infinity))

export function tracksShownByDefault<T extends TrackLike>(tracks: T[]): Set<T> {
  const playable = tracks.filter(t => !t.isDrum && (t.notes?.length ?? 0) > 0)
  const piano = playable.filter(t => t.group === 'piano')
  const organ = playable.filter(t => t.group === 'organ')
  if (piano.length && (!organ.length || firstNote(piano) - firstNote(organ) <= LATE_ENTRY_SEC)) return new Set(piano)
  return new Set(organ.length ? organ : tracks)
}
