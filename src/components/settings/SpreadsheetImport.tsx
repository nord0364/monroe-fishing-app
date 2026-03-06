import { useState, useRef } from 'react'
import type { LandedFish, GPSCoords, Species, LureWeight } from '../../types'
import { saveEvent } from '../../db/database'
import { nanoid } from '../logger/nanoid'

interface Props { onClose: () => void }

// ─── CSV parser (handles quoted fields) ──────────────────────────────────────
function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  for (const line of lines) {
    if (!line.trim()) continue
    const cols: string[] = []
    let inQuote = false, current = ''
    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      if (c === '"') {
        if (inQuote && line[i + 1] === '"') { current += '"'; i++; continue }
        inQuote = !inQuote
      } else if (c === ',' && !inQuote) {
        cols.push(current.trim()); current = ''
      } else {
        current += c
      }
    }
    cols.push(current.trim())
    rows.push(cols)
  }
  return rows
}

// ─── Column detection ─────────────────────────────────────────────────────────
type ColKey = 'date' | 'month' | 'day' | 'year' | 'time' | 'conditions' | 'rod' | 'lureType' | 'color' |
              'lureWeight' | 'species' | 'fishWeight' | 'fishWeightLb' | 'fishWeightOz' | 'length' | 'location' | 'notes' | 'coords'

const MATCHERS: [ColKey, string[]][] = [
  ['date',       ['date', 'full date', 'catch date']],
  ['month',      ['month', 'mo', 'mon']],
  ['day',        ['day', 'dy', 'dom', 'date (day)']],
  ['year',       ['year', 'yr', 'yyyy', 'yy']],
  ['time',       ['time', 'catch time', 'time of day']],
  ['conditions', ['condition']],
  ['rod',        ['rod']],
  ['lureType',   ['lure/rig', 'lure', 'rig', 'lure type', 'bait', 'technique']],
  ['color',      ['color', 'colour', 'pattern', 'col']],
  ['lureWeight', ['lure weight', 'lure wt', 'lure wgt', 'weight (lure)', 'oz']],
  ['species',      ['species', 'fish species', 'type of fish', 'fish type']],
  ['fishWeight',   ['fish weight', 'fish wt', 'wt', 'weight']],
  ['fishWeightLb', ['fish weight lb', 'fish lb', 'fishweightlb', 'weight lb', 'lbs', 'lb']],
  ['fishWeightOz', ['fish weight oz', 'fish oz', 'fishweightoz', 'weight oz', 'oz (fish)']],
  ['length',     ['length', 'len', 'size', 'inches']],
  ['location',   ['location', 'loc', 'area', 'spot', 'place', 'where']],
  ['notes',      ['notes', 'note', 'comment', 'remarks', 'details']],
  ['coords',     ['coord', 'gps', 'lat', 'lat/lng', 'latitude', 'longitude']],
]

// Human-readable labels for each ColKey
const COL_LABELS: Record<ColKey, string> = {
  lureType:   'Lure / Rig *',
  date:       'Date (combined)',
  month:      'Month',
  day:        'Day',
  year:       'Year',
  time:       'Time',
  species:    'Species',
  fishWeight:   'Fish Weight (combined)',
  fishWeightLb: 'Fish Weight — lbs',
  fishWeightOz: 'Fish Weight — oz',
  length:       'Length',
  color:      'Color / Pattern',
  lureWeight: 'Lure Weight',
  rod:        'Rod',
  conditions: 'Conditions',
  location:   'Location',
  notes:      'Notes',
  coords:     'Coordinates',
}

const COL_KEY_ORDER: ColKey[] = [
  'lureType','date','month','day','year','time','species',
  'fishWeight','fishWeightLb','fishWeightOz','length',
  'color','lureWeight','rod','conditions','location','notes','coords',
]

function detectColumns(headers: string[]): Partial<Record<ColKey, number>> {
  const map: Partial<Record<ColKey, number>> = {}
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i].toLowerCase().trim()
    for (const [key, options] of MATCHERS) {
      if (!(key in map) && options.some(o => h.includes(o))) {
        map[key] = i
      }
    }
  }
  return map
}

// ─── Field parsers ────────────────────────────────────────────────────────────
function mapSpecies(s: string): Species {
  const l = s.toLowerCase()
  if (l.includes('large') || l === 'lmb') return 'Largemouth Bass'
  if (l.includes('small') || l === 'smb') return 'Smallmouth Bass'
  if (l.includes('crappie'))              return 'Crappie'
  if (l.includes('flathead'))             return 'Flathead Catfish'
  if (l.includes('catfish') || l.includes('channel')) return 'Channel Catfish'
  if (l.includes('bluegill') || l.includes('bream')) return 'Bluegill'
  if (l.includes('walleye'))              return 'Walleye'
  if (l.includes('white bass') || l.includes('drum')) return 'White Bass/Drum'
  return 'Largemouth Bass'
}

function mapLureWeight(s: string): LureWeight {
  const l = s.toLowerCase().replace(/\s/g, '')
  if (l.includes('weightless'))                  return 'Weightless'
  if (l.includes('3/16') || l === '.1875')       return '3/16 oz'
  if (l.includes('1/4')  || l === '.25')         return '1/4 oz'
  if (l.includes('3/8')  || l === '.375')        return '3/8 oz'
  if (l.includes('1/2')  || l === '.5')          return '1/2 oz'
  if (l.includes('3/4')  || l === '.75')         return '3/4 oz'
  return 'Other'
}

function parseFishWeight(s: string): { lbs: number; oz: number } {
  if (!s) return { lbs: 0, oz: 0 }
  // "3 lb 4 oz" / "3lb4oz"
  const m1 = s.match(/(\d+\.?\d*)\s*lb[s]?\s*(\d+\.?\d*)\s*oz/i)
  if (m1) return { lbs: parseFloat(m1[1]), oz: parseFloat(m1[2]) }
  // "3 4" (two numbers: lbs then oz)
  const m2 = s.match(/^(\d+)\s+(\d{1,2})$/)
  if (m2) return { lbs: parseFloat(m2[1]), oz: parseFloat(m2[2]) }
  // decimal lbs like "3.5"
  const dec = parseFloat(s)
  if (!isNaN(dec)) {
    const totalOz = Math.round(dec * 16)
    return { lbs: Math.floor(totalOz / 16), oz: totalOz % 16 }
  }
  return { lbs: 0, oz: 0 }
}

function applyTime(base: Date, timeStr: string): Date {
  if (!timeStr) return base
  const tm = timeStr.match(/(\d{1,2}):(\d{2})(?:\s*(AM|PM))?/i)
  if (tm) {
    let h = parseInt(tm[1])
    if (tm[3]?.toUpperCase() === 'PM' && h < 12) h += 12
    if (tm[3]?.toUpperCase() === 'AM' && h === 12) h = 0
    base.setHours(h, parseInt(tm[2]), 0, 0)
  }
  return base
}

function parseTimestamp(
  dateStr: string, timeStr: string,
  monthStr?: string, dayStr?: string, yearStr?: string,
): number {
  // Build from separate month/day/year columns when no combined date present
  if (!dateStr && (monthStr || dayStr || yearStr)) {
    const rawMonth = monthStr?.trim() ?? ''
    const rawDay   = dayStr?.trim() ?? '1'
    const rawYear  = yearStr?.trim() ?? String(new Date().getFullYear())

    // Month can be numeric (3), abbreviated (Mar), or full (March)
    const MONTH_NAMES = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec']
    let m = parseInt(rawMonth) - 1  // 0-based
    if (isNaN(m)) {
      const idx = MONTH_NAMES.findIndex(n => rawMonth.toLowerCase().startsWith(n))
      m = idx >= 0 ? idx : 0
    }
    let y = parseInt(rawYear)
    if (y < 100) y += 2000
    const d = parseInt(rawDay) || 1
    const base = new Date(y, m, d, 7, 0, 0, 0)  // default 7 AM
    if (!isNaN(base.getTime())) return applyTime(base, timeStr).getTime()
  }

  // Combined date field
  if (!dateStr) return Date.now()
  const combined = timeStr ? `${dateStr} ${timeStr}` : dateStr
  const d = new Date(combined)
  if (!isNaN(d.getTime())) return d.getTime()
  // Try MM/DD/YYYY
  const mdy = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
  if (mdy) {
    const year = parseInt(mdy[3]) < 100 ? 2000 + parseInt(mdy[3]) : parseInt(mdy[3])
    const base = new Date(year, parseInt(mdy[1]) - 1, parseInt(mdy[2]), 7, 0, 0, 0)
    if (!isNaN(base.getTime())) return applyTime(base, timeStr).getTime()
  }
  return Date.now()
}

function parseCoords(s: string): GPSCoords | undefined {
  if (!s) return undefined
  const m = s.match(/(-?\d+\.?\d+)[,\s]+(-?\d+\.?\d+)/)
  return m ? { lat: parseFloat(m[1]), lng: parseFloat(m[2]) } : undefined
}

// ─── Row → LandedFish ─────────────────────────────────────────────────────────
interface RowResult { fish?: LandedFish; error?: string; raw: string[] }

function parseRow(
  cols: string[],
  colMap: Partial<Record<ColKey, number>>,
): RowResult {
  const get = (k: ColKey) => colMap[k] !== undefined ? (cols[colMap[k]!] ?? '').trim() : ''

  const lureType = get('lureType')
  if (!lureType) return { error: 'No lure type', raw: cols }

  const ts = parseTimestamp(get('date'), get('time'), get('month'), get('day'), get('year'))

  // Weight: prefer separate lb/oz columns; fall back to combined column
  let lbs = 0, oz = 0
  const lbRaw = get('fishWeightLb')
  const ozRaw = get('fishWeightOz')
  if (lbRaw || ozRaw) {
    lbs = parseFloat(lbRaw) || 0
    oz  = parseFloat(ozRaw) || 0
  } else {
    const parsed = parseFishWeight(get('fishWeight'))
    lbs = parsed.lbs; oz = parsed.oz
  }

  const coords = parseCoords(get('coords'))

  // Combine supplementary fields into notes
  const extraParts = [
    get('conditions') && `Conditions: ${get('conditions')}`,
    get('rod')        && `Rod: ${get('rod')}`,
    get('location')   && `Location: ${get('location')}`,
    get('notes'),
  ].filter(Boolean)

  return {
    fish: {
      id: nanoid(),
      sessionId: 'historical',
      timestamp: ts,
      type: 'Landed Fish',
      species: get('species') ? mapSpecies(get('species')) : 'Largemouth Bass',
      weightLbs: lbs,
      weightOz: oz,
      lengthInches: parseFloat(get('length')) || 0,
      waterColumn: undefined,
      lureType,
      lureWeight: get('lureWeight') ? mapLureWeight(get('lureWeight')) : 'Other',
      lureColor: get('color'),
      customPour: false,
      notes: extraParts.join(' | ') || undefined,
      coords,
      isHistorical: true,
      historicalDate: ts,
    },
    raw: cols,
  }
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function SpreadsheetImport({ onClose }: Props) {
  const [stage, setStage]           = useState<'pick' | 'preview' | 'importing' | 'done'>('pick')
  const [rawData, setRawData]       = useState<string[][]>([])
  const [rows, setRows]             = useState<RowResult[]>([])
  const [colMap, setColMap]         = useState<Partial<Record<ColKey, number>>>({})
  const [headers, setHeaders]       = useState<string[]>([])
  const [imported, setImported]     = useState(0)
  const [errors, setErrors]         = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const text = ev.target?.result as string
      const parsed = parseCSV(text)
      if (parsed.length < 2) return
      const hdrs = parsed[0]
      const map  = detectColumns(hdrs)
      const dataRows = parsed.slice(1).filter(r => r.some(c => c.trim()))
      setHeaders(hdrs)
      setColMap(map)
      setRawData(dataRows)
      setRows(dataRows.map(r => parseRow(r, map)))
      setStage('preview')
    }
    reader.readAsText(file)
  }

  const reparse = (map: Partial<Record<ColKey, number>>) => {
    setRows(rawData.map(r => parseRow(r, map)))
  }

  const handleColChange = (key: ColKey, val: string) => {
    const newMap = { ...colMap }
    if (val === '') { delete newMap[key] } else { newMap[key] = parseInt(val) }
    setColMap(newMap)
    reparse(newMap)
  }

  const doImport = async () => {
    setStage('importing')
    let ok = 0, err = 0
    for (const row of rows) {
      if (row.fish) {
        try { await saveEvent(row.fish); ok++ } catch { err++ }
      } else {
        err++
      }
    }
    setImported(ok)
    setErrors(err)
    setStage('done')
  }

  const validRows   = rows.filter(r => r.fish)
  const invalidRows = rows.filter(r => !r.fish)

  if (stage === 'done') {
    return (
      <div className="p-4 pb-24 max-w-lg mx-auto text-center">
        <div className="text-5xl mb-4 mt-12">✅</div>
        <h2 className="th-text font-bold text-xl mb-2">Import Complete</h2>
        <p className="th-text-muted text-sm mb-1">{imported} catches imported successfully.</p>
        {errors > 0 && <p className="text-amber-400 text-sm">{errors} rows skipped (missing lure type).</p>}
        <p className="th-text-muted text-xs mt-3">Your catch history now includes this data. Generate a new briefing to use it.</p>
        <button onClick={onClose} className="mt-6 w-full py-4 th-btn-primary rounded-xl font-semibold text-base">
          Done
        </button>
      </div>
    )
  }

  if (stage === 'importing') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
        <div className="text-4xl mb-4 animate-pulse">📥</div>
        <p className="th-text-muted">Importing {validRows.length} catches…</p>
      </div>
    )
  }

  if (stage === 'preview') {
    return (
      <div className="p-4 pb-24 max-w-lg mx-auto">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => setStage('pick')} className="th-accent-text text-sm font-medium">← Back</button>
          <h2 className="th-text font-bold text-lg flex-1">Preview Import</h2>
        </div>

        {/* Interactive column mapping */}
        <div className="th-surface rounded-xl border th-border p-4 mb-4">
          <h3 className="th-text font-semibold text-sm mb-1">Column Mapping</h3>
          <p className="th-text-muted text-xs mb-3">
            Auto-detected from your headers. Fix any mismatches using the dropdowns — changes update the preview instantly.
          </p>
          <div className="space-y-2">
            {COL_KEY_ORDER.map(key => {
              const mapped = colMap[key] !== undefined
              return (
                <div key={key} className="flex items-center gap-2">
                  <span className={`text-xs w-28 shrink-0 ${key === 'lureType' ? 'th-text font-semibold' : 'th-text-muted'}`}>
                    {COL_LABELS[key]}
                  </span>
                  <select
                    className={`flex-1 th-surface-deep border rounded-lg px-2 py-1.5 text-xs th-text ${
                      mapped ? 'th-border' : (key === 'lureType' ? 'border-amber-400' : 'th-border opacity-60')
                    }`}
                    value={colMap[key] !== undefined ? String(colMap[key]) : ''}
                    onChange={e => handleColChange(key, e.target.value)}
                  >
                    <option value="">— Not mapped —</option>
                    {headers.map((h, i) => (
                      <option key={i} value={String(i)}>{h}</option>
                    ))}
                  </select>
                </div>
              )
            })}
          </div>
          {colMap.lureType === undefined && (
            <p className="text-amber-400 text-xs mt-3">⚠ Lure Type is required — rows without it will be skipped.</p>
          )}
        </div>

        {/* Summary */}
        <div className="flex gap-3 mb-4">
          <div className="flex-1 th-surface rounded-xl border th-border p-3 text-center">
            <div className="th-accent-text font-bold text-2xl">{validRows.length}</div>
            <div className="th-text-muted text-xs">ready to import</div>
          </div>
          {invalidRows.length > 0 && (
            <div className="flex-1 th-surface rounded-xl border th-border p-3 text-center">
              <div className="text-amber-400 font-bold text-2xl">{invalidRows.length}</div>
              <div className="th-text-muted text-xs">rows skipped<br/>(no lure type)</div>
            </div>
          )}
        </div>

        {/* Preview table - first 5 valid rows */}
        {validRows.slice(0, 5).map((r, i) => r.fish && (
          <div key={i} className="th-surface rounded-xl border th-border p-3 mb-2">
            <div className="flex items-center justify-between">
              <div className="th-text text-sm font-medium">{r.fish.lureType} · {r.fish.lureColor || '—'}</div>
              <div className="th-text-muted text-xs">{new Date(r.fish.timestamp).toLocaleDateString()}</div>
            </div>
            <div className="th-text-muted text-xs mt-0.5">
              {r.fish.species} · {(r.fish.weightLbs + r.fish.weightOz / 16).toFixed(1)} lbs
              {r.fish.lengthInches ? ` · ${r.fish.lengthInches}"` : ''}
            </div>
            {r.fish.notes && <div className="th-text-muted text-xs mt-0.5 italic truncate">{r.fish.notes}</div>}
          </div>
        ))}
        {validRows.length > 5 && (
          <p className="th-text-muted text-xs text-center mb-4">… and {validRows.length - 5} more</p>
        )}

        <button
          onClick={doImport}
          disabled={validRows.length === 0}
          className="w-full py-4 th-btn-primary rounded-xl font-semibold text-base disabled:opacity-40 text-center"
        >
          Import {validRows.length} Catches
        </button>
      </div>
    )
  }

  // ── Pick file ──────────────────────────────────────────────────────────────
  return (
    <div className="p-4 pb-24 max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={onClose} className="th-accent-text text-sm font-medium">← Back</button>
        <h2 className="th-text font-bold text-lg flex-1">Import from Spreadsheet</h2>
      </div>

      <div className="th-surface rounded-xl border th-border p-4 mb-4 space-y-2">
        <h3 className="th-text font-semibold text-sm">Any Column Names Work</h3>
        <p className="th-text-muted text-xs leading-relaxed">
          After loading your file you'll see a column mapping screen where you can match your spreadsheet's columns to the right fields — even if the names are different. The app auto-detects common names.
        </p>
        <p className="th-text-muted text-xs font-medium mt-1">Only <span className="th-text">Lure / Rig</span> is required. All others are optional.</p>
        <p className="th-text-muted text-xs mt-1">
          <strong className="th-text">Date</strong>: single column (<span className="font-mono">3/15/2024</span>) or separate <span className="font-mono">Month</span>, <span className="font-mono">Day</span>, <span className="font-mono">Year</span> columns — both work.<br/>
          <strong className="th-text">Fish Weight</strong>: single column <span className="font-mono">3.5</span> (lbs) or <span className="font-mono">3 lb 4 oz</span>, or separate <span className="font-mono">Fish Weight — lbs</span> and <span className="font-mono">Fish Weight — oz</span> columns.<br/>
          <strong className="th-text">Coordinates</strong>: <span className="font-mono">39.1234, -86.5678</span><br/>
          <strong className="th-text">Water column</strong> — if not in your spreadsheet it will be left blank (you can add it later).
        </p>
      </div>

      <button
        onClick={() => fileRef.current?.click()}
        className="w-full py-5 th-btn-primary rounded-xl font-semibold text-base text-center shadow-lg"
      >
        📂 Choose CSV File
      </button>
      <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} />

      <p className="th-text-muted text-xs text-center mt-3">
        Export your spreadsheet as CSV (File → Save As → CSV) before importing.
      </p>
    </div>
  )
}
