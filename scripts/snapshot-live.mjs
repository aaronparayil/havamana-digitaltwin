/* Captures the live Open-Meteo readings the Overview page shows and saves
   them as the app's offline fallback (src/assets/live-snapshot.json).

   Run it the day before a demo so the fallback is recent:
       npm run snapshot

   Uses the page's own lattices, city list and URL builders, so the snapshot
   always matches what the globe expects. */
import { writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import {
  globalLats, globalLons, gridLats, gridLons, buildGridUrl, buildCityUrl,
  FORECAST_URL, AIR_URL, CITY_WX_FIELDS, CITY_AIR_FIELDS, asArray, citiesFrom,
} from '../src/hooks/useLiveConditions.js'

const here = dirname(fileURLToPath(import.meta.url))
const out = join(here, '..', 'src', 'assets', 'live-snapshot.json')

async function get(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} from ${url.slice(0, 60)}…`)
  return res.json()
}

// Only the `current` block of each point is read by the app; drop the rest.
const slim = (json) => asArray(json).map((p) => ({ current: p.current }))

const [globalJson, gridJson, cityWx, cityAir] = await Promise.all([
  get(buildGridUrl(globalLats, globalLons)),
  get(buildGridUrl(gridLats, gridLons)),
  get(buildCityUrl(FORECAST_URL, CITY_WX_FIELDS)),
  get(buildCityUrl(AIR_URL, CITY_AIR_FIELDS)),
])

const snapshot = {
  at: Date.now(),
  observedAt: asArray(gridJson)[0]?.current?.time ?? null,
  globalJson: slim(globalJson),
  gridJson: slim(gridJson),
  cities: citiesFrom(cityWx, cityAir),
}

writeFileSync(out, JSON.stringify(snapshot))
const kb = (JSON.stringify(snapshot).length / 1024).toFixed(0)
console.log(`Saved offline snapshot (${kb} KB, observed ${snapshot.observedAt} UTC) to ${out}`)
