import { useState, useEffect, useRef, useMemo, lazy, Suspense } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Play, Pause, RotateCcw, CloudRain, Thermometer,
  CheckCircle2, AlertCircle, RefreshCw, Grid2x2, Box
} from 'lucide-react'
import { Line } from 'react-chartjs-2'
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement,
  LineElement, Title, Tooltip as ChartTooltip, Legend, Filler
} from 'chart.js'
import { DatePicker } from '../components/DatePicker'
import { cellColor, legendGradient, legendBounds, legendTicks, seriesFor } from '../styles/dataColors'
import { chartOptions, lineSeries } from '../styles/chartTheme'
import { API_BASE } from '../hooks/useApiHealth'

// Loaded only when the 3D tab is opened — keeps three.js out of the main bundle.
const ForecastTerrain3D = lazy(() =>
  import('../components/ForecastTerrain3D').then((m) => ({ default: m.ForecastTerrain3D }))
)
import './ModelSimulation.css'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, ChartTooltip, Legend, Filler)

// Future Forecasting Scenarios for Karnataka State Pilot
const SCENARIOS = [
  { id: 'immediate', label: '🔮 Next 14 days', desc: 'Forward projection seeded from the most recent recorded observations for this time of year' },
  { id: 'monsoon_surge', label: '🌧️ Monsoon Surge (Ghats & Coast)', desc: 'Heavy precipitation over Coastal Karnataka and Malnad Western Ghats' },
  { id: 'north_heatwave', label: '☀️ North Karnataka Heatwave', desc: 'Pre-monsoon peak heat over Kalaburagi, Raichur, and Vijayapura' },
  { id: 'post_monsoon', label: '🌾 Post-Monsoon Showers', desc: 'Northeast monsoon convective showers over Bengaluru & South Interior' },
]

// Held-out test-period events (2023-2025, never seen in training) that make
// good live demos. Picked by scoring every test window against the recorded
// IMD grids; the skill numbers shown on screen are recomputed by the API for
// the loaded window, not copied from here.
const FEATURED_REPLAYS = [
  {
    date: '2024-05-04',
    variable: 'tmax',
    city: 'Kalaburagi',
    title: '2024 pre-monsoon heatwave',
    blurb: 'North Karnataka peaked near 44 °C. Watch the model hold the heat dome in place.',
  },
  {
    date: '2023-07-24',
    variable: 'rainfall',
    city: 'Mangaluru',
    title: 'July 2023 Western Ghats deluge',
    blurb: 'Coastal and Malnad districts under 20–100 mm/day. The model locates the rain band.',
  },
  {
    date: '2024-07-24',
    variable: 'rainfall',
    city: 'Shivamogga',
    title: 'Peak of the 2024 monsoon',
    blurb: 'A second monsoon surge a year later, to show the first was not a one-off.',
  },
]

const VAR_UNIT = { rainfall: 'mm', tmax: '°C', tmin: '°C' }
const VAR_NAME = { rainfall: 'Rainfall', tmax: 'Max temp', tmin: 'Min temp' }

// High-Resolution 32x32 Karnataka State Land Mask (Lat 11.5°N - 18.5°N, Lon 74.0°E - 78.6°E)
// Row 0 is South (11.5°N), Row 31 is North (18.5°N)
const KARNATAKA_LAND_MASK = [
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0],
  [0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
]

// Key Karnataka Regional Centers
const CITIES = [
  { name: 'Bengaluru (Pilot)', y: 7, x: 24, region: 'South Interior Plateau' },
  { name: 'Mysuru', y: 4, x: 18, region: 'South Interior Valley' },
  { name: 'Mangaluru', y: 6, x: 6, region: 'Coastal Karnataka' },
  { name: 'Shivamogga', y: 11, x: 11, region: 'Malnad Western Ghats' },
  { name: 'Hubballi-Dharwad', y: 17, x: 8, region: 'Central Transition' },
  { name: 'Belagavi', y: 19, x: 3, region: 'North Western Border' },
  { name: 'Kalaburagi', y: 26, x: 19, region: 'North Interior Semi-Arid' }
]

/* ---------------------------------------------------------------- benchmark
   The benchmark table used to hardcode four rows and stamp "Neural Best" on
   ConvLSTM unconditionally — while the numbers beside it showed climatology
   winning every column. The winner is now computed per column from whatever
   data is actually loaded, so the tag can never contradict the table. */
const LEAD_DAYS = [
  { day: 1, label: '24h lead' },
  { day: 3, label: '72h lead' },
  { day: 7, label: '1-week lead' },
  { day: 14, label: '2-week horizon' },
]

const fmt = (v) => (typeof v === 'number' ? v.toFixed(2) : '—')

const BENCH_ROWS = [
  { key: 'ConvLSTM2D', label: 'ConvLSTM2D (state model)' },
  { key: 'Climatology', label: 'Climatology baseline (15-yr mean)' },
  { key: 'Persistence', label: 'Persistence baseline (repeat day 0)' },
  { key: 'LinearTrend', label: 'Linear trend extrapolation' },
]

// `lowerIsBetter` is what makes the winner calculation correct for both error
// metrics and R², rather than assuming one direction.
const BENCH_COLUMNS = [
  { key: 'rainfall.MAE',  label: 'Rainfall MAE',  unit: ' mm', lowerIsBetter: true },
  { key: 'rainfall.RMSE', label: 'Rainfall RMSE', unit: ' mm', lowerIsBetter: true },
  { key: 'rainfall.R2',   label: 'Rainfall R²', unit: '',  lowerIsBetter: false },
  { key: 'tmax.MAE',      label: 'Tmax MAE',      unit: ' °C', lowerIsBetter: true },
  { key: 'tmax.RMSE',     label: 'Tmax RMSE',     unit: ' °C', lowerIsBetter: true },
  { key: 'tmax.R2',       label: 'Tmax R²',     unit: '',  lowerIsBetter: false },
  { key: 'tmin.MAE',      label: 'Tmin MAE',      unit: ' °C', lowerIsBetter: true },
  { key: 'tmin.R2',       label: 'Tmin R²',     unit: '',  lowerIsBetter: false },
]

function benchValue(metrics, modelKey, column) {
  const [variable, stat] = column.key.split('.')
  const v = metrics?.[modelKey]?.variables?.[variable]?.[stat]
  return typeof v === 'number' ? v : null
}

function bestModelFor(metrics, column) {
  let winner = null
  let bestVal = null
  for (const row of BENCH_ROWS) {
    const v = benchValue(metrics, row.key, column)
    if (v === null) continue
    if (bestVal === null || (column.lowerIsBetter ? v < bestVal : v > bestVal)) {
      bestVal = v
      winner = row.key
    }
  }
  return winner
}

// Local-timezone "today" as YYYY-MM-DD, used to default the date picker to a live current date
function getTodayISO() {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/** City dots with short labels, drawn in grid units on the 32x32 raster. */
function CityMarkers({ selected, onSelect }) {
  return CITIES.map((city) => {
    const cx = city.x + 0.5
    const cy = 31 - city.y + 0.5
    const short = city.name.replace(' (Pilot)', '')
    // Labels sit left of dots near the eastern edge so they stay inside the state.
    const anchorEnd = city.x > 20
    return (
      <g
        key={city.name}
        className={`city-marker ${selected === city.name ? 'is-selected' : ''}`}
        onClick={() => onSelect?.(city.name)}
        role="button"
        aria-label={`Show ${short} in the chart`}
      >
        <title>{`${short}: click to chart`}</title>
        <circle cx={cx} cy={cy} r="1.3" className="city-hit" />
        <circle cx={cx} cy={cy} r="0.42" className="city-pin" />
        <text
          x={anchorEnd ? cx - 0.8 : cx + 0.8}
          y={cy + 0.35}
          textAnchor={anchorEnd ? 'end' : 'start'}
          className="city-pin-label"
        >
          {short}
        </text>
      </g>
    )
  })
}

/** Colour key for a raster; bounds and gradient come from dataColors.js. */
function MapLegend({ variable, mode }) {
  const bounds = legendBounds(variable, mode)
  const ticks = legendTicks(variable, mode)
  return (
    <div className="legend-bar-wrap">
      <span className="legend-end">{bounds.low}</span>
      <div className="legend-scale">
        <div
          className="legend-gradient"
          style={{ background: legendGradient(variable, mode) }}
          role="img"
          aria-label={`Colour scale from ${bounds.low} to ${bounds.high}`}
        />
        {ticks && (
          <div className="legend-ticks">
            {ticks.map((t) => <span key={t}>{t}</span>)}
          </div>
        )}
      </div>
      <span className="legend-end">{bounds.high}</span>
    </div>
  )
}

/** Forecast, recorded value and error for one hovered cell of a replay. */
function ReplayCellReadout({ day, cell, variable }) {
  const { x, y } = cell
  const u = VAR_UNIT[variable]
  const pick = (grid) => {
    const v = grid?.[variable]?.[y]?.[x]
    return typeof v === 'number' ? `${v.toFixed(1)} ${u}` : '—'
  }
  const lat = (11.5 + (y / 31) * 7.0).toFixed(2)
  const lon = (74.0 + (x / 31) * 4.6).toFixed(2)
  return (
    <div className="pixel-hover-info">
      <div>📍 <strong>{lat}°N, {lon}°E</strong></div>
      <div>Forecast: <strong>{pick(day.forecast_grid)}</strong></div>
      {day.actual_grid && <div>Recorded: <strong>{pick(day.actual_grid)}</strong></div>}
      {day.error_grid && <div className="pin-sub">Error: {pick(day.error_grid)}</div>}
    </div>
  )
}

/** Plain-language verdict for one variable over a replayed window. */
function SkillTile({ variable, skill }) {
  if (!skill) return null
  const model = skill.ConvLSTM2D
  const clim = skill.Climatology
  const gain = clim > 0 ? ((clim - model) / clim) * 100 : null
  const beats = gain !== null && gain > 0
  return (
    <div className="skill-tile">
      <span className="stat-label">{VAR_NAME[variable]} · first 3 days</span>
      <div className="skill-main">
        <strong>{model.toFixed(2)} {VAR_UNIT[variable]}</strong>
        <span>model error</span>
      </div>
      <div className="skill-sub">
        vs {clim.toFixed(2)} {VAR_UNIT[variable]} climatology ·{' '}
        <em className={beats ? 'is-good' : 'is-poor'}>
          {gain === null ? '—' : beats ? `${gain.toFixed(0)}% lower error` : `${Math.abs(gain).toFixed(0)}% higher error`}
        </em>
      </div>
      {typeof skill.pattern_correlation === 'number' && (
        <div className="skill-sub">
          Spatial pattern match r = <strong>{skill.pattern_correlation.toFixed(2)}</strong>
        </div>
      )}
    </div>
  )
}

export function ModelSimulation() {
  // ?replay=YYYY-MM-DD opens straight into Replay & verify on that date, so a
  // presenter can bookmark an event instead of clicking through to it.
  const [searchParams] = useSearchParams()
  const replayParam = searchParams.get('replay')
  const replayPreset = FEATURED_REPLAYS.find((r) => r.date === replayParam)

  const [selectedScenario, setSelectedScenario] = useState('immediate')
  const [activeVariable, setActiveVariable] = useState(replayPreset?.variable ?? 'rainfall') // 'rainfall' | 'tmax' | 'tmin'
  const [viewMode, setViewMode] = useState('forecast') // 'forecast' | 'climatology' | 'anomaly'
  const [leadDay, setLeadDay] = useState(1) // 1 to 14
  const [isPlaying, setIsPlaying] = useState(false)
  const [selectedCity, setSelectedCity] = useState(replayPreset?.city ?? 'Bengaluru (Pilot)')
  const [hoveredPixel, setHoveredPixel] = useState(null)
  const [dateHover, setDateHover] = useState(null) // { x, y } cell under the pointer in replay mode
  // 2D stays the precise reading surface; 3D is the showpiece. Neither replaces the other.
  const [renderMode, setRenderMode] = useState('2d') // '2d' | '3d'

  // Explorer mode: forward-looking scenarios vs. a specific calendar date lookup
  const [explorerMode, setExplorerMode] = useState(replayParam ? 'date' : 'future') // 'future' | 'date'
  const [selectedDate, setSelectedDate] = useState(replayParam || getTodayISO())
  const [dateForecast, setDateForecast] = useState(null)
  const [dateLoading, setDateLoading] = useState(false)
  const [dateError, setDateError] = useState(null)
  const [dateLeadDay, setDateLeadDay] = useState(1)
  const [dateViewMode, setDateViewMode] = useState('forecast') // 'forecast' | 'actual' | 'error'

  // API State
  const [apiConnected, setApiConnected] = useState(null) // null = first request in flight
  const [loading, setLoading] = useState(false)
  const [forecastData, setForecastData] = useState(null)
  const [benchmarkMetrics, setBenchmarkMetrics] = useState(null)

  const timerRef = useRef(null)

  // Fetch a 14-day forecast starting at a specific calendar date (predicted vs. actual, if recorded)
  const fetchDateForecast = async (dateStr) => {
    setDateLoading(true)
    setDateError(null)
    try {
      const res = await fetch(`${API_BASE}/api/forecast/date?date=${dateStr}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Request failed')
      setDateForecast(data)
      setDateLeadDay(1)
      setApiConnected(true)
    } catch (err) {
      setDateForecast(null)
      setDateError(
        err.message === 'Failed to fetch'
          ? 'Could not reach the forecasting API. Start the backend (python backend/api/app.py) to explore historical dates.'
          : err.message
      )
    } finally {
      setDateLoading(false)
    }
  }

  // Fetch true future forward forecast from Flask API
  const fetchFutureForecast = async (scenario) => {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/forecast/future?scenario=${scenario}`)
      if (res.ok) {
        const data = await res.json()
        setForecastData(data)
        setApiConnected(true)
      } else {
        throw new Error('API request failed')
      }
    } catch (err) {
      console.log('Running in Karnataka local simulation mode:', err)
      setApiConnected(false)
      generateKarnatakaLocalForecast(scenario)
    } finally {
      setLoading(false)
    }
  }

  const fetchMetrics = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/metrics`)
      if (res.ok) {
        const data = await res.json()
        setBenchmarkMetrics(data)
      }
    } catch {
      // Real numbers from backend/outputs/metrics/evaluation_metrics_karnataka.json
      // (2023-2025 test split, 1,083 sequences). Kept in sync with that file —
      // the previous constants here were labelled "exact empirical" but did not
      // match any evaluation run.
      setBenchmarkMetrics({
        ConvLSTM2D: {
          variables: {
            rainfall: { MAE: 4.387, RMSE: 7.974, R2: 0.207 },
            tmax: { MAE: 1.255, RMSE: 1.697, R2: 0.739 },
            tmin: { MAE: 0.925, RMSE: 1.287, R2: 0.757 },
          },
          lead_time_metrics: {
            day_1: { rainfall: { MAE: 3.993 }, tmax: { MAE: 0.655, R2: 0.927 }, tmin: { MAE: 0.54, R2: 0.92 } },
            day_3: { rainfall: { MAE: 4.421 }, tmax: { MAE: 1.054, R2: 0.821 }, tmin: { MAE: 0.81, R2: 0.815 } },
            day_7: { rainfall: { MAE: 4.434 }, tmax: { MAE: 1.319, R2: 0.727 }, tmin: { MAE: 0.974, R2: 0.734 } },
            day_14: { rainfall: { MAE: 4.422 }, tmax: { MAE: 1.494, R2: 0.641 }, tmin: { MAE: 1.041, R2: 0.707 } },
          },
        },
        Climatology: {
          variables: {
            rainfall: { MAE: 3.51, RMSE: 7.888, R2: 0.224 },
            tmax: { MAE: 1.238, RMSE: 1.698, R2: 0.739 },
            tmin: { MAE: 1.002, RMSE: 1.359, R2: 0.729 },
          }
        },
        Persistence: {
          variables: {
            rainfall: { MAE: 3.989, RMSE: 10.093, R2: -0.271 },
            tmax: { MAE: 1.331, RMSE: 1.805, R2: 0.705 },
            tmin: { MAE: 1.032, RMSE: 1.477, R2: 0.68 },
          }
        },
        LinearTrend: {
          variables: {
            rainfall: { MAE: 4.123, RMSE: 9.146, R2: -0.044 },
            tmax: { MAE: 1.619, RMSE: 2.143, R2: 0.584 },
            tmin: { MAE: 1.106, RMSE: 1.557, R2: 0.645 },
          }
        },
      })
    }
  }

  // Realistic Karnataka local fallback generator respecting local agro-climatic zones
  const generateKarnatakaLocalForecast = (scenario) => {
    const H = 32
    const W = 32
    const days = []
    
    let baseDate
    let isMonsoon = false
    let isSummer = false
    let isPostMonsoon = false

    if (scenario === 'monsoon_surge') {
      baseDate = new Date('2026-07-01')
      isMonsoon = true
    } else if (scenario === 'north_heatwave') {
      baseDate = new Date('2026-05-10')
      isSummer = true
    } else if (scenario === 'post_monsoon') {
      baseDate = new Date('2026-10-15')
      isPostMonsoon = true
    } else {
      // Immediate next 14 days
      baseDate = new Date('2026-01-01')
    }

    const dateList = []
    for (let d = 0; d < 14; d++) {
      const curDate = new Date(baseDate)
      curDate.setDate(curDate.getDate() + d)
      dateList.push(curDate.toISOString().split('T')[0])
    }

    for (let d = 0; d < 14; d++) {
      const predRain = [], climRain = [], anomRain = []
      const predTmax = [], climTmax = [], anomTmax = []
      const predTmin = [], climTmin = [], anomTmin = []

      for (let y = 0; y < H; y++) {
        const rowPR = [], rowCR = [], rowAR = []
        const rowPTx = [], rowCTx = [], rowATx = []
        const rowPTn = [], rowCTn = [], rowATn = []

        const latNorm = y / 31 // 0 (Chamarajanagar) to 1 (Bidar)
        for (let x = 0; x < W; x++) {
          const lonNorm = x / 31 // 0 (Coastal Karwar/Mangaluru) to 1 (Kolar/Mulbagal)
          const isLand = KARNATAKA_LAND_MASK[y] && KARNATAKA_LAND_MASK[y][x] === 1

          if (!isLand) {
            rowPR.push(0); rowCR.push(0); rowAR.push(0)
            rowPTx.push(0); rowCTx.push(0); rowATx.push(0)
            rowPTn.push(0); rowCTn.push(0); rowATn.push(0)
            continue
          }

          // Coastal & Western Ghats orographic barrier (high rainfall in west x < 0.35)
          const isCoastGhats = lonNorm < 0.32
          const isNorthInterior = latNorm > 0.65
          const isSouthInterior = latNorm <= 0.45 && lonNorm > 0.45

          let climR = 0
          if (isMonsoon) {
            climR = isCoastGhats ? (45 - lonNorm * 60) : (6 + Math.sin(latNorm * 3) * 4)
            climR = Math.max(0, climR)
          } else if (isPostMonsoon) {
            climR = isSouthInterior ? (18 + Math.cos(d * 0.4) * 6) : 4
          } else {
            // Winter dry season / immediate forward rollout (localized winter baseline)
            climR = isCoastGhats ? 1.5 : (isSouthInterior ? 1.2 + Math.sin(d * 0.5) * 0.6 : 0.4)
          }

          const predR = Math.max(0, Math.round(climR * (1.12 + 0.15 * Math.sin(d * 0.35 + x * 0.5)) * 10) / 10)
          const anomR = Math.round((predR - climR) * 10) / 10

          // Tmax patterns: North Interior (Kalaburagi) hottest, Bengaluru/Mysuru moderate
          let baseTx = 30.0
          if (isSummer) {
            baseTx = isNorthInterior ? 42.5 : isSouthInterior ? 34.5 : 36.0
          } else if (isMonsoon) {
            baseTx = isCoastGhats ? 28.5 : 31.0
          } else {
            baseTx = isNorthInterior ? 31.0 : isSouthInterior ? 27.5 : 29.0
          }

          const climTx = Math.round((baseTx + Math.sin(x * 0.3) * 0.8) * 10) / 10
          const predTx = Math.round((climTx + 0.9 + Math.sin(d * 0.3 + y * 0.2) * 0.6) * 10) / 10
          const anomTx = Math.round((predTx - climTx) * 10) / 10

          // Tmin patterns
          const climTn = Math.round((climTx - (isSummer ? 14.5 : 9.5)) * 10) / 10
          const predTn = Math.round((climTn + 0.7 + Math.cos(d * 0.4) * 0.5) * 10) / 10
          const anomTn = Math.round((predTn - climTn) * 10) / 10

          rowPR.push(predR); rowCR.push(climR); rowAR.push(anomR)
          rowPTx.push(predTx); rowCTx.push(climTx); rowATx.push(anomTx)
          rowPTn.push(predTn); rowCTn.push(climTn); rowATn.push(anomTn)
        }
        predRain.push(rowPR); climRain.push(rowCR); anomRain.push(rowAR)
        predTmax.push(rowPTx); climTmax.push(rowCTx); anomTmax.push(rowATx)
        predTmin.push(rowPTn); climTmin.push(rowCTn); anomTmin.push(rowATn)
      }

      days.push({
        day_index: d + 1,
        date: dateList[d],
        forecast_grid: { rainfall: predRain, tmax: predTmax, tmin: predTmin },
        climatology_grid: { rainfall: climRain, tmax: climTmax, tmin: climTmin },
        anomaly_grid: { rainfall: anomRain, tmax: anomTmax, tmin: anomTmin },
      })
    }

    const cityTimeseries = {}
    CITIES.forEach((c) => {
      cityTimeseries[c.name] = {
        dates: dateList,
        pred_rainfall: days.map(d => d.forecast_grid.rainfall[c.y][c.x]),
        climatology_rainfall: days.map(d => d.climatology_grid.rainfall[c.y][c.x]),
        pred_tmax: days.map(d => d.forecast_grid.tmax[c.y][c.x]),
        climatology_tmax: days.map(d => d.climatology_grid.tmax[c.y][c.x]),
        pred_tmin: days.map(d => d.forecast_grid.tmin[c.y][c.x]),
        climatology_tmin: days.map(d => d.climatology_grid.tmin[c.y][c.x]),
      }
    })

    setForecastData({
      forecast_type: 'future_prediction',
      region: 'Karnataka',
      scenario,
      forecast_start_date: dateList[0],
      forecast_end_date: dateList[13],
      horizon_days: 14,
      is_future_unseen: true,
      land_mask: KARNATAKA_LAND_MASK,
      days,
      city_timeseries: cityTimeseries
    })
  }

  /* The API takes ~5 s (longer on a cold machine) to load TensorFlow and the dataset. Opening this page
     before it is ready used to leave demo data on screen until someone
     clicked Re-compute. Now it quietly retries and swaps in the real model
     output the moment the API answers. */
  useEffect(() => {
    if (apiConnected !== false) return undefined
    const t = setInterval(() => {
      if (explorerMode === 'future') fetchFutureForecast(selectedScenario)
      else if (dateError) fetchDateForecast(selectedDate)
      fetchMetrics()
    }, 5000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiConnected, explorerMode, selectedScenario, dateError, selectedDate])

  /* Keyboard control for presenting: Space plays/pauses, arrow keys step the
     forecast day. Ignored while typing in a field or using a select. */
  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target?.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || e.target?.isContentEditable) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const step = explorerMode === 'date' ? setDateLeadDay : setLeadDay
      if (e.key === ' ') {
        e.preventDefault()
        // A focused button would otherwise also "click" on keyup.
        if (e.target?.tagName === 'BUTTON') e.target.blur()
        setIsPlaying((p) => !p)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        setIsPlaying(false)
        step((d) => Math.min(14, d + 1))
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        setIsPlaying(false)
        step((d) => Math.max(1, d - 1))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [explorerMode])

  useEffect(() => {
    fetchFutureForecast(selectedScenario)
    fetchMetrics()
  }, [selectedScenario])

  useEffect(() => {
    if (explorerMode === 'date' && !dateForecast && !dateLoading) {
      fetchDateForecast(selectedDate)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [explorerMode])

  // Playback timer
  useEffect(() => {
    if (isPlaying) {
      const advance = explorerMode === 'date' ? setDateLeadDay : setLeadDay
      timerRef.current = setInterval(() => {
        advance((prev) => (prev >= 14 ? 1 : prev + 1))
      }, 1000)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [isPlaying, explorerMode])

  // Current day grid data
  const currentDayData = useMemo(() => {
    if (!forecastData || !forecastData.days || forecastData.days.length === 0) return null
    return forecastData.days[leadDay - 1] || forecastData.days[0]
  }, [forecastData, leadDay])

  // Select active 2D grid matrix
  const activeGrid = useMemo(() => {
    if (!currentDayData) return null
    if (viewMode === 'forecast') return currentDayData.forecast_grid?.[activeVariable]
    if (viewMode === 'climatology') return currentDayData.climatology_grid?.[activeVariable]
    if (viewMode === 'anomaly') return currentDayData.anomaly_grid?.[activeVariable]
    return currentDayData.forecast_grid?.[activeVariable]
  }, [currentDayData, viewMode, activeVariable])

  // Current day grid data for the date-explorer mode
  const currentDateDay = useMemo(() => {
    if (!dateForecast || !dateForecast.days || dateForecast.days.length === 0) return null
    return dateForecast.days[dateLeadDay - 1] || dateForecast.days[0]
  }, [dateForecast, dateLeadDay])

  const dateActiveGrid = useMemo(() => {
    if (!currentDateDay) return null
    if (dateViewMode === 'forecast') return currentDateDay.forecast_grid?.[activeVariable]
    if (dateViewMode === 'actual') return currentDateDay.actual_grid?.[activeVariable]
    if (dateViewMode === 'error') return currentDateDay.error_grid?.[activeVariable]
    return currentDateDay.forecast_grid?.[activeVariable]
  }, [currentDateDay, dateViewMode, activeVariable])

  // Colour scales come from styles/dataColors.js — a single validated source
  // shared with the legend, so a swatch can never disagree with the map.
  const getErrorColor = (val, isLand = true) => cellColor(val, activeVariable, 'error', isLand)

  const getColor = (val, variable, mode, isLand = true) => cellColor(val, variable, mode, isLand)

  // Formats an ISO date string (YYYY-MM-DD) as "Sep 14, 2026"
  const formatPrettyDate = (isoStr) => {
    if (!isoStr) return ''
    const d = new Date(`${isoStr}T00:00:00`)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  // Chart Data for City Time Series
  const cityData = forecastData?.city_timeseries?.[selectedCity]
  const chartDates = cityData?.dates || []
  const chartLabels = chartDates.map(d => {
    const parts = d.split('-')
    return `${parts[1]}/${parts[2]}`
  })

  const yTitle = activeVariable === 'rainfall' ? 'Rainfall (mm/day)' : 'Temperature (°C)'

  // The model is ALWAYS series 1 and the reference baseline ALWAYS series 2,
  // whichever variable is selected. Repainting a line when the user switches
  // variable would teach them a colour that then lies.
  const lineChartData = {
    labels: chartLabels,
    datasets: [
      lineSeries(
        `ConvLSTM2D forecast`,
        cityData ? cityData[`pred_${activeVariable}`] : [],
        seriesFor('ConvLSTM2D'),
        { fill: true }
      ),
      lineSeries(
        '15-yr historical normal',
        cityData?.[`climatology_${activeVariable}`] ?? [],
        seriesFor('Climatology'),
        { dashed: true }
      ),
    ],
  }

  const lineChartOptions = chartOptions({
    yTitle,
    beginAtZero: activeVariable === 'rainfall',
  })

  // Chart Data for the date-explorer City Time Series: predicted vs. actual recorded when
  // ground truth exists (historical dates), or vs. the 15-Yr historical normal as the most
  // meaningful reference when it doesn't (future dates) — the comparison series switches
  // seamlessly based on what the API actually returned for this date, never on the date's
  // position relative to "today" client-side, so it can never show a stale/wrong label.
  const dateCityData = dateForecast?.city_timeseries?.[selectedCity]
  const dateChartDates = dateCityData?.dates || []
  const dateChartLabels = dateChartDates.map(d => {
    const parts = d.split('-')
    return `${parts[1]}/${parts[2]}`
  })
  const hasActualComparison = Boolean(dateForecast?.has_ground_truth && dateCityData?.[`actual_${activeVariable}`])
  const comparisonLabel = hasActualComparison ? 'Actual Recorded' : '15-Yr Historical Normal'

  const dateLineChartData = {
    labels: dateChartLabels,
    datasets: [
      lineSeries(
        'ConvLSTM2D forecast',
        dateCityData ? dateCityData[`pred_${activeVariable}`] : [],
        seriesFor('ConvLSTM2D'),
        { fill: true }
      ),
      ...(hasActualComparison
        ? [lineSeries(
            'Actual recorded',
            dateCityData[`actual_${activeVariable}`],
            seriesFor('Persistence'),
            { dashed: true }
          )]
        : (dateCityData?.[`climatology_${activeVariable}`]
            ? [lineSeries(
                '15-yr historical normal',
                dateCityData[`climatology_${activeVariable}`],
                seriesFor('Climatology'),
                { dashed: true }
              )]
            : [])),
    ],
  }

  const dateLineChartOptions = chartOptions({
    yTitle,
    beginAtZero: activeVariable === 'rainfall',
  })

  return (
    <div className="sim-wrap">
      {/* Top Header */}
      <section className="sim-header">
        <div>
          <div className="sim-badge-row">
            <span className="sim-badge active"><i /> Karnataka High-Resolution Pilot</span>
            <span className="sim-badge">15-Year IMD Foundation (2010–2025)</span>
            <span className="sim-badge">
              Resolution: ~22 km Grid
            </span>
            {apiConnected === null ? (
              <span className="sim-badge">
                <RefreshCw size={12} className="spin" style={{ verticalAlign: '-2px', marginRight: 4 }} />
                Connecting to model…
              </span>
            ) : apiConnected ? (
              <span className="sim-badge is-live">
                <CheckCircle2 size={12} style={{ verticalAlign: '-2px', marginRight: 4 }} />
                Neural API Live
              </span>
            ) : (
              <span className="sim-badge is-demo">
                <AlertCircle size={12} style={{ verticalAlign: '-2px', marginRight: 4 }} />
                Demo data — API offline
              </span>
            )}
          </div>
          <h1 className="sim-title">Karnataka Climate Digital Twin — Pilot Forecasting</h1>
          <p className="sim-subtitle">
            High-resolution spatiotemporal climate modeling and forward projections across Karnataka's distinct agro-climatic zones.
          </p>
        </div>

        {/* Action Controls */}
        <div className="sim-actions">
          <button className="preset-btn" onClick={() => fetchFutureForecast(selectedScenario)}>
            <RefreshCw size={14} className={loading ? 'spin' : ''} /> {loading ? 'Forecasting...' : 'Re-compute Forecast'}
          </button>
        </div>
      </section>

      {/* When the API is unreachable the page falls back to a synthetic
          generator. Saying so plainly is the point: the charts below are
          indistinguishable from real model output at a glance. */}
      {apiConnected === false && (
        <div className="demo-banner">
          <AlertCircle size={16} />
          <div>
            <strong>Showing demo data, not model output.</strong>{' '}
            The forecasting API at <code>{API_BASE}</code> is unreachable, so every
            value on this page is generated locally for layout purposes. Start the backend
            to see real ConvLSTM2D forecasts. <em>Retrying every 5 seconds…</em>
          </div>
        </div>
      )}

      {/* Explorer Mode Tabs: Forward Scenarios vs. a Specific Calendar Date */}
      <section className="sim-controls-bar" style={{ marginBottom: 4 }}>
        <div className="control-group">
          <span className="control-label">Explore:</span>
          <div className="pill-group">
            <button
              className={`pill-btn ${explorerMode === 'future' ? 'active' : ''}`}
              onClick={() => { setIsPlaying(false); setExplorerMode('future') }}
            >
              🔮 Forecast ahead
            </button>
            <button
              className={`pill-btn ${explorerMode === 'date' ? 'active' : ''}`}
              onClick={() => { setIsPlaying(false); setExplorerMode('date') }}
            >
              🎯 Replay &amp; verify
            </button>
          </div>
        </div>
      </section>

      {explorerMode === 'date' ? (
      <>
      <section className="replay-grid" aria-label="Featured replays">
        {FEATURED_REPLAYS.map((r) => (
          <button
            key={r.date}
            className={`replay-card ${selectedDate === r.date ? 'active' : ''}`}
            onClick={() => {
              setSelectedDate(r.date)
              setActiveVariable(r.variable)
              setSelectedCity(r.city)
              setDateViewMode('forecast')
              fetchDateForecast(r.date)
            }}
          >
            <span className="replay-date">
              {formatPrettyDate(r.date)} · unseen test data
              {dateLoading && selectedDate === r.date && <RefreshCw size={11} className="spin replay-spin" />}
            </span>
            <strong>{r.title}</strong>
            <span className="replay-blurb">{r.blurb}</span>
          </button>
        ))}
      </section>
      {/* Date Explorer: forecast (and actual recorded climate, if available) for any chosen date, past or future */}
      <section className="sim-controls-bar">
        <div className="control-group">
          <span className="control-label">Forecast Start Date:</span>
          <DatePicker
            value={selectedDate}
            minDate="2010-01-31"
            onChange={(val) => {
              setSelectedDate(val)
              if (val) fetchDateForecast(val)
            }}
          />
          <button className="preset-btn" onClick={() => fetchDateForecast(selectedDate)}>
            <RefreshCw size={14} className={dateLoading ? 'spin' : ''} /> {dateLoading ? 'Loading...' : 'Load'}
          </button>
        </div>

        <div className="control-group">
          <span className="control-label">Variable:</span>
          <div className="pill-group">
            <button className={`pill-btn ${activeVariable === 'rainfall' ? 'active' : ''}`} onClick={() => setActiveVariable('rainfall')}>
              <CloudRain size={14} /> Rainfall (mm)
            </button>
            <button className={`pill-btn ${activeVariable === 'tmax' ? 'active' : ''}`} onClick={() => setActiveVariable('tmax')}>
              <Thermometer size={14} /> Max Temp (°C)
            </button>
            <button className={`pill-btn ${activeVariable === 'tmin' ? 'active' : ''}`} onClick={() => setActiveVariable('tmin')}>
              <Thermometer size={14} /> Min Temp (°C)
            </button>
          </div>
        </div>

        <div className="control-group">
          <span className="control-label">Layer:</span>
          <div className="pill-group">
            <button className={`pill-btn ${dateViewMode === 'forecast' ? 'active' : ''}`} onClick={() => setDateViewMode('forecast')}>
              Model Forecast
            </button>
            {dateForecast?.has_ground_truth && (
              <>
                <button className={`pill-btn ${dateViewMode === 'actual' ? 'active' : ''}`} onClick={() => setDateViewMode('actual')}>
                  Actual Recorded
                </button>
                <button className={`pill-btn ${dateViewMode === 'error' ? 'active' : ''}`} onClick={() => setDateViewMode('error')}>
                  Forecast Error
                </button>
              </>
            )}
          </div>
        </div>
      </section>

      {dateError && (
        <section className="sim-state-card is-error">
          ⚠️ {dateError}
        </section>
      )}

      {!dateForecast && dateLoading && (
        <section className="sim-state-card">
          <RefreshCw size={14} className="spin" /> Running the model on the 30 days before {formatPrettyDate(selectedDate)}…
        </section>
      )}

      {dateForecast && (
        <>
          <section className="timeline-card">
            <div className="timeline-top">
              <div className="timeline-playback">
                <button
                  className="play-btn"
                  onClick={() => setIsPlaying(!isPlaying)}
                  aria-label={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? <Pause size={16} /> : <Play size={16} style={{ marginLeft: 2 }} />}
                </button>
                <button
                  className="preset-btn"
                  onClick={() => { setIsPlaying(false); setDateLeadDay(1) }}
                  title="Reset to Day 1"
                >
                  <RotateCcw size={13} /> Reset
                </button>
                <div style={{ marginLeft: 8 }}>
                  <strong className="scrub-readout">
                    Forecast Horizon: Day +{dateLeadDay} of 14
                  </strong>
                  <span className="scrub-date">
                    ({currentDateDay?.date})
                  </span>
                </div>
              </div>
              <div className="timeline-meta">
                <span className="keyboard-hint"><kbd>Space</kbd> play · <kbd>←</kbd><kbd>→</kbd> step</span>
                <div className={`card-meta ${dateForecast.has_ground_truth ? 'is-good' : 'is-warning'}`}>
                  {dateForecast.has_ground_truth ? '● Ground truth available for this window' : '● Beyond recorded data — model forecast only'}
                </div>
              </div>
            </div>
            <div className="timeline-slider-wrap">
              <input
                type="range"
                min="1"
                max="14"
                value={dateLeadDay}
                onChange={(e) => setDateLeadDay(parseInt(e.target.value))}
                className="timeline-slider"
              />
              <div className="timeline-ticks">
                {Array.from({ length: 14 }, (_, i) => i + 1).map((d) => (
                  <span key={d} className={d === dateLeadDay ? 'active' : ''} style={{ cursor: 'pointer' }} onClick={() => setDateLeadDay(d)}>
                    +{d}d
                  </span>
                ))}
              </div>
            </div>
          </section>

          {dateForecast.window_skill && (
            <section className="skill-strip">
              <div className="skill-intro">
                <span className="section-kicker">How the model did in this window</span>
                <p>
                  Forecast made from the 30 days before {formatPrettyDate(dateForecast.forecast_start_date)} only,
                  then scored against what IMD actually recorded, averaged over all 432 land cells.
                </p>
              </div>
              {['rainfall', 'tmax', 'tmin'].map((v) => (
                <SkillTile key={v} variable={v} skill={dateForecast.window_skill.first_3_days?.[v]} />
              ))}
            </section>
          )}

          <section className="sim-main-grid">
            <div className="map-card">
              <div className="map-card-header">
                <div>
                  <span className="section-kicker">Karnataka Spatial Grid (32×32 High-Res)</span>
                  <h2 className="card-title">
                    {dateViewMode === 'forecast' ? 'ConvLSTM2D Forecast' : dateViewMode === 'actual' ? 'Actual Recorded Climate' : 'Absolute Forecast Error'} — {activeVariable.toUpperCase()}
                  </h2>
                </div>
                <div className="map-card-tools">
                  <div className="pill-group">
                    <button
                      className={`pill-btn ${renderMode === '2d' ? 'active' : ''}`}
                      onClick={() => setRenderMode('2d')}
                    >
                      <Grid2x2 size={13} /> 2D
                    </button>
                    <button
                      className={`pill-btn ${renderMode === '3d' ? 'active' : ''}`}
                      onClick={() => setRenderMode('3d')}
                    >
                      <Box size={13} /> 3D
                    </button>
                  </div>
                  <span className="card-meta">11.5°N–18.5°N · 74.0°E–78.6°E</span>
                </div>
              </div>

              <div className="map-canvas-container">
                {dateLoading && (
                  <div className="map-loading is-refresh">
                    <RefreshCw size={16} className="spin" /> Running the model…
                  </div>
                )}
                {renderMode === '3d' && dateActiveGrid && (
                  <Suspense fallback={<div className="terrain3d-loading">Loading 3D terrain…</div>}>
                    <ForecastTerrain3D
                      grid={dateActiveGrid}
                      tmaxGrid={currentDateDay?.forecast_grid?.tmax}
                      landMask={KARNATAKA_LAND_MASK}
                      variable={activeVariable}
                      mode={dateViewMode === 'error' ? 'error' : 'forecast'}
                      cities={CITIES}
                      dateLabel={currentDateDay?.date ? formatPrettyDate(currentDateDay.date) : null}
                    />
                  </Suspense>
                )}
                {renderMode === '2d' && dateActiveGrid && (
                  <svg viewBox="0 0 32 32" className="raster-grid-svg" preserveAspectRatio="none">
                    {dateActiveGrid.map((row, y) =>
                      row.map((val, x) => {
                        const activeMask = KARNATAKA_LAND_MASK
                        const isLand = Boolean(activeMask && activeMask[y] && activeMask[y][x] > 0.5)
                        const svgY = 31 - y
                        const isHovered = dateHover && dateHover.x === x && dateHover.y === y
                        return (
                          <rect
                            key={`${x}-${y}`}
                            x={x}
                            y={svgY}
                            width="1.05"
                            height="1.05"
                            fill={dateViewMode === 'error' ? getErrorColor(val, isLand) : getColor(val, activeVariable, 'forecast', isLand)}
                            stroke={isHovered ? 'var(--accent)' : (isLand ? 'rgba(255, 255, 255, 0.12)' : 'none')}
                            strokeWidth={isHovered ? 0.35 : (isLand ? 0.05 : 0)}
                            onMouseEnter={() => setDateHover(isLand ? { x, y } : null)}
                            onMouseLeave={() => setDateHover(null)}
                            style={{ cursor: isLand ? 'crosshair' : 'default', transition: 'fill 0.15s ease' }}
                          />
                        )
                      })
                    )}
                    <CityMarkers selected={selectedCity} onSelect={setSelectedCity} />
                  </svg>
                )}
                {renderMode === '2d' && dateHover && currentDateDay && (
                  <ReplayCellReadout day={currentDateDay} cell={dateHover} variable={activeVariable} />
                )}
              </div>
              <MapLegend variable={activeVariable} mode={dateViewMode === 'error' ? 'error' : 'forecast'} />
            </div>

            <div className="chart-card">
              <div className="card-row">
                <div>
                  <span className="section-kicker">Regional Point Trajectory</span>
                  <h2 className="card-title">Forecast vs. {comparisonLabel}</h2>
                </div>
                <select className="city-select" value={selectedCity} onChange={(e) => setSelectedCity(e.target.value)}>
                  {CITIES.map((c, i) => (
                    <option key={i} value={c.name}>{c.name} ({c.region})</option>
                  ))}
                </select>
              </div>
              <div className="chart-area">
                <Line data={dateLineChartData} options={dateLineChartOptions} />
              </div>
              <div className="context-note">
                💡 <strong>Replay &amp; verify:</strong> pick any date from Jan 2010 to Dec 2025. The model sees only the 30 days
                before it, forecasts 14 days ahead, and is scored against what IMD actually recorded. Dates from 2023 onward
                were held out of training entirely, so they are a fair test.
              </div>
            </div>
          </section>
        </>
      )}
      </>
      ) : (
      <>
      {/* Scenario & Variable Control Bar */}
      <section className="sim-controls-bar">
        {/* Scenarios */}
        <div className="control-group">
          <span className="control-label">Outlook window:</span>
          {SCENARIOS.map((s) => (
            <button
              key={s.id}
              className={`preset-btn ${selectedScenario === s.id ? 'active' : ''}`}
              onClick={() => setSelectedScenario(s.id)}
              title={s.desc}
            >
              {s.label}
            </button>
          ))}
          {forecastData?.forecast_start_date && forecastData?.forecast_end_date && (
            <span
              className="sim-badge"
              title="Actual calendar dates this scenario forecasts, resolved relative to today"
            >
              📅 {formatPrettyDate(forecastData.forecast_start_date)} → {formatPrettyDate(forecastData.forecast_end_date)}
            </span>
          )}
        </div>

        {/* Variable Switcher */}
        <div className="control-group">
          <span className="control-label">Variable:</span>
          <div className="pill-group">
            <button
              className={`pill-btn ${activeVariable === 'rainfall' ? 'active' : ''}`}
              onClick={() => setActiveVariable('rainfall')}
            >
              <CloudRain size={14} /> Rainfall (mm)
            </button>
            <button
              className={`pill-btn ${activeVariable === 'tmax' ? 'active' : ''}`}
              onClick={() => setActiveVariable('tmax')}
            >
              <Thermometer size={14} /> Max Temp (°C)
            </button>
            <button
              className={`pill-btn ${activeVariable === 'tmin' ? 'active' : ''}`}
              onClick={() => setActiveVariable('tmin')}
            >
              <Thermometer size={14} /> Min Temp (°C)
            </button>
          </div>
        </div>

        {/* View Mode */}
        <div className="control-group">
          <span className="control-label">Layer:</span>
          <div className="pill-group">
            <button
              className={`pill-btn ${viewMode === 'forecast' ? 'active' : ''}`}
              onClick={() => setViewMode('forecast')}
            >
              Future Forecast
            </button>
            <button
              className={`pill-btn ${viewMode === 'climatology' ? 'active' : ''}`}
              onClick={() => setViewMode('climatology')}
            >
              15-Yr Normal
            </button>
            <button
              className={`pill-btn ${viewMode === 'anomaly' ? 'active' : ''}`}
              onClick={() => setViewMode('anomaly')}
            >
              State Anomaly
            </button>
          </div>
        </div>
      </section>

      {/* 14-Day Timeline Player */}
      <section className="timeline-card">
        <div className="timeline-top">
          <div className="timeline-playback">
            <button
              className="play-btn"
              onClick={() => setIsPlaying(!isPlaying)}
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause size={16} /> : <Play size={16} style={{ marginLeft: 2 }} />}
            </button>
            <button
              className="preset-btn"
              onClick={() => { setIsPlaying(false); setLeadDay(1) }}
              title="Reset to Day 1"
            >
              <RotateCcw size={13} /> Reset
            </button>
            <div style={{ marginLeft: 8 }}>
              <strong className="scrub-readout">
                Forecast Horizon: Day +{leadDay} of 14
              </strong>
              {currentDayData?.date && (
                <span className="scrub-date">
                  ({currentDayData.date})
                </span>
              )}
            </div>
          </div>
          <div className="timeline-meta">
            <span className="keyboard-hint"><kbd>Space</kbd> play · <kbd>←</kbd><kbd>→</kbd> step</span>
            <div className="card-meta is-good">
              ● Karnataka Forward Projection: +{leadDay * 24}h Lookahead
            </div>
          </div>
        </div>

        <div className="timeline-slider-wrap">
          <input
            type="range"
            min="1"
            max="14"
            value={leadDay}
            onChange={(e) => setLeadDay(parseInt(e.target.value))}
            className="timeline-slider"
          />
          <div className="timeline-ticks">
            {Array.from({ length: 14 }, (_, i) => i + 1).map((d) => (
              <span
                key={d}
                className={d === leadDay ? 'active' : ''}
                style={{ cursor: 'pointer' }}
                onClick={() => setLeadDay(d)}
              >
                +{d}d
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Main Grid: Spatial Map & Time Series */}
      <section className="sim-main-grid">
        {/* 2D Spatial Map Card */}
        <div className="map-card">
          <div className="map-card-header">
            <div>
              <span className="section-kicker">Karnataka Spatial Grid (32×32 High-Res)</span>
              <h2 className="card-title">
                {viewMode === 'forecast' ? 'ConvLSTM2D State Forecast' : viewMode === 'climatology' ? '15-Year Historical Normal' : 'Projected Climate Anomaly'} — {activeVariable.toUpperCase()}
              </h2>
            </div>
            <div className="map-card-tools">
              <div className="pill-group">
                <button
                  className={`pill-btn ${renderMode === '2d' ? 'active' : ''}`}
                  onClick={() => setRenderMode('2d')}
                >
                  <Grid2x2 size={13} /> 2D
                </button>
                <button
                  className={`pill-btn ${renderMode === '3d' ? 'active' : ''}`}
                  onClick={() => setRenderMode('3d')}
                >
                  <Box size={13} /> 3D
                </button>
              </div>
              <span className="card-meta">11.5°N–18.5°N · 74.0°E–78.6°E</span>
            </div>
          </div>

          <div className="map-canvas-container">
            {(loading || !forecastData) && (
              <div className={`map-loading ${forecastData ? 'is-refresh' : ''}`}>
                <RefreshCw size={16} className="spin" /> Running ConvLSTM2D forecast…
              </div>
            )}
            {renderMode === '3d' ? (
              <Suspense fallback={<div className="terrain3d-loading">Loading 3D terrain…</div>}>
                <ForecastTerrain3D
                  grid={activeGrid}
                  tmaxGrid={currentDayData?.forecast_grid?.tmax}
                  landMask={forecastData?.land_mask || KARNATAKA_LAND_MASK}
                  variable={activeVariable}
                  mode={viewMode}
                  cities={CITIES}
                  dateLabel={currentDayData?.date ? formatPrettyDate(currentDayData.date) : null}
                />
              </Suspense>
            ) : (
              <>
            {activeGrid && (
              <svg viewBox="0 0 32 32" className="raster-grid-svg" preserveAspectRatio="none">
                {activeGrid.map((row, y) =>
                  row.map((val, x) => {
                    const activeMask = forecastData?.land_mask || KARNATAKA_LAND_MASK
                    const isLand = Boolean(activeMask && activeMask[y] && activeMask[y][x] > 0.5)
                    // SVG coordinates: y=0 is top, so invert y (31 - y)
                    const svgY = 31 - y
                    const isHovered = hoveredPixel && hoveredPixel.x === x && hoveredPixel.y === y && isLand
                    return (
                      <rect
                        key={`${x}-${y}`}
                        x={x}
                        y={svgY}
                        width="1.05"
                        height="1.05"
                        fill={getColor(val, activeVariable, viewMode, isLand)}
                        stroke={isHovered ? 'var(--accent)' : (isLand ? 'rgba(255, 255, 255, 0.10)' : 'none')}
                        strokeWidth={isHovered ? 0.35 : (isLand ? 0.05 : 0)}
                        onMouseEnter={() => {
                          if (!isLand) return
                          const lat = (11.5 + (y / 31) * 7.0).toFixed(2)
                          const lon = (74.0 + (x / 31) * 4.6).toFixed(2)
                          const climVal = currentDayData?.climatology_grid?.[activeVariable]?.[y]?.[x]
                          const anomVal = currentDayData?.anomaly_grid?.[activeVariable]?.[y]?.[x]
                          setHoveredPixel({ x, y, lat, lon, val, climVal, anomVal, isLand })
                        }}
                        onMouseLeave={() => setHoveredPixel(null)}
                        style={{ cursor: isLand ? 'crosshair' : 'default', transition: 'fill 0.15s ease' }}
                      />
                    )
                  })
                )}
                {/* Overlay City Markers */}
                <CityMarkers selected={selectedCity} onSelect={setSelectedCity} />
              </svg>
            )}

            {/* Hover Tooltip Info */}
            {hoveredPixel && hoveredPixel.isLand && (
              <div className="pixel-hover-info">
                <div>📍 <strong>{hoveredPixel.lat}°N, {hoveredPixel.lon}°E</strong> (Karnataka)</div>
                <div>
                  {viewMode === 'forecast' ? 'Future Forecast' : viewMode === 'climatology' ? 'Historical Normal' : 'State Anomaly'}:{' '}
                  <strong>
                    {hoveredPixel.val !== null && hoveredPixel.val !== undefined ? hoveredPixel.val : 0} {activeVariable === 'rainfall' ? 'mm' : '°C'}
                  </strong>
                </div>
                {hoveredPixel.anomVal !== undefined && (
                  <div className="pin-sub">
                    Anomaly vs Normal: {hoveredPixel.anomVal >= 0 ? `+${hoveredPixel.anomVal}` : hoveredPixel.anomVal} {activeVariable === 'rainfall' ? 'mm' : '°C'}
                  </div>
                )}
              </div>
            )}
              </>
            )}
          </div>

          {/* Legend bounds and gradient both come from dataColors.js, so the
              swatch and its end labels always describe the scale the map
              actually painted. */}
          <div className="legend-bar-wrap">
            <span className="legend-end">{legendBounds(activeVariable, viewMode).low}</span>
            <div className="legend-scale">
              <div
                className="legend-gradient"
                style={{ background: legendGradient(activeVariable, viewMode) }}
                role="img"
                aria-label={`Colour scale from ${legendBounds(activeVariable, viewMode).low} to ${legendBounds(activeVariable, viewMode).high}`}
              />
              {legendTicks(activeVariable, viewMode) && (
                <div className="legend-ticks">
                  {legendTicks(activeVariable, viewMode).map((t) => (
                    <span key={t}>{t}</span>
                  ))}
                </div>
              )}
              {viewMode === 'anomaly' && (
                <div className="legend-ticks legend-ticks-diverging">
                  <span>below</span><span>normal</span><span>above</span>
                </div>
              )}
            </div>
            <span className="legend-end">{legendBounds(activeVariable, viewMode).high}</span>
          </div>
        </div>

        {/* 14-Day City Line Chart */}
        <div className="chart-card">
          <div className="card-row">
            <div>
              <span className="section-kicker">Regional Point Trajectory</span>
              <h2 className="card-title">Karnataka District Forecast</h2>
            </div>
            <select
              className="city-select"
              value={selectedCity}
              onChange={(e) => setSelectedCity(e.target.value)}
            >
              {CITIES.map((c, i) => (
                <option key={i} value={c.name}>{c.name} ({c.region})</option>
              ))}
            </select>
          </div>

          <div className="chart-area">
            <Line data={lineChartData} options={lineChartOptions} />
          </div>

          <div className="context-note">
            💡 <strong>Where the inputs come from:</strong> the IMD record in this pilot runs to 31 Dec 2025. For dates
            after that, the twin is seeded with the latest recorded 30 days from the same time of year, then
            forecasts the calendar dates shown. A live IMD feed replaces this in Phase 2. To see the model scored
            against reality, use <strong>Replay &amp; verify</strong>.
          </div>
        </div>
      </section>
      </>
      )}

      {/* Model Benchmark Accuracy Cards */}
      <section className="metrics-row">
        <div className="model-metric-card">
          <span className="metric-badge">Rainfall Forecast Accuracy</span>
          <div className="metric-val-row">
            <strong>{benchmarkMetrics?.ConvLSTM2D?.variables?.rainfall?.MAE ?? '—'} mm</strong>
            <span>MAE</span>
          </div>
          <p className="metric-subtext">
            RMSE: <strong>{benchmarkMetrics?.ConvLSTM2D?.variables?.rainfall?.RMSE ?? '—'} mm</strong> · R²: <strong>{benchmarkMetrics?.ConvLSTM2D?.variables?.rainfall?.R2 ?? '—'}</strong>
          </p>
        </div>

        <div className="model-metric-card">
          <span className="metric-badge">Tmax Forecast Accuracy</span>
          <div className="metric-val-row">
            <strong>{benchmarkMetrics?.ConvLSTM2D?.variables?.tmax?.MAE ?? '—'} °C</strong>
            <span>MAE</span>
          </div>
          <p className="metric-subtext">
            RMSE: <strong>{benchmarkMetrics?.ConvLSTM2D?.variables?.tmax?.RMSE ?? '—'} °C</strong> · R²: <strong>{benchmarkMetrics?.ConvLSTM2D?.variables?.tmax?.R2 ?? '—'}</strong>
          </p>
        </div>

        <div className="model-metric-card">
          <span className="metric-badge">Tmin Forecast Accuracy</span>
          <div className="metric-val-row">
            <strong>{benchmarkMetrics?.ConvLSTM2D?.variables?.tmin?.MAE ?? '—'} °C</strong>
            <span>MAE</span>
          </div>
          <p className="metric-subtext">
            RMSE: <strong>{benchmarkMetrics?.ConvLSTM2D?.variables?.tmin?.RMSE ?? '—'} °C</strong> · R²: <strong>{benchmarkMetrics?.ConvLSTM2D?.variables?.tmin?.R2 ?? '—'}</strong>
          </p>
        </div>

        <div className="model-metric-card">
          <span className="metric-badge">Digital twin grid</span>
          <div className="metric-val-row">
            <strong>~22 km</strong>
            <span>Grid Spacing</span>
          </div>
          <p className="metric-subtext">
            32×32 grid · <strong>432</strong> land cells · 30 days in → 14 days out
          </p>
        </div>
      </section>

      {/* Comprehensive Accuracy & Benchmark Evaluation Table */}
      <section className="benchmark-table-card">
        <div className="map-card-header">
          <div>
            <span className="section-kicker">Empirical Verification (2023–2025 Test Split)</span>
            <h2 className="card-title">Karnataka Pilot Benchmark Accuracy Comparison</h2>
          </div>
          <span className="card-meta">
            Evaluated across 1,083 out-of-sample forward sequences over Karnataka State
          </span>
        </div>

        <div className="benchmark-table-wrap">
          <table className="benchmark-table">
            <caption className="sr-only">
              Forecast error by model and variable on the 2023-2025 test split.
              Lower MAE and RMSE are better; higher R² is better.
            </caption>
            <thead>
              <tr>
                <th scope="col">Forecasting model</th>
                {BENCH_COLUMNS.map((c) => (
                  <th scope="col" key={c.key}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {BENCH_ROWS.map((row) => (
                <tr key={row.key} className={row.key === 'ConvLSTM2D' ? 'highlight-row' : ''}>
                  <th scope="row">
                    <span className="model-cell">
                      <i style={{ background: seriesFor(row.key) }} />
                      {row.label}
                    </span>
                  </th>
                  {BENCH_COLUMNS.map((c) => {
                    const v = benchValue(benchmarkMetrics, row.key, c)
                    const best = bestModelFor(benchmarkMetrics, c)
                    return (
                      <td key={c.key}>
                        {v === null ? '—' : `${v}${c.unit}`}
                        {best === row.key && <span className="winner-tag">best</span>}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Lead-time degradation, read from the loaded metrics rather than
            transcribed by hand — these are presented as empirical results, so
            they must track the evaluation output. */}
        <div className="lead-strip">
          {LEAD_DAYS.map((d) => {
            const lt = benchmarkMetrics?.ConvLSTM2D?.lead_time_metrics?.[`day_${d.day}`]
            return (
              <div key={d.day}>
                <span className="stat-label">Day +{d.day} ({d.label})</span>
                <div className="stat-value">
                  Rainfall {fmt(lt?.rainfall?.MAE)} mm · Tmax {fmt(lt?.tmax?.MAE)} °C
                </div>
                <span className="stat-sub">
                  Tmax R² {fmt(lt?.tmax?.R2)} · Tmin R² {fmt(lt?.tmin?.R2)}
                </span>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
