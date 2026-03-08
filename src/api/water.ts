import type { EnvironmentalConditions, WaterLevelVsNormal } from '../types'
import { USGS_STATION, LAKE_MONROE_COORDS } from '../constants'

// ─── Cache (localStorage) ─────────────────────────────────────────────────────
const CACHE_KEY = 'water-data-cache-v1'

interface WaterCache {
  waterTempF?: number
  waterTempSource?: string
  waterLevelFt?: number
  waterLevelVsNormal?: WaterLevelVsNormal
  fetchedAt: number
}

function readCache(): WaterCache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    return raw ? (JSON.parse(raw) as WaterCache) : null
  } catch { return null }
}

function writeCache(data: WaterCache): void {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)) } catch {}
}

// ─── USGS — water temperature (primary) ───────────────────────────────────────
// Station 03366500, parameter 00010 = water temp °C
async function fetchUsgsTemp(): Promise<number | undefined> {
  const url =
    `https://waterservices.usgs.gov/nwis/iv/?site=${USGS_STATION}` +
    `&parameterCd=00010&format=json&period=PT1H`
  const res = await fetch(url)
  if (!res.ok) throw new Error('USGS temp failed')
  const data = await res.json()
  const series: Record<string, unknown>[] = data.value?.timeSeries ?? []
  for (const s of series) {
    type S = { variable: { variableCode: { value: string }[] }; values: { value: { value: string }[] }[] }
    const ts = s as unknown as S
    const varCode = ts.variable?.variableCode?.[0]?.value
    const values = ts.values?.[0]?.value ?? []
    const lastVal = values[values.length - 1]?.value
    if (varCode === '00010' && lastVal != null) {
      const c = parseFloat(lastVal)
      if (isFinite(c)) return +(c * 9 / 5 + 32).toFixed(1)
    }
  }
  return undefined
}

// ─── Open-Meteo — surface temperature fallback ────────────────────────────────
// soil_temperature_0cm is the closest proxy for surface water temperature
// when USGS is unavailable. Labeled clearly as an estimate.
async function fetchOpenMeteoTemp(): Promise<number | undefined> {
  const { lat, lng } = LAKE_MONROE_COORDS
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    `&hourly=soil_temperature_0cm&timezone=America%2FIndiana%2FIndianapolis` +
    `&temperature_unit=fahrenheit&forecast_days=1`
  const res = await fetch(url)
  if (!res.ok) throw new Error('Open-Meteo surface temp failed')
  const data = await res.json()
  // Use the most recent (first) hourly value
  const temps: unknown[] = data.hourly?.soil_temperature_0cm ?? []
  const val = temps.find((v): v is number => typeof v === 'number')
  return val != null ? +val.toFixed(1) : undefined
}

// ─── NOAA NWPS — lake level (primary) ─────────────────────────────────────────
// Gauge MONI3 = Monroe Lake at Harrodsburg, IN
// API: https://api.water.noaa.gov/nwps/v1/gauges/MONI3
async function fetchNoaaLevel(): Promise<number | undefined> {
  const res = await fetch('https://api.water.noaa.gov/nwps/v1/gauges/MONI3')
  if (!res.ok) throw new Error('NOAA NWPS failed')
  const data = await res.json()
  // Try both known response shapes from the NWPS v1 API
  const observed = data?.status?.observed ?? data?.observed
  const val = observed?.primary?.value
  if (typeof val === 'number' && isFinite(val)) return +val.toFixed(2)
  return undefined
}

// ─── USGS — lake level fallback + "vs normal" ─────────────────────────────────
// Parameter 00065 = gage height (ft), same station as water temp
async function fetchUsgsLevel(): Promise<{ ft?: number; vsNormal?: WaterLevelVsNormal }> {
  const ivUrl =
    `https://waterservices.usgs.gov/nwis/iv/?site=${USGS_STATION}` +
    `&parameterCd=00065&format=json&period=PT1H`
  const res = await fetch(ivUrl)
  if (!res.ok) throw new Error('USGS level failed')
  const data = await res.json()
  const series: Record<string, unknown>[] = data.value?.timeSeries ?? []
  let ft: number | undefined
  for (const s of series) {
    type S = { variable: { variableCode: { value: string }[] }; values: { value: { value: string }[] }[] }
    const ts = s as unknown as S
    if (ts.variable?.variableCode?.[0]?.value !== '00065') continue
    const lastVal = ts.values?.[0]?.value?.at(-1)?.value
    if (lastVal != null) { ft = +parseFloat(lastVal).toFixed(2); break }
  }

  let vsNormal: WaterLevelVsNormal | undefined
  if (ft != null) {
    try {
      const dvRes = await fetch(
        `https://waterservices.usgs.gov/nwis/dv/?site=${USGS_STATION}&parameterCd=00065&period=P30D&format=json`
      )
      if (dvRes.ok) {
        const dvData = await dvRes.json()
        const dvSeries: Record<string, unknown>[] = dvData.value?.timeSeries ?? []
        for (const s of dvSeries) {
          type S = { variable: { variableCode: { value: string }[] }; values: { value: { value: string }[] }[] }
          const ts = s as unknown as S
          if (ts.variable?.variableCode?.[0]?.value !== '00065') continue
          const vals = (ts.values?.[0]?.value ?? [])
            .map((v: { value: string }) => parseFloat(v.value))
            .filter((n: number) => isFinite(n))
          if (vals.length > 0) {
            const sorted = [...vals].sort((a, b) => a - b)
            const median = sorted[Math.floor(sorted.length / 2)]
            const delta = ft! - median
            vsNormal = delta > 0.5 ? 'High' : delta < -0.5 ? 'Low' : 'Normal'
          }
          break
        }
      }
    } catch { /* non-fatal */ }
  }
  return { ft, vsNormal }
}

// ─── Public API ────────────────────────────────────────────────────────────────
export interface WaterDataResult extends Partial<EnvironmentalConditions> {
  waterTempSource?: string   // e.g. 'USGS gauge' | 'Open-Meteo estimate' | 'cached'
  waterDataAge?: number      // ms since cached fetch
}

export async function fetchWaterData(): Promise<WaterDataResult> {
  // ── Water temperature ────────────────────────────────────────────────────────
  let waterTempF: number | undefined
  let waterTempSource: string | undefined

  try {
    waterTempF = await fetchUsgsTemp()
    if (waterTempF != null) waterTempSource = 'USGS gauge'
  } catch { /* try fallback */ }

  if (waterTempF == null) {
    try {
      waterTempF = await fetchOpenMeteoTemp()
      if (waterTempF != null) waterTempSource = 'Open-Meteo estimate'
    } catch { /* both failed */ }
  }

  // ── Lake level ───────────────────────────────────────────────────────────────
  let waterLevelFt: number | undefined
  let waterLevelVsNormal: WaterLevelVsNormal | undefined

  try {
    waterLevelFt = await fetchNoaaLevel()
  } catch { /* try USGS */ }

  if (waterLevelFt == null) {
    try {
      const usgs = await fetchUsgsLevel()
      waterLevelFt   = usgs.ft
      waterLevelVsNormal = usgs.vsNormal
    } catch { /* both failed */ }
  }

  // If we got level but no vsNormal, compute it from USGS daily data
  if (waterLevelFt != null && waterLevelVsNormal == null) {
    try {
      const { vsNormal } = await fetchUsgsLevel()
      waterLevelVsNormal = vsNormal
    } catch { /* non-fatal */ }
  }

  // ── Cache successful results; fall back to cache if nothing came back ─────────
  const now = Date.now()
  const gotData = waterTempF != null || waterLevelFt != null

  if (gotData) {
    const prev = readCache()
    writeCache({
      waterTempF:         waterTempF         ?? prev?.waterTempF,
      waterTempSource:    waterTempSource     ?? prev?.waterTempSource,
      waterLevelFt:       waterLevelFt        ?? prev?.waterLevelFt,
      waterLevelVsNormal: waterLevelVsNormal  ?? prev?.waterLevelVsNormal,
      fetchedAt: now,
    })
    return { waterTempF, waterTempSource, waterLevelFt, waterLevelVsNormal }
  }

  // Nothing from any live source — serve cached data with age indicator
  const cached = readCache()
  if (cached) {
    return {
      waterTempF:         cached.waterTempF,
      waterTempSource:    'cached',
      waterLevelFt:       cached.waterLevelFt,
      waterLevelVsNormal: cached.waterLevelVsNormal,
      waterDataAge:       now - cached.fetchedAt,
    }
  }

  // Truly nothing
  return {}
}
