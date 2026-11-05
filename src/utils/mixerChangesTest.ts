import { changedChannels } from './mixerChanges'

export function runMixerChangesTest(): number {
  let failures = 0
  const eq = (name: string, got: unknown, want: unknown) => {
    const a = JSON.stringify(got), b = JSON.stringify(want)
    if (a !== b) { console.error(`FAIL ${name}: got ${a}, want ${b}`); failures++ }
  }
  const file = { volume: 0.8, pan: 0, chorus: 0, reverb: 0.2 }
  const baseline = { 0: file, 1: file, 2: file }
  const tracks = [{ index: 0, ...file }, { index: 1, ...file, pan: 0.5 }, { index: 2, ...file, reverb: 0 }, { index: 9, ...file, volume: 0 }]
  eq('only channels moved off the file', changedChannels(tracks, baseline).map(t => t.index), [1, 2])
  eq('nothing changed', changedChannels([tracks[0]], baseline), [])
  if (!failures) console.log('[mixerChanges] all passed')
  return failures
}
