import { useEffect, useState, type ReactNode } from 'react'
import { Volume2, Library, Gauge, Plus, Trash2, FileAudio } from 'lucide-react'
import { useStore } from '../../../store'
import { t } from '../../../utils/i18n'
import { OptionBtn, OptionGroup, Switch, HelpText, SubLabel, useSurface } from '../controls'
import { getSamplesSampleRate, getSamplesBufferSec } from '../../../hooks/useSamplesEngine'
import { MarqueeText } from '../../MarqueeText'
import {
  useSoundfontState, useOutputLatency, chooseSamplesFromQuick, selectSoundfont,
  downloadSoundfont, deleteSoundfont, importSoundfont, allSoundfonts,
} from '../../../hooks/useSoundfonts'
import type { SettingDef } from '../types'
import { useNativeAudio, stopNative } from '../../../audio/nativeClient'
import { setLowLatency } from '../../../audio/useNativeEngine'
import { useMidiSettings } from '../../../store/midiSettings'

// Native engine (beta): Windows only for now
export const NATIVE_AVAILABLE = navigator.userAgent.includes('Windows')

const pickGm = async () => { if (useStore.getState().audioEngine === 'native') await stopNative(); useStore.getState().setAudioEngine('gm') }
const pickNative = () => useStore.getState().setAudioEngine('native')

// Window: three big tiles, each filled with its own colour once chosen. Setup: the pill.
function SoundEngineControl() {
  const audioEngine = useStore((s) => s.audioEngine)
  const surface = useSurface()
  if (surface === 'window') {
    const tile = (id: string, name: string, tag: string, what: string, onPick: () => void) => (
      <button key={id} className="set-engine" data-engine={id} aria-pressed={audioEngine === id} onClick={onPick}>
        <span className="set-engine-head"><span>{name}</span><span className="o-tag">{tag}</span></span>
        <span className="set-engine-what">{what}</span>
      </button>
    )
    return (
      <div role="group" aria-label={t`Sound engine`} className="set-engines">
        {tile('gm', 'GM', t`Built in`, t`Generic — sounds like a 1996 Nokia phone`, () => void pickGm())}
        {tile('samples', t`Studio`, t`Sound fonts`, t`Perfect for listening — real recorded instruments`, chooseSamplesFromQuick)}
        {NATIVE_AVAILABLE && tile('native', t`Native`, t`Beta`, t`Ideal for playing along on a connected keyboard`, pickNative)}
      </div>
    )
  }
  return (
    <OptionGroup label={t`Sound engine`}>
      <OptionBtn active={audioEngine === 'gm'} title={t`Generic — sounds like a 1996 Nokia phone`} oneLine onClick={() => void pickGm()}>GM</OptionBtn>
      <OptionBtn active={audioEngine === 'samples'} title={t`Perfect for listening — real recorded instruments`} oneLine onClick={chooseSamplesFromQuick}>{t`Studio`}</OptionBtn>
      {NATIVE_AVAILABLE && <OptionBtn active={audioEngine === 'native'} title={t`Ideal for playing along on a connected keyboard`} oneLine onClick={pickNative}>{t`Native`}</OptionBtn>}
    </OptionGroup>
  )
}

// The system's default output, by name ("Speakers (Realtek(R) Audio)") — what GM and
// Studio play through
function useDefaultOutputName(): string {
  const [name, setName] = useState('')
  useEffect(() => {
    const read = () => navigator.mediaDevices?.enumerateDevices?.().then(list => {
      const d = list.find(x => x.kind === 'audiooutput' && x.deviceId === 'default') ?? list.find(x => x.kind === 'audiooutput')
      // "Default - Speakers (Yeti Stereo Microphone) (b58e:9e84)" → "Speakers (Yeti Stereo Microphone)"
      setName((d?.label ?? '').replace(/^Default - /, '').replace(/\s*\([0-9a-f]{4}:[0-9a-f]{4}\)$/i, ''))
    }).catch(() => {})
    void read()
    navigator.mediaDevices?.addEventListener?.('devicechange', read)
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', read)
  }, [])
  return name
}

const rowStyle = { display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', columnGap: 10, alignItems: 'baseline', marginTop: 4,
  fontSize: 'var(--text-sm)', lineHeight: 1.4 } as const
// `marquee`: a long name (a sound card's) that scrolls into view on hover when it doesn't fit
// `marquee`: the row's text (for content with styling, also pass it as children) —
// when it doesn't fit, it scrolls into view on hover
function InfoRow({ label, children, marquee }: { label: string; children?: ReactNode; marquee?: string }) {
  return (
    <div style={rowStyle}>
      <span style={{ color: 'var(--ui-text-soft)' }}>{label}</span>
      {marquee !== undefined
        ? <div style={{ display: 'flex', minWidth: 0, textAlign: 'right' }}><MarqueeText name={marquee} spanStyle={{ color: 'var(--ui-text)' }}>{children}</MarqueeText></div>
        : <span style={{ color: 'var(--ui-text)', textAlign: 'right', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{children}</span>}
    </div>
  )
}
const amber = (s: ReactNode) => <span style={{ color: 'var(--ui-text)' }}>{s}</span>
const kHz = (rate: number) => `${Math.round(rate / 100) / 10} kHz`
const msOf = (sec: number) => `${Math.round(sec * 1000 * 10) / 10} ms`

// Four rows under the engine buttons, Setup and window, framed like a small
// display: the sound card, how Orfeo uses it, the delay from "play" to
// "heard", and the sound set playing
const glanceBox = { marginTop: 10, background: 'var(--ui-sunken)', borderRadius: 'var(--radius-sm)', padding: '6px 12px 10px' } as const
function SoundEngineGlance() {
  const audioEngine = useStore((s) => s.audioEngine)
  const samplesStatus = useSoundfontState((s) => s.samplesStatus)
  const latencySec = useOutputLatency()
  const defaultName = useDefaultOutputName()
  const gmExternal = useMidiSettings((s) => s.gmOutput)
  const native = useNativeAudio((s) => s.status)
  const phase = useNativeAudio((s) => s.phase)
  const error = useNativeAudio((s) => s.error)
  const wantsExclusive = useMidiSettings((s) => s.nativeExclusive)
  const latency = <InfoRow label={t`Latency`}>{latencySec > 0 ? amber(`${Math.round(latencySec * 1000)} ms`) : '—'}</InfoRow>
  const selectedSoundfont = useStore((s) => s.selectedSoundfont)
  const extraSoundfonts = useSoundfontState((s) => s.extra)
  // GM needs no sound set: its own built-in sounds, or none when it plays an external instrument
  const soundfontName = audioEngine === 'gm'
    ? (gmExternal ? '—' : t`Built-in GM`)
    : allSoundfonts(extraSoundfonts).find(sf => sf.id === selectedSoundfont)?.name ?? selectedSoundfont
  const soundfont = <InfoRow label={t`Soundfont`} marquee={soundfontName}>{amber(soundfontName)}</InfoRow>

  if (audioEngine === 'native') {
    if (phase === 'failed') return <HelpText>{t`Native engine unavailable:`} {error}</HelpText>
    if (phase !== 'running' || !native) return <InfoRow label={t`Sound card`}>{t`starting…`}</InfoRow>
    if (native.mode === 'none') return <div className="set-state"><span className="set-state-title">{t`Native · waiting for a sound card…`}</span></div>
    return (
      <div>
        <div style={glanceBox}>
          <InfoRow label={t`Sound card`} marquee={native.deviceName} />
        <InfoRow label={t`Mode`} marquee={`${native.mode} ${native.rate} ${native.bufferFrames}`}>{native.mode === 'exclusive' ? amber(t`Exclusive (low latency)`) : t`Shared`} · {kHz(native.rate)} · {msOf(native.bufferFrames / native.rate)} {t`buffer`}</InfoRow>
          {latency}
          {soundfont}
        </div>
        {/* Exclusive asked for, but the card couldn't do it: say why */}
        {wantsExclusive && native.mode === 'shared' && native.fallbackReason && <HelpText>{t`Sharing the sound card instead of Exclusive:`} {native.fallbackReason}.</HelpText>}
      </div>
    )
  }
  const rate = getSamplesSampleRate(), buffer = getSamplesBufferSec()
  return (
    <div style={glanceBox}>
      <InfoRow label={t`Sound card`} marquee={audioEngine === 'gm' && gmExternal ? gmExternal : defaultName || t`Default output`} />
      <InfoRow label={t`Mode`} marquee={`${audioEngine} ${gmExternal} ${samplesStatus} ${rate} ${buffer}`}>{audioEngine === 'gm' && gmExternal ? t`External instrument` : <>{t`Shared`}{audioEngine === 'samples' && samplesStatus === 'ready' && rate > 0 && <> · {kHz(rate)}{buffer > 0 && <> · {msOf(buffer)} {t`buffer`}</>}</>}</>}</InfoRow>
      {latency}
      {soundfont}
    </div>
  )
}

// What the chosen engine is — only that one
function SoundEngineDescription() {
  const audioEngine = useStore((s) => s.audioEngine)
  if (audioEngine === 'gm') return <>{t`The simple synth built into Orfeo: light, always ready, no sound set needed. It sounds basic — good for slow computers, or for playing through an external instrument (MIDI Keyboard › General MIDI sound).`}</>
  if (audioEngine === 'native') return <>{t`The same sound sets as Studio, played by Orfeo's own engine straight to your sound card: the shortest delay from key to sound. Windows only.`}</>
  return <>{t`Real recorded instruments from a sound set (choose it under Sound Fonts). Plays through the system's mixer like any other app, with its usual delay.`}</>
}

// Native's Low latency mode: Shared (default) or Exclusive. A keyboard plugged in
// switches to Exclusive by itself unless that's turned off (MIDI Keyboard ›
// Sound & Latency); a choice made here holds until the next keyboard change.
function LowLatencyButtons() {
  const exclusive = useMidiSettings((s) => s.nativeExclusive)
  return (
    <>
      <SubLabel>{t`Low latency mode`}</SubLabel>
      <OptionGroup label={t`Low latency mode`}>
        <OptionBtn active={!exclusive} onClick={() => setLowLatency(false)}>{t`Shared`}</OptionBtn>
        <OptionBtn active={exclusive} onClick={() => setLowLatency(true)}>{t`Exclusive`}</OptionBtn>
      </OptionGroup>
    </>
  )
}
function LowLatencyMode() {
  const exclusive = useMidiSettings((s) => s.nativeExclusive)
  const autoLow = useMidiSettings((s) => s.autoLowLatency)
  return (
    <div className="theme-studio set-strip">
      <div style={{ flex: 1, minWidth: 220 }}>
      <HelpText>{exclusive
        ? t`Orfeo talks to your sound card directly, past Windows' mixer: the shortest delay from key to sound. Recommended when the delay between pressing a key and hearing it feels uncomfortable.`
        : t`Orfeo shares the sound card with everything else, so you still hear YouTube, video calls and other apps alongside it. Windows adds its usual delay between key and sound.`}</HelpText>
      {exclusive && <HelpText>{t`Orfeo takes over the whole sound card: other apps stay silent while Orfeo is open.`}</HelpText>}
      {autoLow && <HelpText>{t`Switches to Exclusive by itself when you plug in a keyboard — change that under MIDI Keyboard › Sound & Latency.`}</HelpText>}
      </div>
      <div><LowLatencyButtons /></div>
    </div>
  )
}

// Window only: loading progress, then Low latency mode (Native)
function SoundEngineExtra() {
  const audioEngine = useStore((s) => s.audioEngine)
  return (
    <>
      <SoundEngineLoading />
      {audioEngine === 'native' && <LowLatencyMode />}
    </>
  )
}
// Setup only: the Low latency mode buttons (Native)
function SoundEngineQuickExtra() {
  const audioEngine = useStore((s) => s.audioEngine)
  return (
    <>
      <SoundEngineLoading />
      {audioEngine === 'native' && <LowLatencyButtons />}
    </>
  )
}
function SoundEngineLoading() {
  const samplesStatus = useSoundfontState((s) => s.samplesStatus)
  const samplesProgress = useSoundfontState((s) => s.samplesProgress)
  if (samplesStatus !== 'loading') return null
  const percent = Math.round(samplesProgress * 100)
  return (
    <div className="set-state">
      <span className="set-state-title">{t`Loading sound font… ${percent}%`}</span>
      <span className="o-progress" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label={t`Loading sound font`}><span style={{ width: `${percent}%` }} /></span>
    </div>
  )
}

// The sound-set library (Samples and Native) — dimmed + inert while General MIDI is active
function SoundFontRow({ sf }: { sf: ReturnType<typeof allSoundfonts>[number] }) {
  const selected = useStore((s) => s.selectedSoundfont) === sf.id
  const progress = useSoundfontState((s) => s.downloads[sf.id])
  const bundled = sf.id === 'generaluser-gs'
  const percent = Math.round((progress ?? 0) * 100)
  return (
    <div className="set-font" data-on={selected || undefined}>
      <button role="radio" aria-checked={selected} aria-label={t`Use ${sf.name}`} disabled={!sf.downloaded} onClick={() => void selectSoundfont(sf.id)}><span /></button>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className="set-font-name">{sf.name}</span>
        <span className="set-font-meta">{progress !== undefined ? t`Downloading… ${percent}%` : `${sf.sizeMB} MB`}</span>
        {progress !== undefined && <span className="o-progress" style={{ maxWidth: 260, marginTop: 4 }}><span style={{ width: `${percent}%` }} /></span>}
      </span>
      {bundled ? <span className="o-tag">{t`Comes with Orfeo`}</span>
        : sf.custom ? <span className="o-tag" style={{ background: 'var(--paint-blue)' }}>{t`Imported`}</span>
        : sf.downloaded ? <span className="o-tag">{t`Downloaded`}</span>
        : progress === undefined ? <button className="o-btn" onClick={() => void downloadSoundfont(sf.id)}>{t`Download`}</button> : null}
      {!bundled && sf.downloaded && (
        <button className="o-icon-quiet" aria-label={sf.custom ? t`Remove imported file ${sf.name}` : t`Delete downloaded file ${sf.name}`} onClick={() => void deleteSoundfont(sf.id)}><Trash2 size={18} strokeWidth={1.8} /></button>
      )}
    </div>
  )
}

function SoundFontsControl() {
  const gm = useStore((s) => s.audioEngine) === 'gm'
  const extra = useSoundfontState((s) => s.extra)
  const error = useSoundfontState((s) => s.error)
  return (
    <div style={{ opacity: gm ? 0.45 : 1, pointerEvents: gm ? 'none' : 'auto', transition: 'opacity 0.15s' }}>
      <div role="radiogroup" aria-label={t`Sound font in use`} className="set-fonts">
        {allSoundfonts(extra).map(sf => <SoundFontRow key={sf.id} sf={sf} />)}
      </div>
      {error && <div style={{ fontSize: 'var(--text-sm)', color: 'var(--status-error)', marginTop: 6 }}>{error}</div>}
      <HelpText>{t`Make sure you have the rights to use imported soundfonts.`}</HelpText>
    </div>
  )
}
function ImportSoundFont() {
  const gm = useStore((s) => s.audioEngine) === 'gm'
  return <button className="o-btn-primary" disabled={gm} onClick={() => void importSoundfont()}><Plus size={16} strokeWidth={2} />{t`Import .sf2 or .sf3`}</button>
}

export const AUDIO_DEFS: SettingDef[] = [
  { id: 'soundEngine', icon: Volume2, kind: 'choice', layout: 'controlFirst', wide: true, Description: SoundEngineDescription,
    Control: SoundEngineControl, Glance: SoundEngineGlance, Extra: SoundEngineExtra, QuickExtra: SoundEngineQuickExtra },
  { id: 'soundFonts', icon: Library, kind: 'choice', wide: true, Control: SoundFontsControl, HeadAction: ImportSoundFont },
  {
    id: 'autoLevel', icon: Gauge, kind: 'switch',
    Control: () => { const v = useStore(s => s.autoLevelOnLoad); return <Switch value={v} onChange={useStore.getState().setAutoLevelOnLoad} label="Auto-Level on Load" /> },
  },
  {
    id: 'exportAudio', icon: FileAudio, kind: 'switch',
    Control: () => { const v = useStore(s => s.exportAudioEnabled); return <Switch value={v} onChange={useStore.getState().setExportAudioEnabled} label={t`Export to audio`} /> },
  },
]
