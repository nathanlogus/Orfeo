import { useEffect, useMemo, useRef, useState } from 'react'
import { Minus, Play, Plus, Square } from 'lucide-react'
import '../styles/redesign-tools.css'
import './jam.css'
import { useStore } from '../store'
import { onLiveNote } from '../hooks/useMidiInput'
import { t } from '../utils/i18n'
import { localizeChord } from '../utils/chordDetection'
import { miniKeyboardLayout } from '../utils/miniKeyboard'
import { SettingsDropdown } from '../components/Settings/controls'
import { BEATS_PER_BAR, noteName, scaleNotes, scalePitchClasses, type JamChord, type JamStyle } from './band'
import { licksFor } from './licks'
import { PRESETS, ROSTER, SLOT_COUNT, instrument } from './roster'
import { MAX_BPM, MIN_BPM, SPLIT_NOTE, setBand, setBpm, setFeel, setKey, setLeftHand, setScale, setSlot, setStyle, startJam, stopJam, useJam } from './jamSession'

const STYLE_OPTIONS: { value: JamStyle; label: string }[] = [
  { value: 'blues', label: t`Blues` },
  { value: 'jazz', label: t`Jazz` },
  { value: 'pop', label: t`Pop` },
  { value: 'rock', label: t`Rock` },
]
const LEVEL_WORD = [t`Calm`, t`Steady`, t`Building`]
const KEYBOARD_ENDS = [36, 83] // C2 to B5
const SCALES = [
  { value: 'blues', label: t`Blues scale` },
  { value: 'minor pentatonic', label: t`Minor pentatonic` },
  { value: 'major pentatonic', label: t`Major pentatonic` },
  { value: 'major', label: t`Major scale` },
  { value: 'minor', label: t`Natural minor` },
  { value: 'dorian', label: t`Dorian` },
  { value: 'mixolydian', label: t`Mixolydian` },
]
const scaleLabel = (scale: string) => SCALES.find(o => o.value === scale)?.label ?? scale

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

function LeadChoice() {
  const leftHand = useJam(s => s.leftHand)
  return (
    <div className="o-seg jam-wide">
      <button aria-pressed={leftHand} onClick={() => setLeftHand(true)}>{t`My left hand leads`}</button>
      <button aria-pressed={!leftHand} onClick={() => setLeftHand(false)}>{t`Fixed chords`}</button>
    </div>
  )
}

const SLOT_OPTIONS = [{ value: '', label: t`Empty` }, ...ROSTER.map(i => ({ value: i.id, label: `${i.family()}: ${i.name()}` }))]
const PRESET_OPTIONS = PRESETS.map(p => ({ value: p.id, label: p.name() }))

function ScalePicker() {
  const scale = useJam(s => s.scale)
  return <SettingsDropdown title={t`Scale`} value={scale} options={SCALES} onChange={setScale} />
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

function Slots() {
  const slots = useJam(s => s.slots)
  const beat = useJam(s => s.beat)
  const live = useJam(s => s.live)
  const preset = PRESETS.find(p => p.slots.join() === slots.join())?.id ?? ''
  return (
    <>
      <SettingsDropdown title={t`Band`} value={preset} options={preset ? PRESET_OPTIONS : [{ value: '', label: t`Your own band` }, ...PRESET_OPTIONS]} onChange={setBand} />
      <div className="jam-band">
        {Array.from({ length: SLOT_COUNT }, (_, i) => (
          <div key={i} className="jam-slot" data-on={!!slots[i] || undefined}>
            <SettingsDropdown title={instrument(slots[i])?.family() ?? t`Open seat`} value={slots[i] ?? ''} options={SLOT_OPTIONS} onChange={v => setSlot(i, v || null)} />
            {live && slots[i] && <span key={beat} className="jam-pulse" aria-hidden />}
          </div>
        ))}
      </div>
    </>
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
  const leftHand = useJam(s => s.leftHand)
  const chord = useJam(s => s.chord)
  const scale = useMemo(() => scalePitchClasses(scaleName, keyPc), [scaleName, keyPc])
  const { whites, blacks } = useMemo(() => miniKeyboardLayout(KEYBOARD_ENDS), [])
  const down = new Set(held)
  const tones = new Set(chord?.semis.map(s => (chord.rootPc + s) % 12))
  const lit = (midi: number) => (midi % 12 === keyPc ? 'root' : scale.has(midi % 12) ? 'on' : undefined)
  const marks = (midi: number) => ({ 'data-lit': lit(midi), 'data-chord': tones.has(midi % 12) || undefined, 'data-held': down.has(midi) || undefined, 'data-target': midi === target || undefined })
  const splitAt = whites.findIndex(k => k.midi === SPLIT_NOTE) * 100 / whites.length
  return (
    <div className="xp-mini jam-keys" role="img" aria-label={t`The notes of the scale, lit on the keyboard`}>
      {whites.map(k => <i key={k.midi} {...marks(k.midi)} />)}
      {blacks.map(k => <b key={k.midi} {...marks(k.midi)} style={{ left: `${k.x}%`, width: `${62 / whites.length}%` }} />)}
      {leftHand && <span className="jam-split" style={{ left: `${splitAt}%` }} />}
    </div>
  )
}

function ScaleLine() {
  const scale = useJam(s => s.scale)
  const keyPc = useJam(s => s.keyPc)
  const chord = useJam(s => s.chord)
  const name = useChordName()
  return (
    <div className="jam-scale">
      <span><strong>{`${name(noteName(keyPc))} ${scaleLabel(scale)}`}</strong>{` ${scaleNotes(scale, keyPc).map(name).join(' ')}`}</span>
      {chord && <span><strong>{t`Chord tones`}</strong>{` ${chord.semis.map(s => name(noteName((chord.rootPc + s) % 12))).join(' ')}`}</span>}
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

function ChordBoard({ chord, next }: { chord: JamChord | null; next: JamChord | null }) {
  const name = useChordName()
  const beat = useJam(s => s.beat)
  return (
    <section className="jam-card jam-board">
      <div className="jam-chord">{name(chord?.raw ?? null)}</div>
      <div className="jam-next">{next ? `${t`Next`}: ${name(next.raw)}` : ' '}</div>
      <div className="jam-beats" aria-hidden>{Array.from({ length: BEATS_PER_BAR }, (_, i) => <i key={i} data-on={i === beat || undefined} />)}</div>
    </section>
  )
}

function Live() {
  const chord = useJam(s => s.chord)
  const nextChord = useJam(s => s.nextChord)
  const leftHand = useJam(s => s.leftHand)
  const connected = useStore(s => s.midiDeviceConnected)
  const [target, setTarget] = useState<number | null>(null)
  return (
    <div className="jam-page">
      {!connected && <div role="alert" className="lib-alert jam-alert"><span className="o-dot o-dot-alert" />{t`Your MIDI keyboard is gone. Connect it to keep playing with the band.`}</div>}
      <ChordBoard chord={chord} next={nextChord} />
      <p className="jam-hint">{leftHand ? t`Play a chord below middle C. The band moves to it on the next beat.` : t`The band plays the chords. Solo over them.`}</p>
      <ScaleLine />
      <Keys target={target} />
      <Licks onTarget={setTarget} />
      <Slots />
      <Listening />
      <div className="jam-controls">
        <KeyPicker />
        <ScalePicker />
        <Tempo />
        <button className="o-btn" onClick={stopJam}><Square size={14} fill="currentColor" aria-hidden />{t`Stop`}</button>
      </div>
    </div>
  )
}

function Setup() {
  const style = useJam(s => s.style)
  const connected = useStore(s => s.midiDeviceConnected)
  const [notReady, setNotReady] = useState(false)
  const start = async () => setNotReady(!(await startJam()))
  return (
    <div className="jam-page">
      <h2 className="jam-title">{t`Jam with a band that follows you`}</h2>
      <div className="jam-setup">
        <div className="o-seg jam-wide">
          {STYLE_OPTIONS.map(o => <button key={o.value} aria-pressed={style === o.value} onClick={() => setStyle(o.value)}>{o.label}</button>)}
        </div>
        <div className="jam-controls">
          <KeyPicker />
          <ScalePicker />
          <Tempo />
        </div>
        <LeadChoice />
        <Feel />
        <Slots />
      </div>
      {!connected && <div role="alert" className="lib-alert jam-alert"><span className="o-dot o-dot-alert" />{t`Jam listens to a MIDI keyboard. Connect one to start.`}</div>}
      {notReady && <div role="alert" className="lib-alert jam-alert"><span className="o-dot o-dot-alert" />{t`The sound is still loading. Try again in a moment.`}</div>}
      <button className="o-btn-primary o-btn-lg jam-start" disabled={!connected} onClick={() => void start()}>
        <Play size={16} fill="currentColor" aria-hidden />{t`Start playing`}
      </button>
    </div>
  )
}

// ── Jam: improvise with a band that follows you. Nothing here is ever scored. ──
export default function JamHome() {
  const live = useJam(s => s.live)
  useEffect(() => stopJam, [])
  return live ? <Live /> : <Setup />
}
