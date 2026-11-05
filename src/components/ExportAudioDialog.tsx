// ── Export to audio window — opened from a Library song's right-click menu ──
// Version (As I hear it / Original / Focus), sound (Studio / Native + sound
// set), format (MP3 / WAV) as radio tiles, then a progress bar and Show in
// folder. Draggable by its title row, like every Orfeo window. The work itself
// is exportToAudio (src/audio/exportAudio.ts).
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Download, X } from 'lucide-react'
import { useStore } from '../store'
import { t } from '../utils/i18n'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { useDraggableDialog, dialogFitsScreen } from '../hooks/useDraggableDialog'
import { SettingsDropdown, OptionBtn, OptionGroup } from './Settings/controls'
import { useSoundfontState, allSoundfonts } from '../hooks/useSoundfonts'
import { exportToAudio, previewExport, isOpenSong, forgetLoadedSong, ExportError, type ExportSound, type ExportFormat, type ExportStage, type ExportNote } from '../audio/exportAudio'
import type { ExportVersion } from '../audio/exportSong'
import '../styles/redesign-settings.css'

const NATIVE_AVAILABLE = navigator.userAgent.includes('Windows')

type Phase = { k: 'choose' } | { k: 'working'; stage: ExportStage; p: number; note?: ExportNote } | { k: 'done'; path: string } | { k: 'error'; message: string }
// What the window says about the chosen version, and whether Export can go ahead
type Note = { kind: 'nokeys' | 'empty' | 'unreadable'; text: string }

// ── One radio tile: the choice and a short line; a real radio input underneath,
// so the fieldset below still disables them all at once ───────────────────
function Radio({ name, active, disabled, title, tag, children, onPick }: { name: string; active: boolean; disabled?: boolean; title: string; tag?: string; children: ReactNode; onPick: () => void }) {
  return (
    <label className="x-tile" data-on={active || undefined} data-off={disabled || undefined}>
      <input type="radio" name={name} checked={active} disabled={disabled} onChange={onPick} />
      {tag ? <span className="o-tag x-tile-tag" data-tag={tag}>{title}</span> : <span className="x-tile-name">{title}</span>}
      <span className="x-tile-what">{children}</span>
    </label>
  )
}

export default function ExportAudioDialog({ path, name, onClose }: { path: string; name: string; onClose: () => void }) {
  const audioEngine = useStore(s => s.audioEngine)
  const selectedSoundfont = useStore(s => s.selectedSoundfont)
  const extra = useSoundfontState(s => s.extra)
  const sets = allSoundfonts(extra).filter(sf => sf.downloaded)
  const open = isOpenSong(path)

  const [version, setVersion] = useState<ExportVersion>('original')
  const [sound, setSound] = useState<ExportSound>(audioEngine === 'native' && NATIVE_AVAILABLE ? 'native' : 'studio')
  const [soundfont, setSoundfont] = useState(selectedSoundfont)
  const [format, setFormat] = useState<ExportFormat>('mp3')
  const [phase, setPhase] = useState<Phase>({ k: 'choose' })
  const [note, setNote] = useState<Note | null>(null)
  const cancelled = useRef(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  useFocusTrap(panelRef, true)

  const { onDragStart, placed } = useDraggableDialog(panelRef)

  // What the chosen version holds: no keys part (Focus), or no notes at all
  useEffect(() => {
    let live = true
    setNote(null)
    previewExport(path, version, sound).then(s => {
      if (!live) return
      if (!s.events.some(e => (e.status & 0xf0) === 0x90)) setNote({ kind: 'empty', text: t`Nothing to export — the chosen version has no notes.` })
      else if (version === 'focus' && !s.hasKeys) setNote({ kind: 'nokeys', text: t`This song has no keys part — Focus exports bass and drums only.` })
    }).catch(() => { if (live) setNote({ kind: 'unreadable', text: t`Couldn't read this song.` }) })
    return () => { live = false }
  }, [path, version, sound])

  const close = () => { cancelled.current = true; forgetLoadedSong(); onClose() }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const start = async () => {
    cancelled.current = false
    setPhase({ k: 'working', stage: 'render', p: 0 })
    try {
      const saved = await exportToAudio({ songPath: path, songName: name, version, sound, soundfont, format },
        (stage, p, note) => setPhase({ k: 'working', stage, p, note }), () => cancelled.current)
      if (saved) setPhase({ k: 'done', path: saved })
      else setPhase({ k: 'choose' })
    } catch (e: any) {
      // words for the musician; the technical detail goes to the log
      console.error('[Orfeo] export failed:', e)
      const kind = e instanceof ExportError ? e.kind : 'failed'
      const message = kind === 'unreadable' ? t`Couldn't read this song.`
        : kind === 'empty' ? t`Nothing to export — the chosen version has no notes.`
        : kind === 'silent' ? t`The export came out silent — check the master volume and the muted parts.`
        : kind === 'quiet' ? t`The export was far too quiet to be worth a file — turn the volume up, or unmute some parts, and try again.`
        : kind === 'soundset' ? t`That sound set isn't installed any more — choose another one.`
        : sound === 'native' ? t`Something went wrong while exporting. Try again, or choose Studio.`
        : t`Something went wrong while exporting. Try again, or choose Native.`
      setPhase({ k: 'error', message })
    }
  }

  const working = phase.k === 'working'
  // a render that lost its sections is slower, and saying so beats a bar that
  // crawls for no visible reason
  const stageText = working
    ? (phase.stage === 'render' ? (phase.note === 'single-pass' ? t`Exporting (single pass)…` : t`Exporting…`) : phase.stage === 'encode' ? t`Encoding…` : t`Saving…`)
    : ''
  const blocked = !!note && note.kind !== 'nokeys'

  return createPortal(
    <div className="o-scrim" style={{ zIndex: 99999 }}
      onMouseDown={e => { if (e.target === e.currentTarget && !working) close() }}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="orfeo-modal-glow app-no-drag theme-paper o-window x-window"
        style={{ width: 'min(820px, calc(100vw - 32px))', ...dialogFitsScreen, ...placed }}
        onMouseDown={e => e.stopPropagation()}>
        <div onPointerDown={onDragStart} className="o-window-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 id={titleId} className="o-title-lg">{t`Export to audio`}</h2>
            <div className="x-song">{name}</div>
          </div>
          <button type="button" onClick={close} aria-label={t`Close`} className="o-close"><X size={18} /></button>
        </div>

        <fieldset disabled={working || phase.k === 'done'} className="x-form">
          <div>
            <div className="x-label">{t`Version to export`}</div>
            <div className="x-tiles x-tiles-3">
              <Radio name="version" active={version === 'heard'} disabled={!open} title={t`As I hear it`} onPick={() => setVersion('heard')}>
                {open ? t`Everything you've changed: tempo, key, muted parts, Mixer, loop.` : t`Only the song open in Orfeo can be exported as you hear it — open this one first.`}
              </Radio>
              <Radio name="version" active={version === 'original'} title={t`Original`} onPick={() => setVersion('original')}>{t`The song as written: every instrument, its own tempo and key.`}</Radio>
              <Radio name="version" active={version === 'focus'} title={t`Focus`} onPick={() => setVersion('focus')}>{t`Keys, bass and drums only.`}</Radio>
            </div>
            {note && <div className="x-note">{note.text}</div>}
          </div>

          <div className="x-sound">
            <div style={{ flex: 1, minWidth: 180 }}>
              <div className="x-label" style={{ marginBottom: 2 }}>{t`Sound to play it with`}</div>
              <div className="x-tile-what">{sound === 'native' ? t`As Native plays it.` : t`As Studio plays it.`}</div>
            </div>
            <div className="x-sound-set"><SettingsDropdown value={soundfont} onChange={setSoundfont} options={sets.map(sf => ({ value: sf.id, label: sf.name }))} /></div>
            {NATIVE_AVAILABLE && (
              <OptionGroup label={t`Sound`}>
                <OptionBtn active={sound === 'studio'} onClick={() => setSound('studio')}>{t`Studio`}</OptionBtn>
                <OptionBtn active={sound === 'native'} onClick={() => setSound('native')}>{t`Native`}</OptionBtn>
              </OptionGroup>
            )}
          </div>

          <div>
            <div className="x-label">{t`File format`}</div>
            <div className="x-tiles x-tiles-2">
              <Radio name="format" active={format === 'mp3'} title={t`MP3`} tag="mp3" onPick={() => setFormat('mp3')}>{t`320 kbps, 44.1 kHz stereo. Small files for phone, car and any player.`}</Radio>
              <Radio name="format" active={format === 'wav'} title={t`WAV`} tag="wav" onPick={() => setFormat('wav')}>{t`44.1 kHz, 16-bit stereo, uncompressed (CD quality). For editing in other audio software.`}</Radio>
            </div>
          </div>
        </fieldset>

        {working && (
          <div>
            <div className="x-tile-what" style={{ marginBottom: 6 }}>{stageText}</div>
            <span className="o-progress" role="progressbar" aria-label={stageText} aria-valuenow={Math.round(phase.p * 100)} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${Math.round(phase.p * 100)}%`, transition: 'width 0.15s' }} /></span>
          </div>
        )}
        {phase.k === 'error' && <div role="alert" style={{ fontSize: 'var(--text-base)', color: 'var(--status-error)' }}>{phase.message}</div>}

        <div className="o-window-actions">
          {phase.k === 'done' ? (
            <>
              <span className="set-saved" role="status"><span className="set-live-dot" />{t`Saved to Exports.`}</span>
              <button type="button" className="o-btn-quiet" onClick={() => { void window.electronAPI.showItemInFolder(phase.path); close() }}>{t`Show in folder`}</button>
              <span className="o-spacer" />
              <button type="button" className="o-btn-primary o-btn-lg" onClick={close}>{t`Close`}</button>
            </>
          ) : working ? (
            // saving takes a moment and can't be undone halfway: Cancel waits it out
            <>
              <span className="o-spacer" />
              <button type="button" className="o-btn o-btn-lg" disabled={phase.stage === 'save'} onClick={() => { cancelled.current = true }}>{t`Cancel`}</button>
            </>
          ) : (
            <>
              <span className="o-spacer" />
              <button type="button" className="o-btn o-btn-lg" onClick={close}>{t`Cancel`}</button>
              <button type="button" className="o-btn-primary o-btn-lg" disabled={blocked} onClick={() => void start()}><Download size={16} strokeWidth={2} />{t`Export`}</button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
