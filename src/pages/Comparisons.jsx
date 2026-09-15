import { useState, useEffect, useMemo } from 'react'
import { RefreshCw, CheckCircle2 } from 'lucide-react'
import { Line, Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement,
  LineElement, BarElement, Title, Tooltip as ChartTooltip, Legend, Filler
} from 'chart.js'
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
          fetch('http://localhost:5005/api/metrics'),
          fetch('http://localhost:5005/api/forecast/date')
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
      datasets: [{
        label: `ConvLSTM2D ${VARIABLE_LABELS[activeVariable]} MAE by Lead Day`,
        data: maeByDay,
        borderColor: '#2563eb',
        backgroundColor: 'rgba(37, 99, 235, 0.12)',
        fill: true,
        tension: 0.3,
        borderWidth: 3,
        pointRadius: 3,
      }]
    }
  }, [metrics, activeVariable])

  const cityBarData = useMemo(() => {
    if (!cityForecast?.city_timeseries) return null
    const cities = Object.keys(cityForecast.city_timeseries)
    return {
      labels: cities,
      datasets: [{
        label: `Day +1 Forecast — ${VARIABLE_LABELS[activeVariable]}`,
        data: cities.map((c) => cityForecast.city_timeseries[c][`pred_${activeVariable}`]?.[0]),
        backgroundColor: '#2b8a72',
        borderRadius: 4,
      }]
    }
  }, [cityForecast, activeVariable])

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top', labels: { boxWidth: 12, font: { family: 'DM Sans', size: 11 } } },
      tooltip: { backgroundColor: '#173c3a', padding: 10 }
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: '#84908b', font: { family: 'DM Mono', size: 10 } } },
      y: { grid: { color: '#e8e5dc' }, ticks: { color: '#84908b', font: { family: 'DM Mono', size: 10 } } }
    }
  }

  return (
    <div className="sim-wrap">
      <section className="sim-header">
        <div>
          <div className="sim-badge-row">
            <span className="sim-badge active"><i /> Karnataka High-Resolution Pilot</span>
            {!loading && !error && (
              <span className="sim-badge" style={{ background: '#deeee1', color: '#2b8a72' }}>
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
        <section className="timeline-card" style={{ color: '#a15c2e', font: '13px "DM Sans", sans-serif' }}>
          ⚠️ {error}
        </section>
      )}
      {loading && !error && (
        <section className="timeline-card" style={{ font: '13px "DM Sans", sans-serif', color: '#6a7972', display: 'flex', alignItems: 'center', gap: 8 }}>
          <RefreshCw size={14} className="spin" /> Loading comparison data...
        </section>
      )}

      {!loading && !error && metrics && (
        <>
          {/* Benchmark Table */}
          <section className="benchmark-table-card">
            <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid var(--line)' }}>
              <span className="section-kicker">Empirical Verification (2023–2025 Test Split)</span>
              <h2 style={{ font: '600 18px Fraunces, serif', margin: '4px 0 0' }}>Forecasting Model Benchmark</h2>
            </div>
            <div style={{ overflowX: 'auto' }}>
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
              <h2 style={{ font: '600 18px Fraunces, serif', margin: '4px 0 0' }}>Accuracy vs. Lead Day</h2>
              <div className="chart-area">
                {leadTimeChartData ? (
                  <Line data={leadTimeChartData} options={chartOptions} />
                ) : (
                  <p style={{ color: '#6a7972', fontSize: 13, marginTop: 40 }}>
                    Run <code>python evaluate.py</code> on the backend to generate lead-time degradation data.
                  </p>
                )}
              </div>
            </div>

            {/* City comparison */}
            <div className="chart-card">
              <span className="section-kicker">Regional Snapshot</span>
              <h2 style={{ font: '600 18px Fraunces, serif', margin: '4px 0 0' }}>Karnataka Cities — Day +1 Forecast</h2>
              <div className="chart-area">
                {cityBarData ? <Bar data={cityBarData} options={chartOptions} /> : null}
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
