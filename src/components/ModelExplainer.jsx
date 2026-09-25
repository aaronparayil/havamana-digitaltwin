import { useState } from 'react'
import {
  History, BrainCircuit, CalendarRange, ArrowRight, ChevronDown, GraduationCap, X,
} from 'lucide-react'
import { useTour } from './tourContext'
import './ModelExplainer.css'

/* First-visit guide to the Model page. Open by default the first time; "Got
   it" folds it to a one-line bar that reopens it. Whether it was dismissed is
   a per-browser convenience, so localStorage is fine, wrapped because storage
   can be unavailable (private windows, blocked site data). */
const SEEN_KEY = 'havamana.explainer.dismissed'

function readDismissed() {
  try {
    return localStorage.getItem(SEEN_KEY) === '1'
  } catch {
    return false
  }
}

function writeDismissed(v) {
  try {
    if (v) localStorage.setItem(SEEN_KEY, '1')
    else localStorage.removeItem(SEEN_KEY)
  } catch {
    /* storage unavailable: the panel just opens again next visit */
  }
}

const STEPS = [
  {
    icon: History,
    title: 'Looks back 30 days',
    body: (
      <>
        Rainfall, maximum and minimum temperature recorded by IMD for every ~22 km square of
        Karnataka (<strong>432 land cells</strong>), plus the time of year.
      </>
    ),
    visual: 'stack-in',
  },
  {
    icon: BrainCircuit,
    title: 'Learns how weather moves',
    body: (
      <>
        A <strong>ConvLSTM2D</strong> neural network. The <em>convolution</em> part looks at
        neighbouring squares, to see how rain bands and heat spread. The <em>LSTM</em> part is a
        memory that tracks how they change day to day. Trained on 2010–2020.
      </>
    ),
    visual: 'net',
  },
  {
    icon: CalendarRange,
    title: 'Forecasts 14 days ahead',
    body: (
      <>
        A full map for each of the next 14 days. It starts from the last day it saw and predicts
        how each square will change. Accuracy is highest in the first few days and fades after
        about a week.
      </>
    ),
    visual: 'stack-out',
  },
]

const GLOSSARY = [
  ['Climatology', 'The 15-year average for that calendar date. The "normal" to beat.'],
  ['Persistence', 'A baseline that assumes tomorrow looks exactly like today.'],
  ['Anomaly', 'How far the forecast is above or below the normal for that date.'],
  ['Lead day', 'How far ahead a forecast looks. Day +1 is tomorrow.'],
  ['Error (MAE)', 'The average gap between forecast and what was recorded. Lower is better.'],
  ['Pattern match (r)', 'Whether the forecast puts highs and lows in the right places. 1.0 is perfect.'],
  ['Unseen test data', '2023–2025. Held back during training, so replays there are a fair test.'],
]

/** Tiny stacked-frames illustration: `count` daily maps, drawn as offset tiles. */
function FrameStack({ label, tone }) {
  return (
    <div className={`frame-stack tone-${tone}`} aria-hidden="true">
      {[0, 1, 2, 3].map((i) => <span key={i} style={{ '--i': i }} />)}
      <em>{label}</em>
    </div>
  )
}

function NetGlyph() {
  return (
    <svg className="net-glyph" viewBox="0 0 64 40" aria-hidden="true">
      {[8, 20, 32].map((y) => [10, 20, 30].map((y2) => (
        <line key={`${y}-${y2}`} x1="10" y1={y} x2="32" y2={y2 + 0} />
      )))}
      {[10, 20, 30].map((y) => [8, 20, 32].map((y2) => (
        <line key={`b${y}-${y2}`} x1="32" y1={y} x2="54" y2={y2} />
      )))}
      {[8, 20, 32].map((y) => <circle key={`a${y}`} cx="10" cy={y} r="3" />)}
      {[10, 20, 30].map((y) => <circle key={`m${y}`} cx="32" cy={y} r="3" className="mid" />)}
      {[8, 20, 32].map((y) => <circle key={`c${y}`} cx="54" cy={y} r="3" />)}
    </svg>
  )
}

export function ModelExplainer() {
  const [open, setOpen] = useState(() => !readDismissed())
  const tour = useTour()

  const dismiss = () => {
    writeDismissed(true)
    setOpen(false)
  }
  const reopen = () => {
    writeDismissed(false)
    setOpen(true)
  }

  if (!open) {
    return (
      <button className="explainer-bar" onClick={reopen} aria-expanded="false">
        <GraduationCap size={15} />
        <span>New here? <strong>How the digital twin works</strong></span>
        <ChevronDown size={15} className="explainer-bar-chev" />
      </button>
    )
  }

  return (
    <section className="explainer" aria-labelledby="explainer-title">
      <div className="explainer-head">
        <div>
          <span className="section-kicker"><GraduationCap size={12} /> New here? Start with this</span>
          <h2 id="explainer-title">How the digital twin works</h2>
        </div>
        <button className="explainer-close" onClick={dismiss} aria-label="Hide the explainer">
          <X size={16} />
        </button>
      </div>

      <ol className="explainer-steps">
        {STEPS.map(({ icon: Icon, title, body, visual }, i) => (
          <li key={title} className="explainer-step">
            <div className="explainer-visual">
              {visual === 'stack-in' && <FrameStack label="30 days" tone="in" />}
              {visual === 'net' && <NetGlyph />}
              {visual === 'stack-out' && <FrameStack label="14 days" tone="out" />}
            </div>
            <div className="explainer-step-title">
              <span className="explainer-num">{i + 1}</span>
              <Icon size={15} />
              <strong>{title}</strong>
            </div>
            <p>{body}</p>
            {i < STEPS.length - 1 && <ArrowRight size={18} className="explainer-arrow" aria-hidden="true" />}
          </li>
        ))}
      </ol>

      <div className="explainer-grid">
        <div className="explainer-card">
          <h3>Two ways to explore</h3>
          <dl>
            <dt>🔮 Forecast ahead</dt>
            <dd>
              The next 14 days, or an upcoming season. The IMD record in this pilot ends in Dec 2025, so these
              are started from the latest recorded weeks for the same time of year.
            </dd>
            <dt>🎯 Replay &amp; verify</dt>
            <dd>
              Pick a past date. The model forecasts it without peeking, then you see what really happened and
              how close it got. <strong>Start with the 2024 heatwave.</strong>
            </dd>
          </dl>
        </div>

        <div className="explainer-card">
          <h3>Reading the map</h3>
          <ul>
            <li>Each square is ~22 km across. Hover one for its exact values.</li>
            <li>Switch <strong>Variable</strong> for rain or temperature, and <strong>Layer</strong> for forecast, normal or anomaly.</li>
            <li>Drag the timeline, or press <kbd>Space</kbd> to play all 14 days. <kbd>←</kbd> <kbd>→</kbd> step one day.</li>
            <li>Click a city dot to chart it on the right. Try <strong>3D</strong> for terrain.</li>
          </ul>
        </div>

        <div className="explainer-card">
          <h3>Words you&rsquo;ll see</h3>
          <dl className="explainer-glossary">
            {GLOSSARY.map(([term, def]) => (
              <div key={term}>
                <dt>{term}</dt>
                <dd>{def}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <div className="explainer-foot">
        <button className="explainer-cta" onClick={dismiss}>Got it, show me the model</button>
        <button className="explainer-tour" onClick={() => { dismiss(); tour.start() }}>
          Or take the guided tour →
        </button>
        <span>You can reopen this any time from the bar at the top.</span>
      </div>
    </section>
  )
}
