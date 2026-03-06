import { useState } from 'react'
import type { LandedFish, AppSettings } from '../../types'
import { SPECIES, WATER_DEPTHS, WATER_COLUMNS, LURE_WEIGHTS, RETRIEVE_STYLES, STRUCTURE_TYPES } from '../../constants'
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
  const [waterDepth, setWaterDepth] = useState<string | null>(null)
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
    if (!date || !waterDepth || !waterColumn || !lureType) return
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
      waterDepth: waterDepth as import('../../types').WaterDepth,
      waterColumn: waterColumn as import('../../types').WaterColumn,
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
    // Reset form (keep date, species, lure settings)
    setWeightLbs('')
    setWeightOz('')
    setLengthIn('')
    setNotes('')
    setSaving(false)
  }

  return (
    <div className="p-4 pb-24 max-w-lg mx-auto space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <button onClick={onClose} className="text-emerald-400 font-medium text-sm">← Back</button>
        <h1 className="text-lg font-bold text-slate-100">Historical Import</h1>
        {saved > 0 && <span className="ml-auto text-emerald-400 text-sm">{saved} saved</span>}
      </div>
      <p className="text-slate-400 text-sm">Enter prior season catches to build your pattern database.</p>

      <div>
        <label className="block text-xs text-slate-400 mb-1">Date of Catch</label>
        <input
          type="date"
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-3 text-slate-100"
          value={date}
          onChange={e => setDate(e.target.value)}
        />
      </div>

      <QuickSelect label="Species" options={SPECIES} value={species as import('../../types').Species} onChange={setSpecies} />

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs text-slate-400 mb-1">lbs</label>
          <input type="number" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-3 text-slate-100"
            value={weightLbs} onChange={e => setWeightLbs(e.target.value)} placeholder="3" inputMode="decimal" />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">oz</label>
          <input type="number" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-3 text-slate-100"
            value={weightOz} onChange={e => setWeightOz(e.target.value)} placeholder="4" inputMode="decimal" />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">in</label>
          <input type="number" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-3 text-slate-100"
            value={lengthIn} onChange={e => setLengthIn(e.target.value)} placeholder="17" inputMode="decimal" />
        </div>
      </div>

      <div>
        <label className="block text-xs text-slate-400 mb-1.5 font-medium uppercase tracking-wide">Lure Type</label>
        <div className="grid grid-cols-2 gap-2">
          {lureTypes.map(lt => (
            <button key={lt} type="button" onClick={() => setLureType(lt)}
              className={`px-3 py-3 rounded-lg text-sm font-medium text-center min-h-[48px] ${
                lureType === lt ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300 border border-slate-700'}`}>
              {lt}
            </button>
          ))}
        </div>
      </div>

      <QuickSelect label="Lure Weight" options={LURE_WEIGHTS} value={lureWeight as import('../../types').LureWeight} onChange={setLureWeight} columns={3} />

      <div>
        <label className="block text-xs text-slate-400 mb-1">Lure Color</label>
        <input className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-3 text-slate-100"
          placeholder="e.g. chartreuse white" value={lureColor} onChange={e => setLureColor(e.target.value)} />
      </div>

      <QuickSelect label="Water Depth" options={WATER_DEPTHS} value={waterDepth as import('../../types').WaterDepth} onChange={setWaterDepth} />
      <QuickSelect label="Water Column" options={WATER_COLUMNS} value={waterColumn as import('../../types').WaterColumn} onChange={setWaterColumn} />
      <QuickSelect label="Retrieve Style" options={RETRIEVE_STYLES} value={retrieveStyle as import('../../types').RetrieveStyle} onChange={setRetrieveStyle} columns={2} />
      <QuickSelect label="Structure / Cover" options={STRUCTURE_TYPES} value={structure as import('../../types').StructureCover} onChange={setStructure} columns={2} />

      <div>
        <label className="block text-xs text-slate-400 mb-1.5 font-medium uppercase tracking-wide">Custom Pour</label>
        <div className="flex gap-2">
          <button type="button" onClick={() => setCustomPour(true)}
            className={`flex-1 py-3 rounded-lg text-sm font-medium text-center transition-all ${
              customPour ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300 border border-slate-700'
            }`}>Yes</button>
          <button type="button" onClick={() => setCustomPour(false)}
            className={`flex-1 py-3 rounded-lg text-sm font-medium text-center transition-all ${
              !customPour ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300 border border-slate-700'
            }`}>No</button>
        </div>
      </div>

      <div>
        <label className="block text-xs text-slate-400 mb-1">Notes</label>
        <textarea className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-3 text-slate-100 min-h-[60px] resize-none"
          value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes" />
      </div>

      <button
        onClick={handleSave}
        disabled={saving || !date || !waterDepth || !waterColumn || !lureType}
        className="w-full py-4 bg-emerald-600 rounded-xl text-white font-semibold text-lg active:bg-emerald-700 disabled:opacity-40"
      >
        {saving ? 'Saving…' : 'Save & Log Another'}
      </button>
    </div>
  )
}
