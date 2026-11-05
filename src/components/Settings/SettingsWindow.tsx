import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useDraggableDialog } from '../../hooks/useDraggableDialog'
import { MODAL_MAX_HEIGHT, MODAL_MIN_TOP } from '../../utils/modalDrag'
import { Search, X } from 'lucide-react'
import { useStore } from '../../store'
import { t } from '../../utils/i18n'
import Tooltip from '../Tooltip'
import { useUpdateState, pressUpdateButton, setUpdateDot } from '../../hooks/useUpdateCheck'
import { GROUPS, SETTINGS, type GroupTab, type SettingId } from './catalog'
import { searchSettings, gridColumns, CARD_GAP } from './search'
import { SettingCard } from './SettingCard'
import { UpdateButton, RateButton, DevModeBadge, Switch } from './controls'
import { NewVersionDot } from './NewVersionDot'
import { GROUP_ICONS } from './groupIcons'
import { TAB_ASIDES } from './defs/midi'
import '../../styles/redesign-settings.css'

// ── Settings window — every setting, by group, with full descriptions.
// Opened from Quick Settings (gear per group / Open settings) or Ctrl + ,.
// Fills the screen like a page, but stays a window: it drags by its header and
// closes from the top right. Only the content area scrolls. ───────────────

const displayVersion = (v: string) => v.replace(/\.0$/, '')

function CardGrid({ ids, width, most = 2 }: { ids: SettingId[]; width: number; most?: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${gridColumns(most, width, most)}, minmax(0, 1fr))`, gap: CARD_GAP, alignContent: 'start' }}>
      {ids.map(id => <SettingCard key={id} id={id} />)}
    </div>
  )
}

// Delay check's tab: cards down the left, the dark panel beside them
function SideSplit({ tab, width }: { tab: GroupTab; width: number }) {
  const left = tab.ids.filter(id => id !== tab.side)
  return (
    <div className="set-split" style={{ gridTemplateColumns: width >= 720 ? 'minmax(0, 1fr) minmax(0, 400px)' : 'minmax(0, 1fr)' }}>
      <div style={{ display: 'grid', gap: CARD_GAP, alignContent: 'start', minWidth: 0 }}>{left.map(id => <SettingCard key={id} id={id} />)}</div>
      <SettingCard id={tab.side!} />
    </div>
  )
}

// Appearance's last card. There is no Settings entry behind it: it is the update
// button's own state with more room for words.
function UpdatesCard() {
  const status = useUpdateState(s => s.status)
  const mode = useUpdateState(s => s.info.mode)
  const dot = useUpdateState(s => s.dot)
  const out = status.state === 'available' || status.state === 'ready' ? status.version ?? '' : null
  return (
    <div role="group" aria-label={t`Updates`} className="o-card set-card theme-studio set-card-dark" style={{ gridColumn: '1 / -1' }}>
      <div className="set-card-head" style={{ alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="set-card-name">{t`Updates`}</div>
          <div className="set-card-desc">
            {t`You're on Orfeo ${displayVersion(__APP_VERSION__)}.`}
            {mode === 'store' && <> {t`Updates come from the Microsoft Store.`}</>}
            {status.state === 'up-to-date' && <> {t`Orfeo is up to date.`}</>}
            {status.state === 'downloading' && <> {t`Downloading update…`}</>}
          </div>
        </div>
        {out === null && <button className="o-btn" disabled={status.state === 'checking'} onClick={pressUpdateButton}>{t`Check for updates`}</button>}
      </div>
      {out !== null && (
        <div role="status" className="set-update">
          <span className="o-dot o-dot-alert" style={{ outline: '1px solid var(--ink)' }} />
          <span style={{ flex: 1, minWidth: 0 }}>
            {status.state === 'ready' ? t`Orfeo ${out} is ready to install.` : t`Orfeo ${out} is out.`}
            <span className="set-update-note">{t`Your songs and settings stay as they are.`}</span>
          </span>
          <button onClick={pressUpdateButton}>{status.state === 'ready' ? t`Install` : t`Download`}</button>
        </div>
      )}
      <div className="set-row" style={{ marginTop: 8 }}>
        <span>{t`Show a dot on Settings when a new version is out`}</span>
        <Switch value={dot} onChange={setUpdateDot} label={t`Show a dot on Settings when a new version is out`} />
      </div>
    </div>
  )
}

export default function SettingsWindow() {
  const open = useStore(s => s.settingsWindowOpen)
  const group = useStore(s => s.settingsWindowGroup)
  const dot = useUpdateState(s => s.dot)
  const [query, setQuery] = useState('')
  const [width, setWidth] = useState(0)
  // Tab within a tabbed group — back to the first tab whenever the group changes
  const [tab, setTab] = useState(0)
  useEffect(() => { setTab(0) }, [group, open])
  const contentRef = useRef<HTMLDivElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  // ── Drag by the header, like the other floating windows; centred again each
  // time the window opens. ────────────────────────────────────────────────
  const { onDragStart, placed, reset } = useDraggableDialog(dialogRef)
  useEffect(() => { if (open) reset() }, [open, reset])

  useLayoutEffect(() => {
    const el = contentRef.current
    if (!open || !el) return
    // content box width (padding excluded) decides how many cards fit across
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [open])
  useEffect(() => { if (!open) setQuery('') }, [open])
  // Esc: clears an active search first, otherwise closes
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (query) { setQuery(''); return }
      useStore.getState().closeSettingsWindow()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, query])
  useEffect(() => { contentRef.current?.scrollTo({ top: 0 }) }, [group, query, tab])

  if (!open) return null
  const close = () => useStore.getState().closeSettingsWindow()
  const g = GROUPS.find(x => x.id === group) ?? GROUPS[0]
  const results = query.trim() ? searchSettings(query) : null
  const activeTab = g.tabs?.[Math.min(tab, g.tabs.length - 1)]
  const Aside = activeTab ? TAB_ASIDES[activeTab.aside ?? ''] : undefined

  return createPortal(
    <div className="o-scrim" onMouseDown={e => { if (e.target === e.currentTarget) close() }}
      style={{ zIndex: 10500, padding: `${MODAL_MIN_TOP}px 16px 12px`, boxSizing: 'border-box' }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={t`Settings`} className="orfeo-modal-glow orfeo-settle-in touch-settings theme-paper set-window"
        style={{ width: 'min(1480px, calc(100vw - 32px))', height: `min(1000px, ${MODAL_MAX_HEIGHT})`, ...placed }}>
        {/* ── Header (drag handle): title | search | close ── */}
        <div onPointerDown={onDragStart} className="o-window-head set-head">
          <span className="o-title" style={{ flex: 1, minWidth: 0 }}>{t`Settings`}</span>
          <label className="o-field set-search">
            <Search size={16} strokeWidth={1.6} style={{ flexShrink: 0 }} />
            <input autoFocus={matchMedia('(pointer: fine)').matches} value={query} onChange={e => setQuery(e.target.value)}
              placeholder={t`Search all settings`} aria-label={t`Search all settings`} />
            {query && <button onClick={() => setQuery('')} aria-label={t`Clear search`} className="o-icon-quiet"><X size={14} /></button>}
          </label>
          <Tooltip title={t`Close (Esc)`} oneLine placement="bottom">
            <button onClick={close} aria-label={t`Close`} className="o-close"><X size={18} /></button>
          </Tooltip>
        </div>

        {/* ── Body: group list | content ── */}
        <div className="set-body">
          <nav aria-label={t`Settings groups`} className="set-nav">
            <div className="set-nav-list">
              {GROUPS.map(x => {
                const Icon = GROUP_ICONS[x.id]
                const active = !results && x.id === group
                return (
                  <button key={x.id} aria-current={active ? 'page' : undefined} onClick={() => { setQuery(''); useStore.getState().openSettingsWindow(x.id) }}>
                    <Icon size={20} strokeWidth={1.7} style={{ flexShrink: 0 }} /><span>{x.name}</span>
                    {x.id === 'appearance' && <NewVersionDot />}
                  </button>
                )
              })}
            </div>
            {/* ── ORFEO + version (opens GitHub) | update check ── */}
            <div className="set-about" data-dot={dot ? undefined : 'off'}>
              <Tooltip title="Open Orfeo on GitHub" oneLine placement="top">
                <button className="o-link" onClick={() => window.electronAPI.openExternal('https://github.com/Squarebow/Orfeo')}>
                  Orfeo v{displayVersion(__APP_VERSION__)}
                </button>
              </Tooltip>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><DevModeBadge /><RateButton placement="top" /><UpdateButton placement="top" showStatus={false} /></div>
            </div>
          </nav>
          <div ref={contentRef} className="set-content">
            {results === null ? (
              <div key={g.id} className="set-page">
                <div className="set-page-head">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h1 className="o-display set-page-title">{g.name}</h1>
                    <div className="set-page-intro">{g.intro}</div>
                  </div>
                  <button className="o-link" onClick={() => window.electronAPI.openExternal(g.manualUrl)}>{t`Open the manual`}</button>
                </div>
                {g.tabs ? (
                  <>
                    <div className="set-tab-row">
                      <div role="tablist" aria-label={g.name} className="o-seg">
                        {g.tabs.map(tb => (
                          <button key={tb.name} role="tab" aria-selected={tb === activeTab} onClick={() => setTab(g.tabs!.indexOf(tb))}>{tb.name}</button>
                        ))}
                      </div>
                      {Aside && <Aside />}
                    </div>
                    {activeTab!.side
                      ? <SideSplit tab={activeTab!} width={width} />
                      : <CardGrid ids={activeTab!.ids} width={width} most={activeTab!.columns ?? 2} />}
                    {activeTab!.wide?.map(id => <div key={id} style={{ marginTop: CARD_GAP }}><SettingCard id={id} /></div>)}
                  </>
                ) : (
                  <CardGrid ids={SETTINGS.filter(s => s.group === g.id).map(s => s.id)} width={width} />
                )}
                {g.id === 'appearance' && <div style={{ display: 'grid', marginTop: CARD_GAP }}><UpdatesCard /></div>}
              </div>
            ) : results.length === 0 ? (
              <p className="o-note" style={{ fontSize: 'var(--text-md)' }}>{t`No settings match “${query.trim()}”.`}</p>
            ) : results.map(r => (
              <section key={r.group.id} className="set-results">
                <h2 className="set-results-name">{r.group.name}</h2>
                <CardGrid ids={r.settings.map(s => s.id)} width={width} />
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
