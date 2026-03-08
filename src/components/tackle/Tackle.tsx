import { useState, useEffect, useRef, useCallback } from 'react'
import type {
  OwnedLure,
  TackleCategory,
  TackleOrigin,
  TackleCondition,
  HookStyle,
  SpoonStyle,
  AppSettings,
} from '../../types'
import {
  getAllOwnedLures,
  saveOwnedLure,
  deleteOwnedLure,
  bulkDeleteOwnedLures,
  exportTackleJSON,
} from '../../db/database'
import { nanoid } from '../logger/nanoid'
import { identifyLureForCatalog, type LureIdentification } from '../../api/claude'

// ─── Constants ────────────────────────────────────────────────────────────────

const LURE_TYPES = [
  'Spinnerbait', 'Swim Jig', 'Chatterbait', 'Football Jig', 'Flipping Jig',
  'Wacky Rig', 'Texas Rig', 'Buzzbait', 'Swimbait', 'Crankbait',
  'Topwater', 'Drop Shot', 'Spoon', 'Other',
]

const WEIGHT_OPTIONS = ['Weightless', '3/16 oz', '1/4 oz', '3/8 oz', '1/2 oz', '3/4 oz', '1 oz', 'Other']

const HOOK_STYLES: HookStyle[] = ['Worm Hook', 'EWG', 'Wacky', 'Ned', 'Drop Shot', 'Treble', 'Other']
const SPOON_STYLES: SpoonStyle[] = ['Casting', 'Trolling', 'Jigging']
const ORIGINS: TackleOrigin[] = ['Hand Poured by Me', 'Homemade — Other', 'Store Bought']
const CONDITIONS: TackleCondition[] = ['New', 'Good', 'Retired']

const SUBTYPES: Record<string, string[]> = {
  'Swimbait':   ['Hard', 'Soft'],
  'Wacky Rig':  ['Weighted', 'Unweighted'],
  'Texas Rig':  ['Standard', 'Finesse'],
  'Topwater':   ['Frog', 'Prop', 'Walker', 'Popper'],
}

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
  if (origin === 'Hand Poured by Me') return <HandPouredBadge />
  return (
    <span className="text-xs px-2 py-0.5 rounded-full bg-sky-900/30 text-sky-400 shrink-0">
      Homemade
    </span>
  )
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
        className="text-xs text-red-400 border border-red-900/50 px-2 py-1 rounded-lg min-w-[44px] min-h-[36px]"
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
              {item.lureType ?? 'Lure'}{item.subType ? ` — ${item.subType}` : ''}
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

// ─── Accordion ────────────────────────────────────────────────────────────────

interface AccordionGroupProps {
  label: string
  count: number
  defaultExpanded?: boolean
  children: React.ReactNode
}

function AccordionGroup({ label, count, defaultExpanded = false, children }: AccordionGroupProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  return (
    <div>
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-2 py-2 px-1 text-left min-h-[44px]"
      >
        <span className="th-text font-semibold text-sm flex-1">{label}</span>
        <span className="th-text-muted text-xs">({count})</span>
        <span className="th-text-muted text-xs ml-1">{expanded ? '▾' : '▸'}</span>
      </button>
      {expanded && <div className="space-y-2 mb-2">{children}</div>}
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

function AddFab({ onAdd }: { onAdd: (cat: TackleCategory) => void }) {
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
              🪝 Add Hook
            </button>
            <button
              onClick={() => { setOpen(false); onAdd('spoon') }}
              className="th-surface border th-border rounded-2xl px-4 py-3 th-text text-sm font-medium shadow-lg min-h-[48px]"
            >
              🥄 Add Spoon
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

// ─── List view ────────────────────────────────────────────────────────────────

type CategoryFilter = 'all' | TackleCategory
type OriginFilter = 'all' | TackleOrigin
type ConditionFilter = 'all' | TackleCondition

interface ListViewProps {
  items: OwnedLure[]
  settings: AppSettings
  onAdd: (cat: TackleCategory) => void
  onEdit: (item: OwnedLure) => void
  onDelete: (id: string) => void
  onBulkDelete: (ids: string[]) => void
  onExport: () => void
}

function ListView({
  items,
  onAdd,
  onEdit,
  onDelete,
  onBulkDelete,
  onExport,
}: ListViewProps) {
  const [catFilter, setCatFilter] = useState<CategoryFilter>('all')
  const [originFilter, setOriginFilter] = useState<OriginFilter>('all')
  const [condFilter, setCondFilter] = useState<ConditionFilter>('all')
  const [lureTypeFilter, setLureTypeFilter] = useState<string>('all')
  const [multiSelect, setMultiSelect] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkConfirm, setBulkConfirm] = useState(false)
  const [subExpanded, setSubExpanded] = useState<Record<string, boolean>>({})

  const lures  = items.filter(i => effectiveCategory(i) === 'lure')
  const hooks  = items.filter(i => effectiveCategory(i) === 'hook')
  const spoons = items.filter(i => effectiveCategory(i) === 'spoon')

  const lureTypesInData = Array.from(new Set(lures.map(l => l.lureType ?? 'Other'))).sort()

  const filterItem = (item: OwnedLure): boolean => {
    const cat = effectiveCategory(item)
    if (catFilter !== 'all' && cat !== catFilter) return false
    if (originFilter !== 'all' && item.origin !== originFilter) return false
    if (condFilter !== 'all' && (item.condition ?? 'Good') !== condFilter) return false
    if (catFilter === 'lure' && lureTypeFilter !== 'all' && (item.lureType ?? 'Other') !== lureTypeFilter) return false
    return true
  }

  const filtered        = items.filter(filterItem)
  const filteredLures   = filtered.filter(i => effectiveCategory(i) === 'lure')
  const filteredHooks   = filtered.filter(i => effectiveCategory(i) === 'hook')
  const filteredSpoons  = filtered.filter(i => effectiveCategory(i) === 'spoon')

  const buildGroups = (arr: OwnedLure[], keyFn: (i: OwnedLure) => string): Record<string, OwnedLure[]> =>
    arr.reduce<Record<string, OwnedLure[]>>((acc, item) => {
      const k = keyFn(item)
      if (!acc[k]) acc[k] = []
      acc[k].push(item)
      return acc
    }, {})

  const lureGroups  = buildGroups(filteredLures,  i => i.lureType  ?? 'Other')
  const hookGroups  = buildGroups(filteredHooks,   i => i.hookStyle ?? 'Other')
  const spoonGroups = buildGroups(filteredSpoons,  i => i.spoonStyle ?? 'Other')

  const initSubKeys = useCallback((cat: TackleCategory, groups: Record<string, OwnedLure[]>) => {
    setSubExpanded(prev => {
      const next = { ...prev }
      Object.keys(groups).forEach((k, idx) => {
        const key = `${cat}::${k}`
        if (!(key in next)) next[key] = idx === 0
      })
      return next
    })
  }, [])

  useEffect(() => { initSubKeys('lure',  lureGroups)  }, [filteredLures.length])  // eslint-disable-line
  useEffect(() => { initSubKeys('hook',  hookGroups)  }, [filteredHooks.length])  // eslint-disable-line
  useEffect(() => { initSubKeys('spoon', spoonGroups) }, [filteredSpoons.length]) // eslint-disable-line

  const toggleSub = (cat: TackleCategory, key: string) => {
    const full = `${cat}::${key}`
    setSubExpanded(prev => ({ ...prev, [full]: !prev[full] }))
  }

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
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

  const renderSubGroup = (
    cat: TackleCategory,
    groupKey: string,
    groupItems: OwnedLure[],
    isFirst: boolean,
  ) => {
    const fullKey = `${cat}::${groupKey}`
    const isExpanded = subExpanded[fullKey] ?? isFirst
    return (
      <div key={groupKey}>
        <button
          onClick={() => toggleSub(cat, groupKey)}
          className="w-full flex items-center gap-2 py-1.5 px-2 text-left min-h-[40px]"
        >
          <span className="section-label flex-1">{groupKey}</span>
          <span className="th-text-muted text-xs">({groupItems.length})</span>
          <span className="th-text-muted text-xs ml-1">{isExpanded ? '▾' : '▸'}</span>
        </button>
        {isExpanded && (
          <div className="space-y-2 pl-1">
            {sortItems(groupItems).map(item => (
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
        )}
      </div>
    )
  }

  const showLures  = (catFilter === 'all' || catFilter === 'lure')  && filteredLures.length  > 0
  const showHooks  = (catFilter === 'all' || catFilter === 'hook')  && filteredHooks.length  > 0
  const showSpoons = (catFilter === 'all' || catFilter === 'spoon') && filteredSpoons.length > 0
  const isEmpty    = filtered.length === 0

  return (
    <div className="pb-32">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3 px-4 pt-4">
        <h1 className="th-text font-bold text-xl flex-1">Tackle</h1>
        <button
          onClick={onExport}
          className="text-xs th-text-muted border th-border px-3 py-2 rounded-xl min-h-[40px]"
        >
          Export
        </button>
      </div>

      {/* Category + filter chips */}
      <div className="overflow-x-auto scrollbar-hide px-4 pb-1">
        <div className="flex gap-2 w-max">
          <Chip label="All" active={catFilter === 'all'} onClick={() => { setCatFilter('all'); setLureTypeFilter('all') }} />
          <Chip label="🎣 Lures" active={catFilter === 'lure'} onClick={() => { setCatFilter('lure'); setLureTypeFilter('all') }} />
          <Chip label="🪝 Hooks" active={catFilter === 'hook'} onClick={() => { setCatFilter('hook'); setLureTypeFilter('all') }} />
          <div className="w-px opacity-20 mx-1 self-stretch" style={{ background: 'var(--th-border)' }} />

          <Chip label="Any Origin" active={originFilter === 'all'} onClick={() => setOriginFilter('all')} />
          <Chip label="🫗 Hand Poured" active={originFilter === 'Hand Poured by Me'} onClick={() => setOriginFilter('Hand Poured by Me')} />
          <Chip label="Store Bought" active={originFilter === 'Store Bought'} onClick={() => setOriginFilter('Store Bought')} />

          <div className="w-px opacity-20 mx-1 self-stretch" style={{ background: 'var(--th-border)' }} />

          <Chip label="Any Condition" active={condFilter === 'all'} onClick={() => setCondFilter('all')} />
          <Chip label="New" active={condFilter === 'New'} onClick={() => setCondFilter('New')} />
          <Chip label="Good" active={condFilter === 'Good'} onClick={() => setCondFilter('Good')} />
          <Chip label="Retired" active={condFilter === 'Retired'} onClick={() => setCondFilter('Retired')} />
        </div>
      </div>

      {/* Lure-type quick-filter */}
      {catFilter === 'lure' && lureTypesInData.length > 1 && (
        <div className="overflow-x-auto scrollbar-hide px-4 pb-2 mt-1">
          <div className="flex gap-2 w-max">
            <Chip label="All Types" active={lureTypeFilter === 'all'} onClick={() => setLureTypeFilter('all')} />
            {lureTypesInData.map(t => (
              <Chip key={t} label={t} active={lureTypeFilter === t} onClick={() => setLureTypeFilter(t)} />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {isEmpty && (
        <div className="text-center py-16 th-text-muted px-4">
          <div className="text-4xl mb-3">🎣</div>
          <p className="text-sm font-medium">No tackle found</p>
          <p className="text-xs mt-1">Adjust filters or tap + to add tackle.</p>
        </div>
      )}

      {/* Accordion list */}
      <div className="px-4 mt-2 space-y-1">
        {showLures && (
          <AccordionGroup
            label={`🎣 Lures (${lures.length})`}
            count={filteredLures.length}

          >
            {Object.entries(lureGroups).map(([key, groupItems], idx) =>
              renderSubGroup('lure', key, groupItems, idx === 0)
            )}
          </AccordionGroup>
        )}

        {showHooks && (
          <AccordionGroup
            label={`🪝 Hooks (${hooks.length})`}
            count={filteredHooks.length}

          >
            {Object.entries(hookGroups).map(([key, groupItems], idx) =>
              renderSubGroup('hook', key, groupItems, idx === 0)
            )}
          </AccordionGroup>
        )}

        {showSpoons && (
          <AccordionGroup
            label={`🥄 Spoons (${spoons.length})`}
            count={filteredSpoons.length}

          >
            {Object.entries(spoonGroups).map(([key, groupItems], idx) =>
              renderSubGroup('spoon', key, groupItems, idx === 0)
            )}
          </AccordionGroup>
        )}
      </div>

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
                  className="text-sm text-red-400 border border-red-900/50 px-3 py-2 rounded-xl min-h-[44px]"
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
                className="text-sm text-red-400 border border-red-900/50 px-3 py-2 rounded-xl min-h-[44px] disabled:opacity-40"
              >
                Delete ({selected.size})
              </button>
            )}
          </div>
        </div>
      )}

      {/* FAB */}
      {!multiSelect && <AddFab onAdd={onAdd} />}
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
  const [lureType,        setLureType]        = useState(initial?.lureType ?? '')
  const [subType,         setSubType]         = useState(initial?.subType ?? '')
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

  const subTypeOptions = SUBTYPES[lureType] ?? []
  const showBladeConfig = BLADE_CONFIG_TYPES.includes(lureType)

  const applyAi = (s: LureIdentification) => {
    if (s.lureType) setLureType(s.lureType)
    if (s.color)    setColor(s.color)
    if (s.brand)    setBrand(s.brand)
    if (s.notes)    setNotes(s.notes ?? '')
  }

  const submit = async () => {
    if (!lureType.trim() || (!weightNA && !weight) || !color.trim()) return
    setSaving(true)
    const item: OwnedLure = {
      id:             initial?.id ?? nanoid(),
      category:       'lure',
      lureType:       lureType.trim(),
      subType:        subType.trim() || undefined,
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

  const canSave = lureType.trim() && (weightNA || weight) && color.trim() && !saving

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
          <FieldLabel>Lure Type *</FieldLabel>
          <input
            list="tackle-lure-types"
            className="w-full th-surface border th-border rounded-xl px-3 py-3 th-text text-base"
            placeholder="e.g. Spinnerbait, Crankbait…"
            value={lureType}
            onChange={e => { setLureType(e.target.value); setSubType('') }}
          />
          <datalist id="tackle-lure-types">
            {LURE_TYPES.map(t => <option key={t} value={t} />)}
          </datalist>
        </div>

        {subTypeOptions.length > 0 && (
          <div>
            <FieldLabel>Sub-type</FieldLabel>
            <ButtonGrid options={subTypeOptions} value={subType} onChange={setSubType} />
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
  const [hookStyle, setHookStyle] = useState<HookStyle | ''>(initial?.hookStyle ?? '')
  const [hookSize,  setHookSize]  = useState(initial?.hookSize ?? '')
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
      hookStyle: hookStyle as HookStyle,
      hookSize:  hookSize.trim() || undefined,
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

export default function Tackle({ settings }: Props) {
  const [items, setItems] = useState<OwnedLure[]>([])
  const [formView, setFormView] = useState<FormView | null>(null)

  useEffect(() => {
    getAllOwnedLures().then(setItems)
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
      onAdd={cat => setFormView({ mode: 'add', category: cat })}
      onEdit={item => setFormView({ mode: 'edit', item })}
      onDelete={handleDelete}
      onBulkDelete={handleBulkDelete}
      onExport={handleExport}
    />
  )
}
