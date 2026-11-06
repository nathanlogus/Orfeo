import { useEffect, useMemo, useState } from 'react'
import { Minus, Play, Plus, Square } from 'lucide-react'
import '../styles/redesign-tools.css'
import './jam.css'
import { useStore } from '../store'
import { t } from '../utils/i18n'
import { localizeChord } from '../utils/chordDetection'
import { miniKeyboardLayout } from '../utils/miniKeyboard'
import { SettingsDropdown } from '../components/Settings/controls'
import { BEATS_PER_BAR, noteName, scalePitchClasses, type JamChord, type JamPart, type JamStyle } from './band'
import { MAX_BPM, MIN_BPM, SPLIT_NOTE, setBpm, setKey, setLeftHand, setPart, setStyle, startJam, stopJam, useJam } from './jamSession'

const STYLE_OPTIONS: { value: JamStyle; label: string }[] = [
  { value: 'blues', label: t`Blues` },
  { value: 'jazz', label: t`Jazz` },
  { value: 'pop', label: t`Pop` },
  { value: 'rock', label: t`Rock` },
]
const PART_OPTIONS: { value: JamPart; label: string }[] = [
  { value: 'drums', label: t`Drums` },
  { value: 'bass', label: t`Bass` },
  { value: 'comp', label: t`Keys` },
]
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

function Parts() {
  const parts = useJam(s => s.parts)
  const beat = useJam(s => s.beat)
  const live = useJam(s => s.live)
  return (
    <div className="jam-band">
      {PART_OPTIONS.map(p => (
        <button key={p.value} className="jam-member" aria-pressed={parts[p.value]} onClick={() => setPart(p.value, !parts[p.value])}>
          <span className="o-dot" data-on={parts[p.value] || undefined} />
          <span>{p.label}</span>
          {live && parts[p.value] && <span key={beat} className="jam-pulse" aria-hidden />}
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

function Keys() {
  const style = useJam(s => s.style)
  const keyPc = useJam(s => s.keyPc)
  const held = useJam(s => s.held)
  const leftHand = useJam(s => s.leftHand)
  const scale = useMemo(() => scalePitchClasses(style, keyPc), [style, keyPc])
  const { whites, blacks } = useMemo(() => miniKeyboardLayout(KEYBOARD_ENDS), [])
  const down = new Set(held)
  const lit = (midi: number) => (midi % 12 === keyPc ? 'root' : scale.has(midi % 12) ? 'on' : undefined)
  const splitAt = whites.findIndex(k => k.midi === SPLIT_NOTE) * 100 / whites.length
  return (
    <div className="xp-mini jam-keys" role="img" aria-label={t`The notes of the scale, lit on the keyboard`}>
      {whites.map(k => <i key={k.midi} data-lit={lit(k.midi)} data-held={down.has(k.midi) || undefined} />)}
      {blacks.map(k => <b key={k.midi} data-lit={lit(k.midi)} data-held={down.has(k.midi) || undefined} style={{ left: `${k.x}%`, width: `${62 / whites.length}%` }} />)}
      {leftHand && <span className="jam-split" style={{ left: `${splitAt}%` }} />}
    </div>
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
  return (
    <div className="jam-page">
      {!connected && <div role="alert" className="lib-alert jam-alert"><span className="o-dot o-dot-alert" />{t`Your MIDI keyboard is gone. Connect it to keep playing with the band.`}</div>}
      <ChordBoard chord={chord} next={nextChord} />
      <p className="jam-hint">{leftHand ? t`Play a chord below middle C. The band moves to it on the next beat.` : t`The band plays the chords. Solo over them.`}</p>
      <Keys />
      <Parts />
      <Listening />
      <div className="jam-controls">
        <KeyPicker />
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
          <Tempo />
        </div>
        <LeadChoice />
        <Parts />
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
