import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Minus, Play, Plus, SlidersHorizontal, Square } from 'lucide-react'
import '../styles/redesign-tools.css'
import './jam.css'
import { useStore } from '../store'
import { onLiveNote } from '../hooks/useMidiInput'
import { t } from '../utils/i18n'
import { localizeChord } from '../utils/chordDetection'
import { miniKeyboardLayout } from '../utils/miniKeyboard'
import { SettingsDropdown } from '../components/Settings/controls'
import { BEATS_PER_BAR, noteName, progressionChords, scaleNotes, scalePitchClasses, type JamStyle } from './band'
import { licksFor } from './licks'
import { startKeyFx } from './keyFx'
import { scaleLabel, scaleOptions } from './scales'
import { PRESETS, ROSTER, SLOT_COUNT, instrument } from './roster'
import { MAX_BPM, MIN_BPM, SPLIT_NOTE, setBand, setBpm, setFeel, setKey, setLeftHand, setRoom, setScale, setSlot, setStyle, startJam, stopJam, useJam } from './jamSession'
import RoomStage from './room/RoomStage'
import { SCENES, roomFor, sceneChoice, stepScene, type SceneChoice } from './room/roomChoice'

const STYLE_OPTIONS: { value: JamStyle; label: string }[] = [
  { value: 'blues', label: t`Blues` },
  { value: 'jazz', label: t`Jazz` },
  { value: 'pop', label: t`Pop` },
  { value: 'rock', label: t`Rock` },
  { value: 'rnb', label: t`R&B` },
  { value: 'soul', label: t`Soul` },
  { value: 'funk', label: t`Funk` },
  { value: 'bossa', label: t`Bossa Nova` },
  { value: 'hiphop', label: t`Hip Hop` },
  { value: 'alternative', label: t`Alternative` },
  { value: 'ballad', label: t`Ballad` },
]
const ROOM_NAMES: Record<Exclude<SceneChoice, 'auto'>, () => string> = {
  studio: () => t`Recording studio`, cafe: () => t`Jazz café`, roadhouse: () => t`Roadhouse bar`, rooftop: () => t`Rooftop at night`,
  beach: () => t`Beach bonfire`, stage: () => t`Concert stage`, space: () => t`Space lounge`, plain: () => t`Plain, no room`,
}
const sceneName = (choice: SceneChoice) => (choice === 'auto' ? t`Auto` : ROOM_NAMES[choice]())
const LEVEL_WORD = [t`Calm`, t`Steady`, t`Building`]
const KEYBOARD_ENDS = [36, 83] // C2 to B5
function useChordName() {
  const naming = useStore(s => s.noteNaming)
  const accidentals = useStore(s => s.accidentals)
  const style = useStore(s => s.chordNamingStyle)
  return (chord: string | null) => localizeChord(chord, naming, accidentals, style) ?? ''
}

function KeyPicker() {
  const keyPc = useJam(s => s.keyPc)
  const name = useChordName()
  const options = useMemo(() => Array.from({ length: 12 }, (_, pc) => ({ value: String(pc), label: name(noteName(pc)) })), [name])
  return <SettingsDropdown title={t`Key`} value={String(keyPc)} options={options} onChange={v => setKey(Number(v))} />
}

// Keys belong to whatever is on top: a dialog or a text field keeps its own
const pageHasKeys = (e: KeyboardEvent) => !e.ctrlKey && !e.metaKey && !e.altKey && !document.querySelector('[aria-modal="true"], [role="listbox"]') && !(e.target as HTMLElement).closest?.('input, textarea, [contenteditable="true"]')

function SceneSwitcher() {
  const choice = useJam(s => sceneChoice(s.savedRoom))
  const room = useJam(s => roomFor(s.savedRoom, s.style))
  const style = useJam(s => s.style)
  const scenes = useJam(s => s.scenes)
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!scenes) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
      if ((e.key === '[' || e.key === ']') && pageHasKeys(e)) setRoom(stepScene(sceneChoice(useJam.getState().savedRoom), e.key === ']' ? 1 : -1))
    }
    const onDown = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    window.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => { window.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown) }
  }, [scenes])
  if (!scenes) return null
  const pick = (scene: SceneChoice) => { setRoom(scene); setOpen(false) }
  const name = choice === 'auto' && room !== 'plain' ? `${t`Auto`}: ${ROOM_NAMES[room]()}` : sceneName(choice)
  return (
    <div ref={box} className="jam-scenes">
      <div className="jam-scene-bar">
        <button className="o-icon-btn" aria-label={t`Previous scene`} title="[" onClick={() => setRoom(stepScene(choice, -1))}><ChevronLeft size={16} aria-hidden /></button>
        <button className="jam-scene-name lib-ellipsis" aria-expanded={open} aria-label={`${t`Scene`}: ${name}`} onClick={() => setOpen(v => !v)}>{name}</button>
        <button className="o-icon-btn" aria-label={t`Next scene`} title="]" onClick={() => setRoom(stepScene(choice, 1))}><ChevronRight size={16} aria-hidden /></button>
      </div>
      {open && (
        <div className="jam-scene-row" role="group" aria-label={t`Scene`}>
          {SCENES.map(scene => {
            const shows = scene === 'auto' ? roomFor('auto', style) : scene
            return (
              <button key={scene} className="jam-scene-card" aria-pressed={scene === choice} onClick={() => pick(scene)}>
                <span className="jam-scene-thumb" data-plain={shows === 'plain' || undefined} style={shows === 'plain' ? undefined : { backgroundImage: `url(./jam/thumbs/${shows}.jpg)` }} />
                <span className="lib-ellipsis">{sceneName(scene)}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Tempo() {
  const bpm = useJam(s => s.bpm)
  return (
    <div className="jam-tempo">
      <button className="o-icon-btn" aria-label={t`Slower`} disabled={bpm <= MIN_BPM} onClick={() => setBpm(bpm - 2)}><Minus size={16} aria-hidden /></button>
      <span className="jam-tempo-value">{`${bpm} ${t`BPM`}`}</span>
      <button className="o-icon-btn" aria-label={t`Faster`} disabled={bpm >= MAX_BPM} onClick={() => setBpm(bpm + 2)}><Plus size={16} aria-hidden /></button>
    </div>
  )
}

// No keyboard, no left hand: the band keeps to its own chords
const useLeftHandLeads = () => {
  const leftHand = useJam(s => s.leftHand)
  const connected = useStore(s => s.midiDeviceConnected)
  return leftHand && connected
}

// Before the first chord arrives, the progression's first one stands in
function useShownChord() {
  const chord = useJam(s => s.chord)
  const style = useJam(s => s.style)
  const keyPc = useJam(s => s.keyPc)
  return useMemo(() => chord ?? progressionChords(style, keyPc)[0], [chord, style, keyPc])
}

function LeadChoice() {
  const leads = useLeftHandLeads()
  const connected = useStore(s => s.midiDeviceConnected)
  return (
    <div className="o-seg jam-wide">
      <button aria-pressed={leads} disabled={!connected} onClick={() => setLeftHand(true)}>{t`My left hand leads`}</button>
      <button aria-pressed={!leads} onClick={() => setLeftHand(false)}>{t`Fixed chords`}</button>
    </div>
  )
}

const SLOT_OPTIONS = [{ value: '', label: t`Empty` }, ...ROSTER.map(i => ({ value: i.id, label: i.name() }))]
const PRESET_OPTIONS = PRESETS.map(p => ({ value: p.id, label: p.name() }))

function ScalePicker() {
  const scale = useJam(s => s.scale)
  const style = useJam(s => s.style)
  const options = useMemo(() => scaleOptions(style), [style])
  return <SettingsDropdown title={t`Scale`} value={scale} options={options} onChange={setScale} />
}

function Feel() {
  const feel = useJam(s => s.feel)
  return (
    <div className="o-seg jam-wide">
      <button aria-pressed={feel === 'tight'} onClick={() => setFeel('tight')}>{t`Tight`}</button>
      <button aria-pressed={feel === 'relaxed'} onClick={() => setFeel('relaxed')}>{t`Relaxed`}</button>
    </div>
  )
}

function BandPicker() {
  const slots = useJam(s => s.slots)
  const preset = PRESETS.find(p => p.slots.join() === slots.join())?.id ?? ''
  return <SettingsDropdown title={t`Band`} value={preset} options={preset ? PRESET_OPTIONS : [{ value: '', label: t`Your own band` }, ...PRESET_OPTIONS]} onChange={setBand} />
}

function Slots() {
  const slots = useJam(s => s.slots)
  const beat = useJam(s => s.beat)
  const live = useJam(s => s.live)
  return (
    <div className="jam-band">
      {Array.from({ length: SLOT_COUNT }, (_, i) => (
        <div key={i} className="jam-slot" data-on={!!slots[i] || undefined}>
          <span className="jam-slot-family">{instrument(slots[i])?.family() ?? t`Open seat`}</span>
          <SettingsDropdown title={instrument(slots[i])?.family() ?? t`Open seat`} value={slots[i] ?? ''} options={SLOT_OPTIONS} onChange={v => setSlot(i, v || null)} />
          {live && slots[i] && <span key={beat} className="jam-pulse" aria-hidden />}
        </div>
      ))}
    </div>
  )
}

// Sitting in the room: each one pulses as it plays, and opens the settings
function Seats({ onOpen }: { onOpen: () => void }) {
  const slots = useJam(s => s.slots)
  const beat = useJam(s => s.beat)
  const live = useJam(s => s.live)
  return (
    <div className="jam-seats">
      {slots.map((id, i) => (
        <button key={i} className="jam-seat" data-on={!!id || undefined} onClick={onOpen}>
          <span className="o-dot" />
          <span className="lib-ellipsis">{instrument(id)?.name() ?? t`Open seat`}</span>
          {live && id && <span key={beat} className="jam-pulse" aria-hidden />}
        </button>
      ))}
    </div>
  )
}

function Meter({ label, value }: { label: string; value: number }) {
  return (
    <div className="jam-meter">
      <span>{label}</span>
      <span className="jam-meter-track" role="img" aria-label={`${label}: ${Math.round(value * 100)}%`}>
        <i style={{ transform: `scaleX(${value})` }} />
      </span>
    </div>
  )
}

function Listening() {
  const loud = useJam(s => s.loud)
  const busy = useJam(s => s.busy)
  const level = useJam(s => s.level)
  return (
    <section className="jam-card" aria-live="off">
      <div className="jam-listening">
        <span>{t`The band is listening`}</span>
        <span className="lib-tag" style={{ background: 'var(--paint-lime)' }}>{LEVEL_WORD[level]}</span>
      </div>
      <Meter label={t`Volume`} value={loud} />
      <Meter label={t`Energy`} value={busy} />
    </section>
  )
}

function Keys({ target }: { target: number | null }) {
  const scaleName = useJam(s => s.scale)
  const keyPc = useJam(s => s.keyPc)
  const held = useJam(s => s.held)
  const live = useJam(s => s.live)
  const leftHand = useLeftHandLeads()
  const chord = useShownChord()
  const scale = useMemo(() => scalePitchClasses(scaleName, keyPc), [scaleName, keyPc])
  const { whites, blacks } = useMemo(() => miniKeyboardLayout(KEYBOARD_ENDS), [])
  const down = new Set(held)
  const tones = new Set(chord.semis.map(s => (chord.rootPc + s) % 12))
  const lit = (midi: number) => (midi % 12 === keyPc ? 'root' : scale.has(midi % 12) ? 'on' : undefined)
  const marks = (midi: number) => ({
    'data-midi': midi, 'data-lit': lit(midi), 'data-chord': tones.has(midi % 12) || undefined, 'data-held': down.has(midi) || undefined,
    'data-outside': !scale.has(midi % 12) || undefined, 'data-target': midi === target || undefined,
  })
  const splitAt = whites.findIndex(k => k.midi === SPLIT_NOTE) * 100 / whites.length
  const fx = useRef<HTMLCanvasElement>(null)
  const board = useRef<HTMLDivElement>(null)
  const state = useRef({ beat: 0, scale, rootPc: keyPc, tones, target })
  Object.assign(state.current, { scale, rootPc: keyPc, tones, target })
  useEffect(() => {
    if (!live || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    return startKeyFx(fx.current!, board.current!, () => ({ ...state.current, beat: useJam.getState().beat }))
  }, [live])
  return (
    <div className="jam-keywrap">
      <div ref={board} className="xp-mini jam-keys" role="img" aria-label={t`The notes of the scale, lit on the keyboard`}>
        {whites.map(k => <i key={k.midi} {...marks(k.midi)} />)}
        {blacks.map(k => <b key={k.midi} {...marks(k.midi)} style={{ left: `${k.x}%`, width: `${62 / whites.length}%` }} />)}
        {leftHand && <span className="jam-split" style={{ left: `${splitAt}%` }} />}
      </div>
      <canvas ref={fx} className="jam-keys-fx" aria-hidden />
    </div>
  )
}

function ScaleLine() {
  const scale = useJam(s => s.scale)
  const keyPc = useJam(s => s.keyPc)
  const chord = useShownChord()
  const name = useChordName()
  return (
    <div className="jam-scale">
      <span><strong>{`${name(noteName(keyPc))} ${scaleLabel(scale)}`}</strong>{` ${scaleNotes(scale, keyPc).map(name).join(' ')}`}</span>
      <span><strong>{t`Chord tones`}</strong>{` ${chord.semis.map(s => name(noteName((chord.rootPc + s) % 12))).join(' ')}`}</span>
    </div>
  )
}

// Never scored: the lit key waits for the player, and a wrong note costs nothing
function Licks({ onTarget }: { onTarget: (midi: number | null) => void }) {
  const style = useJam(s => s.style)
  const scale = useJam(s => s.scale)
  const keyPc = useJam(s => s.keyPc)
  const name = useChordName()
  const licks = useMemo(() => licksFor(style, scale, keyPc), [style, scale, keyPc])
  const [picked, setPicked] = useState(0)
  const [step, setStep] = useState(0)
  const hearing = useRef<ReturnType<typeof setTimeout>[]>([])
  const lick = licks[Math.min(picked, licks.length - 1)]
  const stopHearing = () => { hearing.current.forEach(clearTimeout); hearing.current = [] }

  useEffect(() => {
    setStep(0)
    return stopHearing
  }, [lick])
  useEffect(() => {
    if (!lick) return
    return onLiveNote(note => {
      if (note < SPLIT_NOTE) return
      stopHearing()
      setStep(s => (note % 12 === lick.notes[s].midi % 12 ? (s + 1) % lick.notes.length : s))
    })
  }, [lick])
  useEffect(() => onTarget(lick?.notes[step]?.midi ?? null), [lick, step, onTarget])
  useEffect(() => () => onTarget(null), [onTarget])

  if (!lick) return null
  // shortcut: page timers, so a heard lick floats over the band's grid; put it on the scheduler if that distracts
  const hear = () => {
    stopHearing()
    const beatMs = 60000 / useJam.getState().bpm
    hearing.current = lick.notes.map((n, i) => setTimeout(() => {
      setStep(i)
      ;(window as any).__pliagePlayNote?.(n.midi, 90, n.beats * beatMs, undefined, false)
    }, n.at * beatMs))
    const last = lick.notes[lick.notes.length - 1]
    hearing.current.push(setTimeout(() => setStep(0), (last.at + last.beats) * beatMs))
  }
  return (
    <section className="jam-card">
      <div className="jam-listening">
        <span>{t`Licks to try`}</span>
        <button className="o-btn" onClick={hear}><Play size={14} fill="currentColor" aria-hidden />{t`Hear it`}</button>
      </div>
      <div className="jam-lick-picks">
        {licks.map((l, i) => <button key={l.id} aria-pressed={l === lick} onClick={() => setPicked(i)}>{l.name}</button>)}
      </div>
      <div className="jam-lick-notes" aria-label={lick.concept}>
        {lick.notes.map((n, i) => <span key={i} data-on={i === step || undefined}>{name(noteName(n.midi % 12))}</span>)}
      </div>
    </section>
  )
}

function ChordBoard() {
  const name = useChordName()
  const live = useJam(s => s.live)
  const beat = useJam(s => s.beat)
  const style = useJam(s => s.style)
  const keyPc = useJam(s => s.keyPc)
  const next = useJam(s => s.nextChord)
  const chord = useShownChord()
  const progression = useMemo(() => progressionChords(style, keyPc), [style, keyPc])
  return (
    <section className="jam-card jam-board">
      <div className="jam-chord">{name(chord.raw)}</div>
      {live
        ? <div className="jam-next">{next ? `${t`Next`}: ${name(next.raw)}` : ' '}</div>
        : <div className="jam-next jam-progression">{progression.map((c, i) => <span key={i}>{name(c.raw)}</span>)}</div>}
      <div className="jam-beats" aria-hidden>{Array.from({ length: BEATS_PER_BAR }, (_, i) => <i key={i} data-on={(live && i === beat) || undefined} />)}</div>
    </section>
  )
}

function Hint() {
  const leads = useLeftHandLeads()
  const connected = useStore(s => s.midiDeviceConnected)
  const hint = !connected ? t`No keyboard connected. The band plays its chords; follow along.`
    : leads ? t`Play a chord below middle C. The band moves to it on the next beat.` : t`The band plays the chords. Solo over them.`
  return <p className="jam-hint" role="status">{hint}</p>
}

// Everything that sets the band up: open while setting up, tucked away while playing
function Settings({ open }: { open: boolean }) {
  const style = useJam(s => s.style)
  const live = useJam(s => s.live)
  const [notReady, setNotReady] = useState(false)
  const start = async () => setNotReady(!(await startJam()))
  return (
    <aside className="jam-drawer" data-open={open || undefined}>
      <div className="jam-set">
        {!live && <h2 className="jam-title">{t`Jam with a band that follows you`}</h2>}
        <div className="jam-controls">
          {!live && <SettingsDropdown title={t`Style`} value={style} options={STYLE_OPTIONS} onChange={setStyle} />}
          <KeyPicker />
          <ScalePicker />
          <BandPicker />
        </div>
      </div>
      <div className="jam-set">
        <Tempo />
        {!live && <LeadChoice />}
        <Feel />
      </div>
      <div className="jam-set jam-set-band"><Slots /></div>
      {notReady && <div role="alert" className="lib-alert jam-alert"><span className="o-dot o-dot-alert" />{t`The sound is still loading. Try again in a moment.`}</div>}
      {!live && (
        <button className="o-btn-primary o-btn-lg jam-start" onClick={() => void start()}>
          <Play size={16} fill="currentColor" aria-hidden />{t`Start playing`}
        </button>
      )}
    </aside>
  )
}

// ── Jam: improvise with a band that follows you. Nothing here is ever scored. ──
export default function JamHome() {
  const live = useJam(s => s.live)
  const [target, setTarget] = useState<number | null>(null)
  const [settings, setSettings] = useState(false)
  useEffect(() => stopJam, [])
  useEffect(() => setSettings(false), [live])
  return (
    <RoomStage>
      <div className="jam-page">
        <SceneSwitcher />
        <ChordBoard />
        <div className="jam-reference">
          <Hint />
          <ScaleLine />
        </div>
        <Keys target={target} />
        <div className="jam-console">
          {live && (
            <div className="jam-dock" hidden={settings}>
              <Seats onOpen={() => setSettings(true)} />
              <Listening />
              <Licks onTarget={setTarget} />
            </div>
          )}
          <Settings open={!live || settings} />
          {live && (
            <div className="jam-bar">
              <button className="o-btn jam-bar-settings" aria-expanded={settings} onClick={() => setSettings(v => !v)}><SlidersHorizontal size={14} aria-hidden />{t`Band settings`}</button>
              <button className="o-btn" onClick={stopJam}><Square size={14} fill="currentColor" aria-hidden />{t`Stop`}</button>
            </div>
          )}
        </div>
      </div>
    </RoomStage>
  )
}
