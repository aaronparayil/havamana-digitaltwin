import { Link } from 'react-router-dom'
import {
  SlidersHorizontal, Satellite, Map as MapIcon, Sprout, BellRing, ArrowRight, CheckCircle2,
} from 'lucide-react'
import './ComingSoon.css'

/* Phase 2 lives here. Nothing on this page is a working feature, and it says
   so: every card is a roadmap item, and the only live links point back to
   what Phase 1 actually ships. */

const SHIPPED = [
  { label: 'Live India conditions on a 3D globe', to: '/' },
  { label: 'ConvLSTM2D 14-day forecast for Karnataka', to: '/model-test' },
  { label: 'Replay & verify against recorded IMD data', to: '/model-test' },
  { label: 'Benchmark against three baseline forecasters', to: '/comparisons' },
]

const ROADMAP = [
  {
    icon: SlidersHorizontal,
    title: 'What-If scenario simulator',
    body: 'Push rainfall or temperature up or down, say a 20% weaker monsoon or a 2 °C hotter May, and watch the twin carry the change across the grid for 14 days.',
    tag: 'Headline feature',
  },
  {
    icon: Sprout,
    title: 'Sector impact layers',
    body: 'Turn forecasts into consequences for agriculture, water reservoirs and urban heat, so planners see what a scenario means on the ground.',
  },
  {
    icon: Satellite,
    title: 'INSAT satellite fusion',
    body: 'Blend ISRO INSAT products with the IMD gauge grids to sharpen rainfall where stations are sparse.',
  },
  {
    icon: MapIcon,
    title: 'All-India scale',
    body: 'Extend the Karnataka pilot to the national grid, one state domain at a time.',
  },
  {
    icon: BellRing,
    title: 'Early-warning alerts',
    body: 'Flag heatwave and heavy-rain thresholds before they happen, district by district.',
  },
]

export function Scenarios() {
  return (
    <div className="content-wrap soon-wrap">
      <section className="soon-hero">
        <span className="soon-pill"><i /> Coming soon · Phase 2</span>
        <h1>The What-If simulator</h1>
        <p>
          Phase 1 built a digital twin that can see Karnataka&rsquo;s climate and forecast it.
          Phase 2 lets you <em>change</em> it: adjust the inputs, run the twin forward, and
          compare the outcome against the forecast.
        </p>
        <div className="soon-actions">
          <Link to="/model-test" className="soon-cta">
            Try the live forecast <ArrowRight size={15} />
          </Link>
          <Link to="/comparisons" className="soon-link">See model accuracy</Link>
        </div>
      </section>

      <section className="soon-grid" aria-label="Phase 2 roadmap">
        {ROADMAP.map(({ icon: Icon, title, body, tag }) => (
          <article key={title} className={`soon-card ${tag ? 'is-featured' : ''}`}>
            <div className="soon-card-top">
              <span className="soon-icon"><Icon size={18} /></span>
              {tag && <span className="soon-tag">{tag}</span>}
            </div>
            <h2>{title}</h2>
            <p>{body}</p>
          </article>
        ))}
      </section>

      <section className="soon-shipped">
        <span className="section-kicker">Already live in Phase 1</span>
        <ul>
          {SHIPPED.map((s) => (
            <li key={s.label}>
              <Link to={s.to}>
                <CheckCircle2 size={15} /> {s.label}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
