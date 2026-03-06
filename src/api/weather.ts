import type { EnvironmentalConditions, BaroTrend } from '../types'
import { LAKE_MONROE_COORDS } from '../constants'

// ─── Open-Meteo weather codes → human-readable sky condition ──────────────────
function wmoCodeToSky(code: number): string {
  if (code === 0)                           return 'Clear'
  if (code <= 2)                            return 'Partly Cloudy'
  if (code === 3)                           return 'Overcast'
  if (code >= 51 && code <= 67)             return 'Rainy'
  if (code >= 71 && code <= 77)             return 'Snowy'
  if (code >= 80 && code <= 82)             return 'Showers'
  if (code >= 95)                           return 'Thunderstorms'
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
  const airTempF       = typeof cur.temperature_2m === 'number' ? Math.round(cur.temperature_2m) : undefined
  const windSpeedMph   = typeof cur.wind_speed_10m === 'number' ? Math.round(cur.wind_speed_10m) : undefined
  const windDirDeg     = typeof cur.wind_direction_10m === 'number' ? cur.wind_direction_10m : undefined
  const windDirection  = windDirDeg != null ? degToCompass(windDirDeg) : undefined
  const skyCondition   = cur.weather_code != null ? wmoCodeToSky(cur.weather_code) : undefined
  const baroHpa        = typeof cur.surface_pressure === 'number' ? cur.surface_pressure : undefined
  const baroPressureInHg = baroHpa != null ? +(baroHpa * 0.02953).toFixed(2) : undefined

  // Derive baro trend from last 3 hourly readings
  let baroTrend: BaroTrend | undefined
  const hourly: number[] = (data.hourly?.surface_pressure ?? []).filter((v: unknown) => typeof v === 'number').slice(0, 3)
  if (hourly.length >= 2) {
    const delta = (hourly[0] - hourly[hourly.length - 1]) * 0.02953  // hPa to inHg
    if (delta > 0.02)       baroTrend = 'Rising'
    else if (delta < -0.02) baroTrend = 'Falling'
    else                    baroTrend = 'Steady'
  }

  return { airTempF, windSpeedMph, windDirection, skyCondition, baroPressureInHg, baroTrend }
}

function degToCompass(deg: number): string {
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
  return dirs[Math.round(deg / 22.5) % 16]
}

// ─── NWS — secondary (better baro history when available) ────────────────────
async function enrichFromNWS(base: Partial<EnvironmentalConditions>): Promise<Partial<EnvironmentalConditions>> {
  const { lat, lng } = LAKE_MONROE_COORDS
  try {
    const pointRes = await fetch(`https://api.weather.gov/points/${lat},${lng}`)
    if (!pointRes.ok) return base
    const pointData = await pointRes.json()

    const stationsUrl = pointData.properties?.observationStations
    if (!stationsUrl) return base

    const stationsRes = await fetch(stationsUrl)
    if (!stationsRes.ok) return base
    const stationsData = await stationsRes.json()
    const stationId: string = stationsData.features?.[0]?.properties?.stationIdentifier ?? ''
    if (!stationId) return base

    const obsRes = await fetch(`https://api.weather.gov/stations/${stationId}/observations?limit=5`)
    if (!obsRes.ok) return base
    const obsData = await obsRes.json()

    const pressures: number[] = (obsData.features ?? [])
      .map((f: Record<string, unknown>) => {
        const p = ((f.properties as Record<string, unknown>)?.barometricPressure as Record<string, unknown>)?.value
        return typeof p === 'number' ? p : null
      })
      .filter((p: number | null): p is number => p != null)

    if (pressures.length >= 2) {
      const delta = (pressures[0] - pressures[pressures.length - 1]) * 0.0002953
      const baroTrend: BaroTrend = delta > 0.02 ? 'Rising' : delta < -0.02 ? 'Falling' : 'Steady'
      const baroPressureInHg = +(pressures[0] * 0.0002953).toFixed(2)
      return { ...base, baroPressureInHg, baroTrend }
    }
  } catch {
    // non-fatal
  }
  return base
}

// ─── Public API ────────────────────────────────────────────────────────────────
export async function fetchWeather(): Promise<Partial<EnvironmentalConditions>> {
  const base = await fetchFromOpenMeteo()
  return enrichFromNWS(base).catch(() => base)
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

  // Indices whose local hour falls within [startHour, endHour]
  const times: string[] = data.hourly?.time ?? []
  const indices = times.reduce<number[]>((acc, t, i) => {
    const h = parseInt(t.slice(11, 13))  // "2025-03-07T06:00" → 6
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

  const airTempF         = avg(temps)    != null ? Math.round(avg(temps)!)  : undefined
  const windSpeedMph     = avg(winds)    != null ? Math.round(avg(winds)!)  : undefined
  const avgDir           = avg(dirs)
  const windDirection    = avgDir        != null ? degToCompass(avgDir)      : undefined
  const midCode          = codes[Math.floor(codes.length / 2)]
  const skyCondition     = midCode       != null ? wmoCodeToSky(midCode)    : undefined
  const baroHpa          = avg(pressures)
  const baroPressureInHg = baroHpa       != null ? +(baroHpa * 0.02953).toFixed(2) : undefined

  let baroTrend: BaroTrend | undefined
  if (pressures.length >= 2) {
    const delta = (pressures[pressures.length - 1] - pressures[0]) * 0.02953
    baroTrend = delta > 0.02 ? 'Rising' : delta < -0.02 ? 'Falling' : 'Steady'
  }

  return { airTempF, windSpeedMph, windDirection, skyCondition, baroPressureInHg, baroTrend }
}
