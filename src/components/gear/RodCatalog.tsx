import { useState, useEffect, useRef } from 'react'
import type { RodSetup } from '../../types'
import { getAllRodSetups, saveRodSetup, deleteRodSetup } from '../../db/database'
import { nanoid } from '../logger/nanoid'

interface Props { onClose: () => void }

const ROD_POWERS  = ['Heavy', 'Medium-Heavy', 'Medium', 'Medium-Light', 'Light'] as const
const ROD_ACTIONS = ['Fast', 'Moderate-Fast', 'Moderate', 'Slow'] as const
const LINE_TYPES  = ['Fluorocarbon', 'Monofilament', 'Braid', 'Braid + Fluoro Leader'] as const

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

export default function RodCatalog({ onClose }: Props) {
  const [rods, setRods] = useState<RodSetup[]>([])
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<RodSetup | null>(null)

  useEffect(() => { getAllRodSetups().then(setRods) }, [])

  const saved = (rod: RodSetup) => {
    setRods(prev => {
      const idx = prev.findIndex(r => r.id === rod.id)
      return idx >= 0 ? prev.map(r => r.id === rod.id ? rod : r) : [rod, ...prev]
    })
    setAdding(false)
    setEditing(null)
  }

  const remove = async (id: string) => {
    await deleteRodSetup(id)
    setRods(prev => prev.filter(r => r.id !== id))
  }

  if (adding || editing) {
    return <RodForm initial={editing ?? undefined} onSave={saved} onCancel={() => { setAdding(false); setEditing(null) }} />
  }

  return (
    <div className="p-4 pb-24 max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={onClose} className="th-accent-text text-sm font-medium">← Back</button>
        <h2 className="th-text font-bold text-lg flex-1">My Rods & Setups</h2>
        <button onClick={() => setAdding(true)} className="th-btn-primary px-4 py-2 rounded-xl text-sm font-semibold">
          + Add
        </button>
      </div>

      {rods.length === 0 ? (
        <div className="text-center py-12 th-text-muted">
          <div className="text-4xl mb-3">🎯</div>
          <p className="text-sm">No rod setups cataloged yet.</p>
          <p className="text-xs mt-1">Add your rod setups so the AI can pair lure recommendations with the right setup.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rods.map(r => (
            <div key={r.id} className="th-surface rounded-xl border th-border flex items-center gap-3 p-3">
              {r.photoDataUrl
                ? <img src={r.photoDataUrl} className="w-14 h-14 rounded-lg object-cover shrink-0" alt="" />
                : <div className="w-14 h-14 rounded-lg th-surface-deep flex items-center justify-center text-2xl shrink-0">🎯</div>
              }
              <div className="flex-1 min-w-0">
                <div className="th-text font-semibold text-sm">{r.name}</div>
                <div className="th-text-muted text-xs">
                  {[r.rodPower, r.rodAction, r.rodLength].filter(Boolean).join(' · ')}
                </div>
                {r.lineType && (
                  <div className="th-text-muted text-xs">
                    {r.lineType}{r.lineWeightLbs ? ` ${r.lineWeightLbs}lb` : ''}
                  </div>
                )}
                {r.notes && <div className="th-text-muted text-xs italic">{r.notes}</div>}
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                <button onClick={() => setEditing(r)} className="text-xs th-accent-text px-2 py-1">Edit</button>
                <button onClick={() => remove(r.id)} className="text-xs text-red-400 px-2 py-1">Remove</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function RodForm({ initial, onSave, onCancel }: { initial?: RodSetup; onSave: (r: RodSetup) => void; onCancel: () => void }) {
  const [name, setName]             = useState(initial?.name ?? '')
  const [rodPower, setRodPower]     = useState<RodSetup['rodPower']>(initial?.rodPower)
  const [rodAction, setRodAction]   = useState<RodSetup['rodAction']>(initial?.rodAction)
  const [rodLength, setRodLength]   = useState(initial?.rodLength ?? '')
  const [lineType, setLineType]     = useState<RodSetup['lineType']>(initial?.lineType)
  const [lineLbs, setLineLbs]       = useState(String(initial?.lineWeightLbs ?? ''))
  const [reelBrand, setReelBrand]   = useState(initial?.reelBrand ?? '')  // used in submit + reel input below
  const [notes, setNotes]           = useState(initial?.notes ?? '')
  const [photo, setPhoto]           = useState(initial?.photoDataUrl ?? '')
  const [saving, setSaving]         = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try { setPhoto(await resizePhoto(file)) } catch {}
  }

  const submit = async () => {
    if (!name.trim()) return
    setSaving(true)
    const rod: RodSetup = {
      id: initial?.id ?? nanoid(),
      name: name.trim(),
      rodPower,
      rodAction,
      rodLength: rodLength.trim() || undefined,
      lineType,
      lineWeightLbs: parseFloat(lineLbs) || undefined,
      reelBrand: reelBrand.trim() || undefined,
      notes: notes.trim() || undefined,
      photoDataUrl: photo || undefined,
      addedAt: initial?.addedAt ?? Date.now(),
    }
    await saveRodSetup(rod)
    onSave(rod)
  }

  return (
    <div className="p-4 pb-24 max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={onCancel} className="th-accent-text text-sm">← Cancel</button>
        <h2 className="th-text font-bold text-lg flex-1">{initial ? 'Edit Setup' : 'Add Rod Setup'}</h2>
      </div>

      <div className="space-y-4">
        {/* Photo */}
        <div className="flex items-center gap-3">
          {photo
            ? <img src={photo} className="w-20 h-20 rounded-xl object-cover" alt="" />
            : <div className="w-20 h-20 rounded-xl th-surface-deep flex items-center justify-center text-3xl">📸</div>
          }
          <div>
            <button onClick={() => fileRef.current?.click()} className="px-4 py-2 th-surface border th-border rounded-xl th-text text-sm font-medium">
              {photo ? 'Retake Photo' : 'Take Photo'}
            </button>
            {photo && <button onClick={() => setPhoto('')} className="block mt-1 text-xs text-red-400">Remove</button>}
            <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhoto} />
          </div>
        </div>

        {/* Name */}
        <div>
          <label className="block text-xs th-text-muted mb-1 font-medium uppercase tracking-wide">Setup Name *</label>
          <input
            className="w-full th-surface border th-border rounded-xl px-3 py-3 th-text text-base"
            placeholder='e.g. "Heavy Baitcaster", "Finesse Spinning"'
            value={name}
            onChange={e => setName(e.target.value)}
          />
        </div>

        {/* Rod Power */}
        <div>
          <label className="block text-xs th-text-muted mb-1.5 font-medium uppercase tracking-wide">Rod Power</label>
          <div className="flex flex-wrap gap-2">
            {ROD_POWERS.map(p => (
              <button key={p} onClick={() => setRodPower(p === rodPower ? undefined : p)}
                className={`px-3 py-1.5 rounded-lg text-sm border ${rodPower === p ? 'th-btn-selected border-transparent' : 'th-surface th-text'}`}
                style={rodPower !== p ? { borderColor: 'var(--th-border)' } : {}}
              >{p}</button>
            ))}
          </div>
        </div>

        {/* Rod Action */}
        <div>
          <label className="block text-xs th-text-muted mb-1.5 font-medium uppercase tracking-wide">Rod Action</label>
          <div className="flex flex-wrap gap-2">
            {ROD_ACTIONS.map(a => (
              <button key={a} onClick={() => setRodAction(a === rodAction ? undefined : a)}
                className={`px-3 py-1.5 rounded-lg text-sm border ${rodAction === a ? 'th-btn-selected border-transparent' : 'th-surface th-text'}`}
                style={rodAction !== a ? { borderColor: 'var(--th-border)' } : {}}
              >{a}</button>
            ))}
          </div>
        </div>

        {/* Rod Length */}
        <div>
          <label className="block text-xs th-text-muted mb-1 font-medium uppercase tracking-wide">Rod Length</label>
          <input
            className="w-full th-surface border th-border rounded-xl px-3 py-3 th-text text-base"
            placeholder="e.g. 7'3&quot;"
            value={rodLength}
            onChange={e => setRodLength(e.target.value)}
          />
        </div>

        {/* Line Type */}
        <div>
          <label className="block text-xs th-text-muted mb-1.5 font-medium uppercase tracking-wide">Line Type</label>
          <div className="flex flex-wrap gap-2">
            {LINE_TYPES.map(l => (
              <button key={l} onClick={() => setLineType(l === lineType ? undefined : l)}
                className={`px-3 py-1.5 rounded-lg text-sm border ${lineType === l ? 'th-btn-selected border-transparent' : 'th-surface th-text'}`}
                style={lineType !== l ? { borderColor: 'var(--th-border)' } : {}}
              >{l}</button>
            ))}
          </div>
        </div>

        {/* Line lb test */}
        <div>
          <label className="block text-xs th-text-muted mb-1 font-medium uppercase tracking-wide">Line Weight (lb)</label>
          <input
            type="number"
            className="w-full th-surface border th-border rounded-xl px-3 py-3 th-text text-base"
            placeholder="e.g. 15"
            value={lineLbs}
            onChange={e => setLineLbs(e.target.value)}
          />
        </div>

        {/* Reel Brand */}
        <div>
          <label className="block text-xs th-text-muted mb-1 font-medium uppercase tracking-wide">Reel Brand (optional)</label>
          <input
            className="w-full th-surface border th-border rounded-xl px-3 py-3 th-text text-base"
            placeholder="e.g. Shimano, Daiwa"
            value={reelBrand}
            onChange={e => setReelBrand(e.target.value)}
          />
        </div>

        {/* Notes */}
        <div>
          <label className="block text-xs th-text-muted mb-1 font-medium uppercase tracking-wide">Notes (optional)</label>
          <input
            className="w-full th-surface border th-border rounded-xl px-3 py-3 th-text text-base"
            placeholder="e.g. primary flipping setup"
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
        </div>

        <button
          onClick={submit}
          disabled={!name.trim() || saving}
          className="w-full py-4 th-btn-primary rounded-xl font-semibold text-base disabled:opacity-40"
        >
          {saving ? 'Saving…' : 'Save Setup'}
        </button>
      </div>
    </div>
  )
}
