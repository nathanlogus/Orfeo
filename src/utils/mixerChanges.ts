// ── The Mixer against the file: which channels differ from what it opened with ──
export interface MixValues { volume: number; pan: number; chorus: number; reverb: number }
type MixTrack = MixValues & { index: number }

export function changedChannels<T extends MixTrack>(tracks: T[], baseline: Record<number, MixValues>): T[] {
  return tracks.filter(t => {
    const base = baseline[t.index]
    return base && (base.volume !== t.volume || base.pan !== t.pan || base.chorus !== t.chorus || base.reverb !== t.reverb)
  })
}
