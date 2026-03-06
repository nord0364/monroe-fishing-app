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
  // Open-Meteo is primary — fast, no auth, global
  const base = await fetchFromOpenMeteo()

  // Optionally enrich baro from NWS station observations (better accuracy, non-blocking)
  return enrichFromNWS(base).catch(() => base)
}
