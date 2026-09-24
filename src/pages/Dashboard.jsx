import { useState, useMemo, lazy, Suspense } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Thermometer, Wind, Gauge, Droplets, RefreshCw, AlertCircle, ArrowUpRight,
} from 'lucide-react'
import { useLiveConditions, aqiBand, AQI_BANDS } from '../hooks/useLiveConditions'
import { LAYERS, LAYER_ORDER } from '../components/globeLayers'
import '../components/Globe3D.css'
import '../App.css'

// three.js is ~570 kB; load it only when this page is actually opened.
const Globe3D = lazy(() =>
  import('../components/Globe3D').then((m) => ({ default: m.Globe3D }))
)

// Rows shown before "Show all", so the table doesn't push the page long.
const TABLE_ROWS = 10

const fmt = (v, digits = 1, suffix = '') =>
  v === null || v === undefined || Number.isNaN(v) ? '—' : `${v.toFixed(digits)}${suffix}`

/** Compass point from a meteorological bearing, so wind direction is readable
 *  without mentally converting degrees. */
function compass(deg) {
  if (deg === null || deg === undefined) return '—'
  const pts = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
  return pts[Math.round(deg / 22.5) % 16]
}

export function Dashboard() {
  const { status, grid, globalGrid, cities, observedAt, error, fromCache, reload } = useLiveConditions()
  const navigate = useNavigate()
  const [layer, setLayer] = useState('wind')
  const [sortKey, setSortKey] = useState('aqi')
  const [showAll, setShowAll] = useState(false)

  const today = new Date()
  const dateStr = today.toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  /* National summary, computed from the live city readings rather than typed
     in by hand. "—" whenever the upstream did not return a value. */
  const summary = useMemo(() => {
    const nums = (k) => cities.map((c) => c[k]).filter((v) => typeof v === 'number')
    const avg = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null)
    const max = (a) => (a.length ? Math.max(...a) : null)

    const temps = nums('temp')
    const winds = nums('windSpeed')
    const aqis = nums('aqi')
    const pms = nums('pm25')

    const hottest = cities.reduce(
      (best, c) => (typeof c.temp === 'number' && (!best || c.temp > best.temp) ? c : best), null)
    const worstAir = cities.reduce(
      (best, c) => (typeof c.aqi === 'number' && (!best || c.aqi > best.aqi) ? c : best), null)

    return {
      avgTemp: avg(temps),
      hottest,
      avgWind: avg(winds),
      maxWind: max(winds),
      worstAir,
      avgPm: avg(pms),
      maxAqi: max(aqis),
    }
  }, [cities])

  const sortedCities = useMemo(() => {
    const arr = [...cities]
    arr.sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      if (typeof av !== 'number') return 1
      if (typeof bv !== 'number') return -1
      return sortKey === 'name' ? 0 : bv - av
    })
    return arr
  }, [cities, sortKey])

  const isLoading = status === 'loading'
  const isError = status === 'error'
  // A failed refresh while cached readings are on screen is a footnote, not an
  // outage. Only claim the feed is unavailable when there is nothing to show.
  const hasData = cities.length > 0
  const isOutage = isError && !hasData
  const isStale = isError && hasData

  return (
    <div className="content-wrap">
      <section className="page-heading">
        <div>
          <div className="eyebrow">
            {dateStr}
            {hasData && (
              <span className={`live-pill ${isStale ? 'is-stale' : ''}`}>
                <i /> {isStale ? 'Last known' : fromCache ? 'Cached' : 'Live'}
              </span>
            )}
          </div>
          <h1>India live conditions</h1>
          <p>
            Observed wind, temperature and air quality across the subcontinent, streamed
            from Open-Meteo. The Karnataka forecast model lives on the Model Simulation page.
          </p>
        </div>
        <div className="refresh-cluster">
          {isStale && (
            <span className="refresh-note" title={error}>
              Couldn&rsquo;t refresh &mdash; showing last reading
            </span>
          )}
          <button className="date-control" onClick={reload} disabled={isLoading}>
            <RefreshCw size={14} className={isLoading ? 'spin' : ''} />
            {isLoading ? 'Loading' : 'Refresh'}
          </button>
        </div>
      </section>

      {isOutage && (
        <div className="demo-banner" style={{ marginBottom: 'var(--space-5)' }}>
          <AlertCircle size={16} />
          <div>
            <strong>Live feed unavailable.</strong> {error}{' '}
            The globe needs an internet connection; everything else on the site works offline.
          </div>
        </div>
      )}

      {/* ------------------------------------------------------- stat tiles */}
      {/* Shimmer instead of "—" while the first reading is in flight, so an
          empty tile never reads as missing data. */}
      <section className={`metrics-grid globe-stats ${isLoading && !hasData ? 'is-loading' : ''}`} aria-busy={isLoading && !hasData}>
        <div className="metric-card">
          <div className="metric-icon"><Thermometer size={18} /></div>
          <div className="metric-copy">
            <span>Mean temperature</span>
            <strong>{fmt(summary.avgTemp, 1, '°C')}</strong>
            <small>
              {summary.hottest
                ? <>warmest <em>{summary.hottest.name} {fmt(summary.hottest.temp, 1, '°C')}</em></>
                : <em>across {cities.length || '—'} cities</em>}
            </small>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon"><Wind size={18} /></div>
          <div className="metric-copy">
            <span>Mean wind</span>
            <strong>{fmt(summary.avgWind, 1, ' km/h')}</strong>
            <small>peak <em>{fmt(summary.maxWind, 1, ' km/h')}</em></small>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon"><Gauge size={18} /></div>
          <div className="metric-copy">
            <span>Worst air quality</span>
            <strong style={{ color: aqiBand(summary.maxAqi).color }}>
              {summary.maxAqi ?? '—'} AQI
            </strong>
            <small>
              {summary.worstAir
                ? <>{summary.worstAir.name} · <em>{aqiBand(summary.maxAqi).label}</em></>
                : <em>US AQI</em>}
            </small>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon"><Droplets size={18} /></div>
          <div className="metric-copy">
            <span>Mean PM2.5</span>
            <strong>{fmt(summary.avgPm, 1)}</strong>
            <small><em>µg/m³ across {cities.length || '—'} cities</em></small>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ globe */}
      <section className="globe-hero">
        <div className="globe-hero-bar">
          <div>
            <span className="section-kicker">Global · centred on India</span>
            <h2>Live {LAYERS[layer].label.toLowerCase()}</h2>
          </div>
          <div className="pill-group">
            {LAYER_ORDER.map((k) => (
              <button
                key={k}
                className={`pill-btn ${layer === k ? 'active' : ''}`}
                onClick={() => setLayer(k)}
              >
                {LAYERS[k].label}
              </button>
            ))}
          </div>
        </div>

        <div className="globe-stage">
          <Suspense fallback={<div className="globe-loading"><RefreshCw size={14} className="spin" />Loading 3D globe…</div>}>
            <Globe3D
              grid={grid}
              globalGrid={globalGrid}
              cities={cities}
              layer={layer}
              observedAt={observedAt}
              onDrillToModel={() => navigate('/model-test', { viewTransition: true })}
            />
          </Suspense>
        </div>

        {/* Scale for whichever layer is painted. Generated from the same ramp
            the globe uses, so swatch and surface can't disagree. */}
        <div className="legend-bar-wrap">
          <span className="legend-end">
            {LAYERS[layer].domain[0]} {LAYERS[layer].unit}
          </span>
          <div className="legend-scale">
            <div
              className="legend-gradient"
              style={{ background: `linear-gradient(to right, ${LAYERS[layer].ramp.join(', ')})` }}
              role="img"
              aria-label={`${LAYERS[layer].label} scale`}
            />
          </div>
          <span className="legend-end">
            {LAYERS[layer].domain[1]}+ {LAYERS[layer].unit}
          </span>
        </div>
      </section>

      {/* ------------------------------------------------------- city table */}
      <section className="panel" style={{ marginTop: 'var(--space-4)' }}>
        <div className="panel-heading">
          <div>
            <span className="section-kicker">Major cities · observed now</span>
            <h2>Live city readings</h2>
          </div>
          <div className="pill-group">
            <button
              className={`pill-btn ${sortKey === 'aqi' ? 'active' : ''}`}
              onClick={() => setSortKey('aqi')}
            >
              By AQI
            </button>
            <button
              className={`pill-btn ${sortKey === 'temp' ? 'active' : ''}`}
              onClick={() => setSortKey('temp')}
            >
              By temp
            </button>
          </div>
        </div>

        <div className="benchmark-table-wrap">
          <table className="benchmark-table">
            <caption className="sr-only">
              Live observed conditions for Indian cities from Open-Meteo.
            </caption>
            <thead>
              <tr>
                <th scope="col">City</th>
                <th scope="col">Temp</th>
                <th scope="col">Humidity</th>
                <th scope="col">Wind</th>
                <th scope="col">Direction</th>
                <th scope="col">PM2.5</th>
                <th scope="col">PM10</th>
                <th scope="col">US AQI</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={8} style={{ textAlign: 'center' }}>Fetching live readings…</td></tr>
              )}
              {!isLoading && (showAll ? sortedCities : sortedCities.slice(0, TABLE_ROWS)).map((c) => {
                const band = aqiBand(c.aqi)
                return (
                  <tr key={c.name}>
                    <th scope="row">
                      <span className="model-cell">
                        <i style={{ background: band.color }} />
                        {c.name}
                        <small className="city-state">{c.state}</small>
                      </span>
                    </th>
                    <td>{fmt(c.temp, 1, '°C')}</td>
                    <td>{fmt(c.humidity, 0, '%')}</td>
                    <td>{fmt(c.windSpeed, 1, ' km/h')}</td>
                    <td>{compass(c.windDir)}</td>
                    <td>{fmt(c.pm25, 1)}</td>
                    <td>{fmt(c.pm10, 1)}</td>
                    {/* Colour never carries the meaning alone — the band name
                        is printed beside the number. */}
                    <td>
                      <span style={{ color: band.color, fontWeight: 600 }}>{c.aqi ?? '—'}</span>
                      <span className="aqi-label">{band.label}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {sortedCities.length > TABLE_ROWS && (
          <button className="table-more" onClick={() => setShowAll((v) => !v)}>
            {showAll ? 'Show fewer' : `Show all ${sortedCities.length} cities`}
          </button>
        )}

        <div className="aqi-key">
          {AQI_BANDS.slice(0, 5).map((b) => (
            <span key={b.label}>
              <i style={{ background: b.color }} />
              {b.label}
            </span>
          ))}
        </div>
      </section>

      <section className="panel source-note">
        <p>
          Wind, temperature, precipitation and air quality on this page are live observations
          from <a href="https://open-meteo.com" target="_blank" rel="noreferrer">Open-Meteo <ArrowUpRight size={12} /></a>,
          sampled on a global 11×18 lattice with a denser 8×7 inset over India, and refreshed every 15 minutes.
          Coastlines and borders are Natural Earth. None of it is produced by this project's
          ConvLSTM model, which forecasts rainfall and temperature for Karnataka only —
          see <strong>Model Simulation</strong> for that.
        </p>
      </section>
    </div>
  )
}
