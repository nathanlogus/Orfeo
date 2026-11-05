import { useEffect, useState } from 'react'
import { ZoomIn, RotateCcw, Sparkles, MessageSquare, Heart, Hand } from 'lucide-react'
import { useStore } from '../../../store'
import { t } from '../../../utils/i18n'
import { ZoomStepper, GlanceLine, InlineIcon, Switch, SubLabel, useSurface } from '../controls'
import { HAND_PRESETS, DEFAULT_HAND_LH, DEFAULT_HAND_RH, handColorWarnings, isHex } from '../../../utils/handPalette'
import { useAppZoom } from '../../../hooks/useAppZoom'
import { simAvailable } from '../../../utils/midiSimulator'
import { previewNewVersion } from '../../../hooks/useUpdateCheck'
import { previewSupportNote } from '../../../hooks/useSupportNote'
import type { SettingDef } from '../types'

function AppZoomControl() {
  const z = useAppZoom()
  // tooltips in Setup only — the window card explains the buttons in text
  const surface = useSurface()
  return <ZoomStepper percent={z.percent} steps={z.steps} max={z.max} onStep={z.step} onReset={z.reset} tooltips={surface === 'setup'} />
}
function AppZoomGlance() {
  const z = useAppZoom()
  return (
    <GlanceLine>
      {t`Ctrl + / Ctrl − / Ctrl 0 — like a web browser`}
      {z.max < 200 && <>{' · '}{t`Limited to ${z.max}% at this window size.`}</>}
    </GlanceLine>
  )
}

// Window card: the description already gives the shortcuts — only the size cap
function AppZoomCap() {
  const z = useAppZoom()
  if (z.max >= 200) return null
  return <GlanceLine>{t`Limited to ${z.max}% at this window size.`}</GlanceLine>
}

// ── Hand colours — ready-made pairs (Control), then your own pair, a preview,
// clash notes and reset (Extra). Every change applies at once (store → CSS vars).
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

function HandPair({ lh, rh }: { lh: string; rh: string }) {
  return <span className="set-pair" aria-hidden><span style={{ background: lh }} /><span style={{ background: rh }} /></span>
}

function HandPresets() {
  const lh = useStore(s => s.handColorLH), rh = useStore(s => s.handColorRH)
  return (
    <div className="set-presets">
      {HAND_PRESETS.map(p => {
        const active = same(p.lh, lh) && same(p.rh, rh)
        return (
          <button key={p.id} className="set-tile" onClick={() => useStore.getState().setHandColors(p.lh, p.rh)} aria-pressed={active}>
            <HandPair lh={p.lh} rh={p.rh} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
          </button>
        )
      })}
    </div>
  )
}

function HandPicker({ label, value, onPick }: { label: string; value: string; onPick: (hex: string) => void }) {
  const [text, setText] = useState(value)
  useEffect(() => { setText(value) }, [value])
  return (
    <label className="set-hand-pick">
      {label}
      <span className="set-hand-swatch" style={{ background: value }}>
        <input type="color" value={value} onChange={e => onPick(e.target.value)} aria-label={t`${label} colour`}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', border: 'none', padding: 0 }} />
      </span>
      <input value={text} spellCheck={false} aria-label={t`${label} colour, hex value`}
        onChange={e => { setText(e.target.value); if (isHex(e.target.value)) onPick(e.target.value) }}
        onBlur={() => setText(value)} />
    </label>
  )
}

function HandColorsExtra() {
  const lh = useStore(s => s.handColorLH), rh = useStore(s => s.handColorRH)
  const set = useStore.getState().setHandColors
  const warnings = handColorWarnings(lh, rh)
  const isDefault = same(lh, DEFAULT_HAND_LH) && same(rh, DEFAULT_HAND_RH)
  const letters = useStore(s => s.showHandLetters)
  return (
    <>
      <SubLabel>{t`Your own`}</SubLabel>
      <div className="set-hand-picks">
        <HandPicker label={t`Left`} value={lh} onPick={hex => set(hex, rh)} />
        <HandPicker label={t`Right`} value={rh} onPick={hex => set(lh, hex)} />
      </div>
      <div className="set-hand-preview" role="img" aria-label={t`Preview of the hand colours on falling notes and keys`}>
        <i style={{ left: '8%', top: 14, height: 56, background: lh }} />
        <i style={{ left: '16%', top: 38, height: 32, background: lh }} />
        <i style={{ left: '62%', top: 8, height: 42, background: rh }} />
        <i style={{ left: '70%', top: 26, height: 44, background: rh }} />
        <div className="set-hand-keys">
          {Array.from({ length: 14 }, (_, k) => <b key={k} style={k === 1 ? { background: lh } : k === 9 ? { background: rh } : undefined}>{letters && k === 1 ? 'L' : letters && k === 9 ? 'R' : ''}</b>)}
        </div>
      </div>
      {warnings.map(w => <GlanceLine key={w}>⚠ {w}</GlanceLine>)}
      <div className="set-row">
        <span>{t`Show L and R letters on hand-coloured keys`}</span>
        <Switch value={letters} onChange={useStore.getState().setShowHandLetters} label={t`Hand tags`} />
      </div>
      {!isDefault && <button className="o-link" style={{ alignSelf: 'flex-start', marginTop: 4 }} onClick={() => set(DEFAULT_HAND_LH, DEFAULT_HAND_RH)}>{t`Back to Orfeo's colours`}</button>}
    </>
  )
}

// Test builds: see either version's note now instead of on the 5th launch
function SupportNotePreview() {
  if (!simAvailable) return null
  const btn = (label: string, store: boolean) => <button onClick={() => previewSupportNote(store)}>{label}</button>
  return (
    <div className="set-dev">
      <div>{t`Preview · test builds only`}</div>
      <div className="set-dev-btns">
        {btn(t`Show note`, false)}
        {btn(t`Microsoft Store version`, true)}
        <button onClick={previewNewVersion}>{t`New version dot`}</button>
      </div>
    </div>
  )
}

export const APPEARANCE_DEFS: SettingDef[] = [
  { id: 'handColors', icon: Hand, kind: 'choice', wide: true, Control: HandPresets, Extra: HandColorsExtra },
  { id: 'appZoom', icon: ZoomIn, kind: 'inline', Control: AppZoomControl, Glance: AppZoomGlance, glanceQuickOnly: true, Extra: AppZoomCap,
    Description: () => <>{t`Makes everything in Orfeo bigger or smaller. Ctrl + / Ctrl − / Ctrl 0 work exactly as in a web browser.`} {t`Click`} <InlineIcon><RotateCcw size={10} /></InlineIcon> {t`to reset.`}</> },
  {
    id: 'tooltips', icon: MessageSquare, kind: 'switch',
    Control: () => { const v = useStore(s => s.tooltipsEnabled); return <Switch value={v} onChange={useStore.getState().setTooltipsEnabled} label={t`Tooltips`} /> },
  },
  {
    id: 'supportNote', icon: Heart, kind: 'switch', Extra: SupportNotePreview,
    Control: () => { const v = useStore(s => s.supportNoteEnabled); return <Switch value={v} onChange={useStore.getState().setSupportNoteEnabled} label={t`Enjoying Orfeo?`} /> },
  },
  {
    id: 'starmap', icon: Sparkles, kind: 'switch',
    Control: () => { const v = useStore(s => s.starmapEnabled); return <Switch value={v} onChange={useStore.getState().setStarmapEnabled} label={t`Starmap`} /> },
  },
]
