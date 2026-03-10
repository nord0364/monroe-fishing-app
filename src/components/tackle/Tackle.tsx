import { useState, useEffect, useRef } from 'react'
import type {
  OwnedLure, TackleCategory, TackleOrigin, TackleCondition, HookStyle,
  AppSettings, Rod, RodType, RodPower, RodAction, RodLineType,
  SoftPlastic, SoftPlasticBodyStyle, SoftPlasticColorFamily,
  SoftPlasticRiggingStyle, SoftPlasticCondition,
} from '../../types'
import {
  getAllOwnedLures, saveOwnedLure, deleteOwnedLure, bulkDeleteOwnedLures,
  exportTackleJSON, getAllRods, saveRod, deleteRod,
  getAllSoftPlastics, saveSoftPlastic, deleteSoftPlastic,
} from '../../db/database'
import { nanoid } from '../logger/nanoid'
import {
  identifyLureForCatalog, identifyLureForScan, identifyHookFromImage, identifyRodFull,
  identifySoftPlastic,
  type LureIdentification, type LureScanResult, type HookIdentification, type RodScanResult,
} from '../../api/claude'
import { SP_BODY_STYLES, SP_COLOR_FAMILIES, SP_RIGGING_STYLES, SP_CONDITIONS } from '../../constants'

// ─── Rod constants ─────────────────────────────────────────────────────────────
const ROD_TYPES:      RodType[]    = ['Baitcasting', 'Spinning']
const ROD_POWERS:     RodPower[]   = ['Ultra Light', 'Light', 'Medium Light', 'Medium', 'Medium Heavy', 'Heavy', 'Extra Heavy']
const ROD_ACTIONS:    RodAction[]  = ['Slow', 'Moderate', 'Fast', 'Extra Fast']
const ROD_LINE_TYPES: RodLineType[] = ['Fluorocarbon', 'Monofilament', 'Braid', 'Braid with Fluorocarbon Leader']

// ─── Constants ────────────────────────────────────────────────────────────────

const LURE_CATEGORIES = [
  'Crankbait', 'Jerkbait', 'Jig', 'Spinnerbait', 'Chatterbait',
  'Spoon', 'Swimbait', 'Topwater', 'Other',
] as const
type LureCategoryOption = typeof LURE_CATEGORIES[number]

const JIG_SUBGROUPS = ['Casting Jig', 'Finesse Jig', 'Flipping Jig', 'Football Jig', 'Swim Jig', 'Other Jig'] as const
type JigSubgroup = typeof JIG_SUBGROUPS[number]

const LURE_DISPLAY_CATS = ['Crankbaits', 'Jerkbaits', 'Jigs', 'Spinnerbaits', 'Chatterbaits', 'Spoons', 'Swimbaits', 'Topwater', 'Other'] as const
type LureDisplayCat = typeof LURE_DISPLAY_CATS[number]

const HOOK_DISPLAY_CATS = ['Ned Rig Heads', 'Standard Hooks', 'Wacky Hooks', 'Weighted Hooks'] as const
type HookDisplayCat = typeof HOOK_DISPLAY_CATS[number]

const WEIGHT_OPTIONS = ['Weightless', '3/16 oz', '1/4 oz', '3/8 oz', '1/2 oz', '3/4 oz', '1 oz', 'Other']
const HOOK_STYLES: HookStyle[] = ['Worm Hook', 'EWG', 'Wacky', 'Ned', 'Drop Shot', 'Treble', 'Other']
const ORIGINS: TackleOrigin[] = ['Hand Poured by Me', 'Store Bought']
const CONDITIONS: TackleCondition[] = ['New', 'Good', 'Retired']
const BLADE_CONFIG_TYPES = ['Spinnerbait', 'Chatterbait']

// ─── View types ────────────────────────────────────────────────────────────────

type FormView =
  | { mode: 'scan-lure'; lureTypeHint?: string }
  | { mode: 'scan-hook'; hookStyleHint?: HookStyle; hookTypeHint?: 'standard' | 'weighted' }
  | { mode: 'scan-rod' }
  | { mode: 'add-lure'; lureTypeHint?: string; prefilled?: Partial<OwnedLure>; aiFields?: Set<string> }
  | { mode: 'add-hook'; hookStyleHint?: HookStyle; hookTypeHint?: 'standard' | 'weighted'; prefilled?: Partial<OwnedLure>; aiFields?: Set<string> }
  | { mode: 'add-rod'; prefilled?: Partial<Rod>; aiFields?: Set<string> }
  | { mode: 'edit'; item: OwnedLure }

type SpView =
  | { mode: 'scan' }
  | { mode: 'form'; prefilled?: Partial<SoftPlastic>; aiFields?: Set<string>; editSp?: SoftPlastic; scanNote?: string }

// ─── Routing helpers ───────────────────────────────────────────────────────────

function getLureCat(item: OwnedLure): LureDisplayCat {
  if (item.category === 'spoon') return 'Spoons'
  const t = item.lureType ?? ''
  if (t === 'Crankbait') return 'Crankbaits'
  if (t === 'Jerkbait') return 'Jerkbaits'
  if (t === 'Jig' || item.jigSubgroup || JIG_SUBGROUPS.includes(t as JigSubgroup)) return 'Jigs'
  if (t === 'Spinnerbait') return 'Spinnerbaits'
  if (t === 'Chatterbait') return 'Chatterbaits'
  if (t === 'Spoon') return 'Spoons'
  if (t === 'Swimbait') return 'Swimbaits'
  if (['Topwater', 'Buzzbait', 'Frog'].includes(t)) return 'Topwater'
  return 'Other'
}

function getHookCat(item: OwnedLure): HookDisplayCat {
  if (item.hookStyle === 'Ned') return 'Ned Rig Heads'
  if (item.hookStyle === 'Wacky') return 'Wacky Hooks'
  if (item.hookType === 'weighted') return 'Weighted Hooks'
  return 'Standard Hooks'
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

// ─── Reassignment helper ───────────────────────────────────────────────────────

function reassignItem(item: OwnedLure, targetCategory: string): OwnedLure {
  const base = { ...item }
  if (targetCategory === 'hook') {
    // Lure → Hook: clear all lure-specific fields
    base.category = 'hook'
    base.lureType = undefined
    base.jigSubgroup = undefined
    base.bladeConfig = undefined
    base.secondaryColor = undefined
    base.weightNA = undefined
    base.spoonStyle = undefined
  } else {
    // Any → Lure category: clear hook-specific fields
    base.category = targetCategory === 'Spoon' ? 'spoon' : 'lure'
    base.lureType = targetCategory
    base.hookStyle = undefined
    base.hookSize = undefined
    base.hookType = undefined
    if (targetCategory !== 'Jig') base.jigSubgroup = undefined
    if (!['Spinnerbait', 'Chatterbait'].includes(targetCategory)) base.bladeConfig = undefined
    if (targetCategory !== 'Spoon') base.spoonStyle = undefined
  }
  return base
}

// ─── Color helpers ─────────────────────────────────────────────────────────────

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

const SP_COLOR_HEX: Record<string, string> = {
  'Black and Blue': '#1e1b4b',
  'Brown': '#92400e',
  'Chartreuse': '#a3e635',
  'Green Pumpkin': '#4a5c2a',
  'Natural': '#c4a882',
  'Smoke': '#9ca3af',
  'Watermelon': '#f43f5e',
  'White': '#f5f5f5',
  'Other': '#6b7280',
}

function spColorHex(sp: SoftPlastic): string {
  if (sp.colorFamily && SP_COLOR_HEX[sp.colorFamily]) return SP_COLOR_HEX[sp.colorFamily]
  if (sp.colorName) return colorToHex(sp.colorName)
  return '#6b7280'
}

// ─── resizePhoto ───────────────────────────────────────────────────────────────

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

// ─── Badge / primitive components ────────────────────────────────────────────

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

// ─── ItemCard (legacy grid view — kept for reference) ─────────────────────────

interface ItemCardProps {
  item: OwnedLure
  multiSelect: boolean
  selected: boolean
  onToggleSelect: () => void
  onEdit: () => void
  onDelete: () => void
  onLongPress: () => void
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
// @ts-expect-error -- kept for reference, not currently rendered
function ItemCard({ item, multiSelect, selected, onToggleSelect, onEdit, onDelete, onLongPress }: ItemCardProps) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cat = effectiveCategory(item)
  const isRetired = item.condition === 'Retired'

  const handlePointerDown = () => {
    longPressTimer.current = setTimeout(() => { onLongPress() }, 500)
  }
  const handlePointerUp = () => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null }
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
              {[item.hookSize ? `Size ${item.hookSize}` : '', item.weight || ''].filter(Boolean).join(' · ')}
            </div>
            {item.brand && <div className="th-text-muted text-xs">{item.brand}</div>}
            {item.quantity !== undefined && item.quantity > 0 && (
              <div className="flex gap-1 mt-1">
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-900/30 text-blue-400">Qty: {item.quantity}</span>
              </div>
            )}
          </>
        )}
        {cat === 'spoon' && (
          <>
            <div className="th-text font-semibold text-sm leading-tight">{item.lureType ?? 'Spoon'}</div>
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
            <DeleteConfirmRow onConfirm={onDelete} onCancel={() => setConfirmDelete(false)} />
          ) : (
            <>
              <button onClick={onEdit} className="text-xs th-accent-text px-2 py-1 min-w-[44px] min-h-[36px] text-center">Edit</button>
              <button onClick={() => setConfirmDelete(true)} className="text-xs text-red-400 px-2 py-1 min-w-[44px] min-h-[36px] text-center">Delete</button>
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

// ─── Field primitives ──────────────────────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-xs th-text-muted mb-1 font-medium uppercase tracking-wide">
      {children}
    </label>
  )
}

function TextInput({
  value, onChange, placeholder,
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
  options, value, onChange, renderLabel,
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

// ─── PhotoSection ─────────────────────────────────────────────────────────────

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
            <div className="w-20 h-20 rounded-xl th-surface-deep flex items-center justify-center text-3xl">📸</div>
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
            <button onClick={() => { setPhoto(''); setSuggestion(null) }} className="text-xs text-red-400 text-left">
              Remove photo
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhoto} />
        </div>
      </div>

      {suggestion && !analyzing && (
        <div className="th-surface-deep border th-border rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="th-text text-xs font-semibold">
              AI Identified{' '}
              <span className={`font-normal ${suggestion.confidence === 'High' ? 'text-green-400' : suggestion.confidence === 'Medium' ? 'text-amber-400' : 'text-red-400'}`}>
                ({suggestion.confidence} confidence)
              </span>
            </span>
            <button onClick={() => setSuggestion(null)} className="text-xs th-text-muted px-1 min-h-[36px]">✕</button>
          </div>
          <div className="th-text text-sm">
            {suggestion.lureType && <span>{suggestion.lureType}</span>}
            {suggestion.color && <span className="th-accent-text"> · {suggestion.color}</span>}
            {suggestion.brand && <span className="th-text-muted"> · {suggestion.brand}</span>}
          </div>
          {suggestion.notes && <div className="th-text-muted text-xs italic">{suggestion.notes}</div>}
          <p className="th-text-muted text-xs">Review and adjust — color descriptions are AI-generated.</p>
          <div className="flex gap-2 pt-0.5">
            <button onClick={applyAndClose} className="flex-1 py-2 th-btn-primary rounded-lg text-xs font-semibold min-h-[44px]">Use These Values</button>
            <button onClick={() => setSuggestion(null)} className="flex-1 py-2 th-surface border th-border rounded-lg text-xs th-text min-h-[44px]">Enter Manually</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── DenseRow ─────────────────────────────────────────────────────────────────

function DenseRow({ item, onEdit, onDelete, multiSelect, selected, onToggleSelect, onLongPress }: {
  item: OwnedLure
  onEdit: () => void
  onDelete: () => void
  multiSelect?: boolean
  selected?: boolean
  onToggleSelect?: () => void
  onLongPress?: () => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cat = effectiveCategory(item)

  const primaryLabel = cat === 'hook'
    ? (item.hookStyle ?? 'Hook')
    : cat === 'spoon'
      ? (item.lureType ?? 'Spoon')
      : item.lureType === 'Jig' && item.jigSubgroup
        ? item.jigSubgroup
        : (item.lureType ?? 'Lure')

  const colorLabel = item.color || ''
  const hex = colorToHex(colorLabel)
  const weightLabel = item.weightNA ? 'N/A' : (item.weight ?? '')
  const sub = [weightLabel, item.brand].filter(Boolean).join(' · ')

  const handlePointerDown = () => {
    if (multiSelect) return
    longPressTimer.current = setTimeout(() => { onLongPress?.() }, 500)
  }
  const cancelLongPress = () => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null }
  }

  return (
    <div
      className={`flex items-center gap-2 pl-9 pr-3 py-2 min-h-[44px] ${item.condition === 'Retired' ? 'opacity-50' : ''} ${selected ? 'bg-[color:var(--th-accent)]/10' : ''}`}
      onPointerDown={handlePointerDown}
      onPointerUp={cancelLongPress}
      onPointerLeave={cancelLongPress}
      onClick={multiSelect ? onToggleSelect : undefined}
    >
      {multiSelect ? (
        <span className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${selected ? 'bg-[color:var(--th-accent-text)] border-[color:var(--th-accent-text)]' : 'border-[color:var(--th-border)]'}`}>
          {selected && <span className="text-white text-xs leading-none">✓</span>}
        </span>
      ) : (
        <span style={{ width: 10, height: 10, borderRadius: 2, flexShrink: 0, background: hex, border: '1px solid rgba(128,128,128,0.4)' }} />
      )}
      {item.photoDataUrl && !multiSelect && (
        <img src={item.photoDataUrl} className="w-8 h-8 rounded-md object-cover shrink-0" alt="" />
      )}
      <div className="flex-1 min-w-0">
        <div className="th-text text-sm font-medium leading-tight truncate">
          {primaryLabel}{colorLabel ? ` · ${colorLabel}` : ''}
        </div>
        {sub && <div className="th-text-muted text-xs leading-tight truncate">{sub}</div>}
      </div>
      {item.origin === 'Hand Poured by Me' && (
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-900/40 text-amber-300 shrink-0 leading-tight">🫗</span>
      )}
      {item.condition === 'New' && (
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-900/30 text-emerald-400 shrink-0 leading-tight">New</span>
      )}
      {item.condition === 'Retired' && (
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-900/30 text-red-400 shrink-0 leading-tight">Ret</span>
      )}
      {!multiSelect && (
        <>
          <button onClick={e => { e.stopPropagation(); onEdit() }} className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg th-text-muted text-xs opacity-50 active:opacity-100">✎</button>
          {confirmDelete ? (
            <div className="flex gap-1 shrink-0">
              <button onClick={e => { e.stopPropagation(); onDelete(); setConfirmDelete(false) }} className="text-white bg-red-700 text-xs px-2 py-1 rounded-lg min-h-[32px]">Del</button>
              <button onClick={e => { e.stopPropagation(); setConfirmDelete(false) }} className="th-text-muted text-xs px-1 py-1 border th-border rounded-lg min-h-[32px]">✕</button>
            </div>
          ) : (
            <button onClick={e => { e.stopPropagation(); setConfirmDelete(true) }} className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg th-text-muted opacity-30 active:opacity-100 text-sm">✕</button>
          )}
        </>
      )}
    </div>
  )
}

// ─── SpRow ────────────────────────────────────────────────────────────────────

function SpRow({ sp, onEdit, onDelete }: {
  sp: SoftPlastic
  onEdit: () => void
  onDelete: () => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const hex = spColorHex(sp)
  const isOut = sp.condition === 'Out'
  const isLow = sp.condition === 'Low Stock'
  const displayName = sp.productName ?? sp.bodyStyle ?? 'Soft Plastic'
  const sub = [sp.bodyStyle, sp.sizeInches != null ? `${sp.sizeInches}"` : null].filter(Boolean).join(' · ')
  return (
    <div className={`flex items-center gap-2 px-3 py-2 min-h-[44px] ${isOut ? 'opacity-50' : ''}`}>
      <span style={{ width: 10, height: 10, borderRadius: 2, flexShrink: 0, background: hex, border: '1px solid rgba(128,128,128,0.4)' }} />
      <div className="flex-1 min-w-0">
        <div className="th-text text-sm font-medium leading-tight truncate">{displayName}</div>
        {sub && <div className="th-text-muted text-xs leading-tight truncate">{sub}</div>}
      </div>
      {sp.quantity != null && (
        <span className="text-xs th-text-muted shrink-0">×{sp.quantity}</span>
      )}
      {isLow && (
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-900/40 text-amber-300 shrink-0">Low</span>
      )}
      <button onClick={onEdit} className="shrink-0 w-8 h-8 flex items-center justify-center th-text-muted text-xs opacity-50 active:opacity-100">✎</button>
      {confirmDelete ? (
        <div className="flex gap-1 shrink-0">
          <button onClick={() => { onDelete(); setConfirmDelete(false) }} className="text-white bg-red-700 text-xs px-2 py-1 rounded-lg min-h-[32px]">Del</button>
          <button onClick={() => setConfirmDelete(false)} className="th-text-muted text-xs px-1 py-1 border th-border rounded-lg min-h-[32px]">✕</button>
        </div>
      ) : (
        <button onClick={() => setConfirmDelete(true)} className="shrink-0 w-8 h-8 flex items-center justify-center th-text-muted opacity-30 active:opacity-100 text-sm">✕</button>
      )}
    </div>
  )
}

// ─── RodRow ───────────────────────────────────────────────────────────────────

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
      {rod.notes && <p className="th-text-muted text-xs italic mt-0.5">{rod.notes}</p>}
    </div>
  )
}

// ─── RodForm ──────────────────────────────────────────────────────────────────

function RodForm({ initial, prefilled, aiFields, onSave, onCancel }: {
  initial?: Rod
  prefilled?: Partial<Rod>
  aiFields?: Set<string>
  onSave: (rod: Rod) => void
  onCancel: () => void
}) {
  const [nickname,      setNickname]      = useState(initial?.nickname ?? prefilled?.nickname ?? '')
  const [rodType,       setRodType]       = useState<RodType | undefined>(initial?.rodType ?? prefilled?.rodType)
  const [lengthFt,      setLengthFt]      = useState(initial?.lengthFt != null ? String(initial.lengthFt) : prefilled?.lengthFt != null ? String(prefilled.lengthFt) : '')
  const [lengthIn,      setLengthIn]      = useState(initial?.lengthIn != null ? String(initial.lengthIn) : prefilled?.lengthIn != null ? String(prefilled.lengthIn) : '')
  const [power,         setPower]         = useState<RodPower | undefined>(initial?.power ?? prefilled?.power as RodPower | undefined)
  const [action,        setAction]        = useState<RodAction | undefined>(initial?.action ?? prefilled?.action as RodAction | undefined)
  const [lineType,      setLineType]      = useState<RodLineType | undefined>(initial?.lineType)
  const [lineWeightLbs, setLineWeightLbs] = useState(initial?.lineWeightLbs != null ? String(initial.lineWeightLbs) : prefilled?.lineWeightLbs != null ? String(prefilled.lineWeightLbs) : '')
  const [lureMinOz,     setLureMinOz]     = useState(initial?.lureWeightMinOz != null ? String(initial.lureWeightMinOz) : prefilled?.lureWeightMinOz != null ? String(prefilled.lureWeightMinOz) : '')
  const [lureMaxOz,     setLureMaxOz]     = useState(initial?.lureWeightMaxOz != null ? String(initial.lureWeightMaxOz) : prefilled?.lureWeightMaxOz != null ? String(prefilled.lureWeightMaxOz) : '')
  const [reelName,      setReelName]      = useState(initial?.reelName ?? prefilled?.reelName ?? '')
  const [notes,         setNotes]         = useState(initial?.notes ?? '')
  const [saving,        setSaving]        = useState(false)

  const aiLabel = (key: string) => aiFields?.has(key)
    ? <span className="text-[10px] th-accent-text font-semibold ml-1">✦ AI</span>
    : null

  const submit = async () => {
    if (!nickname.trim()) return
    setSaving(true)
    const rod: Rod = {
      id:              initial?.id ?? nanoid(),
      nickname:        nickname.trim(),
      rodType,
      lengthFt:        parseFloat(lengthFt) || undefined,
      lengthIn:        parseFloat(lengthIn) || undefined,
      power,
      action,
      lineType,
      lineWeightLbs:   parseFloat(lineWeightLbs) || undefined,
      lureWeightMinOz: parseFloat(lureMinOz) || undefined,
      lureWeightMaxOz: parseFloat(lureMaxOz) || undefined,
      reelName:        reelName.trim() || undefined,
      notes:           notes.trim() || undefined,
      addedAt:         initial?.addedAt ?? Date.now(),
    }
    await saveRod(rod)
    onSave(rod)
  }


  return (
    <div className="p-4 pb-32 max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={onCancel} className="th-accent-text text-sm">← Cancel</button>
        <h2 className="th-text font-bold text-lg flex-1">{initial ? 'Edit Rod' : 'Add Rod'}</h2>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-xs th-text-muted mb-1 font-medium uppercase tracking-wide">Nickname *{aiLabel('nickname')}</label>
          <input className="w-full th-surface border th-border rounded-xl px-3 py-3 th-text text-base"
            placeholder='e.g. "Heavy Baitcaster", "Finesse Spinning"'
            value={nickname} onChange={e => setNickname(e.target.value)} />
        </div>

        <div>
          <label className="block text-xs th-text-muted mb-1.5 font-medium uppercase tracking-wide">Rod Type{aiLabel('rodType')}</label>
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

        <div>
          <label className="block text-xs th-text-muted mb-1.5 font-medium uppercase tracking-wide">Length{aiLabel('lengthFt')}</label>
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

        <div>
          <label className="block text-xs th-text-muted mb-1.5 font-medium uppercase tracking-wide">Power{aiLabel('power')}</label>
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

        <div>
          <label className="block text-xs th-text-muted mb-1.5 font-medium uppercase tracking-wide">Action{aiLabel('action')}</label>
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

        <div>
          <label className="block text-xs th-text-muted mb-1 font-medium uppercase tracking-wide">Line Weight (lb){aiLabel('lineWeightLbs')}</label>
          <input type="number" className="w-full th-surface border th-border rounded-xl px-3 py-3 th-text text-base"
            placeholder="e.g. 15" value={lineWeightLbs} onChange={e => setLineWeightLbs(e.target.value)} />
        </div>

        <div>
          <label className="block text-xs th-text-muted mb-1.5 font-medium uppercase tracking-wide">Lure Weight Range (oz){aiLabel('lureWeightMinOz')}</label>
          <div className="flex gap-2 items-center">
            <input type="number" step="0.0625" className="flex-1 th-surface border th-border rounded-xl px-3 py-3 th-text text-base"
              placeholder="Min" value={lureMinOz} onChange={e => setLureMinOz(e.target.value)} />
            <span className="th-text-muted text-sm">–</span>
            <input type="number" step="0.0625" className="flex-1 th-surface border th-border rounded-xl px-3 py-3 th-text text-base"
              placeholder="Max" value={lureMaxOz} onChange={e => setLureMaxOz(e.target.value)} />
          </div>
        </div>

        <div>
          <label className="block text-xs th-text-muted mb-1 font-medium uppercase tracking-wide">Reel Name / Model (optional){aiLabel('reelName')}</label>
          <input className="w-full th-surface border th-border rounded-xl px-3 py-3 th-text text-base"
            placeholder="e.g. Shimano Curado 200K" value={reelName} onChange={e => setReelName(e.target.value)} />
        </div>

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

// ─── ReassignModal ────────────────────────────────────────────────────────────

const REASSIGN_LURE_CATS = [...LURE_CATEGORIES] as string[]
const REASSIGN_HOOK_LABEL = 'Hooks'

function ReassignModal({ currentCategory, onSelect, onClose }: {
  currentCategory: string
  onSelect: (cat: string) => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-lg th-surface rounded-t-2xl border th-border p-4 pb-10 space-y-3"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="th-text font-semibold text-base">Move to Category</h3>
          <button onClick={onClose} className="th-text-muted text-base w-8 h-8 flex items-center justify-center">✕</button>
        </div>
        <div className="flex flex-wrap gap-2">
          {REASSIGN_LURE_CATS.map(cat => (
            <button
              key={cat}
              onClick={() => onSelect(cat)}
              disabled={cat === currentCategory}
              className={`px-3 py-2 rounded-xl text-sm border min-h-[40px] ${
                cat === currentCategory
                  ? 'opacity-40 th-surface th-text border-[color:var(--th-border)]'
                  : 'th-surface-deep th-text border-[color:var(--th-border)] active:opacity-70'
              }`}
            >{cat}</button>
          ))}
          <button
            key="hook"
            onClick={() => onSelect('hook')}
            disabled={currentCategory === 'hook'}
            className={`px-3 py-2 rounded-xl text-sm border min-h-[40px] ${
              currentCategory === 'hook'
                ? 'opacity-40 th-surface th-text border-[color:var(--th-border)]'
                : 'th-surface-deep th-text border-[color:var(--th-border)] active:opacity-70'
            }`}
          >{REASSIGN_HOOK_LABEL}</button>
        </div>
      </div>
    </div>
  )
}

// ─── LureForm ─────────────────────────────────────────────────────────────────

interface LureFormProps {
  initial?: OwnedLure
  apiKey?: string
  lureTypeHint?: string
  prefilled?: Partial<OwnedLure>
  aiFields?: Set<string>
  onSave: (item: OwnedLure) => void
  onCancel: () => void
  onReassign?: (item: OwnedLure) => void
}

function LureForm({ initial, apiKey, lureTypeHint, prefilled, aiFields, onSave, onCancel, onReassign }: LureFormProps) {
  const [lureCategory, setLureCategory] = useState<string>(() => {
    if (initial) {
      const t = initial.lureType ?? ''
      if (initial.category === 'spoon' || t === 'Spoon') return 'Spoon'
      if (['Swim Jig', 'Football Jig', 'Flipping Jig', 'Casting Jig', 'Finesse Jig'].includes(t)) return 'Jig'
      if (LURE_CATEGORIES.includes(t as LureCategoryOption)) return t
      return t || ''
    }
    return lureTypeHint ?? ''
  })
  const [jigSubgroup, setJigSubgroup] = useState<string>(() => {
    if (!initial) return prefilled?.jigSubgroup ?? ''
    if (initial.jigSubgroup) return initial.jigSubgroup
    const t = initial.lureType ?? ''
    if (['Swim Jig', 'Football Jig', 'Flipping Jig', 'Casting Jig', 'Finesse Jig'].includes(t)) return t
    return ''
  })
  const [otherTypeText, setOtherTypeText] = useState<string>(() => {
    if (!initial) return ''
    const t = initial.lureType ?? ''
    if (LURE_CATEGORIES.includes(t as LureCategoryOption)) return ''
    if (['Swim Jig', 'Football Jig', 'Flipping Jig', 'Casting Jig', 'Finesse Jig'].includes(t)) return ''
    return t
  })
  const [weight,         setWeight]         = useState(initial?.weight ?? prefilled?.weight ?? '')
  const [weightNA,       setWeightNA]       = useState(initial?.weightNA ?? false)
  const [color,          setColor]          = useState(initial?.color ?? prefilled?.color ?? '')
  const [secondaryColor, setSecondaryColor] = useState(initial?.secondaryColor ?? prefilled?.secondaryColor ?? '')
  const [bladeConfig,    setBladeConfig]    = useState(initial?.bladeConfig ?? prefilled?.bladeConfig ?? '')
  const [brand,          setBrand]          = useState(initial?.brand ?? prefilled?.brand ?? '')
  const [origin,         setOrigin]         = useState<TackleOrigin | ''>(initial?.origin ?? '')
  const [condition,      setCondition]      = useState<TackleCondition | ''>(initial?.condition ?? '')
  const [notes,          setNotes]          = useState(initial?.notes ?? prefilled?.notes ?? '')
  const [photo,          setPhoto]          = useState(initial?.photoDataUrl ?? '')
  const [saving,         setSaving]         = useState(false)
  const [showReassign,   setShowReassign]   = useState(false)

  const aiLabel = (key: string) => aiFields?.has(key)
    ? <span className="text-[10px] th-accent-text font-semibold ml-1">✦ AI</span>
    : null

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
      {showReassign && initial && (
        <ReassignModal
          currentCategory={initial.lureType ?? (effectiveCategory(initial) === 'hook' ? 'hook' : '')}
          onSelect={cat => {
            const reassigned = reassignItem(initial, cat)
            setShowReassign(false)
            onReassign?.(reassigned)
          }}
          onClose={() => setShowReassign(false)}
        />
      )}

      <div className="flex items-center gap-3">
        <button onClick={onCancel} className="th-accent-text text-sm min-h-[44px] px-1">← Cancel</button>
        <h2 className="th-text font-bold text-lg flex-1">{initial ? 'Edit Lure' : 'Add Lure'}</h2>
        {initial && onReassign && (
          <button onClick={() => setShowReassign(true)} className="text-xs th-text-muted border th-border px-2 py-1 rounded-xl min-h-[36px]">
            Move to…
          </button>
        )}
      </div>

      <div className="th-surface rounded-2xl border th-border p-4 space-y-3">
        <p className="section-label">Photo</p>
        <PhotoSection photo={photo} setPhoto={setPhoto} apiKey={apiKey} onAiSuggestion={applyAi} />
      </div>

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
                  lureCategory === cat ? 'th-btn-selected border-transparent' : 'th-surface th-text border-[color:var(--th-border)]'
                }`}
              >{cat}</button>
            ))}
          </div>
        </div>

        {showOtherText && (
          <div>
            <FieldLabel>Type Name *</FieldLabel>
            <TextInput value={otherTypeText} onChange={setOtherTypeText} placeholder="e.g. Glide Bait, Bladed Jig…" />
          </div>
        )}

        {showJigSubgroup && (
          <div>
            <FieldLabel>Jig Type *{aiLabel('jigSubgroup')}</FieldLabel>
            <div className="flex flex-wrap gap-2">
              {JIG_SUBGROUPS.map(sub => (
                <button
                  key={sub}
                  onClick={() => setJigSubgroup(sub)}
                  className={`px-3 py-2 rounded-xl text-sm border min-h-[44px] ${
                    jigSubgroup === sub ? 'th-btn-selected border-transparent' : 'th-surface th-text border-[color:var(--th-border)]'
                  }`}
                >{sub}</button>
              ))}
            </div>
          </div>
        )}

        {showBladeConfig && (
          <div>
            <FieldLabel>Blade Config{aiLabel('bladeConfig')}</FieldLabel>
            <TextInput value={bladeConfig} onChange={setBladeConfig} placeholder='e.g. "Colorado + Willow", "double willow"' />
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-1">
            <FieldLabel>Weight{weightNA ? '' : ' *'}{aiLabel('weight')}</FieldLabel>
            <button
              onClick={() => setWeightNA(v => !v)}
              className={`text-xs px-2 py-1 rounded-lg border min-h-[36px] ${
                weightNA ? 'th-btn-selected border-transparent' : 'th-surface th-text border-[color:var(--th-border)]'
              }`}
            >N/A</button>
          </div>
          {!weightNA && (
            <div className="flex flex-wrap gap-2">
              {WEIGHT_OPTIONS.map(w => (
                <button
                  key={w}
                  onClick={() => setWeight(w)}
                  className={`px-3 py-2 rounded-xl text-sm border min-h-[44px] ${
                    weight === w ? 'th-btn-selected border-transparent' : 'th-surface th-text border-[color:var(--th-border)]'
                  }`}
                >{w}</button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="th-surface rounded-2xl border th-border p-4 space-y-4">
        <p className="section-label">Color</p>
        <div>
          <FieldLabel>Primary Color *{aiLabel('color')}</FieldLabel>
          <TextInput value={color} onChange={setColor} placeholder="e.g. White/Chartreuse, Green Pumpkin" />
        </div>
        <div>
          <FieldLabel>Secondary Color / Accent{aiLabel('secondaryColor')}</FieldLabel>
          <TextInput value={secondaryColor} onChange={setSecondaryColor} placeholder="e.g. Red Trailer, Silver Flake" />
        </div>
      </div>

      <div className="th-surface rounded-2xl border th-border p-4 space-y-4">
        <p className="section-label">Origin & Condition</p>
        <div>
          <FieldLabel>Brand{aiLabel('brand')}</FieldLabel>
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
                  origin === o ? 'th-btn-selected border-transparent' : 'th-surface th-text border-[color:var(--th-border)]'
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
        <FieldLabel>Notes{aiLabel('notes')}</FieldLabel>
        <TextInput value={notes} onChange={setNotes} placeholder="e.g. works best slow-rolled with trailer" />
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

// ─── HookForm ─────────────────────────────────────────────────────────────────

interface HookFormProps {
  initial?: OwnedLure
  hookStyleHint?: HookStyle
  hookTypeHint?: 'standard' | 'weighted'
  prefilled?: Partial<OwnedLure>
  aiFields?: Set<string>
  onSave: (item: OwnedLure) => void
  onCancel: () => void
  onReassign?: (item: OwnedLure) => void
}

function HookForm({ initial, hookStyleHint, hookTypeHint, prefilled, aiFields, onSave, onCancel, onReassign }: HookFormProps) {
  const [hookType,  setHookType]  = useState<'standard' | 'weighted' | ''>(initial?.hookType ?? prefilled?.hookType ?? hookTypeHint ?? '')
  const [hookStyle, setHookStyle] = useState<HookStyle | ''>(initial?.hookStyle ?? prefilled?.hookStyle ?? hookStyleHint ?? '')
  const [hookSize,  setHookSize]  = useState(initial?.hookSize ?? prefilled?.hookSize ?? '')
  const [weight,    setWeight]    = useState(initial?.weight ?? '')
  const [brand,     setBrand]     = useState(initial?.brand ?? prefilled?.brand ?? '')
  const [quantity,  setQuantity]  = useState<string>(
    initial?.quantity !== undefined ? String(initial.quantity) : prefilled?.quantity !== undefined ? String(prefilled.quantity) : ''
  )
  const [notes,        setNotes]        = useState(initial?.notes ?? prefilled?.notes ?? '')
  const [saving,       setSaving]       = useState(false)
  const [showReassign, setShowReassign] = useState(false)

  const aiLabel = (key: string) => aiFields?.has(key)
    ? <span className="text-[10px] th-accent-text font-semibold ml-1">✦ AI</span>
    : null

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
      {showReassign && initial && (
        <ReassignModal
          currentCategory="hook"
          onSelect={cat => {
            const reassigned = reassignItem(initial, cat)
            setShowReassign(false)
            onReassign?.(reassigned)
          }}
          onClose={() => setShowReassign(false)}
        />
      )}

      <div className="flex items-center gap-3">
        <button onClick={onCancel} className="th-accent-text text-sm min-h-[44px] px-1">← Cancel</button>
        <h2 className="th-text font-bold text-lg flex-1">{initial ? 'Edit Hook' : 'Add Hook'}</h2>
        {initial && onReassign && (
          <button onClick={() => setShowReassign(true)} className="text-xs th-text-muted border th-border px-2 py-1 rounded-xl min-h-[36px]">
            Move to…
          </button>
        )}
      </div>

      <div className="th-surface rounded-2xl border th-border p-4 space-y-4">
        <p className="section-label">Hook Details</p>

        <div>
          <FieldLabel>Hook Type{aiLabel('hookType')}</FieldLabel>
          <div className="flex gap-2">
            {(['standard', 'weighted'] as const).map(ht => (
              <button
                key={ht}
                onClick={() => setHookType(ht)}
                className={`flex-1 py-2.5 rounded-xl text-sm border min-h-[44px] capitalize ${
                  hookType === ht ? 'th-btn-selected border-transparent' : 'th-surface th-text border-[color:var(--th-border)]'
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
                    weight === w ? 'th-btn-selected border-transparent' : 'th-surface th-text border-[color:var(--th-border)]'
                  }`}
                >{w}</button>
              ))}
            </div>
          </div>
        )}

        <div>
          <FieldLabel>Hook Style *{aiLabel('hookStyle')}</FieldLabel>
          <ButtonGrid options={HOOK_STYLES} value={hookStyle} onChange={setHookStyle} />
        </div>

        <div>
          <FieldLabel>Hook Size{aiLabel('hookSize')}</FieldLabel>
          <TextInput value={hookSize} onChange={setHookSize} placeholder='e.g. 3/0, 5/0, #4' />
        </div>

        <div>
          <FieldLabel>Brand{aiLabel('brand')}</FieldLabel>
          <TextInput value={brand} onChange={setBrand} placeholder="e.g. Gamakatsu, Owner" />
        </div>

        <div>
          <FieldLabel>Quantity{aiLabel('quantity')}</FieldLabel>
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
        <FieldLabel>Notes{aiLabel('notes')}</FieldLabel>
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

// ─── SoftPlasticScanFlow ──────────────────────────────────────────────────────

interface SoftPlasticScanFlowProps {
  apiKey?: string
  onComplete: (prefilled?: Partial<SoftPlastic>, aiFields?: Set<string>, note?: string) => void
  onSkip: () => void
  onCancel: () => void
}

function SoftPlasticScanFlow({ apiKey, onComplete, onSkip, onCancel }: SoftPlasticScanFlowProps) {
  const [scanning, setScanning] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (apiKey) {
      const timer = setTimeout(() => { fileRef.current?.click() }, 200)
      return () => clearTimeout(timer)
    }
  }, [apiKey])

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    if (!apiKey) {
      onSkip()
      return
    }

    setScanning(true)
    try {
      const dataUrl = await resizePhoto(file)
      const result = await identifySoftPlastic(apiKey, dataUrl)
      const prefilled: Partial<SoftPlastic> = {}
      const aiFields = new Set<string>()
      const fields = ['brand', 'productName', 'bodyStyle', 'sizeInches', 'colorName', 'colorFamily', 'quantity', 'hookSizeRecommendation', 'handPoured', 'riggingStyles'] as const
      for (const key of fields) {
        const field = result[key as keyof typeof result]
        if (field && (field.confidence === 'high' || field.confidence === 'medium')) {
          ;(prefilled as Record<string, unknown>)[key] = field.value
          aiFields.add(key)
        }
      }
      onComplete(prefilled, aiFields)
    } catch {
      onComplete(undefined, undefined, 'Scan failed — enter details manually.')
    }
  }

  if (scanning) {
    return (
      <div className="fixed inset-0 z-50 th-surface flex flex-col items-center justify-center gap-4">
        <div className="text-4xl animate-pulse">🔍</div>
        <p className="th-text text-lg font-semibold">Analyzing image…</p>
        <p className="th-text-muted text-sm">Claude is reading the packaging</p>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 th-surface flex flex-col items-center justify-center gap-6 px-6 text-center">
      <button
        onClick={onCancel}
        className="absolute top-4 left-4 th-accent-text text-sm min-h-[44px] px-2"
      >
        ← Cancel
      </button>

      <div className="text-5xl">📦</div>
      <div>
        <h2 className="th-text text-xl font-bold mb-2">Point at the packaging or the bait</h2>
        <p className="th-text-muted text-sm">Claude will auto-fill the details from your photo</p>
      </div>

      <button
        onClick={() => fileRef.current?.click()}
        className="w-full max-w-xs py-4 th-btn-primary rounded-2xl font-semibold text-base min-h-[56px]"
      >
        📷 Take Photo
      </button>

      <button
        onClick={onSkip}
        className="th-text-muted text-sm min-h-[44px]"
      >
        Skip — enter manually
      </button>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFile}
      />
    </div>
  )
}

// ─── LureScanFlow ─────────────────────────────────────────────────────────────

interface LureScanFlowProps {
  lureTypeHint?: string
  apiKey?: string
  onComplete: (prefilled?: Partial<OwnedLure>, aiFields?: Set<string>) => void
  onSkip: () => void
  onCancel: () => void
}

function LureScanFlow({ lureTypeHint, apiKey, onComplete, onSkip, onCancel }: LureScanFlowProps) {
  const [scanning, setScanning] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (apiKey) {
      const timer = setTimeout(() => { fileRef.current?.click() }, 200)
      return () => clearTimeout(timer)
    }
  }, [apiKey])

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    if (!apiKey) { onSkip(); return }

    setScanning(true)
    try {
      const dataUrl = await resizePhoto(file)
      const result: LureScanResult = await identifyLureForScan(apiKey, dataUrl, lureTypeHint)
      const prefilled: Partial<OwnedLure> = {}
      const aiFields = new Set<string>()
      if (result.color)         { prefilled.color = result.color; aiFields.add('color') }
      if (result.secondaryColor){ prefilled.secondaryColor = result.secondaryColor; aiFields.add('secondaryColor') }
      if (result.weight)        { prefilled.weight = result.weight; aiFields.add('weight') }
      if (result.brand)         { prefilled.brand = result.brand; aiFields.add('brand') }
      if (result.jigSubgroup)   { prefilled.jigSubgroup = result.jigSubgroup; aiFields.add('jigSubgroup') }
      if (result.bladeConfig)   { prefilled.bladeConfig = result.bladeConfig; aiFields.add('bladeConfig') }
      if (result.notes)         { prefilled.notes = result.notes; aiFields.add('notes') }
      onComplete(prefilled, aiFields)
    } catch {
      onComplete()
    }
  }

  const label = lureTypeHint ?? 'Lure'

  if (scanning) {
    return (
      <div className="fixed inset-0 z-50 th-surface flex flex-col items-center justify-center gap-4">
        <div className="text-4xl animate-pulse">🔍</div>
        <p className="th-text text-lg font-semibold">Analyzing image…</p>
        <p className="th-text-muted text-sm">Claude is reading the lure</p>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 th-surface flex flex-col items-center justify-center gap-6 px-6 text-center">
      <button onClick={onCancel} className="absolute top-4 left-4 th-accent-text text-sm min-h-[44px] px-2">← Cancel</button>
      <div className="text-5xl">🎣</div>
      <div>
        <h2 className="th-text text-xl font-bold mb-2">Point at the {label}</h2>
        <p className="th-text-muted text-sm">Claude will auto-fill color, weight, and brand from your photo</p>
      </div>
      <button onClick={() => fileRef.current?.click()} className="w-full max-w-xs py-4 th-btn-primary rounded-2xl font-semibold text-base min-h-[56px]">
        Take Photo
      </button>
      <button onClick={onSkip} className="th-text-muted text-sm min-h-[44px]">Skip — enter manually</button>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
    </div>
  )
}

// ─── HookScanFlow ─────────────────────────────────────────────────────────────

interface HookScanFlowProps {
  hookStyleHint?: HookStyle
  hookTypeHint?: 'standard' | 'weighted'
  apiKey?: string
  onComplete: (prefilled?: Partial<OwnedLure>, aiFields?: Set<string>) => void
  onSkip: () => void
  onCancel: () => void
}

function HookScanFlow({ hookStyleHint: _hookStyleHint, hookTypeHint: _hookTypeHint, apiKey, onComplete, onSkip, onCancel }: HookScanFlowProps) {
  const [scanning, setScanning] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (apiKey) {
      const timer = setTimeout(() => { fileRef.current?.click() }, 200)
      return () => clearTimeout(timer)
    }
  }, [apiKey])

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    if (!apiKey) { onSkip(); return }

    setScanning(true)
    try {
      const dataUrl = await resizePhoto(file)
      const result: HookIdentification = await identifyHookFromImage(apiKey, dataUrl)
      const prefilled: Partial<OwnedLure> = { color: '', category: 'hook' }
      const aiFields = new Set<string>()
      if (result.hookStyle) { prefilled.hookStyle = result.hookStyle; aiFields.add('hookStyle') }
      if (result.hookType)  { prefilled.hookType  = result.hookType;  aiFields.add('hookType') }
      if (result.hookSize)  { prefilled.hookSize  = result.hookSize;  aiFields.add('hookSize') }
      if (result.brand)     { prefilled.brand     = result.brand;     aiFields.add('brand') }
      if (result.quantity != null) { prefilled.quantity = result.quantity; aiFields.add('quantity') }
      if (result.notes)     { prefilled.notes     = result.notes;     aiFields.add('notes') }
      onComplete(prefilled, aiFields)
    } catch {
      onComplete()
    }
  }

  if (scanning) {
    return (
      <div className="fixed inset-0 z-50 th-surface flex flex-col items-center justify-center gap-4">
        <div className="text-4xl animate-pulse">🔍</div>
        <p className="th-text text-lg font-semibold">Analyzing image…</p>
        <p className="th-text-muted text-sm">Claude is reading the hook packaging</p>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 th-surface flex flex-col items-center justify-center gap-6 px-6 text-center">
      <button onClick={onCancel} className="absolute top-4 left-4 th-accent-text text-sm min-h-[44px] px-2">← Cancel</button>
      <div className="text-5xl">🪝</div>
      <div>
        <h2 className="th-text text-xl font-bold mb-2">Point at the hook or package</h2>
        <p className="th-text-muted text-sm">Claude will auto-fill style, size, and brand from your photo</p>
      </div>
      <button onClick={() => fileRef.current?.click()} className="w-full max-w-xs py-4 th-btn-primary rounded-2xl font-semibold text-base min-h-[56px]">
        Take Photo
      </button>
      <button onClick={onSkip} className="th-text-muted text-sm min-h-[44px]">Skip — enter manually</button>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
    </div>
  )
}

// ─── RodScanFlow ──────────────────────────────────────────────────────────────

interface RodScanFlowProps {
  apiKey?: string
  onComplete: (prefilled?: Partial<Rod>, aiFields?: Set<string>) => void
  onSkip: () => void
  onCancel: () => void
}

function RodScanFlow({ apiKey, onComplete, onSkip, onCancel }: RodScanFlowProps) {
  const [scanning, setScanning] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (apiKey) {
      const timer = setTimeout(() => { fileRef.current?.click() }, 200)
      return () => clearTimeout(timer)
    }
  }, [apiKey])

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    if (!apiKey) { onSkip(); return }

    setScanning(true)
    try {
      const dataUrl = await resizePhoto(file)
      const result: RodScanResult = await identifyRodFull(apiKey, dataUrl)
      const prefilled: Partial<Rod> = {}
      const aiFields = new Set<string>()

      // Compose nickname from brand + power + action + reel type
      const nicknameParts = [result.brand, result.power, result.action, result.reelName].filter(Boolean)
      if (nicknameParts.length > 0) {
        prefilled.nickname = nicknameParts.join(' ')
        aiFields.add('nickname')
      }

      if (result.rodType)          { prefilled.rodType          = result.rodType;          aiFields.add('rodType') }
      if (result.power)            { prefilled.power            = result.power as Rod['power']; aiFields.add('power') }
      if (result.action)           { prefilled.action           = result.action as Rod['action']; aiFields.add('action') }
      if (result.lengthFt != null) { prefilled.lengthFt         = result.lengthFt;          aiFields.add('lengthFt') }
      if (result.lengthIn != null) { prefilled.lengthIn         = result.lengthIn;          aiFields.add('lengthIn') }
      if (result.lineWeightLbs != null) { prefilled.lineWeightLbs = result.lineWeightLbs;   aiFields.add('lineWeightLbs') }
      if (result.lureWeightMinOz != null) { prefilled.lureWeightMinOz = result.lureWeightMinOz; aiFields.add('lureWeightMinOz') }
      if (result.lureWeightMaxOz != null) { prefilled.lureWeightMaxOz = result.lureWeightMaxOz; aiFields.add('lureWeightMaxOz') }
      if (result.reelName)         { prefilled.reelName         = result.reelName;          aiFields.add('reelName') }

      onComplete(prefilled, aiFields)
    } catch {
      onComplete()
    }
  }

  if (scanning) {
    return (
      <div className="fixed inset-0 z-50 th-surface flex flex-col items-center justify-center gap-4">
        <div className="text-4xl animate-pulse">🔍</div>
        <p className="th-text text-lg font-semibold">Analyzing image…</p>
        <p className="th-text-muted text-sm">Claude is reading the rod and reel</p>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 th-surface flex flex-col items-center justify-center gap-6 px-6 text-center">
      <button onClick={onCancel} className="absolute top-4 left-4 th-accent-text text-sm min-h-[44px] px-2">← Cancel</button>
      <div className="text-5xl">🎯</div>
      <div>
        <h2 className="th-text text-xl font-bold mb-2">Point at the rod blank or reel</h2>
        <p className="th-text-muted text-sm">Claude will read brand, length, power, and action from the label</p>
      </div>
      <button onClick={() => fileRef.current?.click()} className="w-full max-w-xs py-4 th-btn-primary rounded-2xl font-semibold text-base min-h-[56px]">
        Take Photo
      </button>
      <button onClick={onSkip} className="th-text-muted text-sm min-h-[44px]">Skip — enter manually</button>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
    </div>
  )
}

// ─── SoftPlasticForm ──────────────────────────────────────────────────────────

interface RescanField {
  key: string
  label: string
  currentVal: string
  newVal: string
  accepted: boolean
}

interface SoftPlasticFormProps {
  initial?: SoftPlastic
  prefilled?: Partial<SoftPlastic>
  aiFields?: Set<string>
  apiKey?: string
  onSave: (sp: SoftPlastic) => void
  onCancel: () => void
  scanNote?: string
}

function SoftPlasticForm({ initial, prefilled, aiFields, apiKey, onSave, onCancel, scanNote }: SoftPlasticFormProps) {
  const src = initial ?? prefilled ?? {}
  const [brand,                setBrand]                = useState<string>(src.brand ?? '')
  const [productName,          setProductName]          = useState<string>(src.productName ?? '')
  const [bodyStyle,            setBodyStyle]            = useState<SoftPlasticBodyStyle | ''>(src.bodyStyle ?? '')
  const [sizeInches,           setSizeInches]           = useState<string>(src.sizeInches != null ? String(src.sizeInches) : '')
  const [colorName,            setColorName]            = useState<string>(src.colorName ?? '')
  const [colorFamily,          setColorFamily]          = useState<SoftPlasticColorFamily | ''>(src.colorFamily ?? '')
  const [quantity,             setQuantity]             = useState<string>(src.quantity != null ? String(src.quantity) : '')
  const [riggingStyles,        setRiggingStyles]        = useState<SoftPlasticRiggingStyle[]>(src.riggingStyles ?? [])
  const [hookSizeRec,          setHookSizeRec]          = useState<string>(src.hookSizeRecommendation ?? '')
  const [handPoured,           setHandPoured]           = useState<boolean>(src.handPoured ?? false)
  const [condition,            setCondition]            = useState<SoftPlasticCondition | ''>(src.condition ?? '')
  const [notes,                setNotes]                = useState<string>(src.notes ?? '')
  const [saving,               setSaving]               = useState(false)
  const [rescanResult,         setRescanResult]         = useState<Partial<SoftPlastic> | null>(null)
  const [rescanFields,         setRescanFields]         = useState<RescanField[]>([])
  const [rescanScanning,       setRescanScanning]       = useState(false)
  const rescanFileRef = useRef<HTMLInputElement>(null)

  const aiLabel = (key: string) =>
    aiFields?.has(key) ? <span className="text-[10px] th-accent-text ml-1">✦ AI</span> : null

  const toggleRigging = (style: SoftPlasticRiggingStyle) => {
    setRiggingStyles(prev =>
      prev.includes(style) ? prev.filter(s => s !== style) : [...prev, style]
    )
  }

  const getFormVal = (key: string): string => {
    switch (key) {
      case 'brand': return brand
      case 'productName': return productName
      case 'bodyStyle': return bodyStyle
      case 'sizeInches': return sizeInches
      case 'colorName': return colorName
      case 'colorFamily': return colorFamily
      case 'quantity': return quantity
      case 'hookSizeRecommendation': return hookSizeRec
      case 'handPoured': return handPoured ? 'Yes' : 'No'
      case 'riggingStyles': return riggingStyles.join(', ')
      default: return ''
    }
  }

  const handleRescanFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !apiKey) return
    e.target.value = ''
    setRescanScanning(true)
    try {
      const dataUrl = await resizePhoto(file)
      const result = await identifySoftPlastic(apiKey, dataUrl)
      const newPrefilled: Partial<SoftPlastic> = {}
      const keys = ['brand', 'productName', 'bodyStyle', 'sizeInches', 'colorName', 'colorFamily', 'quantity', 'hookSizeRecommendation', 'handPoured', 'riggingStyles'] as const
      for (const key of keys) {
        const field = result[key as keyof typeof result]
        if (field && (field.confidence === 'high' || field.confidence === 'medium')) {
          ;(newPrefilled as Record<string, unknown>)[key] = field.value
        }
      }
      setRescanResult(newPrefilled)
      // Build diff fields
      const diffFields: RescanField[] = []
      const fieldLabels: Record<string, string> = {
        brand: 'Brand', productName: 'Product Name', bodyStyle: 'Body Style',
        sizeInches: 'Size (in)', colorName: 'Color Name', colorFamily: 'Color Family',
        quantity: 'Quantity', hookSizeRecommendation: 'Hook Size Rec.', handPoured: 'Hand Poured',
        riggingStyles: 'Rigging Styles',
      }
      for (const key of keys) {
        const newRaw = (newPrefilled as Record<string, unknown>)[key]
        if (newRaw === undefined) continue
        const newStr = Array.isArray(newRaw) ? (newRaw as string[]).join(', ') : typeof newRaw === 'boolean' ? (newRaw ? 'Yes' : 'No') : String(newRaw)
        const curStr = getFormVal(key)
        if (newStr !== curStr) {
          diffFields.push({ key, label: fieldLabels[key] ?? key, currentVal: curStr, newVal: newStr, accepted: true })
        }
      }
      setRescanFields(diffFields)
    } catch {
      // ignore scan failure
    }
    setRescanScanning(false)
  }

  const applyRescan = () => {
    for (const f of rescanFields) {
      if (!f.accepted) continue
      const v = (rescanResult as Record<string, unknown>)?.[f.key]
      if (v === undefined) continue
      switch (f.key) {
        case 'brand': setBrand(String(v)); break
        case 'productName': setProductName(String(v)); break
        case 'bodyStyle': setBodyStyle(v as SoftPlasticBodyStyle); break
        case 'sizeInches': setSizeInches(String(v)); break
        case 'colorName': setColorName(String(v)); break
        case 'colorFamily': setColorFamily(v as SoftPlasticColorFamily); break
        case 'quantity': setQuantity(String(v)); break
        case 'hookSizeRecommendation': setHookSizeRec(String(v)); break
        case 'handPoured': setHandPoured(v as boolean); break
        case 'riggingStyles': setRiggingStyles(v as SoftPlasticRiggingStyle[]); break
      }
    }
    setRescanResult(null)
    setRescanFields([])
  }

  const submit = async () => {
    setSaving(true)
    const sp: SoftPlastic = {
      id:                     initial?.id ?? nanoid(),
      brand:                  brand.trim() || undefined,
      productName:            productName.trim() || undefined,
      bodyStyle:              bodyStyle || undefined,
      sizeInches:             sizeInches ? parseFloat(sizeInches) || undefined : undefined,
      colorName:              colorName.trim() || undefined,
      colorFamily:            colorFamily || undefined,
      quantity:               quantity ? parseInt(quantity, 10) || undefined : undefined,
      riggingStyles:          riggingStyles.length > 0 ? riggingStyles : undefined,
      hookSizeRecommendation: hookSizeRec.trim() || undefined,
      handPoured:             handPoured || undefined,
      condition:              condition || undefined,
      notes:                  notes.trim() || undefined,
      addedAt:                initial?.addedAt ?? Date.now(),
    }
    await saveSoftPlastic(sp)
    onSave(sp)
  }

  return (
    <div className="p-4 pb-28 max-w-lg mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={onCancel} className="th-accent-text text-sm min-h-[44px] px-1">← Cancel</button>
        <h2 className="th-text font-bold text-lg flex-1">{initial ? 'Edit Soft Plastic' : 'Add Soft Plastic'}</h2>
        {apiKey && (
          <button
            onClick={() => rescanFileRef.current?.click()}
            className="text-xs th-text-muted border th-border px-3 py-2 rounded-xl min-h-[36px]"
          >
            Re-scan
          </button>
        )}
      </div>

      <input
        ref={rescanFileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleRescanFile}
      />

      {rescanScanning && (
        <div className="th-surface-deep border th-border rounded-2xl p-4 text-center">
          <div className="text-2xl animate-pulse mb-2">🔍</div>
          <p className="th-text-muted text-sm">Analyzing image…</p>
        </div>
      )}

      {rescanResult && rescanFields.length > 0 && (
        <div className="th-surface-deep border th-border rounded-2xl p-4 space-y-3">
          <p className="th-text font-semibold text-sm">Review scan results</p>
          <div className="space-y-2">
            {rescanFields.map((f, i) => (
              <div key={f.key} className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setRescanFields(prev => prev.map((rf, ri) => ri === i ? { ...rf, accepted: !rf.accepted } : rf))
                  }}
                  className={`shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center text-xs ${
                    f.accepted ? 'border-[color:var(--th-accent)] bg-[color:var(--th-accent)]' : 'border-[color:var(--th-border)]'
                  }`}
                >
                  {f.accepted && <span className="text-white text-[10px]">✓</span>}
                </button>
                <div className="flex-1 min-w-0">
                  <span className="th-text-muted text-xs">{f.label}: </span>
                  <span className="th-text-muted text-xs line-through">{f.currentVal || '—'}</span>
                  <span className="th-text text-xs"> → {f.newVal}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={applyRescan} className="flex-1 py-2 th-btn-primary rounded-xl text-xs font-semibold min-h-[40px]">
              Apply Selected
            </button>
            <button onClick={() => { setRescanResult(null); setRescanFields([]) }} className="flex-1 py-2 th-surface border th-border rounded-xl text-xs th-text min-h-[40px]">
              Discard
            </button>
          </div>
        </div>
      )}

      {scanNote && (
        <div className="th-surface-deep border th-border rounded-xl px-4 py-3">
          <p className="th-text-muted text-sm">{scanNote}</p>
        </div>
      )}

      <div className="th-surface rounded-2xl border th-border p-4 space-y-4">
        <p className="section-label">Product Info</p>

        <div>
          <FieldLabel><>Brand {aiLabel('brand')}</></FieldLabel>
          <TextInput value={brand} onChange={setBrand} placeholder="e.g. Zoom, Strike King, Berkley" />
        </div>

        <div>
          <FieldLabel><>Product Name {aiLabel('productName')}</></FieldLabel>
          <TextInput value={productName} onChange={setProductName} placeholder='e.g. "Trick Worm", "Rage Craw"' />
        </div>

        <div>
          <FieldLabel><>Body Style {aiLabel('bodyStyle')}</></FieldLabel>
          <ButtonGrid options={SP_BODY_STYLES} value={bodyStyle} onChange={setBodyStyle} />
        </div>

        <div>
          <FieldLabel><>Size (inches) {aiLabel('sizeInches')}</></FieldLabel>
          <input
            type="number"
            step="0.25"
            min="0"
            className="w-full th-surface border th-border rounded-xl px-3 py-3 th-text text-base"
            placeholder="e.g. 4, 5.5, 7"
            value={sizeInches}
            onChange={e => setSizeInches(e.target.value)}
          />
        </div>
      </div>

      <div className="th-surface rounded-2xl border th-border p-4 space-y-4">
        <p className="section-label">Color</p>

        <div>
          <FieldLabel><>Color Name {aiLabel('colorName')}</></FieldLabel>
          <TextInput value={colorName} onChange={setColorName} placeholder='e.g. "Green Pumpkin Red Flake"' />
        </div>

        <div>
          <FieldLabel><>Color Family {aiLabel('colorFamily')}</></FieldLabel>
          <ButtonGrid options={SP_COLOR_FAMILIES} value={colorFamily} onChange={setColorFamily} />
        </div>
      </div>

      <div className="th-surface rounded-2xl border th-border p-4 space-y-4">
        <p className="section-label">Rigging & Use</p>

        <div>
          <FieldLabel><>Rigging Styles {aiLabel('riggingStyles')}</></FieldLabel>
          <div className="flex flex-wrap gap-2">
            {SP_RIGGING_STYLES.map(style => (
              <button
                key={style}
                onClick={() => toggleRigging(style)}
                className={`px-3 py-2 rounded-xl text-sm border min-h-[44px] ${
                  riggingStyles.includes(style) ? 'th-btn-selected border-transparent' : 'th-surface th-text border-[color:var(--th-border)]'
                }`}
              >{style}</button>
            ))}
          </div>
        </div>

        <div>
          <FieldLabel><>Hook Size Recommendation {aiLabel('hookSizeRecommendation')}</></FieldLabel>
          <TextInput value={hookSizeRec} onChange={setHookSizeRec} placeholder="e.g. 3/0 EWG (optional)" />
        </div>
      </div>

      <div className="th-surface rounded-2xl border th-border p-4 space-y-4">
        <p className="section-label">Inventory</p>

        <div>
          <FieldLabel><>Quantity {aiLabel('quantity')}</></FieldLabel>
          <input
            type="number"
            min="0"
            className="w-full th-surface border th-border rounded-xl px-3 py-3 th-text text-base"
            placeholder="e.g. 10"
            value={quantity}
            onChange={e => setQuantity(e.target.value)}
          />
        </div>

        <div>
          <FieldLabel>Condition</FieldLabel>
          <ButtonGrid options={SP_CONDITIONS} value={condition} onChange={setCondition} />
        </div>

        <div>
          <FieldLabel><>Hand Poured {aiLabel('handPoured')}</></FieldLabel>
          <div className="flex gap-2">
            <button
              onClick={() => setHandPoured(true)}
              className={`flex-1 py-2.5 rounded-xl text-sm border min-h-[44px] ${
                handPoured ? 'th-btn-selected border-transparent' : 'th-surface th-text border-[color:var(--th-border)]'
              }`}
            >Yes</button>
            <button
              onClick={() => setHandPoured(false)}
              className={`flex-1 py-2.5 rounded-xl text-sm border min-h-[44px] ${
                !handPoured ? 'th-btn-selected border-transparent' : 'th-surface th-text border-[color:var(--th-border)]'
              }`}
            >No</button>
          </div>
        </div>
      </div>

      <div className="th-surface rounded-2xl border th-border p-4">
        <FieldLabel>Notes (optional)</FieldLabel>
        <TextInput value={notes} onChange={setNotes} placeholder="Any notes…" />
      </div>

      <button
        onClick={submit}
        disabled={saving}
        className="w-full py-4 th-btn-primary rounded-xl font-semibold text-base disabled:opacity-40 min-h-[56px]"
      >
        {saving ? 'Saving…' : initial ? 'Save Changes' : 'Add Soft Plastic'}
      </button>
    </div>
  )
}

// ─── GroupSection ─────────────────────────────────────────────────────────────

function GroupSection({ title, count, children }: {
  title: string
  count: number
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b th-border">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-4 th-surface-deep"
        style={{ borderLeft: '4px solid var(--th-accent)' }}
      >
        <span className="flex-1 text-base font-bold th-text tracking-wide text-left">{title}</span>
        <span className="text-sm th-text-muted font-medium tabular-nums">{count}</span>
        <span className="th-text-muted text-sm">{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="accordion-enter">{children}</div>}
    </div>
  )
}

// ─── CategorySection ──────────────────────────────────────────────────────────

function CategorySection({ title, count, children }: {
  title: string
  count: number
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  if (count === 0) return null
  return (
    <div className="border-b th-border">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 pl-8 pr-4 py-2.5 th-surface-deep border-t th-border"
      >
        <span className="flex-1 text-sm font-semibold th-text text-left">{title}</span>
        <span className="text-xs th-text-muted">({count})</span>
        <span className="text-xs th-text-muted ml-1">{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="accordion-enter">{children}</div>}
    </div>
  )
}

// ─── JigsCategory ─────────────────────────────────────────────────────────────

function JigsCategory({ items, onEdit, onDelete, multiSelect, selected, onToggleSelect, onLongPress }: {
  items: OwnedLure[]
  onEdit: (item: OwnedLure) => void
  onDelete: (id: string) => void
  multiSelect?: boolean
  selected?: Set<string>
  onToggleSelect?: (id: string) => void
  onLongPress?: (id: string) => void
}) {
  const [openSubs, setOpenSubs] = useState<Set<string>>(new Set())

  const toggleSub = (sub: string) =>
    setOpenSubs(prev => { const s = new Set(prev); s.has(sub) ? s.delete(sub) : s.add(sub); return s })

  const bySubgroup = new Map<string, OwnedLure[]>()
  for (const sub of JIG_SUBGROUPS) bySubgroup.set(sub, [])
  for (const item of items) {
    const sub = item.jigSubgroup
      ?? (JIG_SUBGROUPS.includes(item.lureType as JigSubgroup) ? item.lureType as string : 'Other Jig')
    if (bySubgroup.has(sub)) {
      bySubgroup.set(sub, [...bySubgroup.get(sub)!, item])
    } else {
      bySubgroup.set('Other Jig', [...(bySubgroup.get('Other Jig') ?? []), item])
    }
  }

  return (
    <div>
      {JIG_SUBGROUPS.map(sub => {
        const subItems = sortItems(bySubgroup.get(sub) ?? [])
        if (subItems.length === 0) return null
        const isSubOpen = openSubs.has(sub)
        return (
          <div key={sub} className="border-b th-border last:border-b-0">
            <button
              onClick={() => toggleSub(sub)}
              className="w-full flex items-center gap-2 pl-12 pr-4 py-2 th-surface border-t th-border"
            >
              <span className="flex-1 text-xs font-medium th-text-muted text-left">{sub}</span>
              <span className="text-xs th-text-muted">({subItems.length})</span>
              <span className="text-xs th-text-muted">{isSubOpen ? '▲' : '▼'}</span>
            </button>
            {isSubOpen && (
              <div className="divide-y th-border">
                {subItems.map(item => (
                  <DenseRow
                    key={item.id}
                    item={item}
                    onEdit={() => onEdit(item)}
                    onDelete={() => onDelete(item.id)}
                    multiSelect={multiSelect}
                    selected={selected?.has(item.id)}
                    onToggleSelect={() => onToggleSelect?.(item.id)}
                    onLongPress={() => onLongPress?.(item.id)}
                  />
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── AddFab ───────────────────────────────────────────────────────────────────

interface AddFabProps {
  onAddLure: (lureType: string) => void
  onAddHook: (hookStyleHint?: HookStyle, hookTypeHint?: 'standard' | 'weighted') => void
  onAddSoftPlastic: () => void
  onAddRod: () => void
}

function AddFab({ onAddLure, onAddHook, onAddSoftPlastic, onAddRod }: AddFabProps) {
  const [open, setOpen] = useState(false)

  const close = () => setOpen(false)

  const LURE_BUTTONS = [
    'Crankbait', 'Jerkbait', 'Jig', 'Spinnerbait', 'Chatterbait',
    'Spoon', 'Swimbait', 'Topwater', 'Other',
  ] as const

  const HOOK_BUTTONS: Array<{ label: string; hookStyleHint?: HookStyle; hookTypeHint?: 'standard' | 'weighted' }> = [
    { label: 'Ned Rig Heads', hookStyleHint: 'Ned' },
    { label: 'Standard Hooks', hookTypeHint: 'standard' },
    { label: 'Wacky Hooks', hookStyleHint: 'Wacky' },
    { label: 'Weighted Hooks', hookTypeHint: 'weighted' },
  ]

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-30 bg-black/40" onClick={close} />
      )}

      {open && (
        <div className="fixed bottom-20 left-0 right-0 z-40 px-4">
          <div className="th-surface border th-border rounded-2xl shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b th-border">
              <span className="th-text font-semibold text-sm">Add Tackle</span>
              <button onClick={close} className="th-text-muted text-base w-8 h-8 flex items-center justify-center">✕</button>
            </div>

            <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto scrollbar-hide">
              {/* Lures section */}
              <div>
                <p className="text-xs th-text-muted font-bold uppercase tracking-wide mb-2">Lures</p>
                <div className="flex flex-wrap gap-2">
                  {LURE_BUTTONS.map(lureType => (
                    <button
                      key={lureType}
                      onClick={() => { close(); onAddLure(lureType) }}
                      className="px-3 py-2 th-surface-deep border th-border rounded-xl text-sm th-text min-h-[40px]"
                    >
                      {lureType}
                    </button>
                  ))}
                </div>
              </div>

              {/* Hooks section */}
              <div>
                <p className="text-xs th-text-muted font-bold uppercase tracking-wide mb-2">Hooks and Rigs</p>
                <div className="flex flex-wrap gap-2">
                  {HOOK_BUTTONS.map(({ label, hookStyleHint, hookTypeHint }) => (
                    <button
                      key={label}
                      onClick={() => { close(); onAddHook(hookStyleHint, hookTypeHint) }}
                      className="px-3 py-2 th-surface-deep border th-border rounded-xl text-sm th-text min-h-[40px]"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Soft Plastics */}
              <button
                onClick={() => { close(); onAddSoftPlastic() }}
                className="w-full py-3.5 th-btn-primary rounded-xl font-semibold text-sm min-h-[52px]"
              >
                Soft Plastics
              </button>

              {/* Rod / Reel */}
              <button
                onClick={() => { close(); onAddRod() }}
                className="w-full py-3.5 th-surface border th-border rounded-xl th-text font-medium text-sm min-h-[52px]"
              >
                🎣 Rod / Reel
              </button>
            </div>
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-20 right-4 z-40 w-14 h-14 rounded-full th-btn-primary flex items-center justify-center text-2xl shadow-lg"
      >
        {open ? '✕' : '+'}
      </button>
    </>
  )
}

// ─── ListView ─────────────────────────────────────────────────────────────────

type OriginFilter = 'all' | TackleOrigin
type ConditionFilter = 'all' | TackleCondition

interface ListViewProps {
  items: OwnedLure[]
  rods: Rod[]
  softPlastics: SoftPlastic[]
  onAddLure: (lureType: string) => void
  onAddHook: (hookStyleHint?: HookStyle, hookTypeHint?: 'standard' | 'weighted') => void
  onAddSoftPlastic: () => void
  onAddRod: () => void
  onEdit: (item: OwnedLure) => void
  onDelete: (id: string) => void
  onBulkDelete: (ids: string[]) => void
  onBulkReassign: (ids: string[], category: string) => void
  onExport: () => void
  onEditRod: (rod: Rod) => void
  onDeleteRod: (id: string) => void
  onEditSp: (sp: SoftPlastic) => void
  onDeleteSp: (id: string) => void
}

function ListView({
  items, rods, softPlastics, onAddLure, onAddHook, onAddSoftPlastic, onAddRod,
  onEdit, onDelete, onBulkDelete, onBulkReassign, onExport, onEditRod, onDeleteRod, onEditSp, onDeleteSp,
}: ListViewProps) {
  const [search, setSearch]           = useState('')
  const [originFilter, setOriginFilter] = useState<OriginFilter>('all')
  const [condFilter, setCondFilter]   = useState<ConditionFilter>('all')
  const [multiSelect, setMultiSelect] = useState(false)
  const [selected, setSelected]       = useState<Set<string>>(new Set())
  const [bulkConfirm, setBulkConfirm] = useState(false)
  const [showBulkReassign, setShowBulkReassign] = useState(false)
  const [confirmRodId, setConfirmRodId] = useState<string | null>(null)

  const filterItem = (item: OwnedLure): boolean => {
    if (originFilter !== 'all' && item.origin !== originFilter) return false
    if (condFilter !== 'all' && (item.condition ?? 'Good') !== condFilter) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      const fields = [item.lureType, item.hookStyle, item.color, item.secondaryColor, item.weight, item.brand]
      if (!fields.some(f => f?.toLowerCase().includes(q))) return false
    }
    return true
  }

  const filterRod = (rod: Rod): boolean => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return [rod.nickname, rod.power, rod.action, rod.lineType].some(f => f?.toLowerCase().includes(q))
  }

  const filterSp = (sp: SoftPlastic): boolean => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return [sp.brand, sp.productName, sp.bodyStyle, sp.colorName, sp.colorFamily].some(f => f?.toLowerCase().includes(q))
  }

  const filtered = items.filter(filterItem)
  const filteredRods = rods.filter(filterRod)
  const filteredSPs = softPlastics.filter(filterSp)

  // Split items by group
  const lureItems = filtered.filter(i => effectiveCategory(i) === 'lure' || effectiveCategory(i) === 'spoon')
  const hookItems = filtered.filter(i => effectiveCategory(i) === 'hook')

  // Build lure display cat maps
  const lureByCat = new Map<LureDisplayCat, OwnedLure[]>()
  for (const cat of LURE_DISPLAY_CATS) lureByCat.set(cat, [])
  for (const item of lureItems) {
    const cat = getLureCat(item)
    lureByCat.get(cat)!.push(item)
  }

  // Build hook display cat maps
  const hookByCat = new Map<HookDisplayCat, OwnedLure[]>()
  for (const cat of HOOK_DISPLAY_CATS) hookByCat.set(cat, [])
  for (const item of hookItems) {
    const cat = getHookCat(item)
    hookByCat.get(cat)!.push(item)
  }

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const enterMultiSelect = (id: string) => {
    setMultiSelect(true)
    setSelected(new Set([id]))
  }

  const exitMultiSelect = () => {
    setMultiSelect(false)
    setSelected(new Set())
    setBulkConfirm(false)
    setShowBulkReassign(false)
  }

  const handleBulkDelete = () => {
    onBulkDelete(Array.from(selected))
    exitMultiSelect()
  }

  const isEmpty = filtered.length === 0 && filteredRods.length === 0 && filteredSPs.length === 0

  return (
    <div className="pb-32">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 pt-4 pb-2">
        <h1 className="th-text font-bold text-xl flex-1">Tackle</h1>
        <button
          onClick={onExport}
          className="text-xs th-text-muted border th-border px-3 py-2 rounded-xl min-h-[36px]"
        >
          Export
        </button>
      </div>

      {/* Search bar */}
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
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 th-text-muted text-sm">✕</button>
          )}
        </div>
      </div>

      {/* Filter chips */}
      <div className="overflow-x-auto scrollbar-hide px-4 pb-2">
        <div className="flex gap-2 w-max">
          <Chip label="Any Origin"     active={originFilter === 'all'}               onClick={() => setOriginFilter('all')} />
          <Chip label="🫗 Hand Poured" active={originFilter === 'Hand Poured by Me'} onClick={() => setOriginFilter('Hand Poured by Me')} />
          <Chip label="Store Bought"   active={originFilter === 'Store Bought'}       onClick={() => setOriginFilter('Store Bought')} />
          <div className="w-px opacity-20 mx-1 self-stretch" style={{ background: 'var(--th-border)' }} />
          <Chip label="Any Condition" active={condFilter === 'all'}     onClick={() => setCondFilter('all')} />
          <Chip label="New"           active={condFilter === 'New'}     onClick={() => setCondFilter('New')} />
          <Chip label="Good"          active={condFilter === 'Good'}    onClick={() => setCondFilter('Good')} />
          <Chip label="Retired"       active={condFilter === 'Retired'} onClick={() => setCondFilter('Retired')} />
        </div>
      </div>

      {/* Empty state */}
      {isEmpty && (
        <div className="text-center py-16 th-text-muted px-4">
          <div className="text-4xl mb-3">🎣</div>
          <p className="text-sm font-medium">{search ? 'No matches' : 'No tackle yet'}</p>
          <p className="text-xs mt-1">
            {search ? 'Try a different search term.' : 'Tap + to add your first lure, hook, or soft plastic.'}
          </p>
        </div>
      )}

      {/* Lures Group */}
      <GroupSection title="Lures" count={lureItems.length}>
        {LURE_DISPLAY_CATS.map(cat => {
          const catItems = sortItems(lureByCat.get(cat) ?? [])
          if (catItems.length === 0) return null
          if (cat === 'Jigs') {
            return (
              <CategorySection key={cat} title={cat} count={catItems.length}>
                <JigsCategory
                  items={catItems}
                  onEdit={onEdit}
                  onDelete={id => onDelete(id)}
                  multiSelect={multiSelect}
                  selected={selected}
                  onToggleSelect={toggleSelect}
                  onLongPress={enterMultiSelect}
                />
              </CategorySection>
            )
          }
          return (
            <CategorySection key={cat} title={cat} count={catItems.length}>
              <div className="divide-y th-border">
                {catItems.map(item => (
                  <DenseRow
                    key={item.id}
                    item={item}
                    onEdit={() => onEdit(item)}
                    onDelete={() => onDelete(item.id)}
                    multiSelect={multiSelect}
                    selected={selected.has(item.id)}
                    onToggleSelect={() => toggleSelect(item.id)}
                    onLongPress={() => enterMultiSelect(item.id)}
                  />
                ))}
              </div>
            </CategorySection>
          )
        })}
      </GroupSection>

      {/* Hooks and Rigs Group */}
      <GroupSection title="Hooks and Rigs" count={hookItems.length}>
        {HOOK_DISPLAY_CATS.map(cat => {
          const catItems = sortItems(hookByCat.get(cat) ?? [])
          return (
            <CategorySection key={cat} title={cat} count={catItems.length}>
              <div className="divide-y th-border">
                {catItems.map(item => (
                  <DenseRow
                    key={item.id}
                    item={item}
                    onEdit={() => onEdit(item)}
                    onDelete={() => onDelete(item.id)}
                    multiSelect={multiSelect}
                    selected={selected.has(item.id)}
                    onToggleSelect={() => toggleSelect(item.id)}
                    onLongPress={() => enterMultiSelect(item.id)}
                  />
                ))}
              </div>
            </CategorySection>
          )
        })}
      </GroupSection>

      {/* Soft Plastics Group */}
      <GroupSection title="Soft Plastics" count={filteredSPs.length}>
        {filteredSPs.length === 0 && (
          <div className="px-4 py-4 text-center th-text-muted text-sm">
            No soft plastics yet — tap + to scan or add.
          </div>
        )}
        <div className="divide-y th-border">
          {filteredSPs.map(sp => (
            <SpRow
              key={sp.id}
              sp={sp}
              onEdit={() => onEditSp(sp)}
              onDelete={() => onDeleteSp(sp.id)}
            />
          ))}
        </div>
      </GroupSection>

      {/* Rods and Reels Group */}
      <GroupSection title="Rods and Reels" count={filteredRods.length}>
        <div className="px-4 py-2 flex justify-end border-b th-border">
          <button onClick={onAddRod} className="text-xs th-accent-text px-2 py-1 min-h-[32px]">+ Add</button>
        </div>
        {filteredRods.length === 0 && (
          <div className="px-4 py-4 text-center th-text-muted text-sm">
            No rods yet — tap + Add above.
          </div>
        )}
        <div className="divide-y th-border">
          {filteredRods.map(rod => (
            <RodRow
              key={rod.id}
              rod={rod}
              confirming={confirmRodId === rod.id}
              onEdit={() => onEditRod(rod)}
              onDeleteRequest={() => setConfirmRodId(confirmRodId === rod.id ? null : rod.id)}
              onDeleteConfirm={() => { onDeleteRod(rod.id); setConfirmRodId(null) }}
            />
          ))}
        </div>
      </GroupSection>

      {/* Bulk reassign modal */}
      {showBulkReassign && (
        <ReassignModal
          currentCategory=""
          onSelect={cat => {
            onBulkReassign(Array.from(selected), cat)
            exitMultiSelect()
          }}
          onClose={() => setShowBulkReassign(false)}
        />
      )}

      {/* Multi-select bar */}
      {multiSelect && (
        <div className="fixed bottom-20 left-0 right-0 z-40 px-4">
          <div className="th-surface border th-border rounded-2xl p-3 flex items-center gap-3 shadow-xl">
            <button onClick={exitMultiSelect} className="th-text-muted text-sm min-h-[44px] px-1">Cancel</button>
            <span className="flex-1 th-text text-sm font-medium text-center">{selected.size} selected</span>
            {bulkConfirm ? (
              <div className="flex gap-2">
                <button onClick={handleBulkDelete} className="text-sm text-white bg-red-700 px-3 py-2 rounded-xl min-h-[44px]">Confirm Delete</button>
                <button onClick={() => setBulkConfirm(false)} className="text-sm th-text-muted border th-border px-3 py-2 rounded-xl min-h-[44px]">No</button>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => setShowBulkReassign(true)}
                  disabled={selected.size === 0}
                  className="text-sm th-accent-text border th-border px-3 py-2 rounded-xl min-h-[44px] disabled:opacity-40"
                >
                  Move
                </button>
                <button
                  onClick={() => setBulkConfirm(true)}
                  disabled={selected.size === 0}
                  className="text-sm th-danger-text border border-red-900/50 px-3 py-2 rounded-xl min-h-[44px] disabled:opacity-40"
                >
                  Delete ({selected.size})
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* FAB */}
      {!multiSelect && (
        <AddFab
          onAddLure={onAddLure}
          onAddHook={onAddHook}
          onAddSoftPlastic={onAddSoftPlastic}
          onAddRod={onAddRod}
        />
      )}
    </div>
  )
}

// ─── Main Tackle component ────────────────────────────────────────────────────

interface Props {
  settings: AppSettings
  onSettingsUpdate: (s: AppSettings) => void
}

export default function Tackle({ settings }: Props) {
  const [items, setItems]             = useState<OwnedLure[]>([])
  const [rods, setRods]               = useState<Rod[]>([])
  const [softPlastics, setSoftPlastics] = useState<SoftPlastic[]>([])
  const [formView, setFormView]       = useState<FormView | null>(null)
  const [spView, setSpView]           = useState<SpView | null>(null)
  const [editRod, setEditRod]         = useState<Rod | null>(null)

  // Load data
  useEffect(() => { getAllRods().then(setRods) }, [])
  useEffect(() => { getAllSoftPlastics().then(setSoftPlastics) }, [])
  useEffect(() => {
    getAllOwnedLures().then(lures => {
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

  // OwnedLure handlers
  const handleSave = (item: OwnedLure) => {
    setItems(prev => {
      const idx = prev.findIndex(i => i.id === item.id)
      return idx >= 0 ? prev.map(i => i.id === item.id ? item : i) : [item, ...prev]
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
    setFormView(null)
    setEditRod(null)
  }

  const handleRodDelete = async (id: string) => {
    await deleteRod(id)
    setRods(prev => prev.filter(r => r.id !== id))
  }

  // Soft plastic handlers
  const handleSpSave = (sp: SoftPlastic) => {
    setSoftPlastics(prev => {
      const idx = prev.findIndex(s => s.id === sp.id)
      return idx >= 0 ? prev.map(s => s.id === sp.id ? sp : s) : [sp, ...prev]
    })
    setSpView(null)
  }

  const handleSpDelete = async (id: string) => {
    await deleteSoftPlastic(id)
    setSoftPlastics(prev => prev.filter(s => s.id !== id))
  }

  const apiKey = settings.anthropicApiKey || undefined

  // ─── SpView routing ───────────────────────────────────────────────────────────

  if (spView?.mode === 'scan') {
    return (
      <SoftPlasticScanFlow
        apiKey={apiKey}
        onComplete={(prefilled, aiFields, note) =>
          setSpView({ mode: 'form', prefilled, aiFields, scanNote: note })
        }
        onSkip={() => setSpView({ mode: 'form' })}
        onCancel={() => setSpView(null)}
      />
    )
  }

  if (spView?.mode === 'form') {
    return (
      <SoftPlasticForm
        initial={spView.editSp}
        prefilled={spView.prefilled}
        aiFields={spView.aiFields}
        apiKey={apiKey}
        scanNote={spView.scanNote}
        onSave={handleSpSave}
        onCancel={() => setSpView(null)}
      />
    )
  }

  // ─── FormView routing ─────────────────────────────────────────────────────────

  if (formView?.mode === 'scan-lure') {
    return (
      <LureScanFlow
        lureTypeHint={formView.lureTypeHint}
        apiKey={apiKey}
        onComplete={(prefilled, aiFields) =>
          setFormView({ mode: 'add-lure', lureTypeHint: formView.lureTypeHint, prefilled, aiFields })
        }
        onSkip={() => setFormView({ mode: 'add-lure', lureTypeHint: formView.lureTypeHint })}
        onCancel={() => setFormView(null)}
      />
    )
  }

  if (formView?.mode === 'scan-hook') {
    return (
      <HookScanFlow
        hookStyleHint={formView.hookStyleHint}
        hookTypeHint={formView.hookTypeHint}
        apiKey={apiKey}
        onComplete={(prefilled, aiFields) =>
          setFormView({ mode: 'add-hook', hookStyleHint: formView.hookStyleHint, hookTypeHint: formView.hookTypeHint, prefilled, aiFields })
        }
        onSkip={() => setFormView({ mode: 'add-hook', hookStyleHint: formView.hookStyleHint, hookTypeHint: formView.hookTypeHint })}
        onCancel={() => setFormView(null)}
      />
    )
  }

  if (formView?.mode === 'scan-rod') {
    return (
      <RodScanFlow
        apiKey={apiKey}
        onComplete={(prefilled, aiFields) => setFormView({ mode: 'add-rod', prefilled, aiFields })}
        onSkip={() => setFormView({ mode: 'add-rod' })}
        onCancel={() => setFormView(null)}
      />
    )
  }

  if (formView?.mode === 'add-rod' || editRod !== null) {
    return (
      <RodForm
        initial={editRod ?? undefined}
        prefilled={formView?.mode === 'add-rod' ? formView.prefilled : undefined}
        aiFields={formView?.mode === 'add-rod' ? formView.aiFields : undefined}
        onSave={handleRodSave}
        onCancel={() => { setFormView(null); setEditRod(null) }}
      />
    )
  }

  if (formView?.mode === 'add-lure') {
    return (
      <LureForm
        lureTypeHint={formView.lureTypeHint}
        prefilled={formView.prefilled}
        aiFields={formView.aiFields}
        apiKey={apiKey}
        onSave={handleSave}
        onCancel={() => setFormView(null)}
      />
    )
  }

  if (formView?.mode === 'add-hook') {
    return (
      <HookForm
        hookStyleHint={formView.hookStyleHint}
        hookTypeHint={formView.hookTypeHint}
        prefilled={formView.prefilled}
        aiFields={formView.aiFields}
        onSave={handleSave}
        onCancel={() => setFormView(null)}
      />
    )
  }

  if (formView?.mode === 'edit') {
    const item = formView.item
    const cat = effectiveCategory(item)
    if (cat === 'hook') {
      return (
        <HookForm
          initial={item}
          onSave={handleSave}
          onCancel={() => setFormView(null)}
          onReassign={reassigned => { handleSave(reassigned) }}
        />
      )
    }
    // lure or spoon — both use LureForm
    return (
      <LureForm
        initial={item}
        apiKey={apiKey}
        onSave={handleSave}
        onCancel={() => setFormView(null)}
        onReassign={reassigned => { handleSave(reassigned) }}
      />
    )
  }

  // ─── ListView ─────────────────────────────────────────────────────────────────

  return (
    <ListView
      items={items}
      rods={rods}
      softPlastics={softPlastics}
      onAddLure={lureType => setFormView({ mode: 'scan-lure', lureTypeHint: lureType })}
      onAddHook={(hookStyleHint, hookTypeHint) => setFormView({ mode: 'scan-hook', hookStyleHint, hookTypeHint })}
      onAddSoftPlastic={() => setSpView({ mode: 'scan' })}
      onAddRod={() => setFormView({ mode: 'scan-rod' })}
      onEdit={item => setFormView({ mode: 'edit', item })}
      onDelete={handleDelete}
      onBulkDelete={handleBulkDelete}
      onBulkReassign={async (ids, targetCategory) => {
        const updated = items
          .filter(i => ids.includes(i.id))
          .map(i => reassignItem(i, targetCategory))
        await Promise.all(updated.map(saveOwnedLure))
        const idSet = new Set(ids)
        setItems(prev => prev.map(i => idSet.has(i.id) ? (updated.find(u => u.id === i.id) ?? i) : i))
      }}
      onExport={handleExport}
      onEditRod={rod => setEditRod(rod)}
      onDeleteRod={handleRodDelete}
      onEditSp={sp => setSpView({ mode: 'form', editSp: sp })}
      onDeleteSp={handleSpDelete}
    />
  )
}
