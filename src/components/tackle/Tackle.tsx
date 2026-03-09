import { useState, useEffect, useRef } from 'react'
import type {
  OwnedLure,
  TackleCategory,
  TackleOrigin,
  TackleCondition,
  HookStyle,
  SpoonStyle,
  AppSettings,
  Rod,
  RodType,
  RodPower,
  RodAction,
  RodLineType,
} from '../../types'
import {
  getAllOwnedLures,
  saveOwnedLure,
  deleteOwnedLure,
  bulkDeleteOwnedLures,
  exportTackleJSON,
  getAllRods,
  saveRod,
  deleteRod,
  bulkDeleteRods,
} from '../../db/database'
import { nanoid } from '../logger/nanoid'
import { identifyLureForCatalog, type LureIdentification } from '../../api/claude'

// ─── Rod constants ─────────────────────────────────────────────────────────────
const ROD_TYPES:    RodType[]    = ['Baitcasting', 'Spinning']
const ROD_POWERS:   RodPower[]   = ['Ultra Light', 'Light', 'Medium Light', 'Medium', 'Medium Heavy', 'Heavy', 'Extra Heavy']
const ROD_ACTIONS:  RodAction[]  = ['Slow', 'Moderate', 'Fast', 'Extra Fast']
const ROD_LINE_TYPES: RodLineType[] = ['Fluorocarbon', 'Monofilament', 'Braid', 'Braid with Fluorocarbon Leader']

// ─── Constants ────────────────────────────────────────────────────────────────

// Top-level lure categories for form picker
const LURE_CATEGORIES = [
  'Spinnerbait', 'Chatterbait', 'Jig', 'Soft Plastics',
  'Topwater', 'Crankbait', 'Swimbait', 'Ned Rig', 'Other',
] as const

const JIG_SUBGROUPS = [
  'Swim Jig', 'Football Jig', 'Flipping Jig', 'Casting Jig', 'Finesse Jig', 'Other Jig',
] as const

// Accordion section display order
const SECTION_ORDER = [
  'Spinnerbaits',
  'Chatterbaits',
  'Jigs',
  'Topwater',
  'Crankbaits',
  'Swimbaits',
  'Spoons',
  'Wacky Rigs',
  'Ned Rig',
  'Hooks',
  'Soft Plastics',
  'Other',
] as const
type TackleSection = typeof SECTION_ORDER[number]

const WEIGHT_OPTIONS = ['Weightless', '3/16 oz', '1/4 oz', '3/8 oz', '1/2 oz', '3/4 oz', '1 oz', 'Other']

const HOOK_STYLES: HookStyle[] = ['Worm Hook', 'EWG', 'Wacky', 'Ned', 'Drop Shot', 'Treble', 'Other']
const SPOON_STYLES: SpoonStyle[] = ['Casting', 'Trolling', 'Jigging']
const ORIGINS: TackleOrigin[] = ['Hand Poured by Me', 'Store Bought']
const CONDITIONS: TackleCondition[] = ['New', 'Good', 'Retired']

const BLADE_CONFIG_TYPES = ['Spinnerbait', 'Chatterbait']

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function effectiveCategory(item: OwnedLure): TackleCategory {
  return item.category ?? 'lure'
}

function effectiveTackleSection(item: OwnedLure): TackleSection {
  const cat = effectiveCategory(item)
  if (cat === 'spoon') return 'Spoons'
  if (cat === 'hook') {
    if (item.hookStyle === 'Wacky') return 'Wacky Rigs'
    if (item.hookStyle === 'Ned')   return 'Ned Rig'
    return 'Hooks'
  }
  const t = item.lureType ?? ''
  if (t === 'Spinnerbait') return 'Spinnerbaits'
  if (t === 'Chatterbait') return 'Chatterbaits'
  if (t === 'Jig' || JIG_SUBGROUPS.includes(t as typeof JIG_SUBGROUPS[number])) return 'Jigs'
  if (['Wacky Rig', 'Texas Rig', 'Drop Shot', 'Soft Plastics', 'Ned Rig'].includes(t)) return 'Soft Plastics'
  if (['Topwater', 'Buzzbait', 'Frog'].includes(t)) return 'Topwater'
  if (t === 'Crankbait') return 'Crankbaits'
  if (t === 'Swimbait') return 'Swimbaits'
  return 'Other'
}

function sortItems(items: OwnedLure[]): OwnedLure[] {
  return [...items].sort((a, b) => {
    const wa = a.weight ?? ''
    const wb = b.weight ?? ''
    if (wa !== wb) return wa.localeCompare(wb)
    return (a.color ?? '').localeCompare(b.color ?? '')
  })
}

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10)
}

// ─── Color → hex mapping ───────────────────────────────────────────────────────

const COLOR_HEX: Record<string, string> = {
  'white':          '#f5f5f5',
  'black':          '#1a1a1a',
  'red':            '#dc2626',
  'chartreuse':     '#a3e635',
  'green':          '#16a34a',
  'green pumpkin':  '#4a5c2a',
  'pumpkin':        '#ea580c',
  'blue':           '#2563eb',
  'purple':         '#9333ea',
  'pink':           '#ec4899',
  'orange':         '#f97316',
  'yellow':         '#eab308',
  'brown':          '#92400e',
  'tan':            '#d4a574',
  'gray':           '#6b7280',
  'grey':           '#6b7280',
  'silver':         '#c0c0c0',
  'gold':           '#d4af37',
  'watermelon':     '#f43f5e',
  'crawfish':       '#b45309',
  'junebug':        '#312e81',
  'june bug':       '#312e81',
  'smoke':          '#9ca3af',
  'natural':        '#c4a882',
  'cinnamon':       '#b45309',
  'plum':           '#7e22ce',
  'tequila':        '#d97706',
  'albino':         '#fef9c3',
  'electric blue':  '#0ea5e9',
  'midnight':       '#1e1b4b',
  'tilapia':        '#64748b',
  'melon':          '#fb923c',
}

function colorToHex(name: string): string {
  if (!name) return '#6b7280'
  const lower = name.toLowerCase().trim()
  if (COLOR_HEX[lower]) return COLOR_HEX[lower]
  for (const [key, val] of Object.entries(COLOR_HEX)) {
    if (lower.includes(key)) return val
  }
  return '#6b7280'
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function HandPouredBadge() {
  return (
    <span className="text-xs px-2 py-0.5 rounded-full bg-amber-900/40 text-amber-300 font-semibold shrink-0">
      🫗 Hand Poured
    </span>
  )
}

function ConditionBadge({ condition }: { condition: TackleCondition }) {
  if (condition === 'Retired') {
    return <span className="text-xs px-2 py-0.5 rounded-full bg-red-900/30 text-red-400">Retired</span>
  }
  if (condition === 'New') {
    return <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-900/30 text-emerald-400">New</span>
  }
  return null
}

function OriginBadge({ origin }: { origin?: TackleOrigin }) {
  if (!origin || origin === 'Store Bought') return null
  return <HandPouredBadge />
}

interface DeleteConfirmProps {
  onConfirm: () => void
  onCancel: () => void
}

function DeleteConfirmRow({ onConfirm, onCancel }: DeleteConfirmProps) {
  return (
    <div className="flex gap-2 items-center">
      <span className="th-text-muted text-xs">Delete?</span>
      <button
        onClick={onConfirm}
        className="text-xs text-white bg-red-700 px-2 py-1 rounded-lg min-w-[44px] min-h-[36px]"
      >
        Yes
      </button>
      <button
        onClick={onCancel}
        className="text-xs th-text-muted border th-border px-2 py-1 rounded-lg min-w-[44px] min-h-[36px]"
      >
        No
      </button>
    </div>
  )
}

// ─── Item Card ────────────────────────────────────────────────────────────────

interface ItemCardProps {
  item: OwnedLure
  multiSelect: boolean
  selected: boolean
  onToggleSelect: () => void
  onEdit: () => void
  onDelete: () => void
  onLongPress: () => void
}

function ItemCard({ item, multiSelect, selected, onToggleSelect, onEdit, onDelete, onLongPress }: ItemCardProps) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cat = effectiveCategory(item)
  const isRetired = item.condition === 'Retired'

  const handlePointerDown = () => {
    longPressTimer.current = setTimeout(() => {
      onLongPress()
    }, 500)
  }

  const handlePointerUp = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  const categoryEmoji = cat === 'hook' ? '🪝' : cat === 'spoon' ? '🥄' : '🎣'
  const lureDisplayType = item.lureType === 'Jig' && item.jigSubgroup ? item.jigSubgroup : (item.lureType ?? 'Lure')

  return (
    <div
      className={`th-surface rounded-2xl border th-border flex items-center gap-3 p-3 min-h-[72px] transition-opacity ${isRetired ? 'opacity-60' : ''} ${selected ? 'ring-2 ring-offset-1 ring-blue-500' : ''}`}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      {multiSelect && (
        <button
          onClick={onToggleSelect}
          className="shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center"
          style={{ borderColor: selected ? '#3b82f6' : 'var(--th-border)', background: selected ? '#3b82f6' : 'transparent' }}
        >
          {selected && <span className="text-white text-xs">✓</span>}
        </button>
      )}

      {item.photoDataUrl ? (
        <img src={item.photoDataUrl} className="w-16 h-16 rounded-xl object-cover shrink-0" alt="" />
      ) : (
        <div className="w-16 h-16 rounded-xl th-surface-deep flex items-center justify-center text-2xl shrink-0">
          {categoryEmoji}
        </div>
      )}

      <div className="flex-1 min-w-0">
        {cat === 'lure' && (
          <>
            <div className="th-text font-semibold text-sm leading-tight">
              {lureDisplayType}{item.subType ? ` — ${item.subType}` : ''}
            </div>
            <div className="th-text-muted text-xs mt-0.5">
              {item.weightNA ? 'Weight N/A' : (item.weight || '—')} · {item.color}
              {item.secondaryColor ? ` / ${item.secondaryColor}` : ''}
            </div>
            {item.brand && <div className="th-text-muted text-xs">{item.brand}</div>}
            {item.bladeConfig && <div className="th-text-muted text-xs">Blade: {item.bladeConfig}</div>}
            <div className="flex flex-wrap gap-1 mt-1">
              <OriginBadge origin={item.origin} />
              {item.condition && item.condition !== 'Good' && <ConditionBadge condition={item.condition} />}
            </div>
          </>
        )}
        {cat === 'hook' && (
          <>
            <div className="th-text font-semibold text-sm leading-tight">{item.hookStyle ?? 'Hook'}</div>
            <div className="th-text-muted text-xs mt-0.5">
              {item.hookSize ? `Size ${item.hookSize}` : ''}
              {item.brand ? (item.hookSize ? ` · ${item.brand}` : item.brand) : ''}
            </div>
            {item.quantity !== undefined && item.quantity > 0 && (
              <div className="flex gap-1 mt-1">
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-900/30 text-blue-400">
                  Qty: {item.quantity}
                </span>
              </div>
            )}
            {item.notes && <div className="th-text-muted text-xs italic mt-0.5">{item.notes}</div>}
          </>
        )}
        {cat === 'spoon' && (
          <>
            <div className="th-text font-semibold text-sm leading-tight">{item.spoonStyle ?? 'Spoon'}</div>
            <div className="th-text-muted text-xs mt-0.5">
              {item.weight ? `${item.weight} · ` : ''}{item.color}
            </div>
            {item.brand && <div className="th-text-muted text-xs">{item.brand}</div>}
            <div className="flex flex-wrap gap-1 mt-1">
              <OriginBadge origin={item.origin} />
              {item.condition && item.condition !== 'Good' && <ConditionBadge condition={item.condition} />}
            </div>
          </>
        )}
      </div>

      {!multiSelect && (
        <div className="flex flex-col gap-1 shrink-0 items-end">
          {confirmDelete ? (
            <DeleteConfirmRow
              onConfirm={onDelete}
              onCancel={() => setConfirmDelete(false)}
            />
          ) : (
            <>
              <button
                onClick={onEdit}
                className="text-xs th-accent-text px-2 py-1 min-w-[44px] min-h-[36px] text-center"
              >
                Edit
              </button>
              <button
                onClick={() => setConfirmDelete(true)}
                className="text-xs text-red-400 px-2 py-1 min-w-[44px] min-h-[36px] text-center"
              >
                Delete
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Chip ─────────────────────────────────────────────────────────────────────

interface ChipProps {
  label: string
  active: boolean
  onClick: () => void
}

function Chip({ label, active, onClick }: ChipProps) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium border transition-colors min-h-[36px] whitespace-nowrap ${
        active
          ? 'th-btn-selected border-transparent'
          : 'th-surface th-text border-[color:var(--th-border)]'
      }`}
    >
      {label}
    </button>
  )
}

// ─── Field primitives ─────────────────────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-xs th-text-muted mb-1 font-medium uppercase tracking-wide">
      {children}
    </label>
  )
}

function TextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <input
      className="w-full th-surface border th-border rounded-xl px-3 py-3 th-text text-base"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
    />
  )
}

function ButtonGrid<T extends string>({
  options,
  value,
  onChange,
  renderLabel,
}: {
  options: readonly T[]
  value: T | ''
  onChange: (v: T) => void
  renderLabel?: (v: T) => string
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(opt => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={`px-3 py-2 rounded-xl text-sm border transition-colors min-h-[44px] ${
            value === opt
              ? 'th-btn-selected border-transparent'
              : 'th-surface th-text border-[color:var(--th-border)]'
          }`}
        >
          {renderLabel ? renderLabel(opt) : opt}
        </button>
      ))}
    </div>
  )
}

// ─── Photo section ────────────────────────────────────────────────────────────

interface PhotoSectionProps {
  photo: string
  setPhoto: (v: string) => void
  apiKey?: string
  onAiSuggestion: (s: LureIdentification) => void
}

function PhotoSection({ photo, setPhoto, apiKey, onAiSuggestion }: PhotoSectionProps) {
  const [analyzing, setAnalyzing] = useState(false)
  const [suggestion, setSuggestion] = useState<LureIdentification | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    try {
      const dataUrl = await resizePhoto(file)
      setPhoto(dataUrl)
      setSuggestion(null)
      if (apiKey) {
        setAnalyzing(true)
        try {
          const result = await identifyLureForCatalog(apiKey, dataUrl)
          setSuggestion(result)
        } catch { /* ignore */ }
        setAnalyzing(false)
      }
    } catch { /* ignore */ }
  }

  const applyAndClose = () => {
    if (suggestion) onAiSuggestion(suggestion)
    setSuggestion(null)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <div className="relative w-20 h-20 shrink-0">
          {photo ? (
            <img src={photo} className="w-20 h-20 rounded-xl object-cover" alt="" />
          ) : (
            <div className="w-20 h-20 rounded-xl th-surface-deep flex items-center justify-center text-3xl">
              📸
            </div>
          )}
          {analyzing && (
            <div className="absolute inset-0 rounded-xl bg-black/60 flex flex-col items-center justify-center gap-1">
              <div className="text-white text-xs animate-pulse">🔍</div>
              <div className="text-white text-xs">Analyzing…</div>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <button
            onClick={() => fileRef.current?.click()}
            className="px-4 py-2 th-surface border th-border rounded-xl th-text text-sm font-medium min-h-[44px]"
          >
            {photo ? 'Retake' : '📷 Take Photo'}
          </button>
          {photo && (
            <button
              onClick={() => { setPhoto(''); setSuggestion(null) }}
              className="text-xs text-red-400 text-left"
            >
              Remove photo
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handlePhoto}
          />
        </div>
      </div>

      {suggestion && !analyzing && (
        <div className="th-surface-deep border th-border rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="th-text text-xs font-semibold">
              AI Identified{' '}
              <span
                className={`font-normal ${
                  suggestion.confidence === 'High'
                    ? 'text-green-400'
                    : suggestion.confidence === 'Medium'
                    ? 'text-amber-400'
                    : 'text-red-400'
                }`}
              >
                ({suggestion.confidence} confidence)
              </span>
            </span>
            <button
              onClick={() => setSuggestion(null)}
              className="text-xs th-text-muted px-1 min-h-[36px]"
            >
              ✕
            </button>
          </div>
          <div className="th-text text-sm">
            {suggestion.lureType && <span>{suggestion.lureType}</span>}
            {suggestion.color && <span className="th-accent-text"> · {suggestion.color}</span>}
            {suggestion.brand && <span className="th-text-muted"> · {suggestion.brand}</span>}
          </div>
          {suggestion.notes && (
            <div className="th-text-muted text-xs italic">{suggestion.notes}</div>
          )}
          <p className="th-text-muted text-xs">
            Review and adjust — color descriptions are AI-generated.
          </p>
          <div className="flex gap-2 pt-0.5">
            <button
              onClick={applyAndClose}
              className="flex-1 py-2 th-btn-primary rounded-lg text-xs font-semibold min-h-[44px]"
            >
              Use These Values
            </button>
            <button
              onClick={() => setSuggestion(null)}
              className="flex-1 py-2 th-surface border th-border rounded-lg text-xs th-text min-h-[44px]"
            >
              Enter Manually
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── FAB with category picker ─────────────────────────────────────────────────

function AddFab({ onAdd, onAddRod }: { onAdd: (cat: TackleCategory) => void; onAddRod: () => void }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
      )}
      <div className="fixed bottom-20 right-4 z-40 flex flex-col gap-2 items-end">
        {open && (
          <>
            <button
              onClick={() => { setOpen(false); onAdd('lure') }}
              className="th-surface border th-border rounded-2xl px-4 py-3 th-text text-sm font-medium shadow-lg min-h-[48px]"
            >
              🎣 Add Lure
            </button>
            <button
              onClick={() => { setOpen(false); onAdd('hook') }}
              className="th-surface border th-border rounded-2xl px-4 py-3 th-text text-sm font-medium shadow-lg min-h-[48px]"
            >
              🪝 Add Hook / Rig
            </button>
            <button
              onClick={() => { setOpen(false); onAdd('spoon') }}
              className="th-surface border th-border rounded-2xl px-4 py-3 th-text text-sm font-medium shadow-lg min-h-[48px]"
            >
              🥄 Add Spoon
            </button>
            <button
              onClick={() => { setOpen(false); onAddRod() }}
              className="th-surface border th-border rounded-2xl px-4 py-3 th-text text-sm font-medium shadow-lg min-h-[48px]"
            >
              🎣 Add Rod
            </button>
          </>
        )}
        <button
          onClick={() => setOpen(o => !o)}
          className="w-14 h-14 rounded-full th-btn-primary flex items-center justify-center text-2xl shadow-lg"
        >
          {open ? '✕' : '+'}
        </button>
      </div>
    </>
  )
}

// ─── Dense list row ───────────────────────────────────────────────────────────

function DenseRow({ item, onEdit, onDelete }: {
  item: OwnedLure
  onEdit: () => void
  onDelete: () => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const cat = effectiveCategory(item)

  const primaryLabel = cat === 'hook'
    ? (item.hookStyle ?? 'Hook')
    : cat === 'spoon'
      ? (item.spoonStyle ?? 'Spoon')
      : item.lureType === 'Jig' && item.jigSubgroup
        ? item.jigSubgroup
        : (item.lureType ?? 'Lure')

  const colorLabel = item.color || ''
  const hex = colorToHex(colorLabel)
  const weightLabel = item.weightNA ? 'N/A' : (item.weight ?? '')
  const sub = [weightLabel, item.brand].filter(Boolean).join(' · ')

  return (
    <div className={`flex items-center gap-2 px-3 py-2 min-h-[44px] ${item.condition === 'Retired' ? 'opacity-50' : ''}`}>
      {/* Color swatch */}
      <span style={{
        width: 10, height: 10, borderRadius: 2, flexShrink: 0,
        background: hex, border: '1px solid rgba(128,128,128,0.4)',
      }} />

      {/* Photo thumbnail */}
      {item.photoDataUrl && (
        <img src={item.photoDataUrl} className="w-8 h-8 rounded-md object-cover shrink-0" alt="" />
      )}

      {/* Name + details */}
      <div className="flex-1 min-w-0">
        <div className="th-text text-sm font-medium leading-tight truncate">
          {primaryLabel}{colorLabel ? ` · ${colorLabel}` : ''}
        </div>
        {sub && <div className="th-text-muted text-xs leading-tight truncate">{sub}</div>}
      </div>

      {/* Origin badge (compact) */}
      {item.origin === 'Hand Poured by Me' && (
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-900/40 text-amber-300 shrink-0 leading-tight">🫗</span>
      )}

      {/* Condition badge (compact) */}
      {item.condition === 'New' && (
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-900/30 text-emerald-400 shrink-0 leading-tight">New</span>
      )}
      {item.condition === 'Retired' && (
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-900/30 text-red-400 shrink-0 leading-tight">Ret</span>
      )}

      {/* Edit */}
      <button
        onClick={onEdit}
        className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg th-text-muted text-xs opacity-50 active:opacity-100"
      >
        ✎
      </button>

      {/* Delete */}
      {confirmDelete ? (
        <div className="flex gap-1 shrink-0">
          <button
            onClick={() => { onDelete(); setConfirmDelete(false) }}
            className="text-white bg-red-700 text-xs px-2 py-1 rounded-lg min-h-[32px]"
          >Del</button>
          <button
            onClick={() => setConfirmDelete(false)}
            className="th-text-muted text-xs px-1 py-1 border th-border rounded-lg min-h-[32px]"
          >✕</button>
        </div>
      ) : (
        <button
          onClick={() => setConfirmDelete(true)}
          className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg th-text-muted opacity-30 active:opacity-100 text-sm"
        >✕</button>
      )}
    </div>
  )
}

// ─── Accordion section ────────────────────────────────────────────────────────

function AccordionSection({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  if (count === 0) return null
  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-4 py-2 th-surface-deep border-y th-border"
      >
        <span className="flex-1 text-xs font-bold th-text-muted uppercase tracking-wide text-left">{title}</span>
        <span className="text-xs th-text-muted">({count})</span>
        <span className="text-xs th-text-muted">{open ? '▲' : '▼'}</span>
      </button>
      {open && children}
    </div>
  )
}

// ─── Rod row ──────────────────────────────────────────────────────────────────

function RodRow({ rod, confirming, onEdit, onDeleteRequest, onDeleteConfirm }: {
  rod: Rod
  confirming: boolean
  onEdit: () => void
  onDeleteRequest: () => void
  onDeleteConfirm: () => void
}) {
  const powerAbbr = rod.power
    ? rod.power.replace('Medium Heavy', 'MH').replace('Medium Light', 'ML').replace('Medium', 'M').replace('Ultra Light', 'UL').replace('Extra Heavy', 'XH')
    : ''
  const lengthStr = rod.lengthFt != null ? `${rod.lengthFt}'${rod.lengthIn != null ? `${rod.lengthIn}"` : ''}` : ''
  const lineStr   = rod.lineWeightLbs != null ? `${rod.lineWeightLbs}lb` : ''
  const sub = [rod.rodType, powerAbbr, rod.action, lineStr, lengthStr].filter(Boolean).join(' · ')
  return (
    <div className="px-4 py-2.5">
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <span className="th-text text-sm font-semibold">{rod.nickname}</span>
          {sub && <span className="th-text-muted text-xs ml-2">{sub}</span>}
        </div>
        <button onClick={onEdit} className="shrink-0 th-text-muted text-xs px-2 py-1 opacity-60 active:opacity-100">Edit</button>
        {confirming ? (
          <div className="flex gap-1 shrink-0">
            <button onClick={onDeleteConfirm} className="text-white bg-red-700 text-xs px-2 py-1 rounded-lg min-h-[32px]">Del</button>
            <button onClick={onDeleteRequest} className="th-text-muted text-xs px-1 py-1 border th-border rounded-lg min-h-[32px]">✕</button>
          </div>
        ) : (
          <button onClick={onDeleteRequest} className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg th-text-muted opacity-30 active:opacity-100 text-sm">✕</button>
        )}
      </div>
      {rod.notes && <p className="th-text-muted text-xs italic mt-0.5 pl-0">{rod.notes}</p>}
    </div>
  )
}

// ─── Rods accordion ───────────────────────────────────────────────────────────

function RodsAccordion({ rods, onAdd, onEdit, onDelete, onBulkDelete }: {
  rods: Rod[]
  onAdd: () => void
  onEdit: (rod: Rod) => void
  onDelete: (id: string) => void
  onBulkDelete: (ids: string[]) => void
}) {
  const [open, setOpen]           = useState(false)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [bulkConfirm, setBulkConfirm] = useState(false)
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const startLongPress = () => {
    if (rods.length === 0) return
    longPressRef.current = setTimeout(() => setBulkConfirm(true), 500)
  }
  const cancelLongPress = () => {
    if (longPressRef.current) { clearTimeout(longPressRef.current); longPressRef.current = null }
  }

  return (
    <div>
      <div
        className="w-full flex items-center gap-2 px-4 py-2 th-surface-deep border-y th-border"
        onPointerDown={startLongPress}
        onPointerUp={cancelLongPress}
        onPointerLeave={cancelLongPress}
      >
        <button
          className="flex-1 flex items-center gap-2 text-left"
          onClick={() => { if (!bulkConfirm && rods.length > 0) setOpen(o => !o) }}
        >
          <span className="flex-1 text-xs font-bold th-text-muted uppercase tracking-wide">Rods & Reels</span>
          <span className="text-xs th-text-muted">({rods.length})</span>
          {rods.length > 0 && <span className="text-xs th-text-muted">{open ? '▲' : '▼'}</span>}
        </button>
        <button
          onClick={e => { e.stopPropagation(); onAdd() }}
          className="text-xs th-accent-text px-2 py-1 min-h-[32px] shrink-0"
        >
          + Add
        </button>
      </div>

      {bulkConfirm && (
        <div className="px-4 py-3 th-danger-bg border-b th-border">
          <p className="th-danger-text text-sm mb-2 font-medium">Delete all {rods.length} rod{rods.length !== 1 ? 's' : ''}? This cannot be undone.</p>
          <div className="flex gap-2">
            <button onClick={() => { onBulkDelete(rods.map(r => r.id)); setBulkConfirm(false) }}
              className="flex-1 py-2 bg-red-700 text-white rounded-xl text-sm font-bold">
              Delete All
            </button>
            <button onClick={() => setBulkConfirm(false)}
              className="flex-1 py-2 th-surface border th-border rounded-xl th-text text-sm">
              Cancel
            </button>
          </div>
        </div>
      )}

      {rods.length === 0 && (
        <div className="px-4 py-4 text-center th-text-muted text-sm">
          No rods yet — tap <span className="th-accent-text font-medium">+ Add</span> or use the <span className="th-accent-text font-medium">+</span> button below.
        </div>
      )}

      {open && rods.length > 0 && (
        <div className="divide-y th-border">
          {rods.map(rod => (
            <RodRow
              key={rod.id}
              rod={rod}
              confirming={confirmId === rod.id}
              onEdit={() => onEdit(rod)}
              onDeleteRequest={() => setConfirmId(confirmId === rod.id ? null : rod.id)}
              onDeleteConfirm={() => { onDelete(rod.id); setConfirmId(null) }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Rod form ─────────────────────────────────────────────────────────────────

function RodForm({ initial, onSave, onCancel }: {
  initial?: Rod
  onSave: (rod: Rod) => void
  onCancel: () => void
}) {
  const [nickname,       setNickname]       = useState(initial?.nickname ?? '')
  const [rodType,        setRodType]        = useState<RodType | undefined>(initial?.rodType)
  const [lengthFt,       setLengthFt]       = useState(initial?.lengthFt != null ? String(initial.lengthFt) : '')
  const [lengthIn,       setLengthIn]       = useState(initial?.lengthIn != null ? String(initial.lengthIn) : '')
  const [power,          setPower]          = useState<RodPower | undefined>(initial?.power)
  const [action,         setAction]         = useState<RodAction | undefined>(initial?.action)
  const [lineType,       setLineType]       = useState<RodLineType | undefined>(initial?.lineType)
  const [lineWeightLbs,  setLineWeightLbs]  = useState(initial?.lineWeightLbs != null ? String(initial.lineWeightLbs) : '')
  const [lureMinOz,      setLureMinOz]      = useState(initial?.lureWeightMinOz != null ? String(initial.lureWeightMinOz) : '')
  const [lureMaxOz,      setLureMaxOz]      = useState(initial?.lureWeightMaxOz != null ? String(initial.lureWeightMaxOz) : '')
  const [reelName,       setReelName]       = useState(initial?.reelName ?? '')
  const [notes,          setNotes]          = useState(initial?.notes ?? '')
  const [saving,         setSaving]         = useState(false)

  const submit = async () => {
    if (!nickname.trim()) return
    setSaving(true)
    const rod: Rod = {
      id:               initial?.id ?? nanoid(),
      nickname:         nickname.trim(),
      rodType,
      lengthFt:         parseFloat(lengthFt) || undefined,
      lengthIn:         parseFloat(lengthIn) || undefined,
      power,
      action,
      lineType,
      lineWeightLbs:    parseFloat(lineWeightLbs) || undefined,
      lureWeightMinOz:  parseFloat(lureMinOz) || undefined,
      lureWeightMaxOz:  parseFloat(lureMaxOz) || undefined,
      reelName:         reelName.trim() || undefined,
      notes:            notes.trim() || undefined,
      addedAt:          initial?.addedAt ?? Date.now(),
    }
    await saveRod(rod)
    onSave(rod)
  }

  const numInput = (label: string, value: string, onChange: (v: string) => void, placeholder: string) => (
    <div>
      <label className="block text-xs th-text-muted mb-1 font-medium uppercase tracking-wide">{label}</label>
      <input type="number" className="w-full th-surface border th-border rounded-xl px-3 py-3 th-text text-base"
        placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} />
    </div>
  )

  return (
    <div className="p-4 pb-32 max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={onCancel} className="th-accent-text text-sm">← Cancel</button>
        <h2 className="th-text font-bold text-lg flex-1">{initial ? 'Edit Rod' : 'Add Rod'}</h2>
      </div>

      <div className="space-y-4">
        {/* Nickname */}
        <div>
          <label className="block text-xs th-text-muted mb-1 font-medium uppercase tracking-wide">Nickname *</label>
          <input className="w-full th-surface border th-border rounded-xl px-3 py-3 th-text text-base"
            placeholder='e.g. "Heavy Baitcaster", "Finesse Spinning"'
            value={nickname} onChange={e => setNickname(e.target.value)} />
        </div>

        {/* Rod type */}
        <div>
          <label className="block text-xs th-text-muted mb-1.5 font-medium uppercase tracking-wide">Rod Type</label>
          <div className="flex gap-2">
            {ROD_TYPES.map(t => (
              <button key={t} onClick={() => setRodType(rodType === t ? undefined : t)}
                className={`flex-1 py-2.5 rounded-xl text-sm border font-medium ${rodType === t ? 'th-btn-selected border-transparent' : 'th-surface th-text'}`}
                style={rodType !== t ? { borderColor: 'var(--th-border)' } : {}}>
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Length */}
        <div>
          <label className="block text-xs th-text-muted mb-1.5 font-medium uppercase tracking-wide">Length</label>
          <div className="flex gap-2">
            <div className="flex-1">
              <input type="number" className="w-full th-surface border th-border rounded-xl px-3 py-3 th-text text-base"
                placeholder="Feet" value={lengthFt} onChange={e => setLengthFt(e.target.value)} />
            </div>
            <div className="flex-1">
              <input type="number" className="w-full th-surface border th-border rounded-xl px-3 py-3 th-text text-base"
                placeholder="Inches" value={lengthIn} onChange={e => setLengthIn(e.target.value)} />
            </div>
          </div>
        </div>

        {/* Power */}
        <div>
          <label className="block text-xs th-text-muted mb-1.5 font-medium uppercase tracking-wide">Power</label>
          <div className="flex flex-wrap gap-2">
            {ROD_POWERS.map(p => (
              <button key={p} onClick={() => setPower(power === p ? undefined : p)}
                className={`px-3 py-1.5 rounded-lg text-sm border ${power === p ? 'th-btn-selected border-transparent' : 'th-surface th-text'}`}
                style={power !== p ? { borderColor: 'var(--th-border)' } : {}}>
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Action */}
        <div>
          <label className="block text-xs th-text-muted mb-1.5 font-medium uppercase tracking-wide">Action</label>
          <div className="flex flex-wrap gap-2">
            {ROD_ACTIONS.map(a => (
              <button key={a} onClick={() => setAction(action === a ? undefined : a)}
                className={`px-3 py-1.5 rounded-lg text-sm border ${action === a ? 'th-btn-selected border-transparent' : 'th-surface th-text'}`}
                style={action !== a ? { borderColor: 'var(--th-border)' } : {}}>
                {a}
              </button>
            ))}
          </div>
        </div>

        {/* Line type */}
        <div>
          <label className="block text-xs th-text-muted mb-1.5 font-medium uppercase tracking-wide">Line Type</label>
          <div className="flex flex-wrap gap-2">
            {ROD_LINE_TYPES.map(l => (
              <button key={l} onClick={() => setLineType(lineType === l ? undefined : l)}
                className={`px-3 py-1.5 rounded-lg text-sm border ${lineType === l ? 'th-btn-selected border-transparent' : 'th-surface th-text'}`}
                style={lineType !== l ? { borderColor: 'var(--th-border)' } : {}}>
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* Line weight */}
        {numInput('Line Weight (lb)', lineWeightLbs, setLineWeightLbs, 'e.g. 15')}

        {/* Lure weight range */}
        <div>
          <label className="block text-xs th-text-muted mb-1.5 font-medium uppercase tracking-wide">Lure Weight Range (oz)</label>
          <div className="flex gap-2 items-center">
            <input type="number" step="0.0625" className="flex-1 th-surface border th-border rounded-xl px-3 py-3 th-text text-base"
              placeholder="Min" value={lureMinOz} onChange={e => setLureMinOz(e.target.value)} />
            <span className="th-text-muted text-sm">–</span>
            <input type="number" step="0.0625" className="flex-1 th-surface border th-border rounded-xl px-3 py-3 th-text text-base"
              placeholder="Max" value={lureMaxOz} onChange={e => setLureMaxOz(e.target.value)} />
          </div>
        </div>

        {/* Reel */}
        <div>
          <label className="block text-xs th-text-muted mb-1 font-medium uppercase tracking-wide">Reel Name / Model (optional)</label>
          <input className="w-full th-surface border th-border rounded-xl px-3 py-3 th-text text-base"
            placeholder="e.g. Shimano Curado 200K" value={reelName} onChange={e => setReelName(e.target.value)} />
        </div>

        {/* Notes */}
        <div>
          <label className="block text-xs th-text-muted mb-1 font-medium uppercase tracking-wide">Notes (optional)</label>
          <input className="w-full th-surface border th-border rounded-xl px-3 py-3 th-text text-base"
            placeholder="Any notes…" value={notes} onChange={e => setNotes(e.target.value)} />
        </div>

        <button onClick={submit} disabled={!nickname.trim() || saving}
          className="w-full py-4 th-btn-primary rounded-xl font-semibold text-base disabled:opacity-40">
          {saving ? 'Saving…' : initial ? 'Save Changes' : 'Add Rod'}
        </button>
      </div>
    </div>
  )
}

// ─── Jigs accordion (nested subgroups) ────────────────────────────────────────

function JigsAccordion({ items, gridView, multiSelect, selected, onToggleSelect, onEdit, onDelete, onLongPress }: {
  items: OwnedLure[]
  gridView: boolean
  multiSelect: boolean
  selected: Set<string>
  onToggleSelect: (id: string) => void
  onEdit: (item: OwnedLure) => void
  onDelete: (id: string) => void
  onLongPress: (id: string) => void
}) {
  const [open, setOpen]       = useState(false)
  const [openSubs, setOpenSubs] = useState<Set<string>>(new Set())

  if (items.length === 0) return null

  const toggleSub = (sub: string) =>
    setOpenSubs(prev => { const s = new Set(prev); s.has(sub) ? s.delete(sub) : s.add(sub); return s })

  // Group items by subgroup
  const bySubgroup = new Map<string, OwnedLure[]>()
  for (const sub of JIG_SUBGROUPS) bySubgroup.set(sub, [])
  for (const item of items) {
    const sub = item.jigSubgroup
      ?? (JIG_SUBGROUPS.includes(item.lureType as typeof JIG_SUBGROUPS[number]) ? item.lureType as string : 'Other Jig')
    if (bySubgroup.has(sub)) {
      bySubgroup.set(sub, [...bySubgroup.get(sub)!, item])
    } else {
      bySubgroup.set('Other Jig', [...(bySubgroup.get('Other Jig') ?? []), item])
    }
  }

  const renderItems = (secItems: OwnedLure[]) =>
    gridView ? (
      <div className="grid grid-cols-2 gap-2 px-3 pt-2 pb-1">
        {secItems.map(item => (
          <ItemCard key={item.id} item={item}
            multiSelect={multiSelect} selected={selected.has(item.id)}
            onToggleSelect={() => onToggleSelect(item.id)}
            onEdit={() => onEdit(item)} onDelete={() => onDelete(item.id)}
            onLongPress={() => onLongPress(item.id)} />
        ))}
      </div>
    ) : (
      <div className="divide-y th-border">
        {secItems.map(item => (
          <DenseRow key={item.id} item={item}
            onEdit={() => onEdit(item)} onDelete={() => onDelete(item.id)} />
        ))}
      </div>
    )

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-4 py-2 th-surface-deep border-y th-border"
      >
        <span className="flex-1 text-xs font-bold th-text-muted uppercase tracking-wide text-left">Jigs</span>
        <span className="text-xs th-text-muted">({items.length})</span>
        <span className="text-xs th-text-muted">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div>
          {JIG_SUBGROUPS.map(sub => {
            const subItems = sortItems(bySubgroup.get(sub) ?? [])
            if (subItems.length === 0) return null
            const isSubOpen = openSubs.has(sub)
            return (
              <div key={sub}>
                <button
                  onClick={() => toggleSub(sub)}
                  className="w-full flex items-center gap-2 px-6 py-1.5 th-surface border-b th-border"
                >
                  <span className="flex-1 text-xs font-semibold th-text-muted text-left">{sub}</span>
                  <span className="text-xs th-text-muted">({subItems.length})</span>
                  <span className="text-xs th-text-muted">{isSubOpen ? '▲' : '▼'}</span>
                </button>
                {isSubOpen && renderItems(subItems)}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── List view ────────────────────────────────────────────────────────────────

type OriginFilter = 'all' | TackleOrigin
type ConditionFilter = 'all' | TackleCondition

interface ListViewProps {
  items: OwnedLure[]
  settings: AppSettings
  rods: Rod[]
  onAdd: (cat: TackleCategory) => void
  onEdit: (item: OwnedLure) => void
  onDelete: (id: string) => void
  onBulkDelete: (ids: string[]) => void
  onExport: () => void
  onAddRod: () => void
  onEditRod: (rod: Rod) => void
  onDeleteRod: (id: string) => void
  onBulkDeleteRods: (ids: string[]) => void
}

function ListView({ items, rods, onAdd, onEdit, onDelete, onBulkDelete, onExport, onAddRod, onEditRod, onDeleteRod, onBulkDeleteRods }: ListViewProps) {
  const [search, setSearch]           = useState('')
  const [originFilter, setOriginFilter] = useState<OriginFilter>('all')
  const [condFilter, setCondFilter]   = useState<ConditionFilter>('all')
  const [gridView, setGridView]       = useState<boolean>(() => {
    try { return localStorage.getItem('tackle-view') === 'grid' } catch { return false }
  })
  const [multiSelect, setMultiSelect] = useState(false)
  const [selected, setSelected]       = useState<Set<string>>(new Set())
  const [bulkConfirm, setBulkConfirm] = useState(false)

  const toggleView = () => {
    const next = !gridView
    setGridView(next)
    try { localStorage.setItem('tackle-view', next ? 'grid' : 'list') } catch {}
  }

  const filterItem = (item: OwnedLure): boolean => {
    if (originFilter !== 'all' && item.origin !== originFilter) return false
    if (condFilter !== 'all' && (item.condition ?? 'Good') !== condFilter) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      const fields = [
        item.lureType, item.hookStyle, item.spoonStyle,
        item.color, item.secondaryColor, item.weight, item.brand, item.subType,
      ]
      if (!fields.some(f => f?.toLowerCase().includes(q))) return false
    }
    return true
  }

  const filterRod = (rod: Rod): boolean => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return [rod.nickname, rod.power, rod.action, rod.lineType].some(f => f?.toLowerCase().includes(q))
  }

  const filtered = items.filter(filterItem)
  const filteredRods = rods.filter(filterRod)

  // Build section map using new taxonomy
  const sectionMap = new Map<TackleSection, OwnedLure[]>()
  for (const sec of SECTION_ORDER) sectionMap.set(sec, [])
  for (const item of filtered) {
    const sec = effectiveTackleSection(item)
    sectionMap.get(sec)!.push(item)
  }

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const exitMultiSelect = () => {
    setMultiSelect(false)
    setSelected(new Set())
    setBulkConfirm(false)
  }

  const handleBulkDelete = () => {
    onBulkDelete(Array.from(selected))
    exitMultiSelect()
  }

  const isEmpty = filtered.length === 0 && filteredRods.length === 0

  return (
    <div className="pb-32">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 pt-4 pb-2">
        <h1 className="th-text font-bold text-xl flex-1">Tackle</h1>
        <button
          onClick={toggleView}
          className="w-9 h-9 flex items-center justify-center th-surface border th-border rounded-xl th-text-muted text-sm"
          title={gridView ? 'List view' : 'Grid view'}
        >
          {gridView ? '☰' : '⊞'}
        </button>
        <button
          onClick={onExport}
          className="text-xs th-text-muted border th-border px-3 py-2 rounded-xl min-h-[36px]"
        >
          Export
        </button>
      </div>

      {/* Always-visible search bar */}
      <div className="px-4 pb-2">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 th-text-muted text-sm pointer-events-none">🔍</span>
          <input
            type="search"
            className="w-full th-surface border th-border rounded-xl pl-8 pr-8 py-2.5 th-text text-sm"
            placeholder="Search by type, color, weight…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 th-text-muted text-sm"
            >✕</button>
          )}
        </div>
      </div>

      {/* Filter chips — origin + condition */}
      <div className="overflow-x-auto scrollbar-hide px-4 pb-2">
        <div className="flex gap-2 w-max">
          <Chip label="Any Origin"     active={originFilter === 'all'}               onClick={() => setOriginFilter('all')} />
          <Chip label="🫗 Hand Poured" active={originFilter === 'Hand Poured by Me'} onClick={() => setOriginFilter('Hand Poured by Me')} />
          <Chip label="Store Bought"   active={originFilter === 'Store Bought'}       onClick={() => setOriginFilter('Store Bought')} />
          <div className="w-px opacity-20 mx-1 self-stretch" style={{ background: 'var(--th-border)' }} />
          <Chip label="Any Condition" active={condFilter === 'all'}      onClick={() => setCondFilter('all')} />
          <Chip label="New"           active={condFilter === 'New'}      onClick={() => setCondFilter('New')} />
          <Chip label="Good"          active={condFilter === 'Good'}     onClick={() => setCondFilter('Good')} />
          <Chip label="Retired"       active={condFilter === 'Retired'}  onClick={() => setCondFilter('Retired')} />
        </div>
      </div>

      {/* Empty state */}
      {isEmpty && (
        <div className="text-center py-16 th-text-muted px-4">
          <div className="text-4xl mb-3">🎣</div>
          <p className="text-sm font-medium">{search ? 'No matches' : 'No tackle yet'}</p>
          <p className="text-xs mt-1">
            {search ? 'Try a different search term.' : 'Tap + to add your first lure, hook, or spoon.'}
          </p>
        </div>
      )}

      {/* Accordion sections — all except 'Jigs' and 'Other' */}
      {SECTION_ORDER.filter(sec => sec !== 'Jigs' && sec !== 'Other').map(sec => {
        const secItems = sortItems(sectionMap.get(sec) ?? [])
        return (
          <AccordionSection key={sec} title={sec} count={secItems.length}>
            {gridView ? (
              <div className="grid grid-cols-2 gap-2 px-3 pt-2 pb-1">
                {secItems.map(item => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    multiSelect={multiSelect}
                    selected={selected.has(item.id)}
                    onToggleSelect={() => toggleSelect(item.id)}
                    onEdit={() => onEdit(item)}
                    onDelete={() => onDelete(item.id)}
                    onLongPress={() => { setMultiSelect(true); setSelected(new Set([item.id])) }}
                  />
                ))}
              </div>
            ) : (
              <div className="divide-y th-border">
                {secItems.map(item => (
                  <DenseRow
                    key={item.id}
                    item={item}
                    onEdit={() => onEdit(item)}
                    onDelete={() => onDelete(item.id)}
                  />
                ))}
              </div>
            )}
          </AccordionSection>
        )
      })}

      {/* Jigs — nested subgroup accordion */}
      <JigsAccordion
        items={sortItems(sectionMap.get('Jigs') ?? [])}
        gridView={gridView}
        multiSelect={multiSelect}
        selected={selected}
        onToggleSelect={toggleSelect}
        onEdit={onEdit}
        onDelete={id => onDelete(id)}
        onLongPress={id => { setMultiSelect(true); setSelected(new Set([id])) }}
      />

      {/* Rods & Reels — above Other */}
      <RodsAccordion
        rods={filteredRods}
        onAdd={onAddRod}
        onEdit={onEditRod}
        onDelete={onDeleteRod}
        onBulkDelete={onBulkDeleteRods}
      />

      {/* Other — always last */}
      {(() => {
        const secItems = sortItems(sectionMap.get('Other') ?? [])
        return (
          <AccordionSection title="Other" count={secItems.length}>
            {gridView ? (
              <div className="grid grid-cols-2 gap-2 px-3 pt-2 pb-1">
                {secItems.map(item => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    multiSelect={multiSelect}
                    selected={selected.has(item.id)}
                    onToggleSelect={() => toggleSelect(item.id)}
                    onEdit={() => onEdit(item)}
                    onDelete={() => onDelete(item.id)}
                    onLongPress={() => { setMultiSelect(true); setSelected(new Set([item.id])) }}
                  />
                ))}
              </div>
            ) : (
              <div className="divide-y th-border">
                {secItems.map(item => (
                  <DenseRow
                    key={item.id}
                    item={item}
                    onEdit={() => onEdit(item)}
                    onDelete={() => onDelete(item.id)}
                  />
                ))}
              </div>
            )}
          </AccordionSection>
        )
      })()}

      {/* Multi-select bottom bar */}
      {multiSelect && (
        <div className="fixed bottom-20 left-0 right-0 z-40 px-4">
          <div className="th-surface border th-border rounded-2xl p-3 flex items-center gap-3 shadow-xl">
            <button onClick={exitMultiSelect} className="th-text-muted text-sm min-h-[44px] px-1">
              Cancel
            </button>
            <span className="flex-1 th-text text-sm font-medium text-center">
              {selected.size} selected
            </span>
            {bulkConfirm ? (
              <div className="flex gap-2">
                <button
                  onClick={handleBulkDelete}
                  className="text-sm text-white bg-red-700 px-3 py-2 rounded-xl min-h-[44px]"
                >
                  Confirm Delete
                </button>
                <button
                  onClick={() => setBulkConfirm(false)}
                  className="text-sm th-text-muted border th-border px-3 py-2 rounded-xl min-h-[44px]"
                >
                  No
                </button>
              </div>
            ) : (
              <button
                onClick={() => setBulkConfirm(true)}
                disabled={selected.size === 0}
                className="text-sm th-danger-text border border-red-900/50 px-3 py-2 rounded-xl min-h-[44px] disabled:opacity-40"
              >
                Delete ({selected.size})
              </button>
            )}
          </div>
        </div>
      )}

      {/* FAB */}
      {!multiSelect && <AddFab onAdd={onAdd} onAddRod={onAddRod} />}
    </div>
  )
}

// ─── Lure Form ────────────────────────────────────────────────────────────────

interface LureFormProps {
  initial?: OwnedLure
  apiKey?: string
  onSave: (item: OwnedLure) => void
  onCancel: () => void
}

function LureForm({ initial, apiKey, onSave, onCancel }: LureFormProps) {
  // Determine initial lureType — map legacy jig subtypes into "Jig" + subgroup
  const initialCategory = (() => {
    const t = initial?.lureType ?? ''
    if (['Swim Jig', 'Football Jig', 'Flipping Jig', 'Casting Jig', 'Finesse Jig'].includes(t)) return 'Jig'
    if (LURE_CATEGORIES.includes(t as typeof LURE_CATEGORIES[number])) return t
    return t || ''
  })()
  const initialSubgroup = (() => {
    const t = initial?.lureType ?? ''
    if (initial?.jigSubgroup) return initial.jigSubgroup
    if (['Swim Jig', 'Football Jig', 'Flipping Jig', 'Casting Jig', 'Finesse Jig'].includes(t)) return t
    return ''
  })()
  const initialOtherType = (() => {
    const t = initial?.lureType ?? ''
    if (LURE_CATEGORIES.includes(t as typeof LURE_CATEGORIES[number])) return ''
    if (['Swim Jig', 'Football Jig', 'Flipping Jig', 'Casting Jig', 'Finesse Jig'].includes(t)) return ''
    return t
  })()

  const [lureCategory,    setLureCategory]    = useState(initialCategory)
  const [jigSubgroup,     setJigSubgroup]     = useState(initialSubgroup)
  const [otherTypeText,   setOtherTypeText]   = useState(initialOtherType)
  const [weight,          setWeight]          = useState(initial?.weight ?? '')
  const [weightNA,        setWeightNA]        = useState(initial?.weightNA ?? false)
  const [color,           setColor]           = useState(initial?.color ?? '')
  const [secondaryColor,  setSecondaryColor]  = useState(initial?.secondaryColor ?? '')
  const [bladeConfig,     setBladeConfig]     = useState(initial?.bladeConfig ?? '')
  const [brand,           setBrand]           = useState(initial?.brand ?? '')
  const [origin,          setOrigin]          = useState<TackleOrigin | ''>(initial?.origin ?? '')
  const [condition,       setCondition]       = useState<TackleCondition | ''>(initial?.condition ?? '')
  const [notes,           setNotes]           = useState(initial?.notes ?? '')
  const [photo,           setPhoto]           = useState(initial?.photoDataUrl ?? '')
  const [saving,          setSaving]          = useState(false)

  const showBladeConfig = BLADE_CONFIG_TYPES.includes(lureCategory)
  const showJigSubgroup = lureCategory === 'Jig'
  const showOtherText   = lureCategory === 'Other'

  const applyAi = (s: LureIdentification) => {
    if (s.color) setColor(s.color)
    if (s.brand) setBrand(s.brand)
    if (s.notes) setNotes(s.notes ?? '')
  }

  const submit = async () => {
    const resolvedType = lureCategory === 'Other' ? (otherTypeText.trim() || 'Other') : lureCategory
    if (!resolvedType || (!weightNA && !weight) || !color.trim()) return
    if (showJigSubgroup && !jigSubgroup) return
    setSaving(true)
    const item: OwnedLure = {
      id:             initial?.id ?? nanoid(),
      category:       'lure',
      lureType:       resolvedType,
      jigSubgroup:    showJigSubgroup ? jigSubgroup : undefined,
      weight:         weightNA ? undefined : (weight || undefined),
      weightNA:       weightNA || undefined,
      color:          color.trim(),
      secondaryColor: secondaryColor.trim() || undefined,
      bladeConfig:    bladeConfig.trim() || undefined,
      brand:          brand.trim() || undefined,
      origin:         origin || undefined,
      condition:      condition || undefined,
      notes:          notes.trim() || undefined,
      photoDataUrl:   photo || undefined,
      addedAt:        initial?.addedAt ?? Date.now(),
    }
    await saveOwnedLure(item)
    onSave(item)
  }

  const canSave = (() => {
    if (!lureCategory) return false
    if (showJigSubgroup && !jigSubgroup) return false
    if (showOtherText && !otherTypeText.trim()) return false
    if (!weightNA && !weight) return false
    if (!color.trim()) return false
    return !saving
  })()

  return (
    <div className="p-4 pb-28 max-w-lg mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={onCancel} className="th-accent-text text-sm min-h-[44px] px-1">
          ← Cancel
        </button>
        <h2 className="th-text font-bold text-lg flex-1">
          {initial ? 'Edit Lure' : 'Add Lure'}
        </h2>
      </div>

      {/* Photo */}
      <div className="th-surface rounded-2xl border th-border p-4 space-y-3">
        <p className="section-label">Photo</p>
        <PhotoSection photo={photo} setPhoto={setPhoto} apiKey={apiKey} onAiSuggestion={applyAi} />
      </div>

      {/* Lure Details */}
      <div className="th-surface rounded-2xl border th-border p-4 space-y-4">
        <p className="section-label">Lure Details</p>

        <div>
          <FieldLabel>Category *</FieldLabel>
          <div className="flex flex-wrap gap-2">
            {LURE_CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => { setLureCategory(cat); setJigSubgroup('') }}
                className={`px-3 py-2 rounded-xl text-sm border min-h-[44px] ${
                  lureCategory === cat
                    ? 'th-btn-selected border-transparent'
                    : 'th-surface th-text border-[color:var(--th-border)]'
                }`}
              >{cat}</button>
            ))}
          </div>
        </div>

        {showOtherText && (
          <div>
            <FieldLabel>Type Name *</FieldLabel>
            <TextInput
              value={otherTypeText}
              onChange={setOtherTypeText}
              placeholder="e.g. Jerkbait, Drop Shot…"
            />
          </div>
        )}

        {showJigSubgroup && (
          <div>
            <FieldLabel>Jig Type *</FieldLabel>
            <div className="flex flex-wrap gap-2">
              {JIG_SUBGROUPS.map(sub => (
                <button
                  key={sub}
                  onClick={() => setJigSubgroup(sub)}
                  className={`px-3 py-2 rounded-xl text-sm border min-h-[44px] ${
                    jigSubgroup === sub
                      ? 'th-btn-selected border-transparent'
                      : 'th-surface th-text border-[color:var(--th-border)]'
                  }`}
                >{sub}</button>
              ))}
            </div>
          </div>
        )}

        {showBladeConfig && (
          <div>
            <FieldLabel>Blade Config</FieldLabel>
            <TextInput
              value={bladeConfig}
              onChange={setBladeConfig}
              placeholder='e.g. "Colorado + Willow", "double willow"'
            />
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-1">
            <FieldLabel>Weight{weightNA ? '' : ' *'}</FieldLabel>
            <button
              onClick={() => setWeightNA(v => !v)}
              className={`text-xs px-2 py-1 rounded-lg border min-h-[36px] ${
                weightNA
                  ? 'th-btn-selected border-transparent'
                  : 'th-surface th-text border-[color:var(--th-border)]'
              }`}
            >
              N/A
            </button>
          </div>
          {!weightNA && (
            <div className="flex flex-wrap gap-2">
              {WEIGHT_OPTIONS.map(w => (
                <button
                  key={w}
                  onClick={() => setWeight(w)}
                  className={`px-3 py-2 rounded-xl text-sm border min-h-[44px] ${
                    weight === w
                      ? 'th-btn-selected border-transparent'
                      : 'th-surface th-text border-[color:var(--th-border)]'
                  }`}
                >
                  {w}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Color */}
      <div className="th-surface rounded-2xl border th-border p-4 space-y-4">
        <p className="section-label">Color</p>
        <div>
          <FieldLabel>Primary Color *</FieldLabel>
          <TextInput
            value={color}
            onChange={setColor}
            placeholder="e.g. White/Chartreuse, Green Pumpkin"
          />
        </div>
        <div>
          <FieldLabel>Secondary Color / Accent</FieldLabel>
          <TextInput
            value={secondaryColor}
            onChange={setSecondaryColor}
            placeholder="e.g. Red Trailer, Silver Flake"
          />
        </div>
      </div>

      {/* Origin & Condition */}
      <div className="th-surface rounded-2xl border th-border p-4 space-y-4">
        <p className="section-label">Origin & Condition</p>
        <div>
          <FieldLabel>Brand</FieldLabel>
          <TextInput value={brand} onChange={setBrand} placeholder="e.g. Strike King, Z-Man" />
        </div>
        <div>
          <FieldLabel>Origin</FieldLabel>
          <div className="flex flex-col gap-2">
            {ORIGINS.map(o => (
              <button
                key={o}
                onClick={() => setOrigin(o)}
                className={`px-4 py-3 rounded-xl text-sm border text-left min-h-[48px] font-medium ${
                  origin === o
                    ? 'th-btn-selected border-transparent'
                    : 'th-surface th-text border-[color:var(--th-border)]'
                }`}
              >
                {o === 'Hand Poured by Me' ? '🫗 Hand Poured by Me' : o}
              </button>
            ))}
          </div>
        </div>
        <div>
          <FieldLabel>Condition</FieldLabel>
          <ButtonGrid options={CONDITIONS} value={condition} onChange={setCondition} />
        </div>
      </div>

      {/* Notes */}
      <div className="th-surface rounded-2xl border th-border p-4">
        <FieldLabel>Notes</FieldLabel>
        <TextInput
          value={notes}
          onChange={setNotes}
          placeholder="e.g. works best slow-rolled with trailer"
        />
      </div>

      <button
        onClick={submit}
        disabled={!canSave}
        className="w-full py-4 th-btn-primary rounded-xl font-semibold text-base disabled:opacity-40 min-h-[56px]"
      >
        {saving ? 'Saving…' : initial ? 'Save Changes' : 'Add Lure'}
      </button>
    </div>
  )
}

// ─── Hook Form ────────────────────────────────────────────────────────────────

interface HookFormProps {
  initial?: OwnedLure
  onSave: (item: OwnedLure) => void
  onCancel: () => void
}

function HookForm({ initial, onSave, onCancel }: HookFormProps) {
  const [hookType,  setHookType]  = useState<'standard' | 'weighted' | ''>(initial?.hookType ?? '')
  const [hookStyle, setHookStyle] = useState<HookStyle | ''>(initial?.hookStyle ?? '')
  const [hookSize,  setHookSize]  = useState(initial?.hookSize ?? '')
  const [weight,    setWeight]    = useState(initial?.weight ?? '')
  const [brand,     setBrand]     = useState(initial?.brand ?? '')
  const [quantity,  setQuantity]  = useState<string>(
    initial?.quantity !== undefined ? String(initial.quantity) : ''
  )
  const [notes,  setNotes]  = useState(initial?.notes ?? '')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!hookStyle) return
    setSaving(true)
    const qty = quantity !== '' ? parseInt(quantity, 10) : undefined
    const item: OwnedLure = {
      id:        initial?.id ?? nanoid(),
      category:  'hook',
      color:     '',
      hookType:  hookType || undefined,
      hookStyle: hookStyle as HookStyle,
      hookSize:  hookSize.trim() || undefined,
      weight:    hookType === 'weighted' ? (weight.trim() || undefined) : undefined,
      brand:     brand.trim() || undefined,
      quantity:  qty !== undefined && !isNaN(qty) ? qty : undefined,
      notes:     notes.trim() || undefined,
      addedAt:   initial?.addedAt ?? Date.now(),
    }
    await saveOwnedLure(item)
    onSave(item)
  }

  const canSave = hookStyle && !saving

  return (
    <div className="p-4 pb-28 max-w-lg mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={onCancel} className="th-accent-text text-sm min-h-[44px] px-1">
          ← Cancel
        </button>
        <h2 className="th-text font-bold text-lg flex-1">
          {initial ? 'Edit Hook' : 'Add Hook'}
        </h2>
      </div>

      <div className="th-surface rounded-2xl border th-border p-4 space-y-4">
        <p className="section-label">Hook Details</p>

        <div>
          <FieldLabel>Hook Type</FieldLabel>
          <div className="flex gap-2">
            {(['standard', 'weighted'] as const).map(ht => (
              <button
                key={ht}
                onClick={() => setHookType(ht)}
                className={`flex-1 py-2.5 rounded-xl text-sm border min-h-[44px] capitalize ${
                  hookType === ht
                    ? 'th-btn-selected border-transparent'
                    : 'th-surface th-text border-[color:var(--th-border)]'
                }`}
              >{ht}</button>
            ))}
          </div>
        </div>

        {hookType === 'weighted' && (
          <div>
            <FieldLabel>Weight</FieldLabel>
            <div className="flex flex-wrap gap-2">
              {WEIGHT_OPTIONS.map(w => (
                <button
                  key={w}
                  onClick={() => setWeight(w)}
                  className={`px-3 py-2 rounded-xl text-sm border min-h-[44px] ${
                    weight === w
                      ? 'th-btn-selected border-transparent'
                      : 'th-surface th-text border-[color:var(--th-border)]'
                  }`}
                >{w}</button>
              ))}
            </div>
          </div>
        )}

        <div>
          <FieldLabel>Hook Style *</FieldLabel>
          <ButtonGrid options={HOOK_STYLES} value={hookStyle} onChange={setHookStyle} />
        </div>

        <div>
          <FieldLabel>Hook Size</FieldLabel>
          <TextInput value={hookSize} onChange={setHookSize} placeholder='e.g. 3/0, 5/0, #4' />
        </div>

        <div>
          <FieldLabel>Brand</FieldLabel>
          <TextInput value={brand} onChange={setBrand} placeholder="e.g. Gamakatsu, Owner" />
        </div>

        <div>
          <FieldLabel>Quantity</FieldLabel>
          <input
            type="number"
            min={0}
            className="w-full th-surface border th-border rounded-xl px-3 py-3 th-text text-base"
            value={quantity}
            onChange={e => setQuantity(e.target.value)}
            placeholder="e.g. 10"
          />
        </div>
      </div>

      <div className="th-surface rounded-2xl border th-border p-4">
        <FieldLabel>Notes</FieldLabel>
        <TextInput value={notes} onChange={setNotes} placeholder="Any notes…" />
      </div>

      <button
        onClick={submit}
        disabled={!canSave}
        className="w-full py-4 th-btn-primary rounded-xl font-semibold text-base disabled:opacity-40 min-h-[56px]"
      >
        {saving ? 'Saving…' : initial ? 'Save Changes' : 'Add Hook'}
      </button>
    </div>
  )
}

// ─── Spoon Form ───────────────────────────────────────────────────────────────

interface SpoonFormProps {
  initial?: OwnedLure
  apiKey?: string
  onSave: (item: OwnedLure) => void
  onCancel: () => void
}

function SpoonForm({ initial, apiKey, onSave, onCancel }: SpoonFormProps) {
  const [spoonStyle, setSpoonStyle] = useState<SpoonStyle | ''>(initial?.spoonStyle ?? '')
  const [weight,     setWeight]     = useState(initial?.weight ?? '')
  const [color,      setColor]      = useState(initial?.color ?? '')
  const [brand,      setBrand]      = useState(initial?.brand ?? '')
  const [origin,     setOrigin]     = useState<TackleOrigin | ''>(initial?.origin ?? '')
  const [condition,  setCondition]  = useState<TackleCondition | ''>(initial?.condition ?? '')
  const [notes,      setNotes]      = useState(initial?.notes ?? '')
  const [photo,      setPhoto]      = useState(initial?.photoDataUrl ?? '')
  const [saving,     setSaving]     = useState(false)

  const applyAi = (s: LureIdentification) => {
    if (s.color) setColor(s.color)
    if (s.brand) setBrand(s.brand)
    if (s.notes) setNotes(s.notes ?? '')
  }

  const submit = async () => {
    if (!color.trim()) return
    setSaving(true)
    const item: OwnedLure = {
      id:           initial?.id ?? nanoid(),
      category:     'spoon',
      color:        color.trim(),
      spoonStyle:   spoonStyle || undefined,
      weight:       weight.trim() || undefined,
      brand:        brand.trim() || undefined,
      origin:       origin || undefined,
      condition:    condition || undefined,
      notes:        notes.trim() || undefined,
      photoDataUrl: photo || undefined,
      addedAt:      initial?.addedAt ?? Date.now(),
    }
    await saveOwnedLure(item)
    onSave(item)
  }

  const canSave = color.trim() && !saving

  return (
    <div className="p-4 pb-28 max-w-lg mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={onCancel} className="th-accent-text text-sm min-h-[44px] px-1">
          ← Cancel
        </button>
        <h2 className="th-text font-bold text-lg flex-1">
          {initial ? 'Edit Spoon' : 'Add Spoon'}
        </h2>
      </div>

      <div className="th-surface rounded-2xl border th-border p-4 space-y-3">
        <p className="section-label">Photo</p>
        <PhotoSection photo={photo} setPhoto={setPhoto} apiKey={apiKey} onAiSuggestion={applyAi} />
      </div>

      <div className="th-surface rounded-2xl border th-border p-4 space-y-4">
        <p className="section-label">Spoon Details</p>

        <div>
          <FieldLabel>Style</FieldLabel>
          <ButtonGrid options={SPOON_STYLES} value={spoonStyle} onChange={setSpoonStyle} />
        </div>

        <div>
          <FieldLabel>Weight</FieldLabel>
          <TextInput value={weight} onChange={setWeight} placeholder="e.g. 1/2 oz, 3/4 oz" />
        </div>

        <div>
          <FieldLabel>Color / Finish *</FieldLabel>
          <TextInput value={color} onChange={setColor} placeholder="e.g. Gold, Silver, Chartreuse" />
        </div>

        <div>
          <FieldLabel>Brand</FieldLabel>
          <TextInput value={brand} onChange={setBrand} placeholder="e.g. Kastmaster, Johnson" />
        </div>
      </div>

      <div className="th-surface rounded-2xl border th-border p-4 space-y-4">
        <p className="section-label">Origin & Condition</p>
        <div>
          <FieldLabel>Origin</FieldLabel>
          <div className="flex flex-col gap-2">
            {ORIGINS.map(o => (
              <button
                key={o}
                onClick={() => setOrigin(o)}
                className={`px-4 py-3 rounded-xl text-sm border text-left min-h-[48px] font-medium ${
                  origin === o
                    ? 'th-btn-selected border-transparent'
                    : 'th-surface th-text border-[color:var(--th-border)]'
                }`}
              >
                {o === 'Hand Poured by Me' ? '🫗 Hand Poured by Me' : o}
              </button>
            ))}
          </div>
        </div>
        <div>
          <FieldLabel>Condition</FieldLabel>
          <ButtonGrid options={CONDITIONS} value={condition} onChange={setCondition} />
        </div>
      </div>

      <div className="th-surface rounded-2xl border th-border p-4">
        <FieldLabel>Notes</FieldLabel>
        <TextInput value={notes} onChange={setNotes} placeholder="Any notes…" />
      </div>

      <button
        onClick={submit}
        disabled={!canSave}
        className="w-full py-4 th-btn-primary rounded-xl font-semibold text-base disabled:opacity-40 min-h-[56px]"
      >
        {saving ? 'Saving…' : initial ? 'Save Changes' : 'Add Spoon'}
      </button>
    </div>
  )
}

// ─── View state ───────────────────────────────────────────────────────────────

type FormView =
  | { mode: 'add'; category: TackleCategory }
  | { mode: 'edit'; item: OwnedLure }

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  settings: AppSettings
  onSettingsUpdate: (s: AppSettings) => void
}

type RodFormView = { mode: 'add' } | { mode: 'edit'; rod: Rod }

export default function Tackle({ settings }: Props) {
  const [items, setItems]           = useState<OwnedLure[]>([])
  const [formView, setFormView]     = useState<FormView | null>(null)
  const [rods, setRods]             = useState<Rod[]>([])
  const [rodFormView, setRodFormView] = useState<RodFormView | null>(null)

  useEffect(() => { getAllRods().then(setRods) }, [])

  useEffect(() => {
    getAllOwnedLures().then(lures => {
      // Migrate: clear 'Homemade — Other' origin (removed category)
      const needsMigration = lures.filter(l => (l.origin as string) === 'Homemade — Other')
      if (needsMigration.length > 0) {
        const migrated = needsMigration.map(l => ({ ...l, origin: undefined }))
        Promise.all(migrated.map(saveOwnedLure)).catch(() => {})
        setItems(lures.map(l => (l.origin as string) === 'Homemade — Other' ? { ...l, origin: undefined } : l))
      } else {
        setItems(lures)
      }
    })
  }, [])

  const handleSave = (item: OwnedLure) => {
    setItems(prev => {
      const idx = prev.findIndex(i => i.id === item.id)
      return idx >= 0 ? prev.map(i => (i.id === item.id ? item : i)) : [item, ...prev]
    })
    setFormView(null)
  }

  const handleDelete = async (id: string) => {
    await deleteOwnedLure(id)
    setItems(prev => prev.filter(i => i.id !== id))
  }

  const handleBulkDelete = async (ids: string[]) => {
    await bulkDeleteOwnedLures(ids)
    const idSet = new Set(ids)
    setItems(prev => prev.filter(i => !idSet.has(i.id)))
  }

  const handleExport = async () => {
    try {
      const json = await exportTackleJSON()
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `tackle-export-${todayDateString()}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch { /* ignore */ }
  }

  // Rod handlers
  const handleRodSave = (rod: Rod) => {
    setRods(prev => {
      const idx = prev.findIndex(r => r.id === rod.id)
      return idx >= 0 ? prev.map(r => r.id === rod.id ? rod : r) : [rod, ...prev]
    })
    setRodFormView(null)
  }
  const handleRodDelete = async (id: string) => {
    await deleteRod(id)
    setRods(prev => prev.filter(r => r.id !== id))
  }
  const handleBulkRodDelete = async (ids: string[]) => {
    await bulkDeleteRods(ids)
    const idSet = new Set(ids)
    setRods(prev => prev.filter(r => !idSet.has(r.id)))
  }

  // Rod form view
  if (rodFormView) {
    return (
      <RodForm
        initial={rodFormView.mode === 'edit' ? rodFormView.rod : undefined}
        onSave={handleRodSave}
        onCancel={() => setRodFormView(null)}
      />
    )
  }

  // Form views
  if (formView) {
    const category = formView.mode === 'edit' ? effectiveCategory(formView.item) : formView.category
    const initial  = formView.mode === 'edit' ? formView.item : undefined
    const apiKey   = settings.anthropicApiKey || undefined

    if (category === 'lure') {
      return (
        <LureForm
          initial={initial}
          apiKey={apiKey}
          onSave={handleSave}
          onCancel={() => setFormView(null)}
        />
      )
    }
    if (category === 'hook') {
      return (
        <HookForm
          initial={initial}
          onSave={handleSave}
          onCancel={() => setFormView(null)}
        />
      )
    }
    if (category === 'spoon') {
      return (
        <SpoonForm
          initial={initial}
          apiKey={apiKey}
          onSave={handleSave}
          onCancel={() => setFormView(null)}
        />
      )
    }
  }

  return (
    <ListView
      items={items}
      settings={settings}
      rods={rods}
      onAdd={cat => setFormView({ mode: 'add', category: cat })}
      onEdit={item => setFormView({ mode: 'edit', item })}
      onDelete={handleDelete}
      onBulkDelete={handleBulkDelete}
      onExport={handleExport}
      onAddRod={() => setRodFormView({ mode: 'add' })}
      onEditRod={rod => setRodFormView({ mode: 'edit', rod })}
      onDeleteRod={handleRodDelete}
      onBulkDeleteRods={handleBulkRodDelete}
    />
  )
}
