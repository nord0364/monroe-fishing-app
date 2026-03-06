import { useState, useEffect, useRef } from 'react'
import type { OwnedLure } from '../../types'
import { getAllOwnedLures, saveOwnedLure, deleteOwnedLure } from '../../db/database'
import { nanoid } from '../logger/nanoid'

interface Props { onClose: () => void }

const WEIGHTS = ['Weightless', '3/16 oz', '1/4 oz', '3/8 oz', '1/2 oz', '3/4 oz', '1 oz', 'Other']
const LURE_TYPES = [
  'Spinnerbait','Swim Jig','Chatterbait','Football Jig','Flipping Jig',
  'Wacky Rig','Texas Rig','Buzzbait','Swimbait','Crankbait',
  'Topwater','Drop Shot','Jerkbait','Swimbait (hard)','Other',
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

export default function LureCatalog({ onClose }: Props) {
  const [lures, setLures] = useState<OwnedLure[]>([])
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<OwnedLure | null>(null)

  useEffect(() => { getAllOwnedLures().then(setLures) }, [])

  const saved = (lure: OwnedLure) => {
    setLures(prev => {
      const idx = prev.findIndex(l => l.id === lure.id)
      return idx >= 0 ? prev.map(l => l.id === lure.id ? lure : l) : [lure, ...prev]
    })
    setAdding(false)
    setEditing(null)
  }

  const remove = async (id: string) => {
    await deleteOwnedLure(id)
    setLures(prev => prev.filter(l => l.id !== id))
  }

  if (adding || editing) {
    return <LureForm initial={editing ?? undefined} onSave={saved} onCancel={() => { setAdding(false); setEditing(null) }} />
  }

  return (
    <div className="p-4 pb-24 max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={onClose} className="th-accent-text text-sm font-medium">← Back</button>
        <h2 className="th-text font-bold text-lg flex-1">My Lures</h2>
        <button onClick={() => setAdding(true)} className="th-btn-primary px-4 py-2 rounded-xl text-sm font-semibold">
          + Add
        </button>
      </div>

      {lures.length === 0 ? (
        <div className="text-center py-12 th-text-muted">
          <div className="text-4xl mb-3">🎣</div>
          <p className="text-sm">No lures cataloged yet.</p>
          <p className="text-xs mt-1">Add your lures so the AI can recommend from what you actually own.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {lures.map(l => (
            <div key={l.id} className="th-surface rounded-xl border th-border flex items-center gap-3 p-3">
              {l.photoDataUrl
                ? <img src={l.photoDataUrl} className="w-14 h-14 rounded-lg object-cover shrink-0" alt="" />
                : <div className="w-14 h-14 rounded-lg th-surface-deep flex items-center justify-center text-2xl shrink-0">🎣</div>
              }
              <div className="flex-1 min-w-0">
                <div className="th-text font-semibold text-sm">{l.lureType}</div>
                <div className="th-text-muted text-xs">{l.weight} · {l.color}</div>
                {l.brand && <div className="th-text-muted text-xs">{l.brand}</div>}
                {l.notes && <div className="th-text-muted text-xs italic">{l.notes}</div>}
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                <button onClick={() => setEditing(l)} className="text-xs th-accent-text px-2 py-1">Edit</button>
                <button onClick={() => remove(l.id)} className="text-xs text-red-400 px-2 py-1">Remove</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function LureForm({ initial, onSave, onCancel }: { initial?: OwnedLure; onSave: (l: OwnedLure) => void; onCancel: () => void }) {
  const [lureType, setLureType] = useState(initial?.lureType ?? '')
  const [weight, setWeight]     = useState(initial?.weight ?? '')
  const [color, setColor]       = useState(initial?.color ?? '')
  const [brand, setBrand]       = useState(initial?.brand ?? '')
  const [notes, setNotes]       = useState(initial?.notes ?? '')
  const [photo, setPhoto]       = useState(initial?.photoDataUrl ?? '')
  const [saving, setSaving]     = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try { setPhoto(await resizePhoto(file)) } catch {}
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
        <div className="flex items-center gap-3">
          {photo
            ? <img src={photo} className="w-20 h-20 rounded-xl object-cover" alt="" />
            : <div className="w-20 h-20 rounded-xl th-surface-deep flex items-center justify-center text-3xl">📸</div>
          }
          <div>
            <button
              onClick={() => fileRef.current?.click()}
              className="px-4 py-2 th-surface border th-border rounded-xl th-text text-sm font-medium"
            >
              {photo ? 'Retake Photo' : 'Take Photo'}
            </button>
            {photo && (
              <button onClick={() => setPhoto('')} className="block mt-1 text-xs text-red-400">Remove</button>
            )}
            <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhoto} />
          </div>
        </div>

        {/* Lure Type */}
        <div>
          <label className="block text-xs th-text-muted mb-1 font-medium uppercase tracking-wide">Lure Type *</label>
          <input
            list="lure-types-list"
            className="w-full th-surface border th-border rounded-xl px-3 py-3 th-text text-base"
            placeholder="e.g. Spinnerbait, Crankbait…"
            value={lureType}
            onChange={e => setLureType(e.target.value)}
          />
          <datalist id="lure-types-list">
            {LURE_TYPES.map(t => <option key={t} value={t} />)}
          </datalist>
        </div>

        {/* Weight */}
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

        {/* Color */}
        <div>
          <label className="block text-xs th-text-muted mb-1 font-medium uppercase tracking-wide">Color *</label>
          <input
            className="w-full th-surface border th-border rounded-xl px-3 py-3 th-text text-base"
            placeholder="e.g. White/Chartreuse, Green Pumpkin"
            value={color}
            onChange={e => setColor(e.target.value)}
          />
        </div>

        {/* Brand */}
        <div>
          <label className="block text-xs th-text-muted mb-1 font-medium uppercase tracking-wide">Brand (optional)</label>
          <input
            className="w-full th-surface border th-border rounded-xl px-3 py-3 th-text text-base"
            placeholder="e.g. Strike King, Z-Man"
            value={brand}
            onChange={e => setBrand(e.target.value)}
          />
        </div>

        {/* Notes */}
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
