import { useState, useRef, useEffect, createContext, useContext, type ReactNode } from 'react'
import {
  ChevronDown, ChevronLeft, ChevronRight, Palette, ZoomIn, ZoomOut, RotateCcw, CloudDownload, Star,
} from 'lucide-react'
import { useStore } from '../../store'
import { TRACK_COLOR_PALETTE } from '../../utils/colors'
import Tooltip, { useTooltip } from '../Tooltip'
import { useUpdateState, pressUpdateButton } from '../../hooks/useUpdateCheck'
import { useSupportNote, requestStoreReview } from '../../hooks/useSupportNote'
import { t } from '../../utils/i18n'
import { simAvailable } from '../../utils/midiSimulator'

// ── Which panel a control is drawn in — Setup (the drawer) or the Settings
// window — for the few controls that differ between the two. ─────────────
export const SurfaceContext = createContext<'setup' | 'window'>('window')
export const useSurface = () => useContext(SurfaceContext)

// ── Shared settings controls — used by the Settings window cards and the
// drawer's Quick Settings rows (moved out of SettingsPanel.tsx unchanged,
// plus the small pieces both surfaces need). ─────────────────────────────

// ── EyeClosed — custom icon replacing lucide EyeOff throughout settings ───────
export function EyeClosed({ size = 24, strokeWidth = 2 }: { size?: number; strokeWidth?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round">
      <path d="m15 18-.722-3.25"/>
      <path d="M2 8a10.645 10.645 0 0 0 20 0"/>
      <path d="m20 15-1.726-2.05"/>
      <path d="m4 15 1.726-2.05"/>
      <path d="m9 18 .722-3.25"/>
    </svg>
  )
}

// ── BETA badge — inline label pill for settings still being refined ──────────
export function BetaBadge() {
  return (
    <span className="o-tag" style={{ flexShrink: 0, background: 'var(--paint-rose)', fontSize: 'var(--text-xs)', lineHeight: 1.2 }}>
      Beta
    </span>
  )
}

// ── Collapsible section — clickable header row (icon + label + chevron) that
// mounts/unmounts children.
export function CollapsibleSection({ icon, label, defaultCollapsed = false, collapsed: controlledCollapsed, onToggle, action, children }: {
  icon: React.ReactNode
  label: string
  // ── Optional button before the chevron (Quick Settings' gear) — its clicks
  // never fold the group. ──
  action?: React.ReactNode
  defaultCollapsed?: boolean
  collapsed?: boolean
  onToggle?: () => void
  children: React.ReactNode
}) {
  const [internalCollapsed, setInternalCollapsed] = useState(defaultCollapsed)
  const isControlled = controlledCollapsed !== undefined
  const collapsed = isControlled ? controlledCollapsed : internalCollapsed
  const toggle = isControlled ? (onToggle ?? (() => {})) : () => setInternalCollapsed(c => !c)

  return (
    <div>
      {/* ── Header row — click anywhere to expand/collapse ── */}
      <div onClick={toggle} className="o-group-head">
        <span style={{ display: 'flex', alignItems: 'center' }}>{icon}</span>
        <span style={{ flex: 1 }}>{label}</span>
        {action && <span onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center' }}>{action}</span>}
        {/* ── Chevron — down = expanded, right = collapsed ── */}
        {collapsed
          ? <ChevronRight size={14} style={{ flexShrink: 0 }} />
          : <ChevronDown  size={14} style={{ flexShrink: 0 }} />
        }
      </div>
      {/* ── Content — unmounted when collapsed ── */}
      {!collapsed && children}
    </div>
  )
}

// ── Option button — one choice of a multi-choice setting. Wrap a row of them in
// <OptionGroup> for the design's segmented pill; alone, each is its own pill.
// activeColor: 'accent' (default) | 'error' (used for Hide/EyeOff)
export function OptionBtn({ active, onClick, children, title, oneLine, comingSoon, activeColor = 'accent' }: {
  active: boolean; onClick: () => void; children: React.ReactNode
  title?: string; oneLine?: boolean; comingSoon?: boolean; activeColor?: 'accent' | 'error'
}) {
  const btn = (
    <button
      className="o-option"
      aria-pressed={active}
      data-tone={activeColor === 'error' ? 'error' : undefined}
      disabled={comingSoon}
      onClick={onClick}
    >
      {children}
    </button>
  )
  // title is optional and per-call-site free text (sometimes just a short
  // hint, sometimes a longer explanation) — wrap only when present, and
  // reuse it as the tooltip's own title verbatim rather than inventing a
  // separate description, since callers already wrote it as one clause.
  return title ? <Tooltip title={title} oneLine={oneLine} wrapperStyle={{ flex: 1 }}>{btn}</Tooltip> : btn
}

// ── OptionGroup — the segmented pill around a row of OptionBtn ───────────────
export function OptionGroup({ label, children }: { label: string; children: ReactNode }) {
  return <div role="group" aria-label={label} className="o-seg">{children}</div>
}

// ── FingerStepper — compact "< 4 >" toggle between the only two valid max-
// finger values (4/5). Replaces two full-width OptionBtn pills with a
// single small control, ~1/3 the footprint. ────────────────────────────────
export function FingerStepper({ value, onChange }: { value: 4 | 5; onChange: (v: 4 | 5) => void }) {
  return (
    <div className="o-stepper">
      <button className="o-step o-step-plain" aria-label="4 fingers" onClick={() => onChange(4)} disabled={value === 4}><ChevronLeft size={14} /></button>
      <span className="o-stepper-value" style={{ minWidth: 12 }}>{value}</span>
      <button className="o-step o-step-plain" aria-label="5 fingers" onClick={() => onChange(5)} disabled={value === 5}><ChevronRight size={14} /></button>
    </div>
  )
}

// ── ZoomStepper — app zoom control (Settings → Appearance), same compact
// bordered-pill shape as FingerStepper above. `percent`/`steps`/`max` come
// from electron/main.ts (the one place that actually owns and persists the
// zoom level) via SettingsPanel's zoomInfo state — this is purely a
// display + dispatch component, same division of responsibility as the
// Ctrl +/-/0 shortcuts it stays in sync with. ──────────────────────────────
// the Settings window explains the zoom buttons in text, so no tooltips there
function MaybeTip({ on, title, children }: { on: boolean; title: string; children: React.ReactElement }) {
  return on ? <Tooltip title={title} oneLine>{children}</Tooltip> : children
}

export function ZoomStepper({ percent, steps, max, onStep, onReset, tooltips = true }: {
  percent: number; steps: number[]; max: number
  onStep: (direction: 1 | -1) => void; onReset: () => void
  tooltips?: boolean
}) {
  const atMin = percent <= steps[0]
  const atMax = percent >= max
  return (
    <div className="o-stepper">
      <MaybeTip on={tooltips} title="Zoom out">
        <button className="o-step" aria-label="Zoom out" onClick={() => onStep(-1)} disabled={atMin}><ZoomOut size={14} strokeWidth={1.5} /></button>
      </MaybeTip>
      <span className="o-stepper-value">{percent}%</span>
      <MaybeTip on={tooltips} title="Zoom in">
        <button className="o-step" aria-label="Zoom in" onClick={() => onStep(1)} disabled={atMax}><ZoomIn size={14} strokeWidth={1.5} /></button>
      </MaybeTip>
      <MaybeTip on={tooltips} title="Reset to 100%">
        <button className="o-step o-step-plain" aria-label="Reset to 100%" onClick={onReset} disabled={percent === 100}><RotateCcw size={14} strokeWidth={1.5} /></button>
      </MaybeTip>
    </div>
  )
}

// ─── Hit-effect color picker — swatch trigger + in-app popover (hex + palette).
// Deliberately NOT a native <input type="color"> — that opens an OS-level dialog
// which was blurring the app window and closing the whole Settings drawer out
// from under it. Self-contained popover with its own outside-click/Escape close,
// same approach as MidiEditor's track ColorPopover. ─────────────────────────────
export function HitEffectColorSwatch({ color, onChange }: { color: string | null; onChange: (c: string) => void }) {
  const [open, setOpen] = useState(false)
  const [hexInput, setHexInput] = useState(color ?? '#e8a027')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('mousedown', handleDown)
    window.addEventListener('keydown', handleKey)
    return () => { window.removeEventListener('mousedown', handleDown); window.removeEventListener('keydown', handleKey) }
  }, [open])

  const commitHex = (v: string) => {
    setHexInput(v)
    if (/^#[0-9a-fA-F]{6}$/.test(v)) onChange(v)
  }

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <Tooltip
        title="Particle color"
        description="Overrides every track's color for the effect flourish — the falling notes and key glow keep their own track colors."
      >
      <button
        onClick={() => { setHexInput(color ?? '#e8a027'); setOpen(o => !o) }}
        style={{
          display: 'flex', alignItems: 'center', gap: 5, padding: 0, marginLeft: 6,
          border: 'none', background: 'none', cursor: 'pointer',
        }}
      >
        <Palette size={14} strokeWidth={1.5} style={{ color: 'var(--ui-text)', flexShrink: 0 }} />
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--ui-text-soft)', whiteSpace: 'nowrap' }}>Color</span>
        <span style={{
          width: 14, height: 14, borderRadius: 3, flexShrink: 0,
          background: color ?? 'var(--hand-lh)',
          border: '1px solid var(--ui-line)',
        }} />
      </button>
      </Tooltip>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 20,
          background: 'var(--ui-surface)', border: '1px solid var(--ui-line)', borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--elevation-popover)', padding: 10, width: 150,
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4 }}>
            {TRACK_COLOR_PALETTE.map(c => (
              <div
                key={c}
                onClick={() => { commitHex(c); onChange(c) }}
                style={{
                  height: 22, background: c, borderRadius: 3, cursor: 'pointer', boxSizing: 'border-box',
                  border: `2px solid ${c.toLowerCase() === color?.toLowerCase() ? 'var(--ui-text)' : 'transparent'}`,
                }}
              />
            ))}
          </div>
          <input
            value={hexInput}
            onChange={e => commitHex(e.target.value)}
            placeholder="#e8a027"
            aria-label="Hit-effect color, hex value"
            style={{
              width: '100%', padding: '4px 6px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--ui-line)',
              background: 'var(--bg-field)', color: 'var(--ui-text)', fontSize: 'var(--text-xs)',
              fontFamily: 'var(--font-code)', boxSizing: 'border-box',
            }}
          />
        </div>
      )}
    </div>
  )
}

// ── SoundfontActionLink — the "remove"/"download" text links in the Sound
// Fonts catalog grid. Each row is a `display:'contents'` div so its 3 cells
// land as direct CSS Grid items — wrapping the link in `<Tooltip>` (a real
// div) would break that passthrough, and even `wrapperStyle={{display:
// 'contents'}}` doesn't work as a fix, since a `display:contents` element
// has no box of its own, so its `getBoundingClientRect()` degenerates to a
// zero-sized rect at the window's origin (tooltip renders in the top-left
// corner). `useTooltip` sidesteps this entirely: no wrapper, ref/hover go
// straight on the real `<button>`, which stays the grid's direct child. ────
export function SoundfontActionLink({ label, tooltip, color, onClick }: {
  label: string; tooltip: string; color: string; onClick: () => void
}) {
  const tt = useTooltip<HTMLButtonElement>({ title: tooltip }, { oneLine: true })
  return (
    <>
      <button
        ref={tt.ref}
        onMouseEnter={tt.onMouseEnter}
        onMouseLeave={tt.onMouseLeave}
        onClick={onClick}
        className="o-link"
        style={{ color, fontSize: 'var(--text-xs)', textAlign: 'right' }}
      >{label}</button>
      {tt.box}
    </>
  )
}

// ── SettingsDropdown — custom popover replacing native <select> ───────────────
// Native <select> option lists render via the OS (Windows' own blue-hover
// scheme on Chromium) and can't be restyled with CSS.
export function SettingsDropdown<T extends string>({ value, options, onChange, title }: {
  value: T
  options: { value: T; label: string; title?: string }[]
  onChange: (v: T) => void
  title?: string
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const selected = options.find(o => o.value === value)

  const trigger = (
    <button
      type="button"
      onClick={() => setOpen(v => !v)}
      aria-haspopup="listbox"
      aria-expanded={open}
      className="o-select"
    >
      <span>{selected?.label ?? value}</span>
      <ChevronDown size={14} style={{ flexShrink: 0 }} />
    </button>
  )

  return (
    <div ref={wrapRef} style={{ position: 'relative', marginBottom: 8 }}>
      {title ? <Tooltip title={title} wrapperStyle={{ display: 'block', width: '100%' }}>{trigger}</Tooltip> : trigger}
      {open && (
        <div
          role="listbox"
          aria-label={title}
          onMouseDown={e => e.stopPropagation()}
          className="o-select-list"
        >
          {options.map(o => {
            const row = (
              <div
                key={o.title ? undefined : o.value}
                role="option"
                aria-selected={o.value === value}
                onClick={() => { onChange(o.value); setOpen(false) }}
                className="o-select-item"
              >
                {o.label}
              </div>
            )
            return o.title
              ? <Tooltip key={o.value} title={o.title} wrapperStyle={{ display: 'block', width: '100%' }}>{row}</Tooltip>
              : row
          })}
        </div>
      )}
    </div>
  )
}

// ── Zoom step button — small +/− stepper for discrete-increment controls ──
export function ZoomStepBtn({ onClick, disabled, children }: {
  onClick: () => void; disabled: boolean; children: React.ReactNode
}) {
  return (
    <button className="o-step" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  )
}

// ── Switch — every on/off setting (was inline in OptionRow)
export function Switch({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={value} aria-label={label} onClick={() => onChange(!value)} className="o-switch">
      <span />
    </button>
  )
}

// ── Small icon inside running text ("Click ⟲ to loop")
export function InlineIcon({ children }: { children: ReactNode }) {
  return <span style={{ display: 'inline-flex', verticalAlign: '-2px', margin: '0 2px', color: 'var(--ui-text)' }}>{children}</span>
}

// ── At-a-glance line under a control (dim) — Quick Settings + window
export function GlanceLine({ children, center }: { children: ReactNode; center?: boolean }) {
  return <div style={{ marginTop: 5, fontSize: 'var(--text-xs)', color: 'var(--ui-text-soft)', lineHeight: 1.4, textAlign: center ? 'center' : 'left' }}>{children}</div>
}

// ── Preview strip (note names, chord spellings) — same look as before
export function PreviewBox({ children, spacing = '0.08em' }: { children: ReactNode; spacing?: string }) {
  return <div style={{ marginTop: 6, padding: '4px 8px', background: 'var(--ui-sunken)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-xs)', color: 'var(--ui-text-soft)', letterSpacing: spacing, textAlign: 'center' }}>{children}</div>
}

// ── Label for follow-up options inside a card
export function SubLabel({ children }: { children: ReactNode }) {
  return <div style={{ marginTop: 10, marginBottom: 6, fontSize: 'var(--text-sm)', color: 'var(--ui-text-soft)' }}>{children}</div>
}

// ── Helper text inside a card's follow-up options
export function HelpText({ children }: { children: ReactNode }) {
  return <div style={{ marginTop: 6, fontSize: 'var(--text-sm)', color: 'var(--ui-text-soft)', lineHeight: 1.35 }}>{children}</div>
}

// ── Piano-roll zoom — − / step dots / + (moved from the drawer unchanged)
export const ROLL_ZOOM_STEPS = [0.5, 0.75, 1, 1.5, 2, 3]
export function RollZoomStepper() {
  const zoomLevel = useStore((s) => s.zoomLevel)
  const setZoomLevel = useStore((s) => s.setZoomLevel)
  const ZOOM_STEPS = ROLL_ZOOM_STEPS
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
      <ZoomStepBtn
        disabled={zoomLevel <= ZOOM_STEPS[0]}
        onClick={() => { const i = ZOOM_STEPS.indexOf(zoomLevel); if (i > 0) setZoomLevel(ZOOM_STEPS[i - 1]) }}
      >−</ZoomStepBtn>
      <div style={{ flex: 1, position: 'relative', height: 4, background: 'var(--border)', borderRadius: 2 }}>
        <div style={{
          position: 'absolute', left: 0, top: 0, height: '100%', borderRadius: 2,
          background: 'var(--text-amber)',
          width: `${(ZOOM_STEPS.indexOf(zoomLevel) / (ZOOM_STEPS.length - 1)) * 100}%`,
          transition: 'width 0.12s',
        }} />
        {ZOOM_STEPS.map((step, i) => (
          <Tooltip key={step} title={`${Math.round(step * 100)}%`}>
          <button onClick={() => setZoomLevel(step)} aria-label={`Zoom ${Math.round(step * 100)}%`}
            style={{
              position: 'absolute',
              left: `${(i / (ZOOM_STEPS.length - 1)) * 100}%`,
              top: '50%', transform: 'translate(-50%, -50%)',
              width: 10, height: 10, borderRadius: '50%',
              background: zoomLevel === step ? 'var(--text-amber)' : 'var(--state-hover-bg)',
              border: `1.5px solid ${zoomLevel === step ? 'var(--text-amber)' : 'var(--text-muted)'}`,
              cursor: 'pointer', padding: 0, transition: 'background-color 0.12s, border-color 0.12s',
            }} />
          </Tooltip>
        ))}
      </div>
      <ZoomStepBtn
        disabled={zoomLevel >= ZOOM_STEPS[ZOOM_STEPS.length - 1]}
        onClick={() => { const i = ZOOM_STEPS.indexOf(zoomLevel); if (i < ZOOM_STEPS.length - 1) setZoomLevel(ZOOM_STEPS[i + 1]) }}
      >+</ZoomStepBtn>
    </div>
  )
}

// ── DEV MODE — in the Setup tab's and the Settings window's footers while the
// test tools are on: dev run, test portable, or Ctrl+Alt+Shift+D ──────────
export function DevModeBadge({ placement = 'top' }: { placement?: 'left' | 'right' | 'top' | 'bottom' }) {
  if (!simAvailable) return null
  return (
    <Tooltip title="Dev mode" description={"Test tools are on: the dashed \"test builds only\"\npanels in Settings. Ctrl+Alt+Shift+D\nswitches them on and off."} placement={placement}>
      <span style={{ color: 'var(--text-amber)', fontSize: 'var(--text-xs)', whiteSpace: 'nowrap', cursor: 'default' }}>DEV MODE</span>
    </Tooltip>
  )
}

// ── Rate Orfeo — Microsoft Store build only; opens the Store's review window
// over Orfeo (hooks/useSupportNote.ts). Sits beside the update check. ─────
export function RateButton({ placement = 'left' }: { placement?: 'left' | 'right' | 'top' | 'bottom' }) {
  const store = useSupportNote((s) => s.store)
  if (!store) return null
  return (
    <Tooltip title={t`Rate Orfeo in the Microsoft Store`} oneLine wrapperStyle={{ flexShrink: 0 }} placement={placement}>
      <button
        className="o-icon-quiet"
        aria-label={t`Rate Orfeo in the Microsoft Store`}
        onClick={() => void requestStoreReview()}
        style={{ marginRight: 6 }}
      >
        <Star size={16} strokeWidth={1.5} />
      </button>
    </Tooltip>
  )
}

// ── Update check button (+ its short status text) — drawer footer and the
// Settings window header share one status (hooks/useUpdateCheck.ts). ─────
export function UpdateButton({ placement = 'left', showStatus = true }: { placement?: 'left' | 'right' | 'top' | 'bottom'; showStatus?: boolean }) {
  const updateStatus = useUpdateState((s) => s.status)
  const updateInfo = useUpdateState((s) => s.info)
  return (
    <>
      {showStatus && updateInfo.mode === 'auto' && updateStatus.state === 'up-to-date' && (
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--ui-text-soft)', whiteSpace: 'nowrap' }}>
          Orfeo is up to date
        </span>
      )}
      {showStatus && updateInfo.mode === 'auto' && updateStatus.state === 'ready' && (
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-amber)', whiteSpace: 'nowrap' }}>
          Update ready — click to install
        </span>
      )}
      <Tooltip
        title={
          updateStatus.state === 'available'   ? t`Orfeo ${updateStatus.version ?? ''} is out. Click to download` :
          updateInfo.mode === 'manual'         ? t`Check for updates on orfeo.cc` :
          updateInfo.mode === 'store'          ? t`Updates come from the Microsoft Store — click to open Orfeo there` :
          updateStatus.state === 'checking'    ? 'Checking for updates…' :
          updateStatus.state === 'downloading' ? `Downloading update${updateStatus.percent ? ` — ${Math.round(updateStatus.percent)}%` : '…'}` :
          updateStatus.state === 'ready'       ? `Update ${updateStatus.version ?? ''} ready — click to restart and install` :
          updateStatus.state === 'error'       ? `${(updateStatus.message ?? 'Update check failed').slice(0, 160)} — click to open the download page` :
          t`Check for updates`
        }
        oneLine
        wrapperStyle={{ flexShrink: 0 }}
        placement={placement}
      >
      <button
        className="o-icon-quiet"
        aria-label={t`Check for updates`}
        onClick={pressUpdateButton}
        style={updateStatus.state === 'ready' ? { color: 'var(--ui-text)' } : undefined}
      >
        <CloudDownload size={16} strokeWidth={1.5} />
        {(updateStatus.state === 'downloading' || updateStatus.state === 'ready' || updateStatus.state === 'available') && (
          <span
            className={updateStatus.state === 'ready' ? undefined : 'loop-nudge-blink'}
            style={{
              position: 'absolute', top: 1, right: 0,
              width: 8, height: 8, borderRadius: '50%',
              background: 'var(--paint-pink)',
            }}
          />
        )}
      </button>
      </Tooltip>
    </>
  )
}
