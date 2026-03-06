import { useEffect, useRef } from 'react'
import type { LandedFish, AppSettings } from '../../types'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

interface Props {
  fish: LandedFish[]
  settings: AppSettings
}

const LAKE_MONROE: [number, number] = [39.067, -86.480]

export default function CatchMap({ fish, settings }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<L.Map | null>(null)
  const threshold    = settings.sizeThresholdLbs ?? 3
  const located      = fish.filter(f => f.coords?.lat != null && f.coords?.lng != null)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = L.map(containerRef.current, {
      center:           LAKE_MONROE,
      zoom:             12,
      zoomControl:      true,
      attributionControl: true,
    })

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OSM</a>',
      maxZoom: 19,
    }).addTo(map)

    // Group catches within ~0.0005° (~50m) to show density clusters
    const clusters = new Map<string, { lat: number; lng: number; fish: LandedFish[] }>()
    located.forEach(f => {
      const lat = Math.round(f.coords!.lat * 2000) / 2000
      const lng = Math.round(f.coords!.lng * 2000) / 2000
      const key = `${lat},${lng}`
      if (!clusters.has(key)) clusters.set(key, { lat, lng, fish: [] })
      clusters.get(key)!.fish.push(f)
    })

    clusters.forEach(({ lat, lng, fish: group }) => {
      const totalWeight  = group.reduce((s, f) => s + f.weightLbs + f.weightOz / 16, 0)
      const avgWeight    = totalWeight / group.length
      const hasQuality   = group.some(f => f.weightLbs + f.weightOz / 16 >= threshold)
      const best         = group.reduce((a, f) =>
        (f.weightLbs + f.weightOz / 16) > (a.weightLbs + a.weightOz / 16) ? f : a
      )

      // Radius: 8px base + 2px per catch up to 20px
      const radius = Math.min(20, 8 + (group.length - 1) * 2)

      const color   = hasQuality ? '#10b981' : '#3b82f6'
      const fill    = hasQuality ? '#10b981' : '#60a5fa'

      const popupLines = [
        `<strong>${group.length === 1 ? '1 catch' : `${group.length} catches`}</strong>`,
        group.length > 1
          ? `Avg ${avgWeight.toFixed(2)}lb · Best: ${best.weightLbs}lb ${best.weightOz}oz`
          : `${best.species} · ${best.weightLbs}lb ${best.weightOz}oz`,
        `${best.lureType}${best.lureColor ? ` (${best.lureColor})` : ''}`,
        `<span style="color:#94a3b8">${new Date(best.timestamp).toLocaleDateString()}</span>`,
      ]

      L.circleMarker([lat, lng], {
        radius, color, fillColor: fill,
        fillOpacity: 0.75, weight: 1.5,
      }).bindPopup(`<div style="font-size:13px;line-height:1.6">${popupLines.join('<br>')}</div>`)
        .addTo(map)
    })

    if (located.length > 0) {
      const bounds = L.latLngBounds(located.map(f => [f.coords!.lat, f.coords!.lng] as [number, number]))
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 })
    }

    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
  }, []) // intentionally runs once; fish changes handled by key in PatternReview

  if (located.length === 0) {
    return (
      <div className="text-center py-12 pb-6">
        <div className="text-4xl mb-3">🗺</div>
        <p className="th-text-muted text-sm">No catches with GPS coordinates yet.</p>
        <p className="th-text-muted text-xs mt-1">
          Enable location access when logging catches to see them mapped here.
        </p>
      </div>
    )
  }

  return (
    <div className="pb-6">
      <div className="flex items-center justify-between mb-2">
        <p className="th-text-muted text-xs">
          {located.length} catch{located.length !== 1 ? 'es' : ''} mapped
          {fish.length > located.length ? ` · ${fish.length - located.length} without GPS` : ''}
        </p>
        <div className="flex gap-3 text-xs th-text-muted">
          <span><span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1" />≥{threshold}lb</span>
          <span><span className="inline-block w-2 h-2 rounded-full bg-blue-400 mr-1" />smaller</span>
        </div>
      </div>
      <div
        ref={containerRef}
        className="rounded-xl overflow-hidden border th-border"
        style={{ height: 420 }}
      />
      <p className="th-text-muted text-xs mt-2 text-center">
        Larger circles = more catches at that spot. Tap a circle for details.
      </p>
    </div>
  )
}
