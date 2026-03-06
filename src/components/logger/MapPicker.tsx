import { useEffect, useRef, useState } from 'react'
import type { GPSCoords } from '../../types'
import { LAKE_MONROE_COORDS } from '../../constants'

// Lazy-load leaflet to avoid SSR issues
let L: typeof import('leaflet') | null = null

interface MapPickerProps {
  coords: GPSCoords | null
  onPick: (coords: GPSCoords) => void
  onClose: () => void
}

export default function MapPicker({ coords, onPick, onClose }: MapPickerProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<import('leaflet').Map | null>(null)
  const markerRef = useRef<import('leaflet').Marker | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let mounted = true
    import('leaflet').then(leaflet => {
      if (!mounted || !mapRef.current || mapInstanceRef.current) return
      L = leaflet.default ?? leaflet
      // Fix default icon paths
      delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      })

      const center: [number, number] = coords
        ? [coords.lat, coords.lng]
        : [LAKE_MONROE_COORDS.lat, LAKE_MONROE_COORDS.lng]

      const map = L.map(mapRef.current!, { zoomControl: true }).setView(center, 13)
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19,
      }).addTo(map)

      if (coords) {
        const marker = L.marker([coords.lat, coords.lng], { draggable: true }).addTo(map)
        markerRef.current = marker
        marker.on('dragend', () => {
          const pos = marker.getLatLng()
          onPick({ lat: pos.lat, lng: pos.lng, manual: true })
        })
      }

      map.on('click', (e: import('leaflet').LeafletMouseEvent) => {
        const { lat, lng } = e.latlng
        if (markerRef.current) {
          markerRef.current.setLatLng([lat, lng])
        } else if (L) {
          const marker = L.marker([lat, lng], { draggable: true }).addTo(map)
          markerRef.current = marker
          marker.on('dragend', () => {
            const pos = marker.getLatLng()
            onPick({ lat: pos.lat, lng: pos.lng, manual: true })
          })
        }
        onPick({ lat, lng, manual: true })
      })

      mapInstanceRef.current = map
      setReady(true)
    })

    return () => {
      mounted = false
      mapInstanceRef.current?.remove()
      mapInstanceRef.current = null
    }
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950">
      <div className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-700">
        <h2 className="font-semibold text-slate-100">Place Pin on Map</h2>
        <button
          onClick={onClose}
          className="px-4 py-2 bg-emerald-600 rounded-lg text-white text-sm font-medium"
        >
          Done
        </button>
      </div>
      <p className="px-4 py-2 text-xs text-slate-400">Tap anywhere to place pin · Drag pin to adjust</p>
      <div ref={mapRef} className="flex-1" />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 z-10">
          <p className="text-slate-300">Loading map…</p>
        </div>
      )}
    </div>
  )
}
