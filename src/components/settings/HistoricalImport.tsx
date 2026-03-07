import { useState } from 'react'
import type { LandedFish, AppSettings } from '../../types'
import { SPECIES, WATER_COLUMNS, LURE_WEIGHTS, RETRIEVE_STYLES, STRUCTURE_TYPES } from '../../constants'
import { saveEvent } from '../../db/database'
import QuickSelect from '../layout/QuickSelect'
import { nanoid } from '../logger/nanoid'

interface Props {
  settings: AppSettings
  onClose: () => void
}

export default function HistoricalImport({ settings, onClose }: Props) {
  const [date, setDate] = useState('')
  const [species, setSpecies] = useState<string>('Largemouth Bass')
  const [weightLbs, setWeightLbs] = useState('')
  const [weightOz, setWeightOz] = useState('')
  const [lengthIn, setLengthIn] = useState('')
  const [waterColumn, setWaterColumn] = useState<string | null>(null)
  const [lureType, setLureType] = useState<string | null>(null)
  const [lureWeight, setLureWeight] = useState<string | null>(null)
  const [lureColor, setLureColor] = useState('')
  const [customPour, setCustomPour] = useState(false)
  const [retrieveStyle, setRetrieveStyle] = useState<string | null>(null)
  const [structure, setStructure] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [saved, setSaved] = useState(0)
  const [saving, setSaving] = useState(false)

  const lureTypes = [...(settings.customLureTypes ?? []),
    'Spinnerbait', 'Swim Jig', 'Chatterbait', 'Football Jig', 'Flipping Jig',
    'Wacky Rig', 'Texas Rig', 'Buzzbait', 'Swimbait', 'Crankbait', 'Topwater',
    'Drop Shot', 'Other']

  const handleSave = async () => {
    if (!date || !lureType) return
    setSaving(true)
    const ts = new Date(date).getTime() || Date.now()
    const event: LandedFish = {
      id: nanoid(),
      sessionId: 'historical',
      timestamp: ts,
      type: 'Landed Fish',
      species: species as import('../../types').Species,
      weightLbs: parseFloat(weightLbs) || 0,
      weightOz: parseFloat(weightOz) || 0,
      lengthInches: parseFloat(lengthIn) || 0,
      waterColumn: waterColumn as import('../../types').WaterColumn ?? undefined,
      lureType,
      lureWeight: (lureWeight ?? 'Other') as import('../../types').LureWeight,
      lureColor,
      customPour,
      retrieveStyle: retrieveStyle as import('../../types').RetrieveStyle | undefined,
      structure: structure as import('../../types').StructureCover | undefined,
      notes: notes || undefined,
      isHistorical: true,
      historicalDate: ts,
    }
    await saveEvent(event)
    setSaved(s => s + 1)
    setWeightLbs(''); setWeightOz(''); setLengthIn(''); setNotes('')
    setSaving(false)
  }

  return (
    <div className="p-4 pb-24 max-w-lg mx-auto space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <button onClick={onClose} className="th-accent-text font-medium text-sm">← Back</button>
        <h1 className="th-text text-lg font-bold flex-1">Historical Import</h1>
        {saved > 0 && <span className="th-accent-text text-sm font-semibold">{saved} saved</span>}
      </div>
      <p className="th-text-muted text-sm">Enter prior season catches to build your pattern database.</p>

      <div>
        <label className="section-label">Date of Catch</label>
        <input
          type="date"
          className="w-full th-surface border th-border rounded-xl px-3 py-3 th-text"
          value={date}
          onChange={e => setDate(e.target.value)}
        />
      </div>

      <QuickSelect label="Species" options={SPECIES} value={species as import('../../types').Species} onChange={setSpecies} />

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="section-label">lbs</label>
          <input type="number" className="w-full th-surface border th-border rounded-xl px-3 py-3 th-text"
            value={weightLbs} onChange={e => setWeightLbs(e.target.value)} placeholder="3" inputMode="decimal" />
        </div>
        <div>
          <label className="section-label">oz</label>
          <input type="number" className="w-full th-surface border th-border rounded-xl px-3 py-3 th-text"
            value={weightOz} onChange={e => setWeightOz(e.target.value)} placeholder="4" inputMode="decimal" />
        </div>
        <div>
          <label className="section-label">in</label>
          <input type="number" className="w-full th-surface border th-border rounded-xl px-3 py-3 th-text"
            value={lengthIn} onChange={e => setLengthIn(e.target.value)} placeholder="17" inputMode="decimal" />
        </div>
      </div>

      <div>
        <label className="section-label">Lure Type</label>
        <div className="grid grid-cols-2 gap-2">
          {lureTypes.map(lt => (
            <button key={lt} type="button" onClick={() => setLureType(lt)}
              className={`px-3 py-3 rounded-xl text-sm font-medium min-h-[48px] border transition-all ${
                lureType === lt
                  ? 'th-btn-primary border-transparent'
                  : 'th-surface th-text-muted th-border'
              }`}>
              {lt}
            </button>
          ))}
        </div>
      </div>

      <QuickSelect label="Lure Weight" options={LURE_WEIGHTS} value={lureWeight as import('../../types').LureWeight} onChange={setLureWeight} columns={3} />

      <div>
        <label className="section-label">Lure Color</label>
        <input className="w-full th-surface border th-border rounded-xl px-3 py-3 th-text"
          placeholder="e.g. chartreuse white" value={lureColor} onChange={e => setLureColor(e.target.value)} />
      </div>

      <QuickSelect label="Water Column (optional)" options={WATER_COLUMNS} value={waterColumn as import('../../types').WaterColumn} onChange={setWaterColumn} />
      <QuickSelect label="Retrieve Style (optional)" options={RETRIEVE_STYLES} value={retrieveStyle as import('../../types').RetrieveStyle} onChange={setRetrieveStyle} columns={2} />
      <QuickSelect label="Structure / Cover (optional)" options={STRUCTURE_TYPES} value={structure as import('../../types').StructureCover} onChange={setStructure} columns={2} />

      <div>
        <label className="section-label">Custom Pour?</label>
        <div className="flex gap-2">
          {(['Yes', 'No'] as const).map(v => (
            <button key={v} type="button" onClick={() => setCustomPour(v === 'Yes')}
              className={`flex-1 py-3 rounded-xl text-sm font-medium border transition-all ${
                (v === 'Yes') === customPour
                  ? 'th-btn-primary border-transparent'
                  : 'th-surface th-text-muted th-border'
              }`}>
              {v}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="section-label">Notes (optional)</label>
        <textarea className="w-full th-surface border th-border rounded-xl px-3 py-3 th-text min-h-[60px] resize-none"
          value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes" />
      </div>

      <button
        onClick={handleSave}
        disabled={saving || !date || !lureType}
        className="w-full py-4 th-btn-primary rounded-xl font-semibold text-lg disabled:opacity-40"
      >
        {saving ? 'Saving…' : 'Save & Log Another'}
      </button>
    </div>
  )
}
