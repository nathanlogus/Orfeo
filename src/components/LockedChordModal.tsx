import React, { useState, useCallback, useMemo, useEffect, useRef, type CSSProperties } from 'react'
import { ChevronLeft, ChevronRight, Lock, Play, X } from 'lucide-react'
import { useStore } from '../store'
import { formatInversionDisplay, ordinalSuffix } from '../utils/chordDetection'
import { getNoteName } from '../utils/noteNames'
import '../styles/redesign-tools.css'
import { getPianoRollCenterX, modalTopAboveKeyboard } from '../utils/modalAnchors'
import { startModalDrag } from '../utils/modalDrag'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { useClampPositionOnZoom } from '../hooks/useClampPositionOnZoom'

const MODAL_WIDTH  = 650
const MODAL_HEIGHT = 280

// ── Rotate voicing one inversion up — lowest note moves up an octave ─────────
function nextInversion(notes: Set<number>): Set<number> {
  const sorted = Array.from(notes).sort((a, b) => a - b)
  const [lowest, ...rest] = sorted
  return new Set([...rest, lowest + 12])
}

// ── Rotate voicing one inversion down — highest note moves down an octave ────
function prevInversion(notes: Set<number>): Set<number> {
  const sorted = Array.from(notes).sort((a, b) => a - b)
  const highest = sorted[sorted.length - 1]
  const rest = sorted.slice(0, -1)
  return new Set([highest - 12, ...rest])
}

// ── Floating draggable modal shown when any keys are Shift+Click locked ───────
export default function LockedChordModal() {
  const lockedKeys              = useStore((s) => s.lockedKeys)
  const lockedColors            = useStore((s) => s.lockedColors)
  const setLockedKeys           = useStore((s) => s.setLockedKeys)
  const clearLockedKeys         = useStore((s) => s.clearLockedKeys)
  const originalLockedChordName = useStore((s) => s.originalLockedChordName)
  const lockedInversionCount    = useStore((s) => s.lockedInversionCount)
  const lockedChordNoteCount    = useStore((s) => s.lockedChordNoteCount)
  const noteNaming              = useStore((s) => s.noteNaming)
  const accidentals             = useStore((s) => s.accidentals)

  // ── Modal visibility — auto-opens when keys are locked; only closes via X ──
  // Clearing the chord (RotateCcw) keeps the modal open showing "— — —".
  const [modalOpen, setModalOpen] = useState(false)
  const setLockedChordModalOpen = useStore((s) => s.setLockedChordModalOpen)
  // ── Mirror into the store so App.tsx's global Escape handler can exclude
  // this modal the same way it already excludes chordExplorerOpen/
  // scaleExplorerOpen — see the field's own comment in store/index.ts. ─────
  useEffect(() => { setLockedChordModalOpen(modalOpen) }, [modalOpen, setLockedChordModalOpen])
  // An Explorer opening lets go of the locked chord (store setters): close too
  const explorerOpen = useStore((s) => s.chordExplorerOpen || s.scaleExplorerOpen)
  useEffect(() => { if (explorerOpen) setModalOpen(false) }, [explorerOpen])
  // ── Position state — bottom edge on the keyboard header, horizontally
  // centered on the piano roll; computed on first actual open (not at app
  // mount, so the layout is settled), then left alone. ───────────────────────
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const positioned = useRef(false)
  useEffect(() => {
    if (lockedKeys.size === 0) return
    setModalOpen(true)
    if (!positioned.current) {
      positioned.current = true
      setPos({
        x: Math.max(16, Math.min(Math.round(getPianoRollCenterX() - MODAL_WIDTH / 2), window.innerWidth - MODAL_WIDTH - 16)),
        y: modalTopAboveKeyboard(MODAL_HEIGHT, 23),
      })
    }
  }, [lockedKeys.size])

  // ── Compute structured inversion display ─────────────────────────────────
  const lockedDisplay = useMemo(() => {
    if (!originalLockedChordName || lockedKeys.size === 0) return null
    const bassNoteMidi = Math.min(...lockedKeys)
    return formatInversionDisplay(
      originalLockedChordName, lockedInversionCount, lockedChordNoteCount,
      bassNoteMidi, noteNaming, accidentals, true,
    )
  }, [originalLockedChordName, lockedInversionCount, lockedChordNoteCount, lockedKeys, noteNaming, accidentals])

  // ── Partial display — 1st/2nd shift-clicked notes shown in place of their
  // dash while the chord isn't identifiable yet (needs 3+ notes); the 3rd
  // dash stays "—" until then. ──────────────────────────────────────────────
  const partialNotes = useMemo(() => {
    if (lockedDisplay || lockedKeys.size === 0) return null
    return Array.from(lockedKeys).sort((a, b) => a - b).map(m => getNoteName(m, noteNaming, accidentals))
  }, [lockedDisplay, lockedKeys, noteNaming, accidentals])

  // ── Drag ─────────────────────────────────────────────────────────────────
  const startDrag = (e: React.PointerEvent<HTMLDivElement>) => startModalDrag(e, panelRef.current, pos, setPos)

  // ── Play all locked notes ─────────────────────────────────────────────────
  const playLockedChord = useCallback(() => {
    const playNote = (window as any).__orfeoPlayNote
    if (!playNote) return
    lockedKeys.forEach(midi => playNote(midi, 0.75, 800, undefined, false))
  }, [lockedKeys])

  // ── Cycle inversion voicing + update inversion count in store ────────────
  const applyInversion = useCallback((fn: (n: Set<number>) => Set<number>, direction: 1 | -1) => {
    const newKeys = fn(lockedKeys)
    const newColors = new Map<number, string>()
    newKeys.forEach(k => newColors.set(k, 'var(--text-amber)'))
    setLockedKeys(newKeys, newColors)
    const s = useStore.getState()
    s.setLockedInversionCount(s.lockedInversionCount + direction)
    const playNote = (window as any).__orfeoPlayNote
    if (playNote) newKeys.forEach(midi => playNote(midi, 0.7, 600, undefined, false))
  }, [lockedKeys, setLockedKeys])

  // ── X button — clears keys and dismisses modal ───────────────────────────
  const handleClose = useCallback(() => { clearLockedKeys(); setModalOpen(false) }, [clearLockedKeys])

  // ── Clear button — clears locked keys only; modal stays open ─────────────
  const handleClear = useCallback(() => { clearLockedKeys() }, [clearLockedKeys])

  // ── Close on Escape ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!modalOpen) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [modalOpen, handleClose])

  const panelRef = useRef<HTMLDivElement>(null)
  useFocusTrap(panelRef, modalOpen)
  useClampPositionOnZoom(pos, setPos, panelRef)

  if (!modalOpen) return null

  const notes = Array.from(lockedKeys).sort((a, b) => a - b).map(m => getNoteName(m, noteNaming, accidentals))

  return (
    <div ref={panelRef} role="dialog" aria-modal="true" aria-label="Lock-a-Chord" data-instant className="orfeo-modal-glow app-no-drag theme-paper xp-lock" style={{
      left: pos.x,
      top: pos.y,
      '--_modal-shadow': 'var(--elevation-modal)',
    } as CSSProperties}>
      <div className="xp-lock-head" onPointerDown={startDrag}>
        <span className="xp-lock-tag"><Lock size={14} /> Locked chord</span>
        <div className="o-spacer" />
        <button className="o-close" aria-label="Unlock and close" onClick={handleClose}><X size={18} /></button>
      </div>

      {/* ── Inversion arrows either side of the chord's name ─────────────────── */}
      <div className="xp-lock-body">
        <button className="xp-lock-step" aria-label="Previous inversion" onClick={() => applyInversion(prevInversion, -1)}><ChevronLeft size={22} /></button>
        <div className="xp-lock-name">
          <span className="xp-lock-chord">{lockedDisplay?.chordLabel ?? [0, 1, 2].map(i => partialNotes?.[i] ?? '—').join(' ')}</span>
          <span className="xp-lock-sub">
            {lockedDisplay ? (lockedDisplay.ordinal ? `${lockedDisplay.ordinal}${ordinalSuffix(Number(lockedDisplay.ordinal))} inversion · ` : 'Root position · ') : ''}
            {notes.join(' · ')}
          </span>
        </div>
        <button className="xp-lock-step" aria-label="Next inversion" onClick={() => applyInversion(nextInversion, 1)}><ChevronRight size={22} /></button>
      </div>

      <div className="xp-lock-foot">
        <button className="o-btn-primary o-btn-lg" onClick={playLockedChord}><Play size={14} fill="currentColor" strokeWidth={0} /> Play chord</button>
        {/* Clear — removes the highlighted keys, the window stays open */}
        <button className="o-btn-quiet" onClick={handleClear}>Clear</button>
      </div>
    </div>
  )
}
