import { useEffect, useState } from 'react'
import { create } from 'zustand'
import { ZoomIn, RotateCcw, Sparkles, MessageSquare, Heart, Hand } from 'lucide-react'
import { useStore } from '../../../store'
import { t } from '../../../utils/i18n'
import { ZoomStepper, GlanceLine, InlineIcon, Switch, useSurface } from '../controls'
import { HAND_PRESETS, DEFAULT_HAND_LH, DEFAULT_HAND_RH, handColorWarnings, isHex, isOwnPair } from '../../../utils/handPalette'
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

// The "Your own" pair outlives picking a ready-made one, here and across restarts
const useOwnPair = create<{ pair: { lh: string; rh: string } | null }>(() => ({ pair: null }))
const OWN_INPUT = 'hand-own-left'

function keepOwnPair(lh: string, rh: string) {
  if (!isOwnPair(lh, rh)) return
  useOwnPair.setState({ pair: { lh, rh } })
  void window.electronAPI.setPrefs({ handColorsOwn: { lh, rh } })
}

function HandTile({ lh, rh, name, note, active, onPick }: { lh: string; rh: string; name: string; note?: string; active: boolean; onPick: () => void }) {
  return (
    <button className="set-tile" onClick={onPick} aria-pressed={active}>
      <HandPair lh={lh} rh={rh} />
      <span className="set-tile-words"><span>{name}</span>{note && <span>{note}</span>}</span>
    </button>
  )
}

function HandPresets() {
  const lh = useStore(s => s.handColorLH), rh = useStore(s => s.handColorRH)
  const own = useOwnPair(s => s.pair)
  useEffect(() => {
    window.electronAPI.getPrefs().then(p => {
      const saved = p.handColorsOwn
      if (useOwnPair.getState().pair) return
      if (isHex(saved?.lh) && isHex(saved?.rh)) useOwnPair.setState({ pair: { lh: saved.lh, rh: saved.rh } })
      else if (isOwnPair(lh, rh)) useOwnPair.setState({ pair: { lh, rh } })
    }).catch(() => {})
  }, [])
  const pickOwn = () => {
    if (own) useStore.getState().setHandColors(own.lh, own.rh)
    document.getElementById(OWN_INPUT)?.focus()
  }
  return (
    <div className="set-presets">
      {HAND_PRESETS.map(p => (
        <HandTile key={p.id} lh={p.lh} rh={p.rh} name={p.name} note={p.note} active={same(p.lh, lh) && same(p.rh, rh)}
          onPick={() => useStore.getState().setHandColors(p.lh, p.rh)} />
      ))}
      <HandTile lh={own?.lh ?? lh} rh={own?.rh ?? rh} name={t`Your own`} note={t`Pick any two`} active={isOwnPair(lh, rh)} onPick={pickOwn} />
    </div>
  )
}

function HandPicker({ id, label, value, onPick }: { id?: string; label: string; value: string; onPick: (hex: string) => void }) {
  const [text, setText] = useState(value)
  useEffect(() => { setText(value) }, [value])
  return (
    <label className="set-hand-pick">
      {label}
      <span className="set-hand-swatch" style={{ background: value }}>
        <input type="color" value={value} onChange={e => onPick(e.target.value)} aria-label={t`${label} colour`}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', border: 'none', padding: 0 }} />
      </span>
      <input id={id} value={text} spellCheck={false} aria-label={t`${label} colour, hex value`}
        onChange={e => { setText(e.target.value); if (isHex(e.target.value)) onPick(e.target.value) }}
        onBlur={() => setText(value)} />
    </label>
  )
}

function HandColorsExtra() {
  const lh = useStore(s => s.handColorLH), rh = useStore(s => s.handColorRH)
  const set = (l: string, r: string) => { useStore.getState().setHandColors(l, r); keepOwnPair(l, r) }
  const warnings = handColorWarnings(lh, rh)
  const isDefault = same(lh, DEFAULT_HAND_LH) && same(rh, DEFAULT_HAND_RH)
  const letters = useStore(s => s.showHandLetters)
  return (
    <>
      <div className="set-hand-picks">
        <HandPicker id={OWN_INPUT} label={t`Left`} value={lh} onPick={hex => set(hex, rh)} />
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
      {!isDefault && <button className="o-link" style={{ alignSelf: 'flex-start', marginTop: 4 }} onClick={() => set(DEFAULT_HAND_LH, DEFAULT_HAND_RH)}>{t`Back to the default colours`}</button>}
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
    Description: () => <>{t`Makes everything in Pliage bigger or smaller. Ctrl + / Ctrl − / Ctrl 0 work exactly as in a web browser.`} {t`Click`} <InlineIcon><RotateCcw size={10} /></InlineIcon> {t`to reset.`}</> },
  {
    id: 'tooltips', icon: MessageSquare, kind: 'switch',
    Control: () => { const v = useStore(s => s.tooltipsEnabled); return <Switch value={v} onChange={useStore.getState().setTooltipsEnabled} label={t`Tooltips`} /> },
  },
  {
    id: 'supportNote', icon: Heart, kind: 'switch', Extra: SupportNotePreview,
    Control: () => { const v = useStore(s => s.supportNoteEnabled); return <Switch value={v} onChange={useStore.getState().setSupportNoteEnabled} label={t`Enjoying Pliage?`} /> },
  },
  {
    id: 'starmap', icon: Sparkles, kind: 'switch',
    Control: () => { const v = useStore(s => s.starmapEnabled); return <Switch value={v} onChange={useStore.getState().setStarmapEnabled} label={t`Starmap`} /> },
  },
]
