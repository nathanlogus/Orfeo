import { NES, buildNoteEditSummary } from '../../utils/noteEditorState'
import { noteSelection, selectionHand, assignSelectedHand } from './noteSelection'
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

  console.log(`${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
