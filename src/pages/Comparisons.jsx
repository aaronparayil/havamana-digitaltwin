import { useState, useEffect, useMemo } from 'react'
import { RefreshCw, CheckCircle2 } from 'lucide-react'
import { Line, Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement,
  LineElement, BarElement, Title, Tooltip as ChartTooltip, Legend, Filler
} from 'chart.js'
import { chartOptions as sharedChartOptions, lineSeries, barSeries } from '../styles/chartTheme'
import { seriesFor } from '../styles/dataColors'
import { API_BASE } from '../hooks/useApiHealth'
import '../pages/ModelSimulation.css'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, ChartTooltip, Legend, Filler)

const VARIABLES = ['rainfall', 'tmax', 'tmin']
const VARIABLE_LABELS = { rainfall: 'Rainfall (mm)', tmax: 'Max Temp (°C)', tmin: 'Min Temp (°C)' }
const MODEL_ORDER = ['ConvLSTM2D', 'Climatology', 'Persistence', 'LinearTrend']

function normalizeMetrics(raw) {
  if (!raw?.ConvLSTM2D?.variables) return null
  return { models: raw, hasLeadTime: Boolean(raw.ConvLSTM2D.lead_time_metrics) }
}

// Winner per column, computed from the loaded numbers so a tag can never
// contradict the table beside it.
function bestFor(models, variable, stat) {
  const lowerIsBetter = stat !== 'R2'
  let best = null
  let bestVal = null
  for (const name of MODEL_ORDER) {
    const v = models[name]?.variables?.[variable]?.[stat]
    if (typeof v !== 'number') continue
    if (bestVal === null || (lowerIsBetter ? v < bestVal : v > bestVal)) {
      bestVal = v
      best = name
    }
  }
  return best
}

const TABLE_COLUMNS = [
  ['rainfall', 'MAE', ' mm'], ['rainfall', 'R2', ''],
  ['tmax', 'MAE', ' °C'], ['tmax', 'R2', ''],
  ['tmin', 'MAE', ' °C'], ['tmin', 'R2', ''],
]

export function Comparisons() {
  const [rawMetrics, setRawMetrics] = useState(null)
  const [cityForecast, setCityForecast] = useState(null)
  const [activeVariable, setActiveVariable] = useState('rainfall')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [metricsRes, cityRes] = await Promise.all([
          fetch(`${API_BASE}/api/metrics`),
          fetch(`${API_BASE}/api/forecast/date`)
        ])
        if (metricsRes.status === 404) {
          throw new Error('No evaluation results yet. Run python backend/evaluate.py to generate them.')
        }
        if (!metricsRes.ok || !cityRes.ok) throw new Error('Request failed')
        const metrics = await metricsRes.json()
        const city = await cityRes.json()
        if (!cancelled) {
          setRawMetrics(metrics)
          setCityForecast(city)
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err.message === 'Failed to fetch'
              ? 'Could not reach the forecasting API. Start the backend (python backend/api/app.py) to view comparisons.'
              : err.message
          )
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [attempt])

  // While the API is still booting, keep trying on our own.
  useEffect(() => {
    if (!error) return undefined
    const t = setTimeout(() => setAttempt((n) => n + 1), 5000)
    return () => clearTimeout(t)
  }, [error])

  const metrics = useMemo(() => normalizeMetrics(rawMetrics), [rawMetrics])

  const leadTimeChartData = useMemo(() => {
    if (!metrics?.hasLeadTime) return null
    const days = Object.keys(metrics.models.ConvLSTM2D.lead_time_metrics).sort(
      (a, b) => parseInt(a.split('_')[1]) - parseInt(b.split('_')[1])
    )
    const labels = days.map((d) => `+${d.split('_')[1]}d`)
    return {
      labels,
      datasets: MODEL_ORDER.filter((name) => metrics.models[name]?.lead_time_metrics).map((name) =>
        lineSeries(
          name,
          days.map((d) => metrics.models[name].lead_time_metrics[d]?.[activeVariable]?.MAE),
          seriesFor(name),
          name === 'ConvLSTM2D' ? {} : { dashed: true }
        )
      ),
    }
  }, [metrics, activeVariable])

  const cityBarData = useMemo(() => {
    if (!cityForecast?.city_timeseries) return null
    const cities = Object.keys(cityForecast.city_timeseries)
    return {
      labels: cities.map((c) => c.replace(' (Pilot)', '')),
      datasets: [
        barSeries(
          `Day +1 forecast — ${VARIABLE_LABELS[activeVariable]}`,
          cities.map((c) => cityForecast.city_timeseries[c][`pred_${activeVariable}`]?.[0]),
          seriesFor('ConvLSTM2D')
        ),
      ]
    }
  }, [cityForecast, activeVariable])

  // Single series on both charts here, so the legend box is off — each
  // panel title already names what is plotted.
  // Four series on the lead-time chart, so its legend stays on. The bar chart
  // has one series and its title names it.
  const lineOpts = sharedChartOptions({ yTitle: `MAE (${activeVariable === 'rainfall' ? 'mm/day' : '°C'})` })
  const baseBarOpts = sharedChartOptions({ yTitle: VARIABLE_LABELS[activeVariable], showLegend: false, beginAtZero: true, crosshair: false })
  // Seven city names do not fit horizontally; tilt them rather than let
  // Chart.js silently drop every other label.
  const barOpts = {
    ...baseBarOpts,
    scales: {
      ...baseBarOpts.scales,
      x: {
        ...baseBarOpts.scales?.x,
        ticks: { ...baseBarOpts.scales?.x?.ticks, autoSkip: false, maxRotation: 35, minRotation: 0 },
      },
    },
  }

  return (
    <div className="sim-wrap">
      <section className="sim-header">
        <div>
          <div className="sim-badge-row">
            <span className="sim-badge active"><i /> Karnataka High-Resolution Pilot</span>
            {!loading && !error && (
              <span className="sim-badge is-live">
                <CheckCircle2 size={12} style={{ verticalAlign: '-2px', marginRight: 4 }} />
                Test split 2023–2025 · 1,083 forecasts
              </span>
            )}
          </div>
          <h1 className="sim-title">Model &amp; Regional Comparisons</h1>
          <p className="sim-subtitle">
            How the ConvLSTM2D model stacks up against three baseline forecasters on three years of data it never saw during training, and how accuracy changes over the 14-day horizon.
          </p>
        </div>
      </section>

      <section className="sim-controls-bar">
        <div className="control-group">
          <span className="control-label">Variable:</span>
          <div className="pill-group">
            {VARIABLES.map((v) => (
              <button key={v} className={`pill-btn ${activeVariable === v ? 'active' : ''}`} onClick={() => setActiveVariable(v)}>
                {VARIABLE_LABELS[v]}
              </button>
            ))}
          </div>
        </div>
      </section>

      {error && (
        <section className="sim-state-card is-error">
          ⚠️ {error}{' '}
          <button className="preset-btn" onClick={() => setAttempt((n) => n + 1)}>
            <RefreshCw size={13} /> Retry now
          </button>
          <span className="card-meta"> Retrying automatically…</span>
        </section>
      )}
      {loading && !error && (
        <section className="sim-state-card">
          <RefreshCw size={14} className="spin" /> Loading comparison data...
        </section>
      )}

      {!loading && !error && metrics && (
        <>
          {/* Benchmark Table */}
          <section className="benchmark-table-card">
            <div className="map-card-header">
              <div>
                <span className="section-kicker">Empirical Verification (2023–2025 Test Split)</span>
                <h2 className="card-title">Forecasting Model Benchmark</h2>
              </div>
              <span className="card-meta">Lower MAE is better · higher R² is better</span>
            </div>
            <div className="benchmark-table-wrap">
              <table className="benchmark-table">
                <thead>
                  <tr>
                    <th>Model</th>
                    <th>Rainfall MAE</th>
                    <th>Rainfall R²</th>
                    <th>Tmax MAE</th>
                    <th>Tmax R²</th>
                    <th>Tmin MAE</th>
                    <th>Tmin R²</th>
                  </tr>
                </thead>
                <tbody>
                  {MODEL_ORDER.filter((name) => metrics.models[name]).map((name) => {
                    const m = metrics.models[name]
                    const isModel = name === 'ConvLSTM2D'
                    return (
                      <tr key={name} className={isModel ? 'highlight-row' : ''}>
                        <td>
                          <strong>{name}</strong>
                          {isModel && <span className="model-tag">our model</span>}
                        </td>
                        {TABLE_COLUMNS.map(([variable, stat, unit]) => {
                          const v = m.variables[variable]?.[stat]
                          return (
                            <td key={`${variable}.${stat}`}>
                              {typeof v === 'number' ? `${v.toFixed(2)}${unit}` : '—'}
                              {bestFor(metrics.models, variable, stat) === name && <span className="winner-tag">best</span>}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="takeaway-card">
            <span className="section-kicker">Reading the results</span>
            <p>
              <strong>Temperature is where the model is strongest.</strong> It has the lowest overall minimum-temperature
              error, and it is the best of the four models for Tmax from day 2 to day 5 and for Tmin from day 2 to day 7.
              After about a week, climatology (the 15-year average for each date) catches up, as it does for any
              weather model. <strong>Rainfall is the open problem.</strong> Averaged over every day, the model&rsquo;s error is
              higher than the baselines&rsquo;. It forecasts light rain on many days that stay dry and underestimates
              downpours. It still places heavy monsoon rain in the right districts (try the replays on the Model page),
              and correcting that dry-day bias is a Phase 2 goal.
            </p>
          </section>

          <section className="sim-main-grid">
            {/* Lead-time degradation */}
            <div className="chart-card">
              <span className="section-kicker">Forecast Horizon Degradation</span>
              <h2 className="card-title">Error vs. Lead Day — all models</h2>
              <div className="chart-area">
                {leadTimeChartData ? (
                  <Line data={leadTimeChartData} options={lineOpts} />
                ) : (
                  <p className="sim-state-card">
                    Run <code>python evaluate.py</code> on the backend to generate lead-time degradation data.
                  </p>
                )}
              </div>
            </div>

            {/* City comparison */}
            <div className="chart-card">
              <span className="section-kicker">Regional Snapshot · tomorrow</span>
              <h2 className="card-title">Karnataka Cities — Day +1 Forecast</h2>
              <div className="chart-area">
                {cityBarData ? <Bar data={cityBarData} options={barOpts} /> : null}
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
