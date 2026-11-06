import { useMemo, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { useStore } from '../../store'
import { t } from '../../utils/i18n'
import PliageMark from '../PliageMark'
import PliageLogo from '../PliageLogo'
import { HeldKeys } from '../Lessons/MiniStaff'

type Pick = 'demo' | 'folder' | 'server'

const COLUMNS = 14
const FALLING_NOTES = 18

// The roll on the welcome page: a fixed drawing, so it needs no song and no Pixi
function fallingNotes() {
  let seed = 4242
  const next = () => (seed = (seed * 9301 + 49297) % 233280) / 233280
  return Array.from({ length: FALLING_NOTES }, () => {
    const column = Math.floor(next() * COLUMNS)
    const height = 6 + next() * 16
    return { left: (column / COLUMNS) * 100, top: next() * (76 - height), height, left_hand: column < COLUMNS / 2 }
  })
}

// ── A new install's first two pages: what Pliage is, then a keyboard and songs ──
export default function FirstRun({ pickFolder, onDone }: { pickFolder: () => Promise<boolean>; onDone: (server: boolean) => void }) {
  const [step, setStep] = useState<'welcome' | 'setup'>('welcome')
  return (
    <div className="theme-paper lib-page">
      <div className="lib-scroll">
        {step === 'welcome'
          ? <Welcome onStart={() => setStep('setup')} onSkip={() => onDone(false)} />
          : <Setup pickFolder={pickFolder} onBack={() => setStep('welcome')} onDone={onDone} />}
      </div>
    </div>
  )
}

function Welcome({ onStart, onSkip }: { onStart: () => void; onSkip: () => void }) {
  const notes = useMemo(fallingNotes, [])
  return (
    <div className="first-welcome">
      <div className="first-welcome-text">
        <span className="lib-logo" style={{ alignSelf: 'flex-start' }}><span className="lib-logo-disc"><PliageMark height={20} tone="sun" /></span><PliageLogo height={26} tone="night" /></span>
        <span className="o-spacer" />
        <h1 className="first-headline">{t`From MIDI to mastery.`}</h1>
        <p className="first-lead">{t`Turn any MIDI file into a piano lesson. Notes fall onto the keys, the keys light up as they play, and you set the pace.`}</p>
        <p className="o-note">{t`Free. No account. Your songs never leave this device.`}</p>
        <div className="first-actions">
          <button className="o-btn-primary first-big" onClick={onStart}>{t`Get started`}</button>
          <button className="o-btn first-big" onClick={onSkip}>{t`Skip to the library`}</button>
        </div>
        <span className="o-spacer" />
        <div className="first-steps" role="img" aria-label={t`Step 1 of 2`}><span data-on /><span /></div>
      </div>
      <div className="first-art" aria-hidden>
        {notes.map((n, i) => <span key={i} className="first-note" style={{ left: `${n.left}%`, top: `${n.top}%`, height: `${n.height}%`, background: n.left_hand ? 'var(--paint-blue)' : 'var(--paint-yellow)' }} />)}
        <span className="o-disc" style={{ right: -60, top: -60, width: 260, height: 260 }} />
        <span className="o-triangle" style={{ left: 40, top: 70, width: 120, height: 104 }} />
        <div className="first-art-keys">{Array.from({ length: COLUMNS }, (_, i) => <span key={i} style={{ background: i === 3 ? 'var(--paint-blue)' : i === 9 ? 'var(--paint-yellow)' : 'var(--paper-card)' }} />)}</div>
      </div>
    </div>
  )
}

function Setup({ pickFolder, onBack, onDone }: { pickFolder: () => Promise<boolean>; onBack: () => void; onDone: (server: boolean) => void }) {
  const connected = useStore(s => s.midiDeviceConnected)
  const name = useStore(s => s.midiDeviceName)
  const [pick, setPick] = useState<Pick>('demo')
  const options: { id: Pick; title: string; sub: string }[] = [
    { id: 'demo', title: t`Start with the demo songs`, sub: t`A few pieces come with Pliage, ready to play.` },
    { id: 'folder', title: t`Choose a song folder`, sub: t`MIDI, MusicXML, Guitar Pro and karaoke files.` },
    { id: 'server', title: t`Connect a home server`, sub: t`Browse a big song collection from your computer.` },
  ]
  const finish = async () => {
    if (pick === 'folder' && !await pickFolder()) return
    onDone(pick === 'server')
  }
  return (
    <div className="first-setup">
      <div className="first-setup-top">
        <button className="o-btn" onClick={onBack}><ArrowLeft size={16} aria-hidden />{t`Back`}</button>
        <span className="o-spacer" />
        <div className="first-steps" role="img" aria-label={t`Step 2 of 2`}><span /><span data-on /></div>
      </div>
      <h1 className="o-display">{t`Two things, then we play.`}</h1>
      <div className="first-cards">
        <section className="o-card first-card">
          <span className="lib-tag" style={{ background: 'var(--paint-lime)' }}>{t`1 · Keyboard`}</span>
          <h2 className="o-title">{t`Connect your keyboard`}</h2>
          <p className="o-note">{t`Plug it in with a USB cable. A tablet usually needs a USB-C adapter for this.`}</p>
          <div className="first-device">
            <span className={`o-dot ${connected ? 'o-dot-on' : 'o-dot-off'}`} />
            <span className="lib-ellipsis" style={{ flex: 1 }}>{connected ? name || t`MIDI keyboard` : t`No keyboard yet`}</span>
            <span>{connected ? t`Connected` : t`Waiting`}</span>
          </div>
          {connected && <>
            <span>{t`Play a few keys to check it works:`}</span>
            <HeldKeys height={120} />
          </>}
          <span className="o-spacer" />
          <button className="o-link" style={{ alignSelf: 'flex-start' }} onClick={() => onDone(false)}>{t`No keyboard? You can play on the screen.`}</button>
        </section>
        <section className="o-card first-card">
          <span className="lib-tag" style={{ background: 'var(--paint-rose)' }}>{t`2 · Songs`}</span>
          <h2 className="o-title">{t`Find your songs`}</h2>
          <p className="o-note">{t`You can change this any time in the Library.`}</p>
          <div role="group" aria-label={t`Where your songs come from`} className="first-options">
            {options.map(o => (
              <button key={o.id} className="first-option" aria-pressed={pick === o.id} onClick={() => setPick(o.id)}>
                <span className="first-radio" />
                <span className="first-option-text"><span className="first-option-title">{o.title}</span><span className="o-note">{o.sub}</span></span>
              </button>
            ))}
          </div>
        </section>
      </div>
      <div className="first-foot">
        <span className="o-note">{t`Everything stays on this device.`}</span>
        <button className="o-btn-primary first-big" onClick={() => void finish()}>{t`Open my Library`}</button>
      </div>
    </div>
  )
}
