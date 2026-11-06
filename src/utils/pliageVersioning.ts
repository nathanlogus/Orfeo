// ── Pliage save-file versioning — one rule, shared by every editing tool ───────
// (MidiEditor merge/instrument-reassign, MidiEditor split, NoteEditor note
// edits). Previously each tool hand-rolled its own suffix logic and they
// disagreed: MidiEditor's merge/reassign save always overwrote the same
// "_PLIAGE"/"_PLIAGE_MERGED" file (no versioning at all), split always
// overwrote "_PLIAGE_SPLIT", and only the note editor actually incremented,
// using "_PLIAGE_V2" (uppercase, and skipping straight past a "_v1").
//
// The rule now, everywhere: any edit produces the next `_PLIAGE_v{N}` file,
// never overwriting a prior save, never stacking suffixes. The specific
// editing tool used (merge, split, note edit, instrument reassignment,
// track removal, track rename) doesn't matter — they all share one counter.
import { SAVED_WORD } from './legacyNames'

const PLIAGE_SUFFIX_RE = new RegExp(`_${SAVED_WORD}(_MERGED|_SPLIT|_IMPORTED|_V(\\d+)|_v(\\d+))?$`, 'i')

// ── Strip whatever Pliage suffix (current or legacy) is already on a base
// filename (no extension, no directory), so re-saving never stacks. ──────────
export function stripPliageSuffix(base: string): string {
  return base.replace(PLIAGE_SUFFIX_RE, '')
}

// ── Next version number for a base filename that may already carry an
// "_PLIAGE_v{N}" (or legacy) suffix. First edit of a fresh file is v1. ────────
export function nextPliageVersion(base: string): number {
  const match = base.match(PLIAGE_SUFFIX_RE)
  const n = match?.[2] ?? match?.[3]
  return n ? parseInt(n, 10) + 1 : 1
}

// ── Full next base filename (still no extension/directory): stripped root
// + "_PLIAGE_v{N}". ────────────────────────────────────────────────────────────
export function nextPliageBaseName(base: string): string {
  return `${stripPliageSuffix(base)}_PLIAGE_v${nextPliageVersion(base)}`
}
