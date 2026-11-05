import { Languages, Hash, Radar, ScanEye, Type } from 'lucide-react'
import { useStore } from '../../../store'
import { t } from '../../../utils/i18n'
import type { NoteNaming } from '../../../types'
import { OptionBtn, OptionGroup, SettingsDropdown, EyeClosed, PreviewBox, GlanceLine, SubLabel } from '../controls'
import type { SettingDef } from '../types'
import { followNeedsPick } from '../followPick'

// ── GM groups selectable for "Follow → By group" — same group ids
// TrackPanel.tsx/MixerConsole.tsx sort tracks by, minus 'drums'. ─────────
export const CHORD_FOLLOW_GROUPS = [
  'piano', 'chromatic', 'organ', 'guitar', 'bass',
  'strings', 'ensemble', 'brass', 'reed', 'pipe',
  'synth_lead', 'synth_pad', 'synth_fx', 'ethnic', 'percussive', 'sfx',
]
export function groupLabel(group: string): string {
  return group.split('_').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')
}

const NOTE_NAMING_OPTIONS: { value: NoteNaming; label: string }[] = [
  { value: 'english', label: 'UK/US' },
  { value: 'central-european', label: 'EU' },
  { value: 'solfege', label: 'Solfège' },
]

function DisplaySystemControl() {
  const noteNaming = useStore(s => s.noteNaming)
  const setNoteNaming = useStore(s => s.setNoteNaming)
  return (
    <OptionGroup label={t`Display system`}>
      {NOTE_NAMING_OPTIONS.map(opt => (
        <OptionBtn key={opt.value} active={noteNaming === opt.value} onClick={() => setNoteNaming(opt.value)}>{opt.label}</OptionBtn>
      ))}
      {/* Hide — red when active (hidden is a meaningful state) */}
      <OptionBtn active={noteNaming === 'hidden'} onClick={() => setNoteNaming('hidden')} activeColor="error">
        <span role="img" aria-label={t`Hide note names`} style={{ display: 'inline-flex' }}><EyeClosed size={16} strokeWidth={1.5} /></span>
      </OptionBtn>
    </OptionGroup>
  )
}
function DisplaySystemGlance() {
  const noteNaming = useStore(s => s.noteNaming)
  return (
    <PreviewBox>
      {noteNaming === 'english'          && 'C  D  E  F  G  A  B'}
      {noteNaming === 'central-european' && 'C  D  E  F  G  A  H'}
      {noteNaming === 'solfege'          && 'Do Re Mi Fa Sol La Si'}
      {noteNaming === 'hidden'           && '— labels hidden —'}
    </PreviewBox>
  )
}

function AccidentalsControl() {
  const accidentals = useStore(s => s.accidentals)
  const setAccidentals = useStore(s => s.setAccidentals)
  return (
    <OptionGroup label={t`Accidentals`}>
      <OptionBtn active={accidentals === 'flat'} onClick={() => setAccidentals('flat')}>♭ {t`Flats`}</OptionBtn>
      <OptionBtn active={accidentals === 'sharp'} onClick={() => setAccidentals('sharp')}>♯ {t`Sharps`}</OptionBtn>
    </OptionGroup>
  )
}
function AccidentalsGlance() {
  const accidentals = useStore(s => s.accidentals)
  return <GlanceLine>{accidentals === 'flat' ? 'Bb  Eb  Ab  Db  Gb' : 'A#  D#  G#  C#  F#'}</GlanceLine>
}

function ChordTrackingControl() {
  const mode = useStore(s => s.chordTrackingMode)
  const setMode = useStore(s => s.setChordTrackingMode)
  const chooseFollow = () => {
    setMode('follow')
    const s = useStore.getState()
    // Follow does nothing until something is picked — open the full settings to pick it
    if (followNeedsPick(s)) s.openSettingsWindow('notation')
  }
  return (
    <OptionGroup label={t`Chord tracking`}>
      <OptionBtn active={mode === 'auto'} onClick={() => setMode('auto')}>Auto</OptionBtn>
      <OptionBtn active={mode === 'harmony'} onClick={() => setMode('harmony')}>Harmony</OptionBtn>
      <OptionBtn active={mode === 'follow'} onClick={chooseFollow}>Follow</OptionBtn>
    </OptionGroup>
  )
}
function ChordTrackingGlance() {
  const mode = useStore(s => s.chordTrackingMode)
  return (
    <GlanceLine>
      {mode === 'auto' && 'Follows the chord instruments (piano, keys, guitar, strings), ignoring melody and ornament lines. Best for most songs.'}
      {mode === 'harmony' && 'Every non-drum track pooled together, including melody. For dense textures where no one instrument holds the chords.'}
      {mode === 'follow' && 'Scoped to one instrument or group you choose.'}
    </GlanceLine>
  )
}
function ChordTrackingExtra() {
  const mode = useStore(s => s.chordTrackingMode)
  const subMode = useStore(s => s.chordFollowSubMode)
  const setSubMode = useStore(s => s.setChordFollowSubMode)
  const group = useStore(s => s.chordFollowGroup)
  const setGroup = useStore(s => s.setChordFollowGroup)
  const trackIndex = useStore(s => s.chordFollowTrackIndex)
  const setTrackIndex = useStore(s => s.setChordFollowTrackIndex)
  const tracks = useStore(s => s.tracks)
  if (mode !== 'follow') return null
  return (
    <>
      <SubLabel>{t`Follow`}</SubLabel>
      <div style={{ marginBottom: 8 }}>
        <OptionGroup label={t`Follow`}>
          <OptionBtn active={subMode === 'group'} onClick={() => setSubMode('group')}>By Group</OptionBtn>
          <OptionBtn active={subMode === 'track'} onClick={() => setSubMode('track')}>By Track</OptionBtn>
        </OptionGroup>
      </div>
      {subMode === 'group' ? (
        <SettingsDropdown
          value={group ?? ''}
          onChange={(v) => setGroup(v || null)}
          options={[{ value: '', label: '— choose a group —' }, ...CHORD_FOLLOW_GROUPS.map(g => ({ value: g, label: groupLabel(g) }))]}
        />
      ) : tracks.length === 0 ? (
        <div className="o-note">No file open</div>
      ) : (
        <SettingsDropdown
          value={trackIndex === null ? '' : String(trackIndex)}
          onChange={(v) => setTrackIndex(v === '' ? null : Number(v))}
          options={[{ value: '', label: '— choose a track —' }, ...tracks.map(tr => ({ value: String(tr.index), label: tr.trackName }))]}
        />
      )}
    </>
  )
}

function ChordReadingControl() {
  const mode = useStore(s => s.chordReadingMode)
  const setMode = useStore(s => s.setChordReadingMode)
  return (
    <OptionGroup label={t`Chord reading`}>
      <OptionBtn active={mode === 'safe'} onClick={() => setMode('safe')}>{t`Safe`}</OptionBtn>
      <OptionBtn active={mode === 'progressive'} onClick={() => setMode('progressive')}>{t`Progressive`}</OptionBtn>
    </OptionGroup>
  )
}
function ChordReadingExtra() {
  const mode = useStore(s => s.chordReadingMode)
  return (
    <GlanceLine>
      {mode === 'safe' && t`Only names a chord's extra notes (like a 7th) once they've rung long enough to be sure. The default.`}
      {mode === 'progressive' && t`Also trusts a clean, real grab — several notes struck together, or rolled quickly — to show that extra note right away, even if it's brief. On a few busy songs, switching to this can take a couple of seconds to catch up.`}
    </GlanceLine>
  )
}

function ChordNamingControl() {
  const style = useStore(s => s.chordNamingStyle)
  const setStyle = useStore(s => s.setChordNamingStyle)
  return (
    <OptionGroup label={t`Chord naming`}>
      <OptionBtn active={style === 'abbreviation'} onClick={() => setStyle('abbreviation')}>Abbreviations</OptionBtn>
      <OptionBtn active={style === 'symbol'} onClick={() => setStyle('symbol')}>Symbols</OptionBtn>
    </OptionGroup>
  )
}
function ChordNamingExtra() {
  const style = useStore(s => s.chordNamingStyle)
  return <PreviewBox spacing="0.04em">{style === 'abbreviation' ? 'Bb(b5)/D  ·  Cm7  ·  Gaug  ·  Fdim7' : 'Bb(♭5)/D  ·  Cm7  ·  G+  ·  F°7'}</PreviewBox>
}

export const NOTATION_DEFS: SettingDef[] = [
  { id: 'displaySystem', icon: Languages, kind: 'choice', Control: DisplaySystemControl, Glance: DisplaySystemGlance },
  { id: 'accidentals', icon: Hash, kind: 'choice', Control: AccidentalsControl, Glance: AccidentalsGlance,
    useVisible: () => useStore(s => s.noteNaming) !== 'hidden' },
  { id: 'chordTracking', icon: Radar, kind: 'choice', Control: ChordTrackingControl, Glance: ChordTrackingGlance, Extra: ChordTrackingExtra },
  { id: 'chordReading', icon: ScanEye, kind: 'choice', Control: ChordReadingControl, Extra: ChordReadingExtra },
  { id: 'chordNaming', icon: Type, kind: 'choice', Control: ChordNamingControl, Extra: ChordNamingExtra },
]
