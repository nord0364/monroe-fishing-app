import { useState, useEffect, useRef } from 'react'
import type { OwnedLure } from '../../types'
import { getAllOwnedLures, saveOwnedLure, deleteOwnedLure, bulkSaveOwnedLures } from '../../db/database'
import { nanoid } from '../logger/nanoid'
import { identifyLureForCatalog, type LureIdentification } from '../../api/claude'

interface Props { onClose: () => void; apiKey?: string }

const WEIGHTS = ['Weightless', '3/16 oz', '1/4 oz', '3/8 oz', '1/2 oz', '3/4 oz', '1 oz', 'Other']
const REASSIGN_CATEGORIES = [
  'Spinnerbait', 'Chatterbait', 'Jig', 'Soft Plastics',
  'Topwater', 'Crankbait', 'Swimbait', 'Ned Rig', 'Other',
]
const JIG_SUBGROUPS = [
  'Swim Jig', 'Football Jig', 'Flipping Jig', 'Casting Jig', 'Finesse Jig', 'Other Jig',
]

async function resizePhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => {
      const img = new Image()
      img.onload = () => {
        const MAX = 400
        const scale = Math.min(MAX / img.width, MAX / img.height, 1)
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', 0.75))
      }
      img.onerror = reject
      img.src = e.target?.result as string
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export default function LureCatalog({ onClose, apiKey }: Props) {
  const [lures, setLures] = useState<OwnedLure[]>([])
  const [editing, setEditing] = useState<OwnedLure | null>(null)
  const [multiSelect, setMultiSelect] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [showReassign, setShowReassign] = useState(false)
  const [reassignCat, setReassignCat] = useState('')
  const [reassignSub, setReassignSub] = useState('')

  useEffect(() => { getAllOwnedLures().then(setLures) }, [])

  const saved = (lure: OwnedLure) => {
    setLures(prev => {
      const idx = prev.findIndex(l => l.id === lure.id)
      return idx >= 0 ? prev.map(l => l.id === lure.id ? lure : l) : [lure, ...prev]
    })
    setEditing(null)
  }

  const remove = async (id: string) => {
    await deleteOwnedLure(id)
    setLures(prev => prev.filter(l => l.id !== id))
  }

  const exitMultiSelect = () => {
    setMultiSelect(false)
    setSelected(new Set())
    setShowReassign(false)
    setReassignCat('')
    setReassignSub('')
  }

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleReassignConfirm = async () => {
    if (!reassignCat) return
    const resolvedType = reassignCat
    const items = lures.filter(l => selected.has(l.id))
    const updated = items.map(l => ({
      ...l,
      lureType: resolvedType,
      jigSubgroup: reassignCat === 'Jig' ? (reassignSub || undefined) : undefined,
    }))
    await bulkSaveOwnedLures(updated)
    setLures(prev => prev.map(l => {
      const u = updated.find(u => u.id === l.id)
      return u ?? l
    }))
    exitMultiSelect()
  }

  const longPressHandlers = (id: string) => {
    let timer: ReturnType<typeof setTimeout> | null = null
    return {
      onPointerDown: () => { timer = setTimeout(() => { setMultiSelect(true); setSelected(new Set([id])) }, 500) },
      onPointerUp:   () => { if (timer) { clearTimeout(timer); timer = null } },
      onPointerLeave: () => { if (timer) { clearTimeout(timer); timer = null } },
    }
  }

  if (editing) {
    return <LureForm initial={editing} apiKey={apiKey} onSave={saved} onCancel={() => setEditing(null)} />
  }

  return (
    <div className="pb-36 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-2">
        <button onClick={onClose} className="th-accent-text text-sm font-medium min-h-[44px] px-1">← Back</button>
        <h2 className="th-text font-bold text-lg flex-1">My Lures</h2>
      </div>

      {lures.length === 0 ? (
        <div className="text-center py-12 th-text-muted px-4">
          <div className="text-4xl mb-3">🎣</div>
          <p className="text-sm">No lures cataloged yet.</p>
          <p className="text-xs mt-1">Add lures from the Tackle tab so the AI can prioritize what you own.</p>
        </div>
      ) : (
        <div className="divide-y th-border">
          {lures.map(l => {
            const lph = longPressHandlers(l.id)
            const isSelected = selected.has(l.id)
            const displayType = l.lureType === 'Jig' && l.jigSubgroup ? l.jigSubgroup : (l.lureType ?? '—')
            return (
              <div
                key={l.id}
                className={`flex items-center gap-3 px-4 py-3 min-h-[60px] transition-colors ${isSelected ? 'bg-blue-900/20' : ''}`}
                {...lph}
                onClick={() => {
                  if (multiSelect) { toggleSelect(l.id) } else { setEditing(l) }
                }}
              >
                {multiSelect && (
                  <div
                    className="shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center"
                    style={{ borderColor: isSelected ? '#3b82f6' : 'var(--th-border)', background: isSelected ? '#3b82f6' : 'transparent' }}
                  >
                    {isSelected && <span className="text-white text-[10px]">✓</span>}
                  </div>
                )}
                {l.photoDataUrl
                  ? <img src={l.photoDataUrl} className="w-12 h-12 rounded-lg object-cover shrink-0" alt="" />
                  : <div className="w-12 h-12 rounded-lg th-surface-deep flex items-center justify-center text-xl shrink-0">🎣</div>
                }
                <div className="flex-1 min-w-0">
                  <div className="th-text font-semibold text-sm">{displayType}</div>
                  <div className="th-text-muted text-xs">{l.weight} · {l.color}</div>
                  {l.brand && <div className="th-text-muted text-xs">{l.brand}</div>}
                </div>
                {!multiSelect && (
                  <button
                    onClick={e => { e.stopPropagation(); remove(l.id) }}
                    className="text-xs text-red-400 px-2 py-1 min-h-[36px]"
                  >
                    Remove
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Multi-select bottom bar */}
      {multiSelect && !showReassign && (
        <div className="fixed bottom-0 left-0 right-0 z-40 px-4 pb-4 pt-2 th-surface border-t th-border">
          <div className="flex items-center gap-3 mb-2">
            <button onClick={exitMultiSelect} className="th-text-muted text-sm min-h-[44px] px-1">
              Cancel
            </button>
            <span className="flex-1 th-text text-sm font-medium text-center">
              {selected.size} selected
            </span>
            <button
              onClick={() => { if (selected.size > 0) setShowReassign(true) }}
              disabled={selected.size === 0}
              className="px-4 py-2 th-btn-primary rounded-xl text-sm font-semibold min-h-[44px] disabled:opacity-40"
            >
              Reassign
            </button>
          </div>
          <p className="text-xs th-text-muted text-center">Tap items to select · Long-press to start</p>
        </div>
      )}

      {/* Reassign category picker */}
      {showReassign && (
        <div className="fixed bottom-0 left-0 right-0 z-50 th-surface border-t th-border px-4 pb-6 pt-4 space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="flex items-center justify-between">
            <h3 className="th-text font-semibold text-sm">Reassign {selected.size} item{selected.size !== 1 ? 's' : ''} to…</h3>
            <button onClick={exitMultiSelect} className="th-text-muted text-sm min-h-[36px] px-2">Cancel</button>
          </div>

          <div>
            <p className="text-xs th-text-muted mb-2 font-medium uppercase tracking-wide">Category</p>
            <div className="flex flex-wrap gap-2">
              {REASSIGN_CATEGORIES.map(cat => (
                <button
                  key={cat}
                  onClick={() => { setReassignCat(cat); setReassignSub('') }}
                  className={`px-3 py-2 rounded-xl text-sm border min-h-[40px] ${
                    reassignCat === cat
                      ? 'th-btn-selected border-transparent'
                      : 'th-surface th-text border-[color:var(--th-border)]'
                  }`}
                >{cat}</button>
              ))}
            </div>
          </div>

          {reassignCat === 'Jig' && (
            <div>
              <p className="text-xs th-text-muted mb-2 font-medium uppercase tracking-wide">Jig Type</p>
              <div className="flex flex-wrap gap-2">
                {JIG_SUBGROUPS.map(sub => (
                  <button
                    key={sub}
                    onClick={() => setReassignSub(sub)}
                    className={`px-3 py-2 rounded-xl text-sm border min-h-[40px] ${
                      reassignSub === sub
                        ? 'th-btn-selected border-transparent'
                        : 'th-surface th-text border-[color:var(--th-border)]'
                    }`}
                  >{sub}</button>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={handleReassignConfirm}
            disabled={!reassignCat || (reassignCat === 'Jig' && !reassignSub)}
            className="w-full py-3.5 th-btn-primary rounded-xl font-semibold text-sm disabled:opacity-40"
          >
            Confirm Reassign
          </button>
        </div>
      )}
    </div>
  )
}

function LureForm({ initial, apiKey, onSave, onCancel }: { initial?: OwnedLure; apiKey?: string; onSave: (l: OwnedLure) => void; onCancel: () => void }) {
  const [lureType, setLureType] = useState(initial?.lureType ?? '')
  const [weight, setWeight]     = useState(initial?.weight ?? '')
  const [color, setColor]       = useState(initial?.color ?? '')
  const [brand, setBrand]       = useState(initial?.brand ?? '')
  const [notes, setNotes]       = useState(initial?.notes ?? '')
  const [photo, setPhoto]       = useState(initial?.photoDataUrl ?? '')
  const [saving, setSaving]     = useState(false)
  const [analyzing, setAnalyzing]     = useState(false)
  const [aiSuggestion, setAiSuggestion] = useState<LureIdentification | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const dataUrl = await resizePhoto(file)
      setPhoto(dataUrl)
      setAiSuggestion(null)
      if (apiKey) {
        setAnalyzing(true)
        try {
          const result = await identifyLureForCatalog(apiKey, dataUrl)
          setAiSuggestion(result)
        } catch {}
        setAnalyzing(false)
      }
    } catch {}
  }

  const applyAiSuggestion = () => {
    if (!aiSuggestion) return
    if (aiSuggestion.lureType) setLureType(aiSuggestion.lureType)
    if (aiSuggestion.color)    setColor(aiSuggestion.color)
    if (aiSuggestion.brand)    setBrand(aiSuggestion.brand)
    if (aiSuggestion.notes)    setNotes(aiSuggestion.notes)
    setAiSuggestion(null)
  }

  const submit = async () => {
    if (!lureType.trim() || !color.trim()) return
    setSaving(true)
    const lure: OwnedLure = {
      id: initial?.id ?? nanoid(),
      lureType: lureType.trim(),
      weight: weight || 'N/A',
      color: color.trim(),
      brand: brand.trim() || undefined,
      notes: notes.trim() || undefined,
      photoDataUrl: photo || undefined,
      addedAt: initial?.addedAt ?? Date.now(),
    }
    await saveOwnedLure(lure)
    onSave(lure)
  }

  return (
    <div className="p-4 pb-24 max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={onCancel} className="th-accent-text text-sm">← Cancel</button>
        <h2 className="th-text font-bold text-lg flex-1">{initial ? 'Edit Lure' : 'Add Lure'}</h2>
      </div>

      <div className="space-y-4">
        {/* Photo */}
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="relative w-20 h-20 shrink-0">
              {photo
                ? <img src={photo} className="w-20 h-20 rounded-xl object-cover" alt="" />
                : <div className="w-20 h-20 rounded-xl th-surface-deep flex items-center justify-center text-3xl">📸</div>
              }
              {analyzing && (
                <div className="absolute inset-0 rounded-xl bg-black/60 flex flex-col items-center justify-center gap-1">
                  <div className="text-white text-xs animate-pulse">🔍</div>
                  <div className="text-white text-xs">Analyzing…</div>
                </div>
              )}
            </div>
            <div>
              <button
                onClick={() => fileRef.current?.click()}
                className="px-4 py-2 th-surface border th-border rounded-xl th-text text-sm font-medium"
              >
                {photo ? 'Retake Photo' : 'Take Photo'}
              </button>
              {photo && (
                <button onClick={() => { setPhoto(''); setAiSuggestion(null) }} className="block mt-1 text-xs text-red-400">Remove</button>
              )}
              <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhoto} />
            </div>
          </div>

          {aiSuggestion && !analyzing && (
            <div className="th-surface-deep border th-border rounded-xl p-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="th-text text-xs font-semibold">
                  AI Identified{' '}
                  <span className={`text-xs font-normal ${
                    aiSuggestion.confidence === 'High' ? 'text-green-400'
                    : aiSuggestion.confidence === 'Medium' ? 'text-amber-400'
                    : 'text-red-400'
                  }`}>({aiSuggestion.confidence} confidence)</span>
                </span>
                <button onClick={() => setAiSuggestion(null)} className="text-xs th-text-muted px-1">✕</button>
              </div>
              <div className="th-text text-sm">
                {aiSuggestion.lureType} · <span className="th-accent-text">{aiSuggestion.color}</span>
                {aiSuggestion.brand && <span className="th-text-muted"> · {aiSuggestion.brand}</span>}
              </div>
              {aiSuggestion.notes && <div className="th-text-muted text-xs italic">{aiSuggestion.notes}</div>}
              <div className="flex gap-2 pt-0.5">
                <button onClick={applyAiSuggestion} className="flex-1 py-2 th-btn-primary rounded-lg text-xs font-semibold text-center">
                  Use These Values
                </button>
                <button onClick={() => setAiSuggestion(null)} className="flex-1 py-2 th-surface border th-border rounded-lg text-xs th-text text-center">
                  Enter Manually
                </button>
              </div>
            </div>
          )}
        </div>

        <div>
          <label className="block text-xs th-text-muted mb-1 font-medium uppercase tracking-wide">Lure Type *</label>
          <input
            className="w-full th-surface border th-border rounded-xl px-3 py-3 th-text text-base"
            placeholder="e.g. Spinnerbait, Crankbait…"
            value={lureType}
            onChange={e => setLureType(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-xs th-text-muted mb-1 font-medium uppercase tracking-wide">Weight</label>
          <div className="flex flex-wrap gap-2">
            {WEIGHTS.map(w => (
              <button
                key={w}
                onClick={() => setWeight(w)}
                className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                  weight === w ? 'th-btn-selected border-transparent' : 'th-surface border-current th-text'
                }`}
                style={weight !== w ? { borderColor: 'var(--th-border)' } : {}}
              >{w}</button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs th-text-muted mb-1 font-medium uppercase tracking-wide">Color *</label>
          <input
            className="w-full th-surface border th-border rounded-xl px-3 py-3 th-text text-base"
            placeholder="e.g. White/Chartreuse, Green Pumpkin"
            value={color}
            onChange={e => setColor(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-xs th-text-muted mb-1 font-medium uppercase tracking-wide">Brand (optional)</label>
          <input
            className="w-full th-surface border th-border rounded-xl px-3 py-3 th-text text-base"
            placeholder="e.g. Strike King, Z-Man"
            value={brand}
            onChange={e => setBrand(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-xs th-text-muted mb-1 font-medium uppercase tracking-wide">Notes (optional)</label>
          <input
            className="w-full th-surface border th-border rounded-xl px-3 py-3 th-text text-base"
            placeholder="e.g. works best with trailer"
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
        </div>

        <button
          onClick={submit}
          disabled={!lureType.trim() || !color.trim() || saving}
          className="w-full py-4 th-btn-primary rounded-xl font-semibold text-base disabled:opacity-40"
        >
          {saving ? 'Saving…' : 'Save Lure'}
        </button>
      </div>
    </div>
  )
}
