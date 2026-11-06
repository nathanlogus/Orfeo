// ── Progressions: the Explorers' twenty, plus blues forms and sets from MIT sources ──
import { PROGRESSIONS } from '../../utils/explorerShared'
import type { Difficulty, Genre, ProgressionItem } from './types'

const FORM = { source: 'Traditional form', license: 'Public domain' }
const SUNDAY = { source: 'SundayLicks', license: 'MIT' }
const SHLD = { source: 'free-midi-chords', license: 'MIT' }
const OWN = { source: 'Pliage', license: 'GPL-3.0' }

const EXPLORER_TAGS: Record<string, [Genre, string, Difficulty, boolean?]> = {
  'Pop': ['pop', 'four-chord loop', 1],
  'Pop/Rock Inv.': ['pop', 'four-chord loop', 1],
  'Energetic Pop': ['pop', 'four-chord loop', 1],
  'Minor Pop': ['pop', 'minor loop', 1, true],
  'Doo-Wop': ['pop', 'four-chord loop', 1],
  'Rock · Blues': ['rock', 'three-chord loop', 1],
  'Mixolydian Rock': ['rock', 'borrowed chord', 2],
  'Grunge · Modal': ['rock', 'borrowed chord', 2],
  'Minor Blues': ['blues', 'minor loop', 1, true],
  'Jazz Standard': ['jazz', 'ii-V-I', 1],
  'Minor Jazz': ['jazz', 'ii-V-i', 2, true],
  'Andalusian': ['rock', 'descending loop', 2, true],
  'Pachelbel': ['pop', 'descending loop', 2],
  'Circle of Fifths': ['jazz', 'circle of fifths', 2],
  'Royal Road': ['pop', 'four-chord loop', 2],
  'Epic · Heroic': ['rock', 'minor loop', 1, true],
  'Sentimental': ['pop', 'four-chord loop', 1],
  'Sad · Hopeful': ['pop', 'four-chord loop', 1],
  'Plagal Turnaround': ['blues', 'turnaround', 1],
  'Step-Down': ['rock', 'descending loop', 2],
}

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-')

const explorer: ProgressionItem[] = PROGRESSIONS.map(p => {
  const [genre, concept, difficulty, minor] = EXPLORER_TAGS[p.name]
  return { id: `xp-${slug(p.name)}`, kind: 'progression', name: p.name, genre, concept, difficulty, key: 'C', numerals: p.labels, ...(minor && { minor }), source: 'Pliage Explorers', license: 'GPL-3.0' }
})

const item = (id: string, name: string, genre: Genre, concept: string, difficulty: Difficulty, numerals: string, credit: { source: string; license: string }, minor?: true): ProgressionItem =>
  ({ id, kind: 'progression', name, genre, concept, difficulty, key: 'C', numerals: numerals.split(' '), ...(minor && { minor }), ...credit })

const added: ProgressionItem[] = [
  // Blues
  item('bl-12-triads', '12-bar blues', 'blues', '12-bar blues', 1, 'I I I I IV IV I I V IV I V', FORM),
  item('bl-12-sevenths', '12-bar blues in sevenths', 'blues', 'dominant sevenths', 2, 'I7 I7 I7 I7 IV7 IV7 I7 I7 V7 IV7 I7 V7', FORM),
  item('bl-quick-four', 'Quick-change blues', 'blues', 'dominant sevenths', 2, 'I7 IV7 I7 I7 IV7 IV7 I7 I7 V7 IV7 I7 V7', FORM),
  item('bl-minor-12', 'Minor blues', 'blues', 'minor sevenths', 3, 'i7 i7 i7 i7 iv7 iv7 i7 i7 VI7 V7 i7 V7', FORM, true),
  item('bl-shuffle', 'Blues shuffle', 'blues', 'dominant sevenths', 2, 'I7 IV7 I7 V7', SUNDAY),
  // Jazz
  item('jz-251', 'Major ii-V-I', 'jazz', 'seventh chords', 2, 'ii7 V7 Imaj7', SUNDAY),
  item('jz-251-minor', 'Minor ii-V-i', 'jazz', 'half-diminished', 3, 'iiø7 V7 i7', SUNDAY, true),
  item('jz-1625', 'Jazz turnaround', 'jazz', 'turnaround', 3, 'Imaj7 VI7 ii7 V7', SUNDAY),
  item('jz-walking', 'ii-V-I with a VI', 'jazz', 'seventh chords', 2, 'ii7 V7 Imaj7 VI7', SUNDAY),
  item('jz-blues', 'Jazz blues opening', 'jazz', 'seventh chords', 3, 'I7 IV7 I7 v7 I7', SUNDAY),
  item('jz-ii-iii', 'Rising ii-V', 'jazz', 'seventh chords', 2, 'ii7 V7 iii7 vi7 ii7 V7', SHLD),
  // Pop
  item('pp-hopeful', 'Hopeful loop', 'pop', 'four-chord loop', 1, 'I V vi ii', SHLD),
  item('pp-tender', 'Tender loop', 'pop', 'four-chord loop', 1, 'I vi ii IV', SHLD),
  item('pp-nostalgic', 'Nostalgic loop', 'pop', 'four-chord loop', 1, 'I vi ii V', SHLD),
  item('pp-romantic', 'Romantic loop', 'pop', 'four-chord loop', 1, 'IV I V vi', SHLD),
  item('pp-rising', 'Rising loop', 'pop', 'four-chord loop', 1, 'I iii IV vi', SHLD),
  // Rock
  item('rk-joyful', 'Bright rock turn', 'rock', 'three-chord loop', 1, 'I IV V IV', SHLD),
  item('rk-sad', 'Rebel loop', 'rock', 'minor loop', 1, 'i VI VII v', SHLD, true),
  item('rk-mixo', 'Borrowed seventh', 'rock', 'borrowed chord', 2, 'I bVII IV V', SHLD),
  item('rk-modal', 'Borrowed third', 'rock', 'borrowed chord', 2, 'I bIII bVII IV', SHLD),
  item('rk-stair', 'Borrowed stairs', 'rock', 'borrowed chord', 2, 'I bIII bVI bVII', SHLD),
  // Inversions: the same loops, arranged so the bass walks
  item('in-walk-down', 'Bass walks down', 'pop', 'inversions', 3, 'I V^1 vi I^2 IV', OWN),
  item('in-climb', 'Bass climbs', 'pop', 'inversions', 3, 'I I^1 IV V', OWN),
  item('in-rock', 'Stay on the root', 'rock', 'inversions', 3, 'I IV^2 I V^1', OWN),
  item('in-blues', 'Blues in inversions', 'blues', 'inversions', 3, 'I IV^2 V^1 I', OWN),
  item('in-jazz', 'ii-V-I, close together', 'jazz', 'inversions', 3, 'ii V^1 I', OWN),
  item('in-minor', 'Minor, close together', 'rock', 'inversions', 3, 'i iv^2 V^1 i', OWN, true),
]

export const PROGRESSION_ITEMS = [...explorer, ...added]
