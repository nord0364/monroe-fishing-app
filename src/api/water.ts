import type { EnvironmentalConditions, WaterLevelVsNormal } from '../types'
import { USGS_STATION } from '../constants'

// USGS Water Services — Station 03366500 (Lake Monroe near Harrodsburg, IN)
// Parameter codes: 00010 = water temp (°C), 00065 = gage height (ft)
export async function fetchWaterData(): Promise<Partial<EnvironmentalConditions>> {
  try {
    // Fetch current + 1 hour of instantaneous data for temp and level
    const url =
      `https://waterservices.usgs.gov/nwis/iv/?site=${USGS_STATION}` +
      `&parameterCd=00010,00065&format=json&period=PT1H`

    const res = await fetch(url)
    if (!res.ok) throw new Error('USGS fetch failed')
    const data = await res.json()

    const timeSeries: Record<string, unknown>[] = data.value?.timeSeries ?? []

    let waterTempF: number | undefined
    let waterLevelFt: number | undefined

    for (const series of timeSeries) {
      type SeriesData = { variable: { variableCode: { value: string }[] }; values: { value: { value: string }[] }[] }
      const s = series as unknown as SeriesData
      const varCode = s.variable?.variableCode?.[0]?.value
      const values = s.values?.[0]?.value ?? []
      const lastVal = values[values.length - 1]?.value

      if (varCode === '00010' && lastVal != null) {
        const tempC = parseFloat(lastVal)
        waterTempF = +(tempC * 9 / 5 + 32).toFixed(1)
      }
      if (varCode === '00065' && lastVal != null) {
        waterLevelFt = +parseFloat(lastVal).toFixed(2)
      }
    }

    // Fetch 30-day daily averages to compute "vs normal"
    let waterLevelVsNormal: WaterLevelVsNormal | undefined
    if (waterLevelFt != null) {
      try {
        const dailyUrl =
          `https://waterservices.usgs.gov/nwis/dv/?site=${USGS_STATION}` +
          `&parameterCd=00065&period=P30D&format=json`
        const dailyRes = await fetch(dailyUrl)
        if (dailyRes.ok) {
          const dailyData = await dailyRes.json()
          const dailySeries: Record<string, unknown>[] = dailyData.value?.timeSeries ?? []
          for (const series of dailySeries) {
            type DS = { variable: { variableCode: { value: string }[] }; values: { value: { value: string }[] }[] }
            const s = series as unknown as DS
            const varCode = s.variable?.variableCode?.[0]?.value
            if (varCode !== '00065') continue
            const vals = (s.values?.[0]?.value ?? [])
              .map((v: { value: string }) => parseFloat(v.value))
              .filter((n: number) => isFinite(n))
            if (vals.length > 0) {
              const sorted = [...vals].sort((a, b) => a - b)
              const median = sorted[Math.floor(sorted.length / 2)]
              const delta = waterLevelFt! - median
              if (delta > 0.5)       waterLevelVsNormal = 'High'
              else if (delta < -0.5) waterLevelVsNormal = 'Low'
              else                   waterLevelVsNormal = 'Normal'
            }
            break
          }
        }
      } catch {
        // non-fatal — water level vs normal stays undefined
      }
    }

    return { waterTempF, waterLevelFt, waterLevelVsNormal }
  } catch (e) {
    console.warn('USGS water data fetch failed:', e)
    return {}
  }
}
