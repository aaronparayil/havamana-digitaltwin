/* The guided tour, in order. Kept apart from Tour.jsx so the copy can be
   edited without touching the mechanics (and so Fast Refresh keeps working:
   a component module that also exports plain data breaks hot updates).

   route   page the step needs; the tour navigates there first
   before  [data-tour] element to click before pointing (open a tab, load a replay)
   target  [data-tour] element to point at; omit for a centred card
   wait    ms to wait for the target to appear (default 6000) */
export const TOUR_STEPS = [
  {
    route: '/',
    target: '[data-tour="nav"]',
    title: 'Welcome to HavaMana',
    body: 'A digital twin of Karnataka’s climate. These four tabs are the whole site, and this tour takes about a minute. Use → and ← to move, Esc to leave.',
  },
  {
    route: '/',
    target: '[data-tour="globe"]',
    title: 'Live India, right now',
    body: 'Real observed wind, temperature and air quality from Open-Meteo. Drag to spin, scroll to zoom, and hover a city dot for its readings.',
  },
  {
    route: '/',
    target: '[data-tour="globe-nav"]',
    title: 'Fly down to Karnataka',
    body: 'Karnataka is where our forecasting model works. Click it to zoom in, then click again to open the model.',
  },
  {
    route: '/',
    target: '[data-tour="city-table"]',
    title: 'Every city at a glance',
    body: 'The same live readings as a table. Sort by air quality or by temperature.',
  },
  {
    route: '/model-test',
    before: '[data-tour="forecast-tab"]',
    target: '[data-tour="explore"]',
    title: 'The digital twin',
    body: 'This is the model itself. Forecast ahead shows what it predicts. Replay & verify tests it on the past, so you can see how good it is.',
  },
  {
    route: '/model-test',
    target: '[data-tour="controls"]',
    title: 'Choose what to see',
    body: 'Pick a time window, a variable (rain, maximum or minimum temperature) and a layer. Hover any ⓘ for a plain-English definition.',
  },
  {
    route: '/model-test',
    target: '[data-tour="timeline"]',
    title: 'Move through the 14 days',
    body: 'Drag the slider, or press Space to play the forecast day by day.',
  },
  {
    route: '/model-test',
    target: '[data-tour="map"]',
    title: 'Karnataka, square by square',
    body: 'Each square is about 22 km across. Hover one for its values, click a city dot to chart it, or switch to 3D.',
  },
  {
    route: '/model-test',
    target: '[data-tour="chart"]',
    title: 'One city over 14 days',
    body: 'The forecast for the city you picked, next to the 15-year normal for the same dates.',
  },
  {
    route: '/model-test',
    before: '[data-tour="replay-tab"]',
    target: '[data-tour="replays"]',
    title: 'Test it on real events',
    body: 'These happened in 2023–2025, years the model never saw in training. Next, we’ll open the 2024 heatwave.',
  },
  {
    route: '/model-test',
    before: '[data-tour="replays"] .replay-card',
    target: '[data-tour="skill"]',
    wait: 10000,
    title: 'The scorecard',
    body: 'The model forecast this heatwave from the 30 days before it. Here it is scored against what IMD actually recorded, and against the 15-year average.',
  },
  {
    route: '/comparisons',
    target: '[data-tour="benchmark"]',
    title: 'The full report card',
    body: 'Every model scored on 1,083 forecasts it never trained on. “best” marks the winner in each column.',
  },
  {
    route: '/comparisons',
    target: '[data-tour="lead-chart"]',
    title: 'How accuracy fades',
    body: 'Error by days ahead. Every forecast gets worse further out; what matters is which line stays lowest, and for how long.',
  },
  {
    target: '[data-tour="nav-whatif"]',
    title: 'Coming next: What-If',
    body: 'Phase 2 lets you change the inputs, such as a weaker monsoon or a hotter May, and watch the twin respond.',
  },
  {
    target: '[data-tour="tour-btn"]',
    title: 'That’s the tour',
    body: 'Replay it any time from this button. Press Ctrl+K to jump to any page.',
  },
]
