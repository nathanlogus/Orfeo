// ── Soft Touch: a run on screen. The rules live in run.ts, the room in mansion.ts ──
import { useEffect, useRef, useState } from 'react'
import { useStore } from '../../store'
import { t } from '../../utils/i18n'
import { gameClock } from '../clock'
import type { GameProps } from '../games'
import { onKeyDown } from '../keys'
import { HITS, levelOf, loadTouch, readTouch, saveTouch, type Touch } from './calibrate'
import { openMansion, type Mansion } from './mansion'
import { LIVES, bossStars, cleanForThree, createRun, multiplierFor, starsFor, type Run, type RunEvent, type Slip, type Step } from './run'
import { MARK_WORDS, type Stage } from './stages'
import './softTouch.css'

const METER_MARKS = ['ff', 'f', 'mf', 'mp', 'p', 'pp']
const CHIPS = 4
const FINISH_MS = 900
const VAULT_MS = 2000     // long enough to watch it swing
const FADE_MS = 700
const AWAKE_MS = 1800
const SOFT_LINE = 0.5
const WHEEL_STEP = 0.7     // radians per note, on the vault's dial
const reducedMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// Escape is how RunHost leaves a run; shortcut: a GameProps.leave would be cleaner, once a second game needs one
const leave = () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))

function Calibrate({ paused, onDone }: { paused: boolean; onDone: (touch: Touch) => void }) {
  const [step, setStep] = useState<'soft' | 'loud' | 'fixed' | 'close'>('soft')
  const [hits, setHits] = useState(0)
  const soft = useRef<number[]>([])
  const loud = useRef<number[]>([])
  const held = useRef(paused)
  held.current = paused

  useEffect(() => {
    if (step !== 'soft' && step !== 'loud') return
    return onKeyDown((_key, _stamp, _down, velocity) => {
      if (held.current) return
      const list = step === 'soft' ? soft.current : loud.current
      if (list.length >= HITS) return
      list.push(velocity)
      setHits(list.length)
      if (list.length < HITS) return
      setHits(0)
      if (step === 'soft') return setStep('loud')
      const touch = readTouch(soft.current, loud.current)
      if (typeof touch === 'string') setStep(touch)
      else onDone(touch)
    })
  }, [step, onDone])

  const again = () => { soft.current = []; loud.current = []; setHits(0); setStep('soft') }
  const measuring = step === 'soft' || step === 'loud'
  return (
    <div className="ac-veil st-veil">
      <div className="ac-sheet st-setup" role="dialog" aria-labelledby="st-setup-title">
        {measuring && (
          <>
            <span className="ac-eyebrow">{t`Your keyboard's touch`}</span>
            <h2 id="st-setup-title">{step === 'soft' ? t`Play ${HITS} notes as softly as you can` : t`Now ${HITS} notes as loud as you like to play`}</h2>
            <p className="ac-soft">{t`Any key. Every keyboard's soft and loud are different, so this sets the meter to yours. It's saved for this keyboard.`}</p>
            <div className="st-hits" role="img" aria-label={t`${hits} of ${HITS} notes`}>
              {Array.from({ length: HITS }, (_, i) => <i key={i} data-on={i < hits || undefined} />)}
            </div>
          </>
        )}
        {step === 'fixed' && (
          <>
            <h2 id="st-setup-title">{t`This game needs touch sensitivity`}</h2>
            <p>{t`Every note came in at exactly the same volume, so this keyboard, or its Velocity setting, isn't sending how hard you play. Soft Touch can't be played without that. Every other Arcade game works fine.`}</p>
          </>
        )}
        {step === 'close' && (
          <>
            <h2 id="st-setup-title">{t`Those were too close together`}</h2>
            <p>{t`Your soft and loud notes came out almost the same. Try again, with as big a difference as you can.`}</p>
          </>
        )}
        {!measuring && (
          <div className="ac-actions">
            <button className="ac-link" onClick={leave}>{t`Back to stages`}</button>
            {step === 'fixed' && <button className="ac-small-btn" onClick={() => useStore.getState().openSettingsWindow('midi')}>{t`Keyboard settings`}</button>}
            <span className="o-spacer" />
            <button className="ac-go" onClick={again}>{t`Try again`}</button>
          </div>
        )}
      </div>
    </div>
  )
}

interface Shown {
  width: number
  chips: Step[]
  done: number
  total: number
  last: number | null        // the height of the last note played
  slip: Slip | null
  guard: 'asleep' | 'stirring' | 'awake'
  alarms: number
  dark: boolean              // between rooms
  dueIn: number              // ms until the next note, for the bar in the tag
  beats: number              // counts notes, to restart that bar
}

const START: Shown = { width: 0, chips: [], done: 0, total: 0, last: null, slip: null, guard: 'asleep', alarms: 0, dark: false, dueIn: 0, beats: 0 }

export default function SoftTouch({ stage, assist, paused, weak, hud, keys, miss, finish }: GameProps<Stage>) {
  const [touch, setTouch] = useState<Touch | null | undefined>(undefined)   // undefined: still looking
  const [shown, setShown] = useState(START)
  const [world, setWorld] = useState<Mansion | null>(null)
  const [failed, setFailed] = useState(false)
  const host = useRef<HTMLDivElement>(null)
  const burglarTag = useRef<HTMLDivElement>(null)
  const guardTag = useRef<HTMLDivElement>(null)
  const tick = useRef<((now: number) => void) | null>(null)
  const held = useRef(paused)
  held.current = paused
  const device = useRef(useStore.getState().midiDeviceName ?? '')
  const boss = stage.kind === 'boss'
  const endless = stage.kind === 'endless'

  useEffect(() => {
    let closed = false
    void loadTouch(device.current).catch(() => null).then(saved => { if (!closed) setTouch(saved) })
    return () => { closed = true }
  }, [])

  useEffect(() => {
    let closed = false
    let opened: Mansion | null = null
    openMansion(host.current!, reducedMotion()).then(w => {
      if (closed) w.dispose()
      else { opened = w; setWorld(w) }
    }).catch(e => { console.error('[Pliage Arcade] world failed to load:', e); setFailed(true) })
    return () => { closed = true; opened?.dispose() }
  }, [])

  // The room keeps living behind calibration and Pause; a run ticks on the same frame
  useEffect(() => {
    if (!world) return
    const label = (tag: HTMLElement | null, at: { x: number; y: number }) => { if (tag) tag.style.transform = `translate(${at.x}px, ${at.y}px) translate(-50%, -100%)` }
    let raf = 0
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      tick.current?.(now)
      world.frame(now)
      label(burglarTag.current, world.labelAt('burglar'))
      label(guardTag.current, world.labelAt('guard'))
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [world])

  const measured = useRef((next: Touch) => {
    void saveTouch(device.current, next).catch(e => console.error('[Pliage Arcade] touch not saved:', e))
    setTouch(next)
  })

  useEffect(() => {
    setShown(START)
    if (!touch || !world) return
    const clock = gameClock(performance.now())
    const timers = new Set<number>()
    const later = (fn: () => void, ms: number) => { const id = window.setTimeout(() => { timers.delete(id); fn() }, ms); timers.add(id) }
    let run: Run | null = null
    let game = 0
    let beats = 0

    const sync = (patch: Partial<Shown> = {}) => {
      if (!run) return    // the first room is announced from inside createRun
      const { score, combo, lives, width } = run.state
      hud({ score, combo, multiplier: multiplierFor(combo), lives })
      const coming = run.coming
      keys({ sun: coming.slice(0, 1).map(s => s.key), labels: false })
      const shared = { width, chips: coming, done: run.done, total: run.total, dueIn: Math.max(0, (coming[0]?.at ?? game) - game), beats: ++beats }
      setShown(s => ({ ...s, ...patch, ...shared }))
    }

    function report(cleared: boolean) {
      const { score, bestCombo, clean, played, tries } = run!.state
      const stars = !cleared ? 0 : boss ? bossStars(tries, assist) : starsFor(run!.accuracy, assist)
      const need = cleanForThree(played)
      const three = boss ? t`Three stars needs the whole phrase on the first try.` : t`Three stars needs ${need} notes inside the window out of ${played}. You were ${need - clean} short.`
      finish({
        cleared, stars, score,
        title: boss && cleared ? t`The vault swings open` : cleared ? t`A clean getaway` : endless ? t`The night is over` : boss ? t`The vault stayed shut` : t`The alarm woke the house`,
        goal: !cleared ? null : assist ? t`A clear with Assist on earns 1 star.` : stars === 3 ? null : three,
        stats: [{ label: t`Inside the window`, value: `${clean} / ${played}` }, { label: t`Top combo`, value: String(bestCombo) }],
      })
    }

    const walk = () => { if (run) world.advance(run.total ? run.done / run.total : 0, (run.coming[0]?.level ?? 0) < SOFT_LINE) }

    const emit = (e: RunEvent) => {
      switch (e.type) {
        case 'room': {
          hud({ detail: boss ? t`Try ${e.index} of ${LIVES}` : endless ? t`Room ${e.index}` : t`Room ${e.index} of ${stage.rooms}` })
          const first = e.index === 1
          sync({ slip: null, guard: 'asleep', dark: !first })
          if (first) { world.enter(boss); walk() }
          // Behind the dark, so nobody sees him jump back
          else later(() => { world.enter(boss); walk(); setShown(s => ({ ...s, dark: false })) }, FADE_MS)
          break
        }
        case 'inside':
          sync({ last: e.level, slip: null })
          walk()
          world.heard(e.level)
          if (e.step.act === 'door') world.openDoor()
          if (e.step.act === 'noise') world.noise()
          if (boss) world.turnWheel(run!.done * WHEEL_STEP)
          break
        case 'slip':
          miss(e.step.mark, MARK_WORDS[e.step.mark])
          sync({ slip: e.slip, ...(e.level === null ? {} : { last: e.level }), guard: e.alarm ? 'awake' : 'stirring' })
          walk()
          if (e.level !== null) world.heard(e.level)
          world.flinch()
          if (e.alarm) {
            world.alarm()
            setShown(s => ({ ...s, alarms: s.alarms + 1 }))
            later(() => { world.calm(); setShown(s => ({ ...s, guard: 'asleep' })) }, AWAKE_MS)
          }
          break
        case 'end':
          if (e.cleared && boss) world.openVault()
          keys({ sun: [] })
          later(() => report(e.cleared), reducedMotion() ? 0 : e.cleared && boss ? VAULT_MS : FINISH_MS)
          break
      }
    }

    run = createRun({ stage, assist, rng: Math.random, emit, start: 0, weak })
    sync()
    const off = onKeyDown((key, stamp, _down, velocity) => { if (!held.current) run!.noteOn(key, clock.at(stamp), levelOf(velocity, touch)) })

    tick.current = now => {
      game = held.current ? clock.hold(now) : clock.tick(now)
      run!.tick(game)
    }

    return () => {
      tick.current = null
      for (const id of timers) clearTimeout(id)
      off()
      keys({ sun: [] })
    }
  }, [touch, world]) // eslint-disable-line react-hooks/exhaustive-deps

  const { width, chips, last, slip, guard, alarms, dark, dueIn, beats } = shown
  const next = chips[0]
  const slipWord = slip === 'loud' ? t`Too loud` : slip === 'soft' ? t`Too soft` : t`Missed it`
  const nextWord = next?.act === 'door' ? t`Open it` : next?.act === 'noise' ? t`Make a noise` : (next?.level ?? 0) < SOFT_LINE ? t`Tiptoe` : t`Creep`
  const chipWord = (s: Step) => (!stage.words ? s.mark : s.act === 'door' ? t`LOUD · open the door` : s.act === 'noise' ? t`LOUD · make a noise` : MARK_WORDS[s.mark])
  const shownChips = chips.slice(0, CHIPS)

  return (
    <>
      <div ref={host} className="ac-stage" />
      <div className="ac-tags st-world" data-paused={paused || undefined} data-alarm={guard === 'awake' || undefined}>
        <div ref={guardTag} className="st-tag">
          <span>{guard === 'awake' ? t`Awake!` : guard === 'stirring' ? t`Stirring` : <>{t`Asleep`} <em>zzz</em></>}</span>
        </div>
        {next && (
          <div ref={burglarTag} className="st-tag st-tag-now" data-slip={slip ? true : undefined}>
            <span>
              {slip ? slipWord : nextWord}
              <i key={beats} style={{ animationDuration: `${dueIn}ms` }} />
            </span>
          </div>
        )}
        {alarms > 0 && <i key={alarms} className="st-alarm" />}
        <i className="st-dark" data-on={dark || undefined} />
      </div>

      {next && (
        <div className="ac-wave st-wave" aria-label={t`Coming up: ${shownChips.map(chipWord).join(', ')}`}>
          <span>{t`Coming up`}</span>
          {shownChips.map((s, i) => (
            <span key={s.at} className="ac-wave-step">
              <b data-now={i === 0 || undefined} className={stage.words ? undefined : 'st-mark'}>{chipWord(s)}</b>
            </span>
          ))}
        </div>
      )}

      <section className="st-meter" aria-label={t`How hard you played`}>
        <span>{t`Loudness`}</span>
        <div
          role="img"
          aria-label={next ? `${t`Target window: ${MARK_WORDS[next.mark]}.`} ${last === null ? '' : slip ? t`Your last note: outside it` : t`Your last note: inside it`}` : t`Loudness meter`}
        >
          <p>{METER_MARKS.map(m => <span key={m}>{m}</span>)}</p>
          <div>
            {next && <i className="st-window" style={{ bottom: `${(next.level - width / 2) * 100}%`, height: `${width * 100}%` }} />}
            {last !== null && <i className="st-last" data-slip={slip && slip !== 'late' ? true : undefined} style={{ bottom: `${last * 100}%` }} />}
          </div>
        </div>
      </section>

      {touch && (
        <div className="ac-hint-row st-pills">
          <span className="ac-pill">{t`Any key: it's how hard you play that counts`}</span>
          <button className="ac-pill st-redo" onClick={() => setTouch(null)}>{t`Calibrated to your keyboard`} <u>{t`Redo`}</u></button>
        </div>
      )}
      {touch === null && <Calibrate paused={paused} onDone={measured.current} />}
      {failed && <div role="alert" className="lib-alert ac-paused">{t`The Midnight Job couldn't load its art.`}</div>}
    </>
  )
}
