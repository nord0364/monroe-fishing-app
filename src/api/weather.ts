import type { EnvironmentalConditions, BaroTrend } from '../types'
import { LAKE_MONROE_COORDS } from '../constants'

// ─── NWS grid URL cache (localStorage — permanent, this URL does not change) ──
const NWS_GRID_URL_KEY   = 'nws_grid_url'
const NWS_GRID_CACHE_KEY = 'nws_grid_cache'
const NWS_GRID_CACHE_TTL = 30 * 60 * 1000  // 30 minutes

type NWSValues = Array<{ validTime: string; value: number | null }>
interface NWSGridProps { [field: string]: { values: NWSValues } | unknown }
interface NWSGridCache { data: NWSGridProps; fetchedAt: number }

function loadGridUrl(): string | null {
  try { return localStorage.getItem(NWS_GRID_URL_KEY) } catch { return null }
}
function saveGridUrl(url: string): void {
  try { localStorage.setItem(NWS_GRID_URL_KEY, url) } catch {}
}
function loadGridCache(): NWSGridProps | null {
  try {
    const raw = localStorage.getItem(NWS_GRID_CACHE_KEY)
    if (!raw) return null
    const cache: NWSGridCache = JSON.parse(raw)
    if (Date.now() - cache.fetchedAt > NWS_GRID_CACHE_TTL) return null
    return cache.data
  } catch { return null }
}
function saveGridCache(data: NWSGridProps): void {
  try { localStorage.setItem(NWS_GRID_CACHE_KEY, JSON.stringify({ data, fetchedAt: Date.now() })) } catch {}
}

// ─── ISO 8601 duration parser (PT1H, PT3H, P1DT6H …) ────────────────────────
function parseDurationMs(dur: string): number {
  let ms = 0
  const days  = dur.match(/(\d+)D/)
  const hours = dur.match(/(\d+)H/)
  const mins  = dur.match(/(\d+)M(?!o)/i)
  if (days)  ms += parseInt(days[1])  * 86_400_000
  if (hours) ms += parseInt(hours[1]) * 3_600_000
  if (mins)  ms += parseInt(mins[1])  * 60_000
  return ms || 3_600_000
}

// ─── Find the NWS value whose interval covers `targetMs` ─────────────────────
function findNWSValue(values: NWSValues, targetMs: number): number | null {
  for (const { validTime, value } of values) {
    if (value === null) continue
    const slash = validTime.indexOf('/')
    if (slash < 0) continue
    const startMs = new Date(validTime.slice(0, slash)).getTime()
    const endMs   = startMs + parseDurationMs(validTime.slice(slash + 1))
    if (targetMs >= startMs && targetMs < endMs) return value
  }
  return null
}

function degToCompass(deg: number): string {
  const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW']
  return dirs[Math.round(deg / 22.5) % 16]
}

// ─── WMO weather codes → human-readable sky condition ────────────────────────
function wmoCodeToSky(code: number): string {
  if (code === 0)               return 'Clear'
  if (code <= 2)                return 'Partly Cloudy'
  if (code === 3)               return 'Overcast'
  if (code >= 51 && code <= 67) return 'Rainy'
  if (code >= 71 && code <= 77) return 'Snowy'
  if (code >= 80 && code <= 82) return 'Showers'
  if (code >= 95)               return 'Thunderstorms'
  return 'Cloudy'
}

// ─── Open-Meteo — primary (fast, no auth, CORS-safe) ─────────────────────────
async function fetchFromOpenMeteo(): Promise<Partial<EnvironmentalConditions>> {
  const { lat, lng } = LAKE_MONROE_COORDS
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    `&current=temperature_2m,wind_speed_10m,wind_direction_10m,weather_code,surface_pressure` +
    `&hourly=surface_pressure&timezone=America%2FIndiana%2FIndianapolis` +
    `&temperature_unit=fahrenheit&wind_speed_unit=mph&forecast_days=1`

  const res = await fetch(url)
  if (!res.ok) throw new Error('Open-Meteo weather failed')
  const data = await res.json()

  const cur = data.current ?? {}
  const airTempF         = typeof cur.temperature_2m     === 'number' ? Math.round(cur.temperature_2m)    : undefined
  const windSpeedMph     = typeof cur.wind_speed_10m     === 'number' ? Math.round(cur.wind_speed_10m)    : undefined
  const windDirDeg       = typeof cur.wind_direction_10m === 'number' ? cur.wind_direction_10m : undefined
  const windDirection    = windDirDeg != null ? degToCompass(windDirDeg) : undefined
  const skyCondition     = cur.weather_code != null ? wmoCodeToSky(cur.weather_code) : undefined
  const baroHpa          = typeof cur.surface_pressure   === 'number' ? cur.surface_pressure  : undefined
  const baroPressureInHg = baroHpa != null ? +(baroHpa * 0.02953).toFixed(2) : undefined

  // Rough baro trend from 3 hourly readings (overridden by NWS grid when available)
  let baroTrend: BaroTrend | undefined
  const hourly: number[] = (data.hourly?.surface_pressure ?? [])
    .filter((v: unknown) => typeof v === 'number').slice(0, 3)
  if (hourly.length >= 2) {
    const delta = (hourly[0] - hourly[hourly.length - 1]) * 0.02953
    baroTrend = delta > 0.02 ? 'Rising' : delta < -0.02 ? 'Falling' : 'Steady'
  }

  return { airTempF, windSpeedMph, windDirection, skyCondition, baroPressureInHg, baroTrend }
}

// ─── NWS gridpoint — enhanced baro trend + dewpoint + sky cover + POP ────────
async function getGridUrl(): Promise<string> {
  const cached = loadGridUrl()
  if (cached) return cached

  const { lat, lng } = LAKE_MONROE_COORDS
  const res = await fetch(`https://api.weather.gov/points/${lat},${lng}`, {
    headers: { 'User-Agent': 'LakeMonroeBassGuide/1.0' },
  })
  if (!res.ok) throw new Error(`NWS points failed: ${res.status}`)
  const data = await res.json()
  const url: string = data.properties?.forecastGridData
  if (!url) throw new Error('No forecastGridData URL')
  saveGridUrl(url)
  return url
}

async function fetchNWSGrid(): Promise<NWSGridProps | null> {
  const cached = loadGridCache()
  if (cached) return cached
  try {
    const gridUrl = await getGridUrl()
    const res = await fetch(gridUrl, { headers: { 'User-Agent': 'LakeMonroeBassGuide/1.0' } })
    if (!res.ok) throw new Error(`NWS grid failed: ${res.status}`)
    const json = await res.json()
    const props = json.properties as NWSGridProps
    saveGridCache(props)
    return props
  } catch { return null }
}

async function enrichFromNWSGrid(
  base: Partial<EnvironmentalConditions>,
): Promise<Partial<EnvironmentalConditions>> {
  const grid = await fetchNWSGrid()
  if (!grid) return base

  const now   = Date.now()
  const ago3h = now - 3 * 3_600_000
  const result = { ...base }

  const getVals = (field: string): NWSValues => {
    const f = grid[field]
    if (f && typeof f === 'object' && 'values' in f) return (f as { values: NWSValues }).values
    return []
  }

  // ── Barometric pressure + trend (Pa → hPa/mb) ────────────────────────────
  const pNow  = findNWSValue(getVals('pressure'), now)
  const p3ago = findNWSValue(getVals('pressure'), ago3h)
  if (pNow !== null) {
    result.baroPressureInHg = +(pNow / 100 * 0.02953).toFixed(2)
    if (p3ago !== null) {
      const deltaHPa = (pNow - p3ago) / 100
      result.baroTrend   = deltaHPa > 0.1 ? 'Rising' : deltaHPa < -0.1 ? 'Falling' : 'Steady'
      result.baroTrendMb = Math.round(Math.abs(deltaHPa) * 10) / 10
    }
  }

  // ── Dewpoint (degC → °F) ──────────────────────────────────────────────────
  const dpC = findNWSValue(getVals('dewpoint'), now)
  if (dpC !== null) result.dewpointF = Math.round(dpC * 9 / 5 + 32)

  // ── Sky cover (%) ─────────────────────────────────────────────────────────
  const sky = findNWSValue(getVals('skyCover'), now)
  if (sky !== null) result.skyCoverPct = Math.round(sky)

  // ── Probability of precipitation (%) ─────────────────────────────────────
  const pop = findNWSValue(getVals('probabilityOfPrecipitation'), now)
  if (pop !== null) result.precipProbPct = Math.round(pop)

  return result
}

// ─── Public API ────────────────────────────────────────────────────────────────
export async function fetchWeather(): Promise<Partial<EnvironmentalConditions>> {
  const base     = await fetchFromOpenMeteo()
  const enriched = await enrichFromNWSGrid(base).catch(() => base)
  return { ...enriched, weatherUpdatedAt: Date.now() }
}

/** Hourly forecast for a specific date, averaged across [startHour, endHour]. */
export async function fetchForecastWeather(
  targetDate: Date,
  startHour: number,
  endHour: number,
): Promise<Partial<EnvironmentalConditions>> {
  const { lat, lng } = LAKE_MONROE_COORDS
  const pad = (n: number) => String(n).padStart(2, '0')
  const dateStr = `${targetDate.getFullYear()}-${pad(targetDate.getMonth() + 1)}-${pad(targetDate.getDate())}`

  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    `&hourly=temperature_2m,wind_speed_10m,wind_direction_10m,weather_code,surface_pressure` +
    `&timezone=America%2FIndiana%2FIndianapolis` +
    `&temperature_unit=fahrenheit&wind_speed_unit=mph` +
    `&start_date=${dateStr}&end_date=${dateStr}`

  const res = await fetch(url)
  if (!res.ok) throw new Error('Open-Meteo forecast failed')
  const data = await res.json()

  const times: string[] = data.hourly?.time ?? []
  const indices = times.reduce<number[]>((acc, t, i) => {
    const h = parseInt(t.slice(11, 13))
    if (h >= startHour && h <= endHour) acc.push(i)
    return acc
  }, [])

  if (indices.length === 0) throw new Error('No forecast data for target window')

  const get = (key: string): number[] =>
    indices
      .map(i => (data.hourly?.[key] as unknown[])?.[i])
      .filter((v): v is number => typeof v === 'number')

  const avg = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : undefined

  const temps     = get('temperature_2m')
  const winds     = get('wind_speed_10m')
  const dirs      = get('wind_direction_10m')
  const codes     = get('weather_code')
  const pressures = get('surface_pressure')

  const airTempF         = avg(temps)     != null ? Math.round(avg(temps)!)  : undefined
  const windSpeedMph     = avg(winds)     != null ? Math.round(avg(winds)!)  : undefined
  const avgDir           = avg(dirs)
  const windDirection    = avgDir         != null ? degToCompass(avgDir)      : undefined
  const midCode          = codes[Math.floor(codes.length / 2)]
  const skyCondition     = midCode        != null ? wmoCodeToSky(midCode)    : undefined
  const baroHpa          = avg(pressures)
  const baroPressureInHg = baroHpa        != null ? +(baroHpa * 0.02953).toFixed(2) : undefined

  let baroTrend: BaroTrend | undefined
  if (pressures.length >= 2) {
    const delta = (pressures[pressures.length - 1] - pressures[0]) * 0.02953
    baroTrend = delta > 0.02 ? 'Rising' : delta < -0.02 ? 'Falling' : 'Steady'
  }

  return { airTempF, windSpeedMph, windDirection, skyCondition, baroPressureInHg, baroTrend, weatherUpdatedAt: Date.now() }
}
