/* ==========================================================================
   HavaMana — Chart.js theme
   --------------------------------------------------------------------------
   Every chart in the app is built from these helpers. Before this file the
   four chart pages each hardcoded their own light-mode greys, which is how
   they drifted apart in the first place.

   House rules baked in here so they can't be forgotten per-chart:
     · Thin marks — 2px lines, small points, no fat saturated blocks.
     · Hairline grid, SOLID never dashed (dashes read as "projection").
     · Only the y-axis draws gridlines; vertical rules add noise.
     · Legend is always on for >= 2 series (identity is never colour-alone).
     · Tooltip on by default, with a crosshair on time series.
     · Axis ticks use tabular figures so digits line up column-wise.
   ========================================================================== */

const INK = '#e8eef4'
const INK_SECONDARY = '#a6b6c4'
const LABEL = '#748796'
const GRID = '#223140'
const AXIS = '#2f4353'
const TOOLTIP_BG = '#071016'
const TOOLTIP_BORDER = '#2f4353'

const SANS = "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif"
const MONO = "'JetBrains Mono', ui-monospace, 'DM Mono', monospace"

/** Applied once at app start — defaults every chart inherits. */
export function installChartDefaults(ChartJS) {
  ChartJS.defaults.color = LABEL
  ChartJS.defaults.font.family = SANS
  ChartJS.defaults.font.size = 11
  ChartJS.defaults.borderColor = GRID
  // Points stay small until hovered, when they grow to a comfortable target.
  ChartJS.defaults.elements.point.radius = 2.5
  ChartJS.defaults.elements.point.hoverRadius = 5
  ChartJS.defaults.elements.point.hitRadius = 12
  ChartJS.defaults.elements.line.borderWidth = 2
  ChartJS.defaults.elements.line.tension = 0.3
  ChartJS.defaults.elements.bar.borderRadius = 3
}

const tooltip = {
  backgroundColor: TOOLTIP_BG,
  borderColor: TOOLTIP_BORDER,
  borderWidth: 1,
  titleColor: INK,
  bodyColor: INK_SECONDARY,
  titleFont: { family: SANS, size: 12, weight: '600' },
  bodyFont: { family: MONO, size: 11 },
  padding: 10,
  cornerRadius: 6,
  displayColors: true,
  boxWidth: 8,
  boxHeight: 8,
  boxPadding: 4,
}

const legend = {
  display: true,
  position: 'top',
  align: 'end',
  labels: {
    boxWidth: 8,
    boxHeight: 8,
    usePointStyle: true,
    pointStyle: 'circle',
    color: INK_SECONDARY,
    font: { family: SANS, size: 11 },
    padding: 14,
  },
}

const tickFont = { family: MONO, size: 10 }

/**
 * Standard options for a chart.
 *
 * @param {object} o
 * @param {string} o.yTitle       axis label, e.g. "Rainfall (mm/day)"
 * @param {boolean} o.showLegend  pass false for a single-series chart —
 *                                the title already names it
 * @param {boolean} o.beginAtZero
 * @param {boolean} o.crosshair   index-mode hover for time series
 */
export function chartOptions({
  yTitle,
  showLegend = true,
  beginAtZero = false,
  crosshair = true,
  extra = {},
} = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    // Index mode gives a whole-column readout on time series rather than
    // making the reader land on a single 2px dot.
    interaction: crosshair
      ? { mode: 'index', intersect: false }
      : { mode: 'nearest', intersect: true },
    plugins: {
      legend: showLegend ? legend : { display: false },
      tooltip,
    },
    scales: {
      x: {
        grid: { display: false },
        border: { color: AXIS },
        ticks: { color: LABEL, font: tickFont, maxRotation: 0, autoSkipPadding: 12 },
      },
      y: {
        beginAtZero,
        grid: { color: GRID, drawTicks: false },
        border: { display: false, dash: undefined },
        ticks: { color: LABEL, font: tickFont, padding: 8 },
        title: yTitle
          ? {
              display: true,
              text: yTitle,
              color: INK_SECONDARY,
              font: { family: SANS, size: 11, weight: '500' },
            }
          : { display: false },
      },
    },
    ...extra,
  }
}

/** A line dataset in house style. `color` comes from dataColors.js. */
export function lineSeries(label, data, color, { fill = false, dashed = false } = {}) {
  return {
    label,
    data,
    borderColor: color,
    backgroundColor: fill ? `${color}1f` : 'transparent',
    fill,
    borderWidth: 2,
    borderDash: dashed ? [5, 4] : undefined,
    pointBackgroundColor: color,
    // 2px surface ring so overlapping markers stay countable.
    pointBorderColor: '#16212b',
    pointBorderWidth: 2,
  }
}

/** A bar dataset in house style. */
export function barSeries(label, data, color) {
  return {
    label,
    data,
    backgroundColor: color,
    borderWidth: 0,
    borderRadius: 3,
    // Leaves a surface gap between adjacent bars instead of drawing borders.
    barPercentage: 0.82,
    categoryPercentage: 0.78,
  }
}
