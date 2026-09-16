/* ==========================================================================
   HavaMana — Data colour scales
   --------------------------------------------------------------------------
   THE single source of truth for every colour that encodes a value: chart
   series, the 32x32 forecast grid, the anomaly map, and the legends that
   describe them. UI chrome lives in tokens.css; this file is only for colour
   that *means* something.

   Why these values and not prettier ones
   -------------------------------------
   The categorical slots are a validated dark palette, checked against this
   app's real chart surface (--surface-1, #16212b) rather than assumed:

     lightness band   all 5 inside OKLCH L 0.48-0.67      PASS
     chroma floor     all 5 >= 0.10                       PASS
     CVD separation   worst adjacent dE 8.4 (protan)      PASS  (target >= 8)
     normal vision    worst adjacent dE 19.3              PASS  (floor >= 15)
     contrast         all 5 >= 3:1 on the surface         PASS

   Re-run the validator before changing any slot — colourblind-safety is
   computed, never eyeballed.

   Three rules this file exists to enforce:
     1. Colour follows the ENTITY, not its rank. `seriesFor(name)` looks a
        model up by name, so filtering a series out never repaints the
        survivors. "ConvLSTM is blue" stays true everywhere.
     2. Sequential = one hue, dark -> light. Never a rainbow. On a dark
        surface the low end recedes toward the surface and the high end is
        luminous — the inverse of a light-mode ramp.
     3. Diverging = two opposite hues + a NEUTRAL midpoint, with both arms
        luminance-matched so an equal departure either side of normal carries
        equal visual weight.
   ========================================================================== */

/* ----------------------------------------------------------- categorical --
   Fixed order, never cycled. A 6th series folds into "Other" or facets out;
   it never gets a generated hue. */
export const SERIES = [
  '#3987e5', // 1 blue
  '#d95926', // 2 orange
  '#199e70', // 3 aqua
  '#c98500', // 4 yellow
  '#d55181', // 5 magenta
]

/* Stable entity -> slot mapping. Keyed by name so a model keeps its colour no
   matter what order it arrives in or which siblings are present. */
const SERIES_BY_NAME = {
  ConvLSTM2D:  SERIES[0],
  Climatology: SERIES[1],
  Persistence: SERIES[2],
  LinearTrend: SERIES[3],
}

export function seriesFor(name, fallbackIndex = 0) {
  return SERIES_BY_NAME[name] ?? SERIES[fallbackIndex % SERIES.length]
}

/* Scenario identity — same principle, separate namespace. */
const SCENARIO_BY_ID = {
  immediate:      SERIES[0],
  monsoon_surge:  SERIES[2],
  north_heatwave: SERIES[1],
  post_monsoon:   SERIES[4],
  upcoming_winter: SERIES[3],
}

export function scenarioColor(id, fallbackIndex = 0) {
  return SCENARIO_BY_ID[id] ?? SERIES[fallbackIndex % SERIES.length]
}

/* ------------------------------------------------------------ sequential --
   Six steps, monotonically increasing in luminance (verified). Index 0 is
   "near zero" and sits just above the map well; index 5 is the peak. */
export const RAMP_RAIN = ['#1a3d5e', '#184f95', '#256abf', '#3987e5', '#86b6ef', '#cde2fb']

/* Tmax and Tmin share one ramp on purpose: same physical quantity, same
   units. Giving them different hues would imply they aren't comparable. */
export const RAMP_TEMP = ['#4a2616', '#7a3316', '#a8441d', '#d95926', '#ef8a54', '#ffc39a']

/* Forecast error gets its own hue so "how wrong" never reads as "how wet". */
export const RAMP_ERROR = ['#461b1e', '#7a2326', '#a82f33', '#d03b3b', '#e87a76', '#ffb8b2']

/* ------------------------------------------------------------- diverging --
   Cool = below normal, warm = above normal, neutral slate = no departure.
   Arms are luminance-matched about the midpoint (measured dL +-0.097 /
   +-0.261 / +-0.497), so a -3 anomaly and a +3 anomaly look equally strong.
   An eyeballed red/blue pair fails this and quietly biases the map. */
export const DIVERGING = {
  cool: ['#2f6aa8', '#5598e7', '#9ec5f4'], // 1, 2, 3 steps below normal
  mid:  '#2c3a47',
  warm: ['#bd3636', '#e2756f', '#f5b1a6'], // 1, 2, 3 steps above normal
}

/* Cells outside the Karnataka polygon recede into the map well; the state
   outline separates "outside the region" from "near zero inside it". */
export const NO_DATA = '#0a1117'
export const OUTLINE = '#3a5163'

/* ------------------------------------------------------------- domains ----
   The value range each ramp spans, in physical units. Kept here so the map,
   the legend and the tooltip all describe the same scale. */
export const DOMAINS = {
  rainfall: { min: 0,  max: 60, unit: 'mm/day' },
  tmax:     { min: 20, max: 44, unit: '°C' },
  tmin:     { min: 10, max: 30, unit: '°C' },
}

/* Daily rainfall is strongly right-skewed: most cells on most days sit under
   5 mm, and a linear 0-60 ramp therefore collapses almost the whole map into
   the first bin and wastes the other five. These are the conventional
   meteorological day-rain classes, so each bin is a category a forecaster
   actually names. Upper edge of each bin, in mm/day. */
export const RAIN_BREAKS = [0.1, 1, 5, 15, 30]

export const RAIN_BREAK_LABELS = ['dry', '<1', '1-5', '5-15', '15-30', '30+']

function rainBin(v) {
  for (let i = 0; i < RAIN_BREAKS.length; i++) {
    if (v < RAIN_BREAKS[i]) return i
  }
  return RAIN_BREAKS.length
}

/* Anomaly is symmetric about zero; the bound is the largest departure the
   scale shows before saturating. */
export const ANOMALY_BOUND = {
  rainfall: 25,
  tmax: 4,
  tmin: 4,
}

export const ERROR_MAX = { rainfall: 20, tmax: 5, tmin: 5 }

/* --------------------------------------------------------------- helpers -- */

function clamp01(n) {
  return n < 0 ? 0 : n > 1 ? 1 : n
}

/** Picks a discrete step from a ramp for a normalised 0..1 value. Discrete
 *  rather than interpolated: ~6 bins stay distinguishable, and a continuous
 *  gradient past ~7 classes blurs into mush anyway. */
function stepOf(ramp, t) {
  const i = Math.round(clamp01(t) * (ramp.length - 1))
  return ramp[i]
}

export function rampFor(variable) {
  return variable === 'rainfall' ? RAMP_RAIN : RAMP_TEMP
}

/**
 * Colour for one grid cell.
 *
 * @param {number|null} value   physical value (mm/day or degC)
 * @param {string} variable     'rainfall' | 'tmax' | 'tmin'
 * @param {string} mode         'forecast' | 'climatology' | 'anomaly' | 'error'
 * @param {boolean} inRegion    false for cells outside Karnataka
 */
export function cellColor(value, variable, mode, inRegion = true) {
  if (!inRegion) return NO_DATA

  const v = (value === null || value === undefined || Number.isNaN(value)) ? 0 : value

  if (mode === 'anomaly') return anomalyColor(v, variable)
  if (mode === 'error') {
    const max = ERROR_MAX[variable] ?? 5
    return stepOf(RAMP_ERROR, Math.abs(v) / max)
  }

  // Rainfall is binned on meteorological classes; temperature is linear
  // across its domain, which is roughly uniformly distributed.
  if (variable === 'rainfall') return RAMP_RAIN[rainBin(v)]

  const d = DOMAINS[variable] ?? DOMAINS.rainfall
  return stepOf(rampFor(variable), (v - d.min) / (d.max - d.min))
}

/** Diverging colour for a departure-from-normal value. */
export function anomalyColor(value, variable) {
  const bound = ANOMALY_BOUND[variable] ?? 4
  // Dead zone: small departures are noise, and must read as "nothing".
  const deadzone = bound * 0.08
  if (Math.abs(value) <= deadzone) return DIVERGING.mid

  const t = clamp01((Math.abs(value) - deadzone) / (bound - deadzone))
  const arm = value > 0 ? DIVERGING.warm : DIVERGING.cool
  const i = Math.min(arm.length - 1, Math.floor(t * arm.length))
  return arm[i]
}

/* ---------------------------------------------------------------- legends --
   Built from the arrays above, so the swatch can never disagree with the map.
   Hard colour stops (not a smooth blend) because the map itself is binned —
   a smooth legend over a binned map is a lie about the encoding. */
function steppedGradient(colors) {
  const n = colors.length
  const stops = colors.map((c, i) => `${c} ${(i / n) * 100}%, ${c} ${((i + 1) / n) * 100}%`)
  return `linear-gradient(to right, ${stops.join(', ')})`
}

export function legendGradient(variable, mode) {
  if (mode === 'anomaly') {
    return steppedGradient([...DIVERGING.cool].reverse().concat(DIVERGING.mid, DIVERGING.warm))
  }
  if (mode === 'error') return steppedGradient(RAMP_ERROR)
  return steppedGradient(rampFor(variable))
}

/** The end labels for a legend bar, in physical units. */
export function legendBounds(variable, mode) {
  if (mode === 'anomaly') {
    const b = ANOMALY_BOUND[variable] ?? 4
    const u = variable === 'rainfall' ? 'mm' : '°C'
    return { low: `−${b}${u}`, high: `+${b}${u}`, mid: 'normal' }
  }
  if (mode === 'error') {
    const m = ERROR_MAX[variable] ?? 5
    const u = variable === 'rainfall' ? 'mm' : '°C'
    return { low: '0', high: `≥${m}${u}` }
  }
  if (variable === 'rainfall') return { low: 'dry', high: '30+ mm/day' }
  const d = DOMAINS[variable] ?? DOMAINS.rainfall
  return { low: `${d.min}°`, high: `${d.max} ${d.unit}` }
}

/** Tick labels under a legend bar, one per bin, so the reader can name a
 *  colour rather than only compare two ends of a gradient. */
export function legendTicks(variable, mode) {
  if (mode === 'anomaly' || mode === 'error') return null
  if (variable === 'rainfall') return RAIN_BREAK_LABELS
  const d = DOMAINS[variable] ?? DOMAINS.rainfall
  const n = RAMP_TEMP.length
  return Array.from({ length: n }, (_, i) =>
    String(Math.round(d.min + ((d.max - d.min) * i) / (n - 1)))
  )
}

/* Flood-risk levels. These are STATUS, not series identity — the same four
   reserved tokens the rest of the app uses, so a risk level can never be
   mistaken for a model. Every marker also carries its risk word in the
   tooltip, so colour never carries the meaning alone. */
export const RISK_COLOR = {
  Low: '#0ca30c',       // status-good
  Moderate: '#fab219',  // status-warning
  High: '#d03b3b',      // status-critical
}

/**
 * Continuous 0..1 position of a value within its scale.
 *
 * Colour is deliberately BINNED (six named classes a forecaster can read off
 * a legend), but terrain height wants to be CONTINUOUS so relief stays smooth
 * instead of stepping. Same data, two encodings, one domain.
 */
export function normalizedFor(value, variable, mode) {
  const v = (value === null || value === undefined || Number.isNaN(value)) ? 0 : value

  if (mode === 'anomaly') {
    const bound = ANOMALY_BOUND[variable] ?? 4
    return clamp01((v + bound) / (2 * bound))   // 0.5 == no departure
  }
  if (mode === 'error') {
    return clamp01(Math.abs(v) / (ERROR_MAX[variable] ?? 5))
  }
  if (variable === 'rainfall') {
    // Rain is right-skewed, so height uses a square-root scale: heavy days
    // still tower, but a 2 mm cell is still visibly off the floor.
    return clamp01(Math.sqrt(Math.max(0, v) / DOMAINS.rainfall.max))
  }
  const d = DOMAINS[variable] ?? DOMAINS.rainfall
  return clamp01((v - d.min) / (d.max - d.min))
}
