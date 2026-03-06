import type { EnvironmentalConditions } from '../types'
import { LAKE_MONROE_COORDS } from '../constants'

// ─── Moon phase — calculated locally (no external dependency) ─────────────────
const KNOWN_NEW_MOON_MS = 946929240000  // Jan 6, 2000 18:14 UTC
const SYNODIC_MONTH_MS  = 29.53058867 * 24 * 60 * 60 * 1000

function calcMoonPhase(date: Date): Pick<EnvironmentalConditions, 'moonPhase' | 'moonIlluminationPct'> {
  const age = ((date.getTime() - KNOWN_NEW_MOON_MS) % SYNODIC_MONTH_MS + SYNODIC_MONTH_MS) % SYNODIC_MONTH_MS
  const ageDays = age / (24 * 60 * 60 * 1000)

  const moonIlluminationPct = Math.round((1 - Math.cos(2 * Math.PI * ageDays / 29.53058867)) / 2 * 100)

  let moonPhase: string
  if (ageDays < 1 || ageDays >= 28.5) moonPhase = 'New Moon'
  else if (ageDays < 7.4)             moonPhase = 'Waxing Crescent'
  else if (ageDays < 8.4)             moonPhase = 'First Quarter'
  else if (ageDays < 14.7)            moonPhase = 'Waxing Gibbous'
  else if (ageDays < 15.7)            moonPhase = 'Full Moon'
  else if (ageDays < 22.1)            moonPhase = 'Waning Gibbous'
  else if (ageDays < 23.1)            moonPhase = 'Last Quarter'
  else                                moonPhase = 'Waning Crescent'

  return { moonPhase, moonIlluminationPct }
}

// ─── Sunrise/sunset + moonrise/moonset — Open-Meteo (reliable, no auth) ──────
export async function fetchMoonData(date?: Date): Promise<Partial<EnvironmentalConditions>> {
  const d = date ?? new Date()
  const moonInfo = calcMoonPhase(d)

  const { lat, lng } = LAKE_MONROE_COORDS
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
      `&daily=sunrise,sunset,moonrise,moonset&timezone=America%2FIndiana%2FIndianapolis&forecast_days=1`

    const res = await fetch(url)
    if (!res.ok) throw new Error('Open-Meteo sun/moon times failed')
    const data = await res.json()

    const fmt = (iso: string | null | undefined): string | undefined => {
      if (!iso) return undefined
      // Open-Meteo returns local time as "2025-03-06T06:45" — extract time directly
      const match = iso.match(/T(\d{2}):(\d{2})/)
      if (!match) return undefined
      const h = parseInt(match[1]), m = parseInt(match[2])
      const period = h >= 12 ? 'PM' : 'AM'
      const h12 = h % 12 || 12
      return `${h12}:${m.toString().padStart(2, '0')} ${period}`
    }

    return {
      ...moonInfo,
      sunrise:   fmt(data.daily?.sunrise?.[0]),
      sunset:    fmt(data.daily?.sunset?.[0]),
      moonrise:  fmt(data.daily?.moonrise?.[0]),
      moonset:   fmt(data.daily?.moonset?.[0]),
    }
  } catch {
    // Fall back to just math-based moon data
    return moonInfo
  }
}
