import { useState, useEffect, useMemo, useRef } from 'react'
import type { LandedFish, Species, WaterDepth, WaterColumn, LureWeight } from '../../types'
import { getLandedFish, saveEvent, deleteEvent } from '../../db/database'

interface Props { onClose: () => void }

const SPECIES: Species[]         = ['Largemouth Bass','Smallmouth Bass','Crappie','Channel Catfish','Flathead Catfish','Bluegill','Walleye','White Bass/Drum','Other']
const DEPTHS: WaterDepth[]       = ['Under 2 ft','2 to 4 ft','4 to 7 ft','7 to 12 ft','12 to 18 ft','18 ft plus']
const COLUMNS: WaterColumn[]     = ['Surface','Subsurface top 2 ft','Mid-column','Near bottom','Bottom contact']
const LURE_WEIGHTS: LureWeight[] = ['Weightless','3/16 oz','1/4 oz','3/8 oz','1/2 oz','3/4 oz','Other']
const MONTH_LABELS               = ['January','February','March','April','May','June','July','August','September','October','November','December']

function tsToLocal(ts: number) {
  const d   = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

type Group = { key: string; year: number; month: number; label: string; catches: LandedFish[] }

function buildGroups(catches: LandedFish[]): Group[] {
  const map = new Map<string, LandedFish[]>()
  for (const f of catches) {
    const d   = new Date(f.timestamp)
    const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(f)
  }
  return [...map.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, cs]) => {
      const [yr, mo] = key.split('-').map(Number)
      cs.sort((a, b) => b.timestamp - a.timestamp)
      return { key, year: yr, month: mo, label: `${MONTH_LABELS[mo]} ${yr}`, catches: cs }
    })
}

// Tri-state checkbox visual
function CheckBox({
  checked, indeterminate, onChange,
}: { checked: boolean; indeterminate?: boolean; onChange: () => void }) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!indeterminate && !checked
  }, [indeterminate, checked])
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      className="w-5 h-5 rounded accent-emerald-500 cursor-pointer shrink-0"
      style={{ accentColor: 'var(--th-accent)' }}
    />
  )
}

// ── Edit form ────────────────────────────────────────────────────────────────
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
      species, weightLbs: parseInt(lbs)||0, weightOz: parseInt(oz)||0,
      lengthInches: parseFloat(length)||0,
      lureType, lureColor, lureWeight, waterDepth, waterColumn,
      notes: notes.trim() || undefined,
    }
    await saveEvent(updated)
    onSave(updated)
  }

  const inp = 'w-full th-surface border th-border rounded-xl px-3 py-2.5 th-text text-sm'

  return (
    <div className="space-y-3 p-3 th-surface-deep rounded-xl border th-border">
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2">
          <label className="section-label">Date / Time</label>
          <input type="datetime-local" className={inp} value={dt} onChange={e => setDt(e.target.value)} />
        </div>
        <div>
          <label className="section-label">Species</label>
          <select className={inp} value={species} onChange={e => setSpecies(e.target.value as Species)}>
            {SPECIES.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-1">
          <div>
            <label className="section-label">lbs</label>
            <input type="number" min="0" max="20" className={inp} value={lbs} onChange={e => setLbs(e.target.value)} inputMode="numeric" />
          </div>
          <div>
            <label className="section-label">oz</label>
            <input type="number" min="0" max="15" className={inp} value={oz} onChange={e => setOz(e.target.value)} inputMode="numeric" />
          </div>
        </div>
        <div>
          <label className="section-label">Length (in)</label>
          <input type="number" min="0" className={inp} value={length} onChange={e => setLength(e.target.value)} inputMode="decimal" />
        </div>
        <div>
          <label className="section-label">Lure Weight</label>
          <select className={inp} value={lureWeight} onChange={e => setLureWeight(e.target.value as LureWeight)}>
            {LURE_WEIGHTS.map(w => <option key={w}>{w}</option>)}
          </select>
        </div>
        <div className="col-span-2">
          <label className="section-label">Lure Type</label>
          <input className={inp} value={lureType} onChange={e => setLureType(e.target.value)} />
        </div>
        <div className="col-span-2">
          <label className="section-label">Lure Color</label>
          <input className={inp} value={lureColor} onChange={e => setLureColor(e.target.value)} />
        </div>
        <div>
          <label className="section-label">Water Depth</label>
          <select className={inp} value={waterDepth} onChange={e => setWaterDepth(e.target.value as WaterDepth)}>
            {DEPTHS.map(d => <option key={d}>{d}</option>)}
          </select>
        </div>
        <div>
          <label className="section-label">Water Column</label>
          <select className={inp} value={waterColumn} onChange={e => setWaterColumn(e.target.value as WaterColumn)}>
            {COLUMNS.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="col-span-2">
          <label className="section-label">Notes</label>
          <input className={inp} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" />
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <button onClick={save} disabled={saving}
          className="flex-1 py-3 th-btn-primary rounded-xl text-sm font-semibold disabled:opacity-50">
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
        <button onClick={onCancel}
          className="flex-1 py-3 th-surface border th-border rounded-xl text-sm th-text">
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function CatchManager({ onClose }: Props) {
  const [all,      setAll]      = useState<LandedFish[]>([])
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState('')

  // Browse state
  const [editId,         setEditId]         = useState<string | null>(null)
  const [deleteId,       setDeleteId]       = useState<string | null>(null)
  const [expandedCatch,  setExpandedCatch]  = useState<string | null>(null)
  const [openGroups,     setOpenGroups]     = useState<Set<string>>(new Set())

  // Bulk select state
  const [selectMode,        setSelectMode]        = useState(false)
  const [selected,          setSelected]          = useState<Set<string>>(new Set())
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false)
  const [bulkDeleting,      setBulkDeleting]      = useState(false)

  useEffect(() => {
    getLandedFish().then(f => {
      setAll(f)
      setLoading(false)
      // Open the most recent month by default
      const groups = buildGroups(f)
      if (groups.length > 0) setOpenGroups(new Set([groups[0].key]))
    })
  }, [])

  // Groups from all catches (unfiltered — for accordion structure)
  const allGroups = useMemo(() => buildGroups(all), [all])

  // Filtered groups (search-aware)
  const filteredGroups = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return allGroups
    return allGroups
      .map(g => ({
        ...g,
        catches: g.catches.filter(f =>
          f.lureType.toLowerCase().includes(q) ||
          f.lureColor.toLowerCase().includes(q) ||
          f.species.toLowerCase().includes(q) ||
          (f.notes ?? '').toLowerCase().includes(q)
        ),
      }))
      .filter(g => g.catches.length > 0)
  }, [allGroups, search])

  // All IDs currently visible (filtered)
  const allVisibleIds = useMemo(
    () => new Set(filteredGroups.flatMap(g => g.catches.map(f => f.id))),
    [filteredGroups]
  )

  // Global select state
  const globalSelected     = allVisibleIds.size > 0 && [...allVisibleIds].every(id => selected.has(id))
  const globalIndeterminate = !globalSelected && [...allVisibleIds].some(id => selected.has(id))

  const toggleGlobalSelect = () => {
    if (globalSelected) {
      setSelected(prev => { const n = new Set(prev); allVisibleIds.forEach(id => n.delete(id)); return n })
    } else {
      setSelected(prev => new Set([...prev, ...allVisibleIds]))
    }
  }

  const toggleGroupSelect = (group: Group) => {
    const ids = new Set(group.catches.map(f => f.id))
    const allIn = [...ids].every(id => selected.has(id))
    setSelected(prev => {
      const n = new Set(prev)
      ids.forEach(id => allIn ? n.delete(id) : n.add(id))
      return n
    })
  }

  const toggleOne = (id: string) => {
    setSelected(prev => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  const toggleGroup = (key: string) => {
    setOpenGroups(prev => {
      const n = new Set(prev)
      n.has(key) ? n.delete(key) : n.add(key)
      return n
    })
  }

  const exitSelectMode = () => {
    setSelectMode(false)
    setSelected(new Set())
    setBulkDeleteConfirm(false)
  }

  const handleSaved = (updated: LandedFish) => {
    setAll(prev => prev.map(f => f.id === updated.id ? updated : f))
    setEditId(null)
  }

  const confirmDelete = async (id: string) => {
    await deleteEvent(id)
    setAll(prev => prev.filter(f => f.id !== id))
    setDeleteId(null)
    setExpandedCatch(null)
  }

  const handleBulkDelete = async () => {
    setBulkDeleting(true)
    for (const id of selected) await deleteEvent(id)
    setAll(prev => prev.filter(f => !selected.has(f.id)))
    exitSelectMode()
    setBulkDeleting(false)
  }

  const totalVisible = filteredGroups.reduce((s, g) => s + g.catches.length, 0)

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 60px)' }}>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="px-4 pt-4 pb-3 th-surface-deep border-b th-border">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={selectMode ? exitSelectMode : onClose}
            className="th-accent-text text-sm font-medium min-w-[44px] py-1.5">
            {selectMode ? 'Cancel' : '← Back'}
          </button>
          <h2 className="th-text font-bold text-base flex-1">Edit Catches</h2>
          <span className="th-text-muted text-xs">{all.length} total</span>
          <button
            onClick={() => { setSelectMode(m => !m); setSelected(new Set()); setBulkDeleteConfirm(false) }}
            className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-colors min-h-[36px] ${
              selectMode
                ? 'th-btn-primary border-transparent'
                : 'th-surface th-text-muted th-border'
            }`}
          >
            {selectMode ? 'Selecting' : 'Select'}
          </button>
        </div>

        <input
          className="w-full th-surface border th-border rounded-xl px-3 py-2.5 th-text text-sm"
          placeholder="Search species, lure, color, notes…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* ── Select-mode global bar ───────────────────────────────────────────── */}
      {selectMode && (
        <div className="flex items-center gap-3 px-4 py-2.5 th-surface border-b th-border">
          <CheckBox
            checked={globalSelected}
            indeterminate={globalIndeterminate}
            onChange={toggleGlobalSelect}
          />
          <span className="th-text text-sm flex-1">
            {globalSelected
              ? `All ${totalVisible} catches`
              : globalIndeterminate
                ? `${[...allVisibleIds].filter(id => selected.has(id)).length} selected`
                : 'Select all'}
          </span>
          {selected.size > 0 && (
            <button
              onClick={() => setBulkDeleteConfirm(true)}
              className="px-4 py-2 bg-red-700 text-white rounded-xl text-xs font-bold min-h-[36px]"
            >
              Delete {selected.size}
            </button>
          )}
        </div>
      )}

      {/* ── Bulk delete confirmation ────────────────────────────────────────── */}
      {bulkDeleteConfirm && (
        <div className="px-4 py-3 bg-red-950/80 border-b border-red-800">
          <p className="th-text text-sm mb-3 font-medium">
            Permanently delete {selected.size} catch{selected.size !== 1 ? 'es' : ''}? This cannot be undone.
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleBulkDelete}
              disabled={bulkDeleting}
              className="flex-1 py-3 bg-red-700 text-white rounded-xl text-sm font-bold disabled:opacity-50"
            >
              {bulkDeleting ? 'Deleting…' : `Yes, Delete ${selected.size}`}
            </button>
            <button
              onClick={() => setBulkDeleteConfirm(false)}
              className="flex-1 py-3 th-surface border th-border rounded-xl text-sm th-text"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Content ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-3 pt-3 pb-8">
        {loading ? (
          <p className="text-center th-text-muted py-12">Loading…</p>
        ) : all.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-3">🎣</div>
            <p className="th-text-muted">No catches logged yet.</p>
          </div>
        ) : filteredGroups.length === 0 ? (
          <p className="text-center th-text-muted py-12">No catches match "{search}".</p>
        ) : (
          <div className="space-y-2">
            {filteredGroups.map(group => {
              const isOpen      = openGroups.has(group.key)
              const groupIds    = group.catches.map(f => f.id)
              const groupSelAll = groupIds.every(id => selected.has(id))
              const groupSelSome = groupIds.some(id => selected.has(id))

              return (
                <div key={group.key} className="th-surface rounded-2xl border th-border overflow-hidden">

                  {/* ── Month header ─────────────────────────────────────── */}
                  <div className="flex items-center gap-3 px-4 min-h-[56px]">
                    {selectMode && (
                      <CheckBox
                        checked={groupSelAll}
                        indeterminate={!groupSelAll && groupSelSome}
                        onChange={() => toggleGroupSelect(group)}
                      />
                    )}
                    <button
                      className="flex-1 flex items-center justify-between py-3 text-left min-h-[56px]"
                      onClick={() => toggleGroup(group.key)}
                    >
                      <div>
                        <span className="th-text font-bold text-sm">{group.label}</span>
                        <span className="th-text-muted text-xs ml-2">
                          {group.catches.length} catch{group.catches.length !== 1 ? 'es' : ''}
                          {selectMode && groupSelSome && !groupSelAll &&
                            <span className="th-accent-text ml-1">· {groupIds.filter(id => selected.has(id)).length} selected</span>}
                        </span>
                      </div>
                      <span className="th-text-muted text-sm ml-2">{isOpen ? '▲' : '▼'}</span>
                    </button>
                  </div>

                  {/* ── Catches list ──────────────────────────────────── */}
                  {isOpen && (
                    <div className="border-t th-border">
                      {group.catches.map((f, idx) => {
                        const isEditing  = editId   === f.id
                        const isDeleting = deleteId === f.id
                        const isExpanded = expandedCatch === f.id && !selectMode
                        const isSelected = selected.has(f.id)
                        const wt = `${f.weightLbs}lb ${f.weightOz}oz`
                        const dt = new Date(f.timestamp).toLocaleDateString([], {
                          weekday: 'short', month: 'short', day: 'numeric',
                        })

                        return (
                          <div
                            key={f.id}
                            className={`${idx > 0 ? 'border-t th-border' : ''} ${isSelected && selectMode ? 'th-surface-deep' : ''}`}
                          >
                            {/* Row */}
                            <div
                              className="flex items-center gap-3 px-4 py-3.5 min-h-[62px]"
                              onClick={selectMode
                                ? () => toggleOne(f.id)
                                : () => {
                                    setExpandedCatch(isExpanded ? null : f.id)
                                    setEditId(null)
                                    setDeleteId(null)
                                  }
                              }
                            >
                              {selectMode && (
                                <CheckBox
                                  checked={isSelected}
                                  onChange={() => toggleOne(f.id)}
                                />
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="th-text text-sm font-semibold truncate">
                                  {f.lureType}
                                  {f.lureColor && <span className="th-text-muted font-normal"> · {f.lureColor}</span>}
                                </div>
                                <div className="th-text-muted text-xs mt-0.5">
                                  {dt} · <span className="th-accent-text">{wt}</span> · {f.species}
                                </div>
                              </div>
                              {!selectMode && (
                                <span className="th-text-muted text-xs shrink-0">{isExpanded ? '▲' : '▼'}</span>
                              )}
                            </div>

                            {/* Expanded detail / edit / delete */}
                            {isExpanded && !isEditing && !isDeleting && (
                              <div className="border-t th-border px-4 pb-4 pt-3 space-y-3">
                                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                                  {([
                                    ['Depth',    f.waterDepth],
                                    ['Column',   f.waterColumn],
                                    ['Lure wt',  f.lureWeight],
                                    f.lengthInches > 0 ? ['Length', `${f.lengthInches}"`] : null,
                                    f.retrieveStyle ? ['Retrieve', f.retrieveStyle] : null,
                                  ] as ([string, string] | null)[]).filter((x): x is [string, string] => x !== null).map(([label, value]) => (
                                    <div key={label}>
                                      <span className="th-text-muted">{label}: </span>
                                      <span className="th-text font-medium">{value}</span>
                                    </div>
                                  ))}
                                </div>
                                {f.notes && <p className="text-xs th-text-muted italic">{f.notes}</p>}
                                <div className="flex gap-2 pt-1">
                                  <button onClick={() => setEditId(f.id)}
                                    className="flex-1 py-2.5 th-btn-primary rounded-xl text-xs font-semibold">
                                    Edit
                                  </button>
                                  <button onClick={() => setDeleteId(f.id)}
                                    className="flex-1 py-2.5 bg-red-900/40 border border-red-700 text-red-300 rounded-xl text-xs font-semibold">
                                    Delete
                                  </button>
                                </div>
                              </div>
                            )}

                            {isExpanded && isEditing && (
                              <div className="border-t th-border p-3">
                                <EditForm fish={f} onSave={handleSaved} onCancel={() => setEditId(null)} />
                              </div>
                            )}

                            {isExpanded && isDeleting && (
                              <div className="border-t th-border px-4 pb-4 pt-3">
                                <p className="th-text text-sm mb-3 font-medium">
                                  Delete this catch? This cannot be undone.
                                </p>
                                <div className="flex gap-2">
                                  <button onClick={() => confirmDelete(f.id)}
                                    className="flex-1 py-3 bg-red-700 text-white rounded-xl text-sm font-bold">
                                    Yes, Delete
                                  </button>
                                  <button onClick={() => setDeleteId(null)}
                                    className="flex-1 py-3 th-surface border th-border rounded-xl text-sm th-text">
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
