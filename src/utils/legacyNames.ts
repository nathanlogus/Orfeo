// ── Read-only support for files from before the app was renamed ───────────────
// Pliage used to be called Orfeo. Songs saved back then keep that word in their
// names (Song_ORFEO_v2.mid), their folder (Orfeo/) and their text markers
// (ORFEO_HAND_MAP:…), so those must go on reading exactly as before. Reading is
// all that happens here: every write uses PLIAGE. Apart from the one-time
// migrations, this is the only code that may still spell the old name.
const OLD_MARKER = 'ORFEO_'

/** The saved-file word in a file name, for use inside a regular expression. */
export const SAVED_WORD = '(?:PLIAGE|ORFEO)'

/** The folder older versions saved into. It stays where it is. */
export const LEGACY_OUTPUT_FOLDER = 'Orfeo'

/** The app's own output folder beside a song, under either name. */
export const isOutputFolder = (name: string): boolean => /^(pliage|orfeo)$/i.test(name)

/** Call on every freshly parsed Midi: everything after it, and every save, only sees PLIAGE_… */
export function upgradeMarkers<T extends { header: unknown }>(midi: T): T {
  for (const m of (midi.header as any).meta ?? []) {
    if (typeof m.text === 'string' && m.text.startsWith(OLD_MARKER)) m.text = 'PLIAGE_' + m.text.slice(OLD_MARKER.length)
  }
  return midi
}

/** Where an older version kept the converted copy of a notation file. */
export const legacyImportPath = (cachePath: string): string =>
  cachePath.replace(/\/Pliage\/([^/]*)$/, `/${LEGACY_OUTPUT_FOLDER}/$1`).replace(/_PLIAGE_IMPORTED\.mid$/, `_${OLD_MARKER}IMPORTED.mid`)

/** One-time: localStorage keys from the old name move to the new ones. */
export function migrateLocalStorage(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>): void {
  const value = storage.getItem('orfeo-dev-tools')
  if (value === null) return
  if (storage.getItem('pliage-dev-tools') === null) storage.setItem('pliage-dev-tools', value)
  storage.removeItem('orfeo-dev-tools')
}
