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

// Normalizes either the full evaluate.py output shape ({model: {variables: {rainfall: {MAE,RMSE,R2}}}})
// or the API's lightweight fallback shape ({benchmark_summary: {model: {Rainfall_MAE, ...}}}) into one form.
function normalizeMetrics(raw) {
  if (!raw) return null
  if (raw.ConvLSTM2D?.variables) {
    return { models: raw, hasLeadTime: Boolean(raw.ConvLSTM2D.lead_time_metrics) }
  }
  if (raw.benchmark_summary) {
    const models = {}
    for (const [name, m] of Object.entries(raw.benchmark_summary)) {
      models[name] = {
        variables: {
          rainfall: { MAE: m.Rainfall_MAE, R2: m.Rainfall_R2 },
          tmax: { MAE: m.Tmax_MAE, R2: m.Tmax_R2 },
          tmin: { MAE: m.Tmin_MAE, R2: m.Tmin_R2 }
        }
      }
    }
    return { models, hasLeadTime: false }
  }
  return null
}

export function Comparisons() {
  const [rawMetrics, setRawMetrics] = useState(null)
  const [cityForecast, setCityForecast] = useState(null)
  const [activeVariable, setActiveVariable] = useState('rainfall')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

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
  }, [])

  const metrics = useMemo(() => normalizeMetrics(rawMetrics), [rawMetrics])

  const leadTimeChartData = useMemo(() => {
    if (!metrics?.hasLeadTime) return null
    const days = Object.keys(metrics.models.ConvLSTM2D.lead_time_metrics).sort(
      (a, b) => parseInt(a.split('_')[1]) - parseInt(b.split('_')[1])
    )
    const labels = days.map((d) => `+${d.split('_')[1]}d`)
    const maeByDay = days.map((d) => metrics.models.ConvLSTM2D.lead_time_metrics[d][activeVariable]?.MAE)
    return {
      labels,
      datasets: [
        lineSeries(
          `ConvLSTM2D ${VARIABLE_LABELS[activeVariable]} MAE`,
          maeByDay,
          seriesFor('ConvLSTM2D'),
          { fill: true }
        ),
      ]
    }
  }, [metrics, activeVariable])

  const cityBarData = useMemo(() => {
    if (!cityForecast?.city_timeseries) return null
    const cities = Object.keys(cityForecast.city_timeseries)
    return {
      labels: cities,
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
  const lineOpts = sharedChartOptions({ yTitle: `MAE (${activeVariable === 'rainfall' ? 'mm/day' : '°C'})`, showLegend: false })
  const barOpts = sharedChartOptions({ yTitle: VARIABLE_LABELS[activeVariable], showLegend: false, beginAtZero: true, crosshair: false })

  return (
    <div className="sim-wrap">
      <section className="sim-header">
        <div>
          <div className="sim-badge-row">
            <span className="sim-badge active"><i /> Karnataka High-Resolution Pilot</span>
            {!loading && !error && (
              <span className="sim-badge is-live">
                <CheckCircle2 size={12} style={{ verticalAlign: '-2px', marginRight: 4 }} />
                Live Neural API
              </span>
            )}
          </div>
          <h1 className="sim-title">Model &amp; Regional Comparisons</h1>
          <p className="sim-subtitle">
            How the ConvLSTM2D model stacks up against baseline forecasters, how accuracy decays over the 14-day horizon, and how districts compare today.
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
          ⚠️ {error}
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
              <span className="section-kicker">Empirical Verification (2023–2025 Test Split)</span>
              <h2 className="card-title">Forecasting Model Benchmark</h2>
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
                          {isModel && <span className="winner-tag">Neural Model</span>}
                        </td>
                        <td>{m.variables.rainfall?.MAE?.toFixed(2) ?? '—'} mm</td>
                        <td>{m.variables.rainfall?.R2?.toFixed(2) ?? '—'}</td>
                        <td>{m.variables.tmax?.MAE?.toFixed(2) ?? '—'} °C</td>
                        <td>{m.variables.tmax?.R2?.toFixed(2) ?? '—'}</td>
                        <td>{m.variables.tmin?.MAE?.toFixed(2) ?? '—'} °C</td>
                        <td>{m.variables.tmin?.R2?.toFixed(2) ?? '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="sim-main-grid">
            {/* Lead-time degradation */}
            <div className="chart-card">
              <span className="section-kicker">Forecast Horizon Degradation</span>
              <h2 className="card-title">Accuracy vs. Lead Day</h2>
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
              <span className="section-kicker">Regional Snapshot</span>
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
