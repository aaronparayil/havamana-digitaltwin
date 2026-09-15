import { useState, useEffect, useMemo } from 'react'
import { RefreshCw, CheckCircle2 } from 'lucide-react'
import { Line } from 'react-chartjs-2'
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement,
  LineElement, Title, Tooltip as ChartTooltip, Legend, Filler
} from 'chart.js'
import '../pages/ModelSimulation.css'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, ChartTooltip, Legend, Filler)

const SCENARIO_DEFS = [
  { id: 'immediate', label: '14-Day State Lookahead', color: '#2563eb' },
  { id: 'monsoon_surge', label: 'Monsoon Surge (Ghats & Coast)', color: '#059669' },
  { id: 'north_heatwave', label: 'North Karnataka Heatwave', color: '#d97706' },
  { id: 'post_monsoon', label: 'Post-Monsoon Showers', color: '#7c3aed' },
  { id: 'upcoming_winter', label: 'Winter Cool Front', color: '#0891b2' },
]

const VARIABLES = ['rainfall', 'tmax', 'tmin']
const VARIABLE_LABELS = { rainfall: 'Rainfall (mm)', tmax: 'Max Temp (°C)', tmin: 'Min Temp (°C)' }

const average = (arr) => (arr && arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null)

export function Scenarios() {
  const [scenarioData, setScenarioData] = useState(null) // { [scenarioId]: apiResponse }
  const [activeVariable, setActiveVariable] = useState('rainfall')
  const [selectedCity, setSelectedCity] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const results = await Promise.all(
          SCENARIO_DEFS.map((s) =>
            fetch(`http://localhost:5005/api/forecast/future?scenario=${s.id}`).then((r) => {
              if (!r.ok) throw new Error('Request failed')
              return r.json()
            })
          )
        )
        if (cancelled) return
        const data = {}
        SCENARIO_DEFS.forEach((s, i) => { data[s.id] = results[i] })
        setScenarioData(data)
        const firstCities = Object.keys(results[0]?.city_timeseries || {})
        setSelectedCity(firstCities.includes('Bengaluru (Pilot)') ? 'Bengaluru (Pilot)' : firstCities[0])
      } catch (err) {
        if (!cancelled) {
          setError(
            err.message === 'Failed to fetch'
              ? 'Could not reach the forecasting API. Start the backend (python backend/api/app.py) to compare scenarios.'
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

  const cityOptions = useMemo(() => {
    if (!scenarioData) return []
    return Object.keys(scenarioData.immediate?.city_timeseries || {})
  }, [scenarioData])

  const summaryRows = useMemo(() => {
    if (!scenarioData || !selectedCity) return []
    return SCENARIO_DEFS.map((s) => {
      const resp = scenarioData[s.id]
      const cityTs = resp?.city_timeseries?.[selectedCity]
      const predAvg = average(cityTs?.[`pred_${activeVariable}`])
      const climAvg = average(cityTs?.[`climatology_${activeVariable}`])
      return {
        ...s,
        startDate: resp?.forecast_start_date,
        endDate: resp?.forecast_end_date,
        predAvg,
        climAvg,
        delta: (predAvg !== null && climAvg !== null) ? predAvg - climAvg : null
      }
    })
  }, [scenarioData, selectedCity, activeVariable])

  const combinedChartData = useMemo(() => {
    if (!scenarioData || !selectedCity) return null
    const labels = Array.from({ length: 14 }, (_, i) => `+${i + 1}d`)
    return {
      labels,
      datasets: SCENARIO_DEFS.map((s) => ({
        label: s.label,
        data: scenarioData[s.id]?.city_timeseries?.[selectedCity]?.[`pred_${activeVariable}`] || [],
        borderColor: s.color,
        backgroundColor: 'transparent',
        borderWidth: 2.5,
        tension: 0.3,
        pointRadius: 2,
      }))
    }
  }, [scenarioData, selectedCity, activeVariable])

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top', labels: { boxWidth: 10, font: { family: 'DM Sans', size: 10 } } },
      tooltip: { backgroundColor: '#173c3a', padding: 10 }
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: '#84908b', font: { family: 'DM Mono', size: 10 } } },
      y: {
        grid: { color: '#e8e5dc' },
        ticks: { color: '#84908b', font: { family: 'DM Mono', size: 10 } },
        title: { display: true, text: VARIABLE_LABELS[activeVariable], font: { family: 'DM Sans', size: 11, weight: 'bold' } }
      }
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
          <h1 className="sim-title">Future Scenario Comparison</h1>
          <p className="sim-subtitle">
            Side-by-side outlook across all forward-looking scenarios, so you can see how Karnataka's next monsoon, heatwave, or winter front compares.
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
        {cityOptions.length > 0 && (
          <div className="control-group">
            <span className="control-label">City:</span>
            <select className="city-select" value={selectedCity || ''} onChange={(e) => setSelectedCity(e.target.value)}>
              {cityOptions.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        )}
      </section>

      {error && (
        <section className="timeline-card" style={{ color: '#a15c2e', font: '13px "DM Sans", sans-serif' }}>
          ⚠️ {error}
        </section>
      )}
      {loading && !error && (
        <section className="timeline-card" style={{ font: '13px "DM Sans", sans-serif', color: '#6a7972', display: 'flex', alignItems: 'center', gap: 8 }}>
          <RefreshCw size={14} className="spin" /> Loading all scenarios...
        </section>
      )}

      {!loading && !error && scenarioData && (
        <>
          <section className="benchmark-table-card">
            <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid var(--line)' }}>
              <span className="section-kicker">14-Day Averages — {selectedCity}</span>
              <h2 style={{ font: '600 18px Fraunces, serif', margin: '4px 0 0' }}>Scenario Summary</h2>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="benchmark-table">
                <thead>
                  <tr>
                    <th>Scenario</th>
                    <th>Window</th>
                    <th>Avg {VARIABLE_LABELS[activeVariable]}</th>
                    <th>15-Yr Normal</th>
                    <th>Anomaly</th>
                  </tr>
                </thead>
                <tbody>
                  {summaryRows.map((row) => (
                    <tr key={row.id}>
                      <td><strong style={{ color: row.color }}>●</strong> {row.label}</td>
                      <td style={{ font: '11px "DM Mono", monospace' }}>{row.startDate} → {row.endDate}</td>
                      <td>{row.predAvg?.toFixed(2) ?? '—'}</td>
                      <td>{row.climAvg?.toFixed(2) ?? '—'}</td>
                      <td style={{ color: row.delta > 0 ? '#dc2626' : row.delta < 0 ? '#2563eb' : undefined }}>
                        {row.delta !== null ? (row.delta >= 0 ? `+${row.delta.toFixed(2)}` : row.delta.toFixed(2)) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="chart-card">
            <span className="section-kicker">14-Day Trajectories</span>
            <h2 style={{ font: '600 18px Fraunces, serif', margin: '4px 0 0' }}>All Scenarios — {selectedCity}</h2>
            <div className="chart-area" style={{ minHeight: 360 }}>
              {combinedChartData && <Line data={combinedChartData} options={chartOptions} />}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
