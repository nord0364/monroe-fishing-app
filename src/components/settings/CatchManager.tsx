import { useState, useEffect, useMemo } from 'react'
import type { LandedFish, Species, WaterDepth, WaterColumn, LureWeight } from '../../types'
import { getLandedFish, saveEvent, deleteEvent } from '../../db/database'

interface Props { onClose: () => void }

const SPECIES: Species[] = [
  'Largemouth Bass','Smallmouth Bass','Crappie',
  'Channel Catfish','Flathead Catfish','Bluegill','Walleye','White Bass/Drum','Other',
]
const DEPTHS: WaterDepth[]   = ['Under 2 ft','2 to 4 ft','4 to 7 ft','7 to 12 ft','12 to 18 ft','18 ft plus']
const COLUMNS: WaterColumn[] = ['Surface','Subsurface top 2 ft','Mid-column','Near bottom','Bottom contact']
const LURE_WEIGHTS: LureWeight[] = ['Weightless','3/16 oz','1/4 oz','3/8 oz','1/2 oz','3/4 oz','Other']
const PAGE = 40

function tsToLocal(ts: number) {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ── Edit form ─────────────────────────────────────────────────────────────────
function EditForm({ fish, onSave, onCancel }: { fish: LandedFish; onSave: (f: LandedFish) => void; onCancel: () => void }) {
  const [dt,          setDt]          = useState(tsToLocal(fish.timestamp))
  const [species,     setSpecies]     = useState(fish.species)
  const [lbs,         setLbs]         = useState(String(fish.weightLbs))
  const [oz,          setOz]          = useState(String(fish.weightOz))
  const [length,      setLength]      = useState(String(fish.lengthInches || ''))
  const [lureType,    setLureType]    = useState(fish.lureType)
  const [lureColor,   setLureColor]   = useState(fish.lureColor)
  const [lureWeight,  setLureWeight]  = useState(fish.lureWeight)
  const [waterDepth,  setWaterDepth]  = useState(fish.waterDepth)
  const [waterColumn, setWaterColumn] = useState(fish.waterColumn)
  const [notes,       setNotes]       = useState(fish.notes ?? '')
  const [saving,      setSaving]      = useState(false)

  const save = async () => {
    setSaving(true)
    const ts = new Date(dt).getTime()
    const updated: LandedFish = {
      ...fish,
      timestamp: isNaN(ts) ? fish.timestamp : ts,
      species,
      weightLbs: parseInt(lbs) || 0,
      weightOz:  parseInt(oz)  || 0,
      lengthInches: parseFloat(length) || 0,
      lureType,
      lureColor,
      lureWeight,
      waterDepth,
      waterColumn,
      notes: notes.trim() || undefined,
    }
    await saveEvent(updated)
    onSave(updated)
  }

  const inp = 'w-full th-surface border th-border rounded-lg px-3 py-2.5 th-text text-sm'
  const sel = inp

  return (
    <div className="space-y-3 p-3 th-surface-deep rounded-xl border th-border">
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2">
          <label className="text-xs th-text-muted mb-1 block">Date / Time</label>
          <input type="datetime-local" className={inp} value={dt} onChange={e => setDt(e.target.value)} />
        </div>
        <div>
          <label className="text-xs th-text-muted mb-1 block">Species</label>
          <select className={sel} value={species} onChange={e => setSpecies(e.target.value as Species)}>
            {SPECIES.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-1">
          <div>
            <label className="text-xs th-text-muted mb-1 block">Weight lbs</label>
            <input type="number" min="0" max="20" className={inp} value={lbs}
              onChange={e => setLbs(e.target.value)} inputMode="numeric" />
          </div>
          <div>
            <label className="text-xs th-text-muted mb-1 block">oz</label>
            <input type="number" min="0" max="15" className={inp} value={oz}
              onChange={e => setOz(e.target.value)} inputMode="numeric" />
          </div>
        </div>
        <div>
          <label className="text-xs th-text-muted mb-1 block">Length (in)</label>
          <input type="number" min="0" className={inp} value={length}
            onChange={e => setLength(e.target.value)} inputMode="decimal" />
        </div>
        <div>
          <label className="text-xs th-text-muted mb-1 block">Lure Weight</label>
          <select className={sel} value={lureWeight} onChange={e => setLureWeight(e.target.value as LureWeight)}>
            {LURE_WEIGHTS.map(w => <option key={w}>{w}</option>)}
          </select>
        </div>
        <div className="col-span-2">
          <label className="text-xs th-text-muted mb-1 block">Lure Type</label>
          <input className={inp} value={lureType} onChange={e => setLureType(e.target.value)} />
        </div>
        <div className="col-span-2">
          <label className="text-xs th-text-muted mb-1 block">Lure Color</label>
          <input className={inp} value={lureColor} onChange={e => setLureColor(e.target.value)} />
        </div>
        <div>
          <label className="text-xs th-text-muted mb-1 block">Water Depth</label>
          <select className={sel} value={waterDepth} onChange={e => setWaterDepth(e.target.value as WaterDepth)}>
            {DEPTHS.map(d => <option key={d}>{d}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs th-text-muted mb-1 block">Water Column</label>
          <select className={sel} value={waterColumn} onChange={e => setWaterColumn(e.target.value as WaterColumn)}>
            {COLUMNS.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="col-span-2">
          <label className="text-xs th-text-muted mb-1 block">Notes</label>
          <input className={inp} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" />
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <button onClick={save} disabled={saving}
          className="flex-1 py-2.5 th-btn-primary rounded-xl text-sm font-semibold disabled:opacity-50">
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
        <button onClick={onCancel}
          className="flex-1 py-2.5 th-surface border th-border rounded-xl text-sm th-text">
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function CatchManager({ onClose }: Props) {
  const [all,       setAll]       = useState<LandedFish[]>([])
  const [loading,   setLoading]   = useState(true)
  const [search,    setSearch]    = useState('')
  const [shown,     setShown]     = useState(PAGE)
  const [editId,    setEditId]    = useState<string | null>(null)
  const [deleteId,  setDeleteId]  = useState<string | null>(null)
  const [expanded,  setExpanded]  = useState<string | null>(null)

  useEffect(() => {
    getLandedFish().then(f => { setAll(f); setLoading(false) })
  }, [])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    if (!q) return all
    return all.filter(f =>
      f.lureType.toLowerCase().includes(q) ||
      f.lureColor.toLowerCase().includes(q) ||
      f.species.toLowerCase().includes(q) ||
      (f.notes ?? '').toLowerCase().includes(q)
    )
  }, [all, search])

  const visible = filtered.slice(0, shown)

  const handleSaved = (updated: LandedFish) => {
    setAll(prev => prev.map(f => f.id === updated.id ? updated : f))
    setEditId(null)
  }

  const confirmDelete = async (id: string) => {
    await deleteEvent(id)
    setAll(prev => prev.filter(f => f.id !== id))
    setDeleteId(null)
    setExpanded(null)
  }

  return (
    <div className="p-4 pb-24 max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={onClose} className="th-accent-text text-sm font-medium">← Back</button>
        <h2 className="th-text font-bold text-lg flex-1">Edit Catches</h2>
        <span className="th-text-muted text-xs">{all.length} total</span>
      </div>

      <input
        className="w-full th-surface border th-border rounded-xl px-3 py-2.5 th-text text-sm mb-4"
        placeholder="Search lure, color, species, notes…"
        value={search}
        onChange={e => { setSearch(e.target.value); setShown(PAGE) }}
      />

      {loading ? (
        <p className="text-center th-text-muted py-8">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-center th-text-muted py-8">No catches match.</p>
      ) : (
        <div className="space-y-2">
          {visible.map(f => {
            const isEditing  = editId   === f.id
            const isDeleting = deleteId === f.id
            const isOpen     = expanded === f.id
            const wt = `${f.weightLbs}lb ${f.weightOz}oz`
            const dt = new Date(f.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })

            return (
              <div key={f.id} className="th-surface border th-border rounded-xl overflow-hidden">
                {/* Row header */}
                <button
                  className="w-full text-left px-3 py-3 flex items-center gap-2"
                  onClick={() => { setExpanded(isOpen ? null : f.id); setEditId(null); setDeleteId(null) }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="th-text text-sm font-medium truncate">
                      {f.lureType} · <span className="th-text-muted">{f.lureColor}</span>
                    </div>
                    <div className="th-text-muted text-xs">{dt} · {wt} · {f.species}</div>
                  </div>
                  <span className="th-text-muted text-xs">{isOpen ? '▲' : '▼'}</span>
                </button>

                {isOpen && !isEditing && !isDeleting && (
                  <div className="border-t th-border px-3 pb-3 pt-2 space-y-2">
                    <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs th-text-muted">
                      <span>Weight: <span className="th-text">{wt}</span></span>
                      {f.lengthInches > 0 && <span>Length: <span className="th-text">{f.lengthInches}"</span></span>}
                      <span>Depth: <span className="th-text">{f.waterDepth}</span></span>
                      <span>Column: <span className="th-text">{f.waterColumn}</span></span>
                      <span>Lure wt: <span className="th-text">{f.lureWeight}</span></span>
                      {f.retrieveStyle && <span>Retrieve: <span className="th-text">{f.retrieveStyle}</span></span>}
                    </div>
                    {f.notes && <p className="text-xs th-text-muted italic">{f.notes}</p>}
                    <div className="flex gap-2 pt-1">
                      <button onClick={() => setEditId(f.id)}
                        className="flex-1 py-2 th-btn-primary rounded-lg text-xs font-semibold">
                        Edit
                      </button>
                      <button onClick={() => setDeleteId(f.id)}
                        className="flex-1 py-2 bg-red-900/40 border border-red-700 text-red-300 rounded-lg text-xs font-semibold">
                        Delete
                      </button>
                    </div>
                  </div>
                )}

                {isOpen && isEditing && (
                  <div className="border-t th-border p-3">
                    <EditForm fish={f} onSave={handleSaved} onCancel={() => setEditId(null)} />
                  </div>
                )}

                {isOpen && isDeleting && (
                  <div className="border-t th-border px-3 pb-3 pt-2">
                    <p className="th-text text-sm mb-3">Delete this catch? This cannot be undone.</p>
                    <div className="flex gap-2">
                      <button onClick={() => confirmDelete(f.id)}
                        className="flex-1 py-2.5 bg-red-700 text-white rounded-xl text-sm font-semibold">
                        Yes, Delete
                      </button>
                      <button onClick={() => setDeleteId(null)}
                        className="flex-1 py-2.5 th-surface border th-border rounded-xl text-sm th-text">
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}

          {shown < filtered.length && (
            <button onClick={() => setShown(n => n + PAGE)}
              className="w-full py-3 th-surface-deep border th-border rounded-xl th-text-muted text-sm">
              Show more ({filtered.length - shown} remaining)
            </button>
          )}
        </div>
      )}
    </div>
  )
}
