import { useState, useEffect, useRef } from 'react'
import type {
  EventType, LandedFish, QualityStrike, FollowNoStrike, VisualSighting,
  Session, GPSCoords, AppSettings,
} from '../../types'
import {
  SPECIES, WATER_DEPTHS, WATER_COLUMNS, LURE_WEIGHTS,
  RETRIEVE_STYLES, STRUCTURE_TYPES,
} from '../../constants'
import { saveEvent } from '../../db/database'
import { identifyLureForCatalog } from '../../api/claude'
import QuickSelect from '../layout/QuickSelect'
import MapPicker from './MapPicker'
import { useGeolocation } from '../../hooks/useGeolocation'
import { nanoid } from './nanoid'

interface Props {
  session: Session
  settings: AppSettings
  onSaved: () => void
}

const EVENT_TYPES: EventType[] = [
  'Landed Fish',
  'Quality Strike — Missed',
  'Follow — Did Not Strike',
  'Visual Sighting',
]

export default function CatchEntry({ session, settings, onSaved }: Props) {
  const [eventType, setEventType] = useState<EventType>('Landed Fish')
  const [coords, setCoords] = useState<GPSCoords | null>(null)
  const [showMap, setShowMap] = useState(false)
  const { coords: gpsCoords, loading: gpsLoading, error: gpsError, getPosition } = useGeolocation()

  // Landed Fish fields
  const [species, setSpecies] = useState<string>('Largemouth Bass')
  const [weightLbs, setWeightLbs] = useState('')
  const [weightOz, setWeightOz] = useState('')
  const [lengthIn, setLengthIn] = useState('')
  const [waterDepth, setWaterDepth] = useState<string | null>(null)
  const [waterColumn, setWaterColumn] = useState<string | null>(null)
  const [lureType, setLureType] = useState<string | null>(null)
  const [lureWeight, setLureWeight] = useState<string | null>(null)
  const [lureColor, setLureColor] = useState('')
  const [customPour, setCustomPour] = useState(false)
  const [retrieveStyle, setRetrieveStyle] = useState<string | null>(null)
  const [structure, setStructure] = useState<string | null>(null)
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [estimatedSize, setEstimatedSize] = useState<string | null>(null)
  const [behavior, setBehavior] = useState('')
  const [saving, setSaving] = useState(false)
  const [identifying, setIdentifying] = useState(false)
  const [saved, setSaved] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const lureTypes = [...(settings.customLureTypes ?? []),
    'Spinnerbait', 'Swim Jig', 'Chatterbait', 'Football Jig', 'Flipping Jig',
    'Wacky Rig', 'Texas Rig', 'Buzzbait', 'Swimbait', 'Crankbait', 'Topwater',
    'Drop Shot', 'Other']

  useEffect(() => {
    getPosition()
  }, [])

  useEffect(() => {
    if (gpsCoords) setCoords(gpsCoords)
  }, [gpsCoords])

  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string
      setPhotoDataUrl(dataUrl)
    }
    reader.readAsDataURL(file)
  }

  const identifyLure = async () => {
    if (!photoDataUrl || !settings.anthropicApiKey) return
    setIdentifying(true)
    try {
      const result = await identifyLureForCatalog(settings.anthropicApiKey, photoDataUrl)
      if (result.color) setLureColor(result.color)
    } catch {
      // ignore
    }
    setIdentifying(false)
  }

  const handleSave = async () => {
    if (!waterDepth || !waterColumn || !lureType) return
    setSaving(true)

    const base = {
      id: nanoid(),
      sessionId: session.id,
      timestamp: Date.now(),
      coords: coords ?? undefined,
    }

    let event: LandedFish | QualityStrike | FollowNoStrike | VisualSighting

    if (eventType === 'Landed Fish') {
      event = {
        ...base,
        type: 'Landed Fish',
        species: species as import('../../types').Species,
        weightLbs: parseFloat(weightLbs) || 0,
        weightOz: parseFloat(weightOz) || 0,
        lengthInches: parseFloat(lengthIn) || 0,
        waterDepth: waterDepth as import('../../types').WaterDepth,
        waterColumn: waterColumn as import('../../types').WaterColumn,
        lureType,
        lureWeight: (lureWeight ?? 'Other') as import('../../types').LureWeight,
        lureColor,
        customPour,
        retrieveStyle: retrieveStyle as import('../../types').RetrieveStyle | undefined,
        structure: structure as import('../../types').StructureCover | undefined,
        photoDataUrl: photoDataUrl ?? undefined,
        notes: notes || undefined,
      } as LandedFish
    } else if (eventType === 'Quality Strike — Missed') {
      event = {
        ...base,
        type: 'Quality Strike — Missed',
        lureType,
        waterDepth: waterDepth as import('../../types').WaterDepth,
        waterColumn: waterColumn as import('../../types').WaterColumn,
        notes: notes || undefined,
      } as QualityStrike
    } else if (eventType === 'Follow — Did Not Strike') {
      event = {
        ...base,
        type: 'Follow — Did Not Strike',
        lureType,
        estimatedSize: (estimatedSize ?? 'Medium') as import('../../types').EstimatedSize,
        notes: notes || undefined,
      } as FollowNoStrike
    } else {
      event = {
        ...base,
        type: 'Visual Sighting',
        estimatedSize: (estimatedSize ?? 'Medium') as import('../../types').EstimatedSize,
        behavior: behavior || undefined,
        notes: notes || undefined,
      } as VisualSighting
    }

    await saveEvent(event)
    setSaving(false)
    setSaved(true)
    setTimeout(() => {
      setSaved(false)
      onSaved()
    }, 1200)
  }

  if (showMap) {
    return <MapPicker coords={coords} onPick={(c) => { setCoords(c); setShowMap(false) }} onClose={() => setShowMap(false)} />
  }

  if (saved) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="text-6xl mb-4">✅</div>
        <p className="text-emerald-400 text-xl font-semibold">Logged!</p>
      </div>
    )
  }

  return (
    <div className="p-4 pb-10 space-y-5 max-w-lg mx-auto">
      {/* Event Type */}
      <div>
        <span className="section-label">What happened?</span>
        <div className="flex flex-col gap-2">
          {EVENT_TYPES.map(et => (
            <button
              key={et}
              type="button"
              onClick={() => setEventType(et)}
              className={`px-4 py-3.5 rounded-2xl text-sm font-semibold text-left min-h-[52px] transition-all border ${
                eventType === et
                  ? 'th-btn-primary border-transparent shadow-md'
                  : 'th-surface th-text-muted th-border'
              }`}
            >
              {et}
            </button>
          ))}
        </div>
      </div>

      {/* GPS */}
      <div className="th-surface rounded-2xl border th-border p-3.5 flex items-center justify-between gap-3 min-h-[52px]">
        <div className="text-sm">
          {coords ? (
            <span className="th-accent-text font-medium">
              📍 {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
              {coords.manual ? ' (manual)' : ''}
            </span>
          ) : gpsLoading ? (
            <span className="th-text-muted">Getting GPS…</span>
          ) : (
            <span className="text-amber-400">{gpsError ?? 'No GPS'}</span>
          )}
        </div>
        <button
          onClick={() => setShowMap(true)}
          className="px-3 py-2.5 th-surface-deep border th-border rounded-xl th-text-muted text-xs font-medium shrink-0 min-h-[40px]"
        >
          📌 Place Pin
        </button>
      </div>

      {/* Landed Fish fields */}
      {eventType === 'Landed Fish' && (
        <>
          {/* Fish details section */}
          <div className="th-surface rounded-2xl border th-border p-4 space-y-4">
            <span className="section-label">Fish Details</span>
            <QuickSelect label="Species" options={SPECIES} value={species as import('../../types').Species} onChange={setSpecies} />
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="section-label">lbs</label>
                <input type="number" className="w-full th-surface-deep border th-border rounded-xl px-3 py-3 th-text text-base"
                  value={weightLbs} onChange={e => setWeightLbs(e.target.value)} placeholder="3" inputMode="decimal" />
              </div>
              <div>
                <label className="section-label">oz</label>
                <input type="number" className="w-full th-surface-deep border th-border rounded-xl px-3 py-3 th-text text-base"
                  value={weightOz} onChange={e => setWeightOz(e.target.value)} placeholder="4" inputMode="decimal" />
              </div>
              <div>
                <label className="section-label">length (in)</label>
                <input type="number" className="w-full th-surface-deep border th-border rounded-xl px-3 py-3 th-text text-base"
                  value={lengthIn} onChange={e => setLengthIn(e.target.value)} placeholder="17" inputMode="decimal" />
              </div>
            </div>
          </div>

          {/* Lure section */}
          <div className="th-surface rounded-2xl border th-border p-4 space-y-4">
            <span className="section-label">Lure Setup</span>
            <div>
              <span className="section-label">type</span>
              <div className="grid grid-cols-2 gap-2">
                {lureTypes.map(lt => (
                  <button key={lt} type="button" onClick={() => setLureType(lt)}
                    className={`px-3 py-3 rounded-xl text-sm font-semibold text-center min-h-[48px] transition-all border ${
                      lureType === lt
                        ? 'th-btn-primary border-transparent'
                        : 'th-surface-deep th-text-muted th-border'}`}>
                    {lt}
                  </button>
                ))}
              </div>
            </div>

            <QuickSelect label="weight" options={LURE_WEIGHTS} value={lureWeight as import('../../types').LureWeight} onChange={setLureWeight} columns={3} />

            <div>
              <span className="section-label">color / pattern</span>
              <div className="flex gap-2">
                <input
                  className="flex-1 th-surface-deep border th-border rounded-xl px-3 py-3 th-text"
                  placeholder="e.g. chartreuse white"
                  value={lureColor}
                  onChange={e => setLureColor(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-3 th-surface-deep border th-border rounded-xl th-text-muted text-xl min-w-[52px]"
                  title="Photo identify"
                >📷</button>
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhoto} />
              {photoDataUrl && (
                <div className="mt-2 flex items-center gap-2">
                  <img src={photoDataUrl} className="w-14 h-14 object-cover rounded-xl" alt="lure" />
                  <button
                    onClick={identifyLure}
                    disabled={identifying || !settings.anthropicApiKey}
                    className="px-4 py-2.5 th-btn-primary rounded-xl text-sm font-semibold disabled:opacity-40"
                  >
                    {identifying ? '…' : '🤖 Identify Color'}
                  </button>
                </div>
              )}
            </div>

            <div>
              <span className="section-label">custom pour?</span>
              <div className="flex gap-2">
                {['Yes', 'No'].map(v => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setCustomPour(v === 'Yes')}
                    className={`flex-1 py-3 rounded-xl text-sm font-semibold text-center border transition-all ${
                      (v === 'Yes') === customPour
                        ? 'th-btn-primary border-transparent'
                        : 'th-surface-deep th-text-muted th-border'
                    }`}
                  >{v}</button>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Shared: depth & column for fish events */}
      {(eventType === 'Landed Fish' || eventType === 'Quality Strike — Missed') && (
        <div className="th-surface rounded-2xl border th-border p-4 space-y-4">
          <span className="section-label">Where &amp; How Deep</span>
          <QuickSelect label="depth" options={WATER_DEPTHS} value={waterDepth as import('../../types').WaterDepth} onChange={setWaterDepth} columns={2} />
          <QuickSelect label="column fished" options={WATER_COLUMNS} value={waterColumn as import('../../types').WaterColumn} onChange={setWaterColumn} />
        </div>
      )}

      {/* Lure for non-visual events */}
      {(eventType === 'Quality Strike — Missed' || eventType === 'Follow — Did Not Strike') && (
        <div>
          <span className="section-label">Lure Type</span>
          <div className="grid grid-cols-2 gap-2">
            {lureTypes.map(lt => (
              <button key={lt} type="button" onClick={() => setLureType(lt)}
                className={`px-3 py-3 rounded-xl text-sm font-semibold text-center min-h-[48px] border transition-all ${
                  lureType === lt
                    ? 'th-btn-primary border-transparent'
                    : 'th-surface th-text-muted th-border'}`}>
                {lt}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Retrieve + Structure (optional, landed fish) */}
      {eventType === 'Landed Fish' && (
        <div className="th-surface rounded-2xl border th-border p-4 space-y-4">
          <span className="section-label">Technique (optional)</span>
          <QuickSelect label="retrieve style" options={RETRIEVE_STYLES} value={retrieveStyle as import('../../types').RetrieveStyle} onChange={setRetrieveStyle} columns={2} />
          <QuickSelect label="structure / cover" options={STRUCTURE_TYPES} value={structure as import('../../types').StructureCover} onChange={setStructure} columns={2} />
        </div>
      )}

      {/* Estimated size for follows and sightings */}
      {(eventType === 'Follow — Did Not Strike' || eventType === 'Visual Sighting') && (
        <QuickSelect
          label="Estimated Size"
          options={['Small', 'Medium', 'Large', 'Toad'] as const}
          value={estimatedSize as import('../../types').EstimatedSize}
          onChange={setEstimatedSize}
          columns={4}
        />
      )}

      {/* Behavior for sightings */}
      {eventType === 'Visual Sighting' && (
        <div>
          <span className="section-label">Behavior</span>
          <input
            className="w-full th-surface border th-border rounded-xl px-3 py-3 th-text"
            placeholder="e.g. schooling, chasing bait"
            value={behavior}
            onChange={e => setBehavior(e.target.value)}
          />
        </div>
      )}

      {/* Notes */}
      <div>
        <span className="section-label">Notes (optional)</span>
        <textarea
          className="w-full th-surface border th-border rounded-xl px-3 py-3 th-text min-h-[80px] resize-none"
          placeholder="Use mic key on keyboard to dictate…"
          value={notes}
          onChange={e => setNotes(e.target.value)}
        />
      </div>

      <button
        onClick={handleSave}
        disabled={saving || (!waterDepth && eventType !== 'Visual Sighting') || (!lureType && eventType !== 'Visual Sighting')}
        className="w-full py-5 th-btn-primary rounded-2xl font-bold text-lg active:scale-[0.98] transition-transform disabled:opacity-40 shadow-lg"
      >
        {saving ? 'Saving…' : 'Log Event'}
      </button>
    </div>
  )
}
