import { NES, buildNoteEditSummary } from '../../utils/noteEditorState'
import { Midi } from '@tonejs/midi'
import { noteSelection, selectionHand, assignSelectedHand, repitchSelected, moveSelected, resizeSelected, deleteSelectedNotes, addAfterSelected } from './noteSelection'
import type { ToneNote } from '../../utils/noteEditorCommands'

export function runNoteSelectionTest(): number {
  console.group('[noteSelection] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }
  const note = (hand?: 'L' | 'R') => ({ midi: 60, hand, handSource: hand ? 'auto' : undefined }) as unknown as ToneNote

  let told = 0
  const stop = noteSelection.subscribe(() => told++)
  const a = note('L'), b = note('R'), c = note()
  check(selectionHand() === null, 'nothing selected: no hand')
  noteSelection.add(a)
  noteSelection.add(a)
  check(noteSelection.size === 1 && told === 1, 'adding a note tells the toolbar once')
  check(selectionHand() === 'L', 'one hand')
  noteSelection.add(b)
  check(selectionHand() === 'mixed', 'two hands read as mixed')
  noteSelection.delete(b)
  noteSelection.delete(b)
  check(told === 3, 'removing tells once, and only if it was there')

  noteSelection.add(b)
  noteSelection.add(c)
  NES.history.clear()
  NES.dirty = false
  assignSelectedHand('R')
  check([a, b, c].every(n => (n as any).hand === 'R' && (n as any).handSource === 'manual'), 'every selected note takes the hand, as manual')
  check(selectionHand() === 'R' && NES.dirty, 'the selection reads the new hand, and the edit is unsaved')
  check(buildNoteEditSummary(NES.history.appliedDescriptions()) === 'reassigned hand on 3 notes', 'counted in the save summary')
  NES.history.undo()
  check((a as any).hand === 'L' && (b as any).hand === 'R' && (b as any).handSource === 'auto' && (c as any).hand === undefined, 'undo restores each note')

  noteSelection.clear()
  const seen = told
  noteSelection.clear()
  check(noteSelection.size === 0 && told === seen, 'clearing nothing tells nobody')
  stop()
  noteSelection.add(a)
  check(told === seen, 'unsubscribed')
  noteSelection.clear()
  NES.reset()

  // ── The toolbar's buttons ──
  const song = new Midi()
  const track = song.addTrack()
  const ppq = song.header.ppq
  track.addNote({ midi: 60, ticks: 0, durationTicks: ppq })
  track.addNote({ midi: 64, ticks: ppq, durationTicks: ppq / 4 })
  const [first, second] = track.notes
  ;(second as any).hand = 'R'
  NES.editMidi = song as any
  noteSelection.add(second)
  repitchSelected(1)
  moveSelected(1)
  check(second.midi === 65 && second.ticks === ppq * 1.5, 'pitch by a semitone, time by the 1/8 grid')
  resizeSelected(-1)
  check(second.durationTicks === ppq / 4, 'a note shorter than the grid never grows by shortening')
  resizeSelected(1)
  check(second.durationTicks === ppq * 0.75, 'length by the grid')
  noteSelection.clear()
  noteSelection.add(first)
  moveSelected(-1)
  check(first.ticks === 0, 'nothing moves before the start')
  noteSelection.clear()
  noteSelection.add(second)
  addAfterSelected()
  const added = [...noteSelection][0] as any
  check(track.notes.length === 3 && added !== second && added.ticks === ppq * 2.25 && added.hand === 'R' && NES.newNotes.has(added), 'a copy after the note, selected, same hand')
  NES.history.undo()
  check(track.notes.length === 2, 'undo removes it')
  NES.history.redo()
  check(track.notes.includes(added), 'redo brings back the same note')
  deleteSelectedNotes()
  check(track.notes.length === 2 && noteSelection.size === 0 && !NES.newNotes.has(added), 'delete')
  NES.history.undo()
  check(track.notes.length === 3 && track.notes.every((n, i, all) => !i || all[i - 1].ticks <= n.ticks), 'undo keeps the track in order')
  check(buildNoteEditSummary(NES.history.appliedDescriptions()).includes('repitched 1 note, '), 'counted in the save summary')
  noteSelection.clear()
  NES.reset()

  console.log(`${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
