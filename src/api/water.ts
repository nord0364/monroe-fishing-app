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

// ─── USGS — combined temp (00010) + level (00065) in one request ──────────────
// Spec URL: https://waterservices.usgs.gov/nwis/iv/?sites=03366500&parameterCd=00010,00065&format=json
interface UsgsResult {
  tempF?: number
  tempSource?: string   // "USGS #03366500 · 6:45 AM"
  levelFt?: number
}

function fmtDateTime(dateTime: string | undefined): string {
  if (!dateTime) return ''
  try {
    const d = new Date(dateTime)
    const h  = d.getHours() % 12 || 12
    const m  = d.getMinutes().toString().padStart(2, '0')
    const ap = d.getHours() >= 12 ? 'PM' : 'AM'
    return ` · ${h}:${m} ${ap}`
  } catch { return '' }
}

async function fetchUsgsCombined(): Promise<UsgsResult> {
  const url =
    `https://waterservices.usgs.gov/nwis/iv/?sites=${USGS_STATION}` +
    `&parameterCd=00010,00065&format=json`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`USGS fetch failed: ${res.status}`)
  const data = await res.json()

  const series: Record<string, unknown>[] = data.value?.timeSeries ?? []
  type S = {
    variable: { variableCode: { value: string }[] }
    values: { value: { value: string; dateTime?: string }[] }[]
  }

  let tempF: number | undefined
  let tempSource: string | undefined
  let levelFt: number | undefined

  for (const raw of series) {
    const s     = raw as unknown as S
    const code  = s.variable?.variableCode?.[0]?.value
    const vals  = s.values?.[0]?.value ?? []
    const last  = vals[vals.length - 1]

    if (code === '00010' && last?.value != null) {
      const c = parseFloat(last.value)
      if (isFinite(c)) {
        tempF      = +(c * 9 / 5 + 32).toFixed(1)
        tempSource = `USGS #${USGS_STATION}${fmtDateTime(last.dateTime)}`
      }
    }

    if (code === '00065' && last?.value != null) {
      const ft = parseFloat(last.value)
      if (isFinite(ft)) levelFt = +ft.toFixed(2)
    }
  }

  return { tempF, tempSource, levelFt }
}

// ─── Open-Meteo — surface temperature fallback (labeled "estimated") ──────────
async function fetchOpenMeteoTemp(): Promise<number | undefined> {
  const { lat, lng } = LAKE_MONROE_COORDS
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    `&hourly=soil_temperature_0cm&timezone=America%2FIndiana%2FIndianapolis` +
    `&temperature_unit=fahrenheit&forecast_days=1`
  const res = await fetch(url)
  if (!res.ok) throw new Error('Open-Meteo surface temp failed')
  const data = await res.json()
  const temps: unknown[] = data.hourly?.soil_temperature_0cm ?? []
  const val = temps.find((v): v is number => typeof v === 'number')
  return val != null ? +val.toFixed(1) : undefined
}

// ─── NOAA NWPS — lake level (primary) ─────────────────────────────────────────
async function fetchNoaaLevel(): Promise<number | undefined> {
  const res = await fetch('https://api.water.noaa.gov/nwps/v1/gauges/MONI3')
  if (!res.ok) throw new Error('NOAA NWPS failed')
  const data = await res.json()
  const observed = data?.status?.observed ?? data?.observed
  const val = observed?.primary?.value
  if (typeof val === 'number' && isFinite(val)) return +val.toFixed(2)
  return undefined
}

// ─── USGS — 30-day daily average for "vs normal" classification ───────────────
async function fetchUsgsVsNormal(currentFt: number): Promise<WaterLevelVsNormal | undefined> {
  try {
    const res = await fetch(
      `https://waterservices.usgs.gov/nwis/dv/?sites=${USGS_STATION}&parameterCd=00065&period=P30D&format=json`
    )
    if (!res.ok) return undefined
    const data = await res.json()
    const series: Record<string, unknown>[] = data.value?.timeSeries ?? []
    for (const raw of series) {
      type S = { variable: { variableCode: { value: string }[] }; values: { value: { value: string }[] }[] }
      const s = raw as unknown as S
      if (s.variable?.variableCode?.[0]?.value !== '00065') continue
      const vals = (s.values?.[0]?.value ?? [])
        .map((v: { value: string }) => parseFloat(v.value))
        .filter((n: number) => isFinite(n))
      if (vals.length > 0) {
        const sorted = [...vals].sort((a, b) => a - b)
        const median = sorted[Math.floor(sorted.length / 2)]
        const delta  = currentFt - median
        return delta > 0.5 ? 'High' : delta < -0.5 ? 'Low' : 'Normal'
      }
    }
  } catch { /* non-fatal */ }
  return undefined
}

// ─── Public API ────────────────────────────────────────────────────────────────
export interface WaterDataResult extends Partial<EnvironmentalConditions> {
  waterTempSource?: string
  waterDataAge?: number
}

export async function fetchWaterData(): Promise<WaterDataResult> {
  // ── Water temperature + instant level (combined USGS request) ────────────────
  let waterTempF: number | undefined
  let waterTempSource: string | undefined
  let waterLevelFt: number | undefined

  try {
    const usgs = await fetchUsgsCombined()
    // 00010 may be null even on a successful request (sensor inactive) — fall through
    if (usgs.tempF != null) {
      waterTempF    = usgs.tempF
      waterTempSource = usgs.tempSource
    }
    if (usgs.levelFt != null) waterLevelFt = usgs.levelFt
  } catch { /* try individual fallbacks */ }

  // Temp fallback — Open-Meteo estimate (always attempt if USGS 00010 unavailable)
  if (waterTempF == null) {
    try {
      waterTempF = await fetchOpenMeteoTemp()
      if (waterTempF != null) waterTempSource = 'Open-Meteo estimate'
    } catch { /* both sources failed */ }
  }

  // ── Lake level ───────────────────────────────────────────────────────────────
  if (waterLevelFt == null) {
    try {
      waterLevelFt = await fetchNoaaLevel()
    } catch { /* try next */ }
  }

  // ── vs-normal classification ─────────────────────────────────────────────────
  let waterLevelVsNormal: WaterLevelVsNormal | undefined
  if (waterLevelFt != null) {
    waterLevelVsNormal = await fetchUsgsVsNormal(waterLevelFt).catch(() => undefined)
  }

  // ── Cache successful results; fall back to cache if nothing came back ─────────
  const now     = Date.now()
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

  // Truly nothing — return empty (display layer must handle missing temp)
  return {}
}
