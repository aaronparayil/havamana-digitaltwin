# HavaMana: Climate Digital Twin (Phase 1)

An AI-powered digital twin of Karnataka's climate. A ConvLSTM2D model trained on 15 years
of IMD gridded observations (2010–2025) takes the last 30 days of rainfall, maximum and
minimum temperature on a 32×32 grid (~22 km cells) and forecasts the next 14 days.

Phase 1 ships three things:

| Page | What it shows |
| --- | --- |
| **Overview** | Live wind, temperature and air quality for 20 Indian cities on an interactive 3D globe (Open-Meteo, not this model's output) |
| **Model** | The Karnataka digital twin: 14-day forecasts as a 2D grid or 3D terrain, plus **Replay & verify**, which re-runs the model on past dates and scores it against what IMD actually recorded |
| **Comparisons** | Benchmark on the held-out 2023–2025 test split (1,083 forecasts) against persistence, climatology and linear-trend baselines |

**What-If** (the scenario simulator) is Phase 2 and is marked *Coming soon* in the app.

## Run locally

Requirements: Node 18+, and Python 3.9–3.11 with the packages in `backend/requirements.txt`.

```bash
npm install
pip install -r backend/requirements.txt   # once, ideally inside a virtualenv
npm run dev                                # starts the Flask API (port 5005) and Vite (port 5173)
```

Then open http://localhost:5173. `npm run dev` automatically uses a virtualenv at `.venv`
or `../.venv` if one exists; set `HAVAMANA_PYTHON` to point at a specific interpreter.

The status pill in the top bar reads **Model active** once the trained model has loaded.
If it says *Baselines only*, the API is running without the model. Check the backend
console for the reason.

The processed dataset (`backend/data_cache/karnataka_climate_fused_2010_2025.nc`, ~140 MB)
is not in git. Place it there, or regenerate it from the raw IMD `.grd` files in `data/grd/`.

Other commands:

```bash
npm run build                  # production build of the frontend
npm run lint
python backend/evaluate.py     # recompute benchmark metrics and figures
```

## Demo walkthrough (about 5 minutes)

1. **Overview.** Spin the globe and toggle Wind / Temperature / Precipitation. Click
   *India*, then *Karnataka*. The camera flies down to the model's domain, and a second
   click opens the model.
2. **Model → Replay & verify → "2024 pre-monsoon heatwave".** The model saw only the 30
   days before 4 May 2024. Over the first 3 days its Tmax error is **0.23 °C**, against
   2.45 °C for climatology, with a spatial pattern match of r = 0.99. Switch the layer to
   *Actual Recorded* to compare, then to *Forecast Error*.
3. **"July 2023 Western Ghats deluge".** Switch to **3D** and press play. The coastal rain
   band stands up as terrain. Rainfall error is 39% lower than climatology, with pattern
   match r = 0.94.
4. **Comparisons.** The honest scorecard. Temperature is the model's strength: best
   Tmin overall, and best of four models for Tmax on days 2–5 and Tmin on days 2–7.
   Rainfall is the open problem, and that sets up Phase 2.
5. **What-If.** The Phase 2 roadmap.

Presenter tips:

- **Guided tour:** the **Tour** button in the top bar runs a 15-step spotlight walkthrough of
  the whole site (it changes pages and opens the heatwave replay by itself). First-time
  visitors are offered it automatically. Use → / ← / Esc. Edit the steps in
  `src/components/tourSteps.js`; targets are `data-tour="..."` attributes in the markup.

- First-time visitors to the Model page get a "How the digital twin works" panel (3-step
  explanation, how to read the map, glossary). "Got it" folds it to a one-line bar; ⓘ icons
  next to jargon explain terms in place across the Model and Comparisons pages.

- `http://localhost:5173/model-test?replay=2024-05-04` opens a replay directly.
- On the Model page, **Space** plays or pauses the 14 days, and **← / →** step one day.
- Click a city dot on the Karnataka map to chart it. Hover any cell for forecast, recorded and error values.
- Hover a city on the globe for its live readings.
- The API needs about 5 s to start (longer on the first run after a reboot). Pages opened
  before it is ready show a loader and retry by themselves every few seconds, so there is
  no need to refresh.

## Known limitations (stated in the app too)

- The IMD record ends 31 Dec 2025. *Forecast ahead* for later dates is seeded with the
  most recent recorded 30 days from the same time of year, not live observations.
- Rainfall: the model forecasts light rain on many days that stay dry and underestimates
  downpours, so its average rainfall error is higher than the baselines'.
- The model was saved with Keras 3.15. On older Keras (for example 3.10 on Python 3.9)
  the loader rebuilds the architecture and loads the weights only. This was verified to
  reproduce the published test metrics exactly.

## Project layout

```
backend/
  api/app.py            Flask API: /api/health, /api/forecast/date, /api/forecast/future, /api/metrics
  models/               ConvLSTM2D architecture + loader, baseline forecasters
  data_pipeline/        IMD readers, regridding, normalisation, sequence building
  evaluation/           metrics and figure generation
  saved_models/         trained weights + scaler parameters
  outputs/              evaluation metrics JSON and figures
src/
  pages/                Overview (Dashboard), Model, Comparisons, What-If (Scenarios)
  components/           Globe3D, ForecastTerrain3D, TopBar, Search, DatePicker
  styles/               design tokens, validated data colour scales, chart theme
```
