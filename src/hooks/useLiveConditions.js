import { useEffect, useState, useCallback } from 'react'

/* ==========================================================================
   useLiveConditions — live weather + air quality over India
   --------------------------------------------------------------------------
   Source: Open-Meteo (open-meteo.com). Chosen because it is the only good
   option that needs NO API key and sends `access-control-allow-origin: *`,
   so the browser calls it directly with no backend proxy and nothing for a
   demo machine to configure.

     forecast API      -> temperature_2m, wind_speed_10m, wind_direction_10m
     air-quality API   -> pm2_5, pm10, european_aqi, us_aqi

   IMPORTANT — provenance
   ----------------------
   None of this is HavaMana's own model output. The ConvLSTM forecasts
   rainfall/tmax/tmin for Karnataka only, from historical IMD grids, and
   predicts no wind and no air quality at all. Everything here is live
   third-party observation/forecast data, and the UI says so on the face of
   the globe. Keep the two clearly separated.
   ========================================================================== */

export const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'
export const AIR_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality'

/* Two sampling lattices.

   GLOBAL gives the whole sphere a wind/temperature field, so the globe reads
   as a planet rather than a rectangular patch of data stuck to one region.
   Longitudes span a full 360 with uniform spacing and no duplicate at the
   antimeridian, so sampling can wrap cleanly with a modulo.

   INDIA is the dense inset. Over the subcontinent its values are blended on
   top of the global field, which keeps local detail without drawing a seam.

   Call budget: Open-Meteo counts EVERY location in a multi-point request as a
   separate API call, and the free tier caps requests per hour. The lattices
   below cost 198 (global) + 56 (India) + 40 (20 cities x 2 APIs) = 294 calls per refresh,
   and results are cached (see CACHE_TTL_MS) so reloading the page during a
   demo does not refetch. An earlier, denser version cost 592 calls per load
   and reliably tripped the hourly limit after a couple of reloads. */
export const GLOBAL_NY = 11
export const GLOBAL_NX = 18
export const globalLats = Array.from({ length: GLOBAL_NY }, (_, i) =>
  +(-60 + (i * 135) / (GLOBAL_NY - 1)).toFixed(3)
)
export const globalLons = Array.from({ length: GLOBAL_NX }, (_, j) =>
  +(-180 + (j * 360) / GLOBAL_NX).toFixed(3)
)

export const GRID_BOUNDS = { latMin: 6, latMax: 37, lonMin: 67, lonMax: 97 }
export const GRID_NY = 8
export const GRID_NX = 7

export const gridLats = Array.from({ length: GRID_NY }, (_, i) =>
  +(GRID_BOUNDS.latMin + (i * (GRID_BOUNDS.latMax - GRID_BOUNDS.latMin)) / (GRID_NY - 1)).toFixed(3)
)
export const gridLons = Array.from({ length: GRID_NX }, (_, i) =>
  +(GRID_BOUNDS.lonMin + (i * (GRID_BOUNDS.lonMax - GRID_BOUNDS.lonMin)) / (GRID_NX - 1)).toFixed(3)
)

// One or two per region so hovering the globe finds a city almost anywhere
// in India. Karnataka's four are the model's own pilot cities.
export const CITIES = [
  { name: 'Delhi', state: 'Delhi', lat: 28.61, lon: 77.21 },
  { name: 'Mumbai', state: 'Maharashtra', lat: 19.08, lon: 72.88 },
  { name: 'Kolkata', state: 'West Bengal', lat: 22.57, lon: 88.36 },
  { name: 'Chennai', state: 'Tamil Nadu', lat: 13.08, lon: 80.27 },
  { name: 'Bengaluru', state: 'Karnataka', lat: 12.97, lon: 77.59 },
  { name: 'Hyderabad', state: 'Telangana', lat: 17.39, lon: 78.49 },
  { name: 'Ahmedabad', state: 'Gujarat', lat: 23.02, lon: 72.57 },
  { name: 'Lucknow', state: 'Uttar Pradesh', lat: 26.85, lon: 80.95 },
  { name: 'Jaipur', state: 'Rajasthan', lat: 26.91, lon: 75.79 },
  { name: 'Pune', state: 'Maharashtra', lat: 18.52, lon: 73.86 },
  { name: 'Bhopal', state: 'Madhya Pradesh', lat: 23.26, lon: 77.41 },
  { name: 'Patna', state: 'Bihar', lat: 25.59, lon: 85.14 },
  { name: 'Guwahati', state: 'Assam', lat: 26.14, lon: 91.74 },
  { name: 'Srinagar', state: 'Jammu & Kashmir', lat: 34.08, lon: 74.80 },
  { name: 'Chandigarh', state: 'Chandigarh', lat: 30.73, lon: 76.78 },
  { name: 'Bhubaneswar', state: 'Odisha', lat: 20.30, lon: 85.82 },
  { name: 'Kochi', state: 'Kerala', lat: 9.93, lon: 76.27 },
  { name: 'Mangaluru', state: 'Karnataka', lat: 12.91, lon: 74.85 },
  { name: 'Mysuru', state: 'Karnataka', lat: 12.30, lon: 76.65 },
  { name: 'Kalaburagi', state: 'Karnataka', lat: 17.33, lon: 76.83 },
]

/**
 * Meteorological wind direction is the bearing the wind blows FROM, so the
 * vector it travels along is the negative of that bearing. Getting this
 * backwards is the classic wind-map bug — every streamline runs the wrong way
 * and it still looks plausible.
 */
export function windToUV(speedKmh, dirFromDeg) {
  const speed = (speedKmh ?? 0) / 3.6            // m/s
  const rad = ((dirFromDeg ?? 0) * Math.PI) / 180
  return {
    u: -speed * Math.sin(rad),  // eastward
    v: -speed * Math.cos(rad),  // northward
  }
}

export function buildGridUrl(latArr, lonArr) {
  const lats = []
  const lons = []
  for (let y = 0; y < latArr.length; y++) {
    for (let x = 0; x < lonArr.length; x++) {
      lats.push(latArr[y])
      lons.push(lonArr[x])
    }
  }
  const p = new URLSearchParams({
    latitude: lats.join(','),
    longitude: lons.join(','),
    current: 'temperature_2m,wind_speed_10m,wind_direction_10m,precipitation',
    timezone: 'UTC',
  })
  return `${FORECAST_URL}?${p}`
}

export function buildCityUrl(base, current) {
  const p = new URLSearchParams({
    latitude: CITIES.map((c) => c.lat).join(','),
    longitude: CITIES.map((c) => c.lon).join(','),
    current,
    timezone: 'UTC',
  })
  return `${base}?${p}`
}


/* --------------------------------------------------------------- caching ---
   Reloading the page during a demo should not spend 270 API calls again. Raw
   responses are kept in localStorage with a TTL; a reload inside the window
   rehydrates instantly and makes zero network requests. Typed arrays are
   rebuilt from the cached JSON on read, so nothing binary goes to storage. */
const CACHE_KEY = 'havamana.live.v2'
const CACHE_TTL_MS = 30 * 60 * 1000

function readCache({ anyAge = false } = {}) {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.at) return null
    if (!anyAge && Date.now() - parsed.at > CACHE_TTL_MS) return null
    return parsed
  } catch {
    return null   // private mode, quota, corrupt entry — just refetch
  }
}

function writeCache(payload) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), ...payload }))
  } catch {
    /* storage unavailable or full; caching is an optimisation, not a requirement */
  }
}

/** Open-Meteo returns a bare object for one point and an array for many. */
export const asArray = (d) => (Array.isArray(d) ? d : [d])

export const CITY_WX_FIELDS = 'temperature_2m,wind_speed_10m,wind_direction_10m,relative_humidity_2m'
export const CITY_AIR_FIELDS = 'pm2_5,pm10,european_aqi,us_aqi'

/** Merges the two per-city responses into one reading per city. */
export function citiesFrom(cityWx, cityAir) {
  const wx = asArray(cityWx)
  const air = asArray(cityAir)
  return CITIES.map((c, i) => ({
    ...c,
    temp: wx[i]?.current?.temperature_2m ?? null,
    humidity: wx[i]?.current?.relative_humidity_2m ?? null,
    windSpeed: wx[i]?.current?.wind_speed_10m ?? null,
    windDir: wx[i]?.current?.wind_direction_10m ?? null,
    pm25: air[i]?.current?.pm2_5 ?? null,
    pm10: air[i]?.current?.pm10 ?? null,
    aqi: air[i]?.current?.us_aqi ?? null,
    aqiEu: air[i]?.current?.european_aqi ?? null,
  }))
}

/* Venue Wi-Fi can accept a connection and then never answer. Without a
   timeout the page sat on "Loading" indefinitely; now a stalled request
   gives up and the fallback below takes over. */
const FETCH_TIMEOUT_MS = 8000

async function fetchWithTimeout(url) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
  try {
    return await fetch(url, { signal: ctrl.signal })
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Open-Meteo did not respond in time.')
    throw err
  } finally {
    clearTimeout(t)
  }
}

/** Decodes a multi-point response into typed field arrays indexed y * nx + x. */
function decodeGrid(json, lats, lons, wrap) {
  const pts = asArray(json)
  const ny = lats.length
  const nx = lons.length
  const n = ny * nx
  const u = new Float32Array(n)
  const v = new Float32Array(n)
  const speed = new Float32Array(n)
  const temp = new Float32Array(n)
  const precip = new Float32Array(n)
  for (let i = 0; i < n && i < pts.length; i++) {
    const c = pts[i]?.current ?? {}
    const { u: uu, v: vv } = windToUV(c.wind_speed_10m, c.wind_direction_10m)
    u[i] = uu
    v[i] = vv
    speed[i] = (c.wind_speed_10m ?? 0) / 3.6
    temp[i] = c.temperature_2m ?? NaN
    precip[i] = c.precipitation ?? 0
  }
  return { lats, lons, nx, ny, u, v, speed, temp, precip, wrap }
}

export function useLiveConditions({ refreshMs = 15 * 60 * 1000 } = {}) {
  const [state, setState] = useState({
    status: 'loading',
    grid: null,
    globalGrid: null,
    cities: [],
    observedAt: null,
    error: null,
  })

  const load = useCallback(async ({ force = false } = {}) => {
    if (!force) {
      const cached = readCache()
      if (cached) {
        setState({
          status: 'ready',
          grid: decodeGrid(cached.gridJson, gridLats, gridLons, false),
          globalGrid: decodeGrid(cached.globalJson, globalLats, globalLons, true),
          cities: cached.cities,
          observedAt: cached.observedAt,
          error: null,
          fromCache: true,
          source: 'cache',
        })
        return
      }
    }
    try {
      const [globalRes, gridRes, cityWxRes, cityAirRes] = await Promise.all([
        fetchWithTimeout(buildGridUrl(globalLats, globalLons)),
        fetchWithTimeout(buildGridUrl(gridLats, gridLons)),
        fetchWithTimeout(buildCityUrl(FORECAST_URL, CITY_WX_FIELDS)),
        fetchWithTimeout(buildCityUrl(AIR_URL, CITY_AIR_FIELDS)),
      ])
      if ([globalRes, gridRes, cityWxRes, cityAirRes].some((r) => r.status === 429)) {
        throw new Error(
          'Open-Meteo hourly request limit reached. It resets at the top of the hour.'
        )
      }
      if (!globalRes.ok || !gridRes.ok || !cityWxRes.ok || !cityAirRes.ok) {
        throw new Error('Upstream request failed')
      }

      const [globalJson, gridJson, cityWx, cityAir] = await Promise.all([
        globalRes.json(),
        gridRes.json(),
        cityWxRes.json(),
        cityAirRes.json(),
      ])

      const globalGrid = decodeGrid(globalJson, globalLats, globalLons, true)
      const grid = decodeGrid(gridJson, gridLats, gridLons, false)

      const cities = citiesFrom(cityWx, cityAir)

      const observedAt = asArray(gridJson)[0]?.current?.time ?? null
      writeCache({ globalJson, gridJson, cities, observedAt })
      setState({ status: 'ready', grid, globalGrid, cities, observedAt, error: null, fromCache: false, source: 'live' })
    } catch (err) {
      const error = String(err.message || err)
      /* Offline fallback, so the opening screen of a demo is never empty:
           1. readings already on screen stay (shown as "last known")
           2. else the last cached readings, however old
           3. else a real snapshot bundled with the app
         Each is labelled with its own observation time. */
      const fallback = readCache({ anyAge: true })
        ?? { ...(await import('../assets/live-snapshot.json')).default, snapshot: true }
      setState((s) => {
        if (s.cities.length) return { ...s, status: 'error', error }
        return {
          status: 'error',
          error,
          grid: decodeGrid(fallback.gridJson, gridLats, gridLons, false),
          globalGrid: decodeGrid(fallback.globalJson, globalLats, globalLons, true),
          cities: fallback.cities,
          observedAt: fallback.observedAt,
          fromCache: true,
          source: fallback.snapshot ? 'snapshot' : 'cache',
        }
      })
    }
  }, [])

  useEffect(() => {
    load()
    // refreshMs <= 0 disables polling (used by tests and static captures; a
    // long-running interval also makes headless virtual-time runs skip ahead
    // and starve requestAnimationFrame).
    if (!(refreshMs > 0)) return undefined
    const t = setInterval(load, refreshMs)
    return () => clearInterval(t)
  }, [load, refreshMs])

  useEffect(() => {
    if (state.status !== 'error') return undefined
    const t = setInterval(() => load({ force: true }), 60 * 1000)
    return () => clearInterval(t)
  }, [state.status, load])

  return { ...state, reload: () => load({ force: true }) }
}

/* ------------------------------------------------------------------ AQI ----
   US AQI category thresholds. Mapped onto the app's reserved status tokens so
   an air-quality band can never be confused with a model series colour, and
   every use pairs the colour with its category word. */
export const AQI_BANDS = [
  { max: 50, label: 'Good', color: '#0ca30c' },
  { max: 100, label: 'Moderate', color: '#fab219' },
  { max: 150, label: 'Unhealthy (sensitive)', color: '#ec835a' },
  { max: 200, label: 'Unhealthy', color: '#d03b3b' },
  { max: 300, label: 'Very unhealthy', color: '#a4478c' },
  { max: Infinity, label: 'Hazardous', color: '#7e2b2b' },
]

export function aqiBand(aqi) {
  if (aqi === null || aqi === undefined || Number.isNaN(aqi)) {
    return { label: 'No data', color: '#4d5f6e' }
  }
  return AQI_BANDS.find((b) => aqi <= b.max) ?? AQI_BANDS[AQI_BANDS.length - 1]
}
