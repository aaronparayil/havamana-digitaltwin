/* ==========================================================================
   Globe layer definitions
   --------------------------------------------------------------------------
   Kept in their own module, free of any three.js import, so the Dashboard can
   read layer labels/ramps for its tabs and legend without pulling the whole
   3D engine into the main bundle. Importing these from Globe3D.jsx silently
   un-did the code splitting and put 570 kB back on every page load.

   Ramps follow the same rules as the forecast scales: one hue for magnitude,
   a diverging warm/cool pair for temperature where the midpoint is "mild".
   ========================================================================== */

export const LAYERS = {
  wind: {
    label: 'Wind',
    field: 'speed',
    unit: 'm/s',
    domain: [0, 14],
    ramp: ['#16334f', '#184f95', '#256abf', '#3987e5', '#86b6ef', '#cde2fb'],
  },
  temp: {
    label: 'Temperature',
    field: 'temp',
    unit: '\u00b0C',
    domain: [5, 45],
    ramp: ['#2f6aa8', '#5598e7', '#9ec5f4', '#f0b429', '#e2756f', '#bd3636'],
  },
  precip: {
    label: 'Precipitation',
    field: 'precip',
    unit: 'mm',
    domain: [0, 12],
    ramp: ['#1a3d5e', '#184f95', '#256abf', '#3987e5', '#86b6ef', '#cde2fb'],
  },
}

export const LAYER_ORDER = ['wind', 'temp', 'precip']

/* Camera stops. Distances are multiples of the globe radius, so the framing
   holds whatever R is set to. Karnataka sits just above OrbitControls'
   minDistance (1.35R) — close enough to fill the frame, not so close the
   near plane clips the surface. */
export const VIEWS = {
  world: { label: 'World', lat: 21, lon: 80, dist: 3.1 },
  india: { label: 'India', lat: 22.5, lon: 79, dist: 2.35 },
  karnataka: { label: 'Karnataka', lat: 15.0, lon: 76.3, dist: 1.62 },
}
