import { useState, useEffect, useMemo } from 'react'
import type { LandedFish, Session, AppSettings } from '../../types'
import { getLandedFish, getAllSessions } from '../../db/database'
import SizeProgression from './SizeProgression'
import LurePerformance from './LurePerformance'
import TimeWindows from './TimeWindows'
import AIChat from './AIChat'
import CatchMap from './CatchMap'

interface Props { settings: AppSettings }

type Tab = 'size' | 'lure' | 'time' | 'history' | 'map' | 'chat'
type Season = 'Spring' | 'Summer' | 'Fall' | 'Winter'

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

const tabs: { id: Tab; label: string }[] = [
  { id: 'size',    label: 'Size' },
  { id: 'lure',    label: 'Lure' },
  { id: 'time',    label: 'Time' },
  { id: 'history', label: 'History' },
  { id: 'map',     label: '🗺 Map' },
  { id: 'chat',    label: '🤖 Chat' },
]

const SEASONS: Season[] = ['Spring', 'Summer', 'Fall', 'Winter']
const SEASON_MONTHS: Record<Season, number[]> = {
  Spring: [3, 4, 5],
  Summer: [6, 7, 8],
  Fall:   [9, 10, 11],
  Winter: [12, 1, 2],
}
const SEASON_ICON: Record<Season, string> = {
  Spring: '🌱', Summer: '☀️', Fall: '🍂', Winter: '❄️',
}

function getSeason(ts: number): Season {
  const m = new Date(ts).getMonth() + 1
  if (m >= 3 && m <= 5)  return 'Spring'
  if (m >= 6 && m <= 8)  return 'Summer'
  if (m >= 9 && m <= 11) return 'Fall'
  return 'Winter'
}

function getYear(ts: number): number {
  return new Date(ts).getFullYear()
}

// ── History tab ────────────────────────────────────────────────────────────────
function HistoryView({ allFish, settings }: { allFish: LandedFish[]; settings: AppSettings }) {
  const threshold = settings.sizeThresholdLbs ?? 3
  const lmb = allFish.filter(f => f.species === 'Largemouth Bass')

  const years = useMemo(() => {
    const ys = new Set(lmb.map(f => getYear(f.timestamp)))
    return [...ys].sort((a, b) => b - a)
  }, [lmb])

  const yearRows = useMemo(() => years.map(y => {
    const yFish = lmb.filter(f => getYear(f.timestamp) === y)
    const weights = yFish.map(f => f.weightLbs + f.weightOz / 16)
    const avg  = weights.length ? +(weights.reduce((a, b) => a + b, 0) / weights.length).toFixed(2) : 0
    const best = yFish.reduce<LandedFish | null>((a, f) => {
      const w = f.weightLbs + f.weightOz / 16
      return !a || w > (a.weightLbs + a.weightOz / 16) ? f : a
    }, null)
    const lureCounts = yFish.reduce<Record<string, number>>((a, f) => { a[f.lureType] = (a[f.lureType] ?? 0) + 1; return a }, {})
    const topLure = Object.entries(lureCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—'
    const quality = yFish.filter(f => f.weightLbs + f.weightOz / 16 >= threshold).length
    return { year: y, total: yFish.length, avg, best, topLure, quality }
  }), [years, lmb, threshold])

  const seasonRows = useMemo(() => SEASONS.map(s => {
    const ms = SEASON_MONTHS[s]
    const sFish = lmb.filter(f => ms.includes(new Date(f.timestamp).getMonth() + 1))
    const weights = sFish.map(f => f.weightLbs + f.weightOz / 16)
    const avg = weights.length ? +(weights.reduce((a, b) => a + b, 0) / weights.length).toFixed(2) : 0
    const best = sFish.reduce<LandedFish | null>((a, f) => {
      const w = f.weightLbs + f.weightOz / 16
      return !a || w > (a.weightLbs + a.weightOz / 16) ? f : a
    }, null)
    const lureCounts = sFish.reduce<Record<string, number>>((a, f) => { a[f.lureType] = (a[f.lureType] ?? 0) + 1; return a }, {})
    const topLure = Object.entries(lureCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—'
    return { season: s, total: sFish.length, avg, best, topLure }
  }), [lmb])

  if (lmb.length === 0) {
    return <p className="text-center th-text-muted py-8">No largemouth bass data yet.</p>
  }

  return (
    <div className="space-y-5 pb-6">
      {/* Year-over-year table */}
      {yearRows.length > 0 && (
        <div className="th-surface rounded-xl border th-border overflow-hidden">
          <div className="px-4 py-3 border-b th-border">
            <h3 className="th-text font-semibold text-sm">Year by Year — Largemouth</h3>
          </div>
          <div className="divide-y th-border">
            {yearRows.map(r => (
              <div key={r.year} className="px-4 py-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="th-text font-bold text-base">{r.year}</span>
                  <span className="th-accent-text text-sm font-semibold">{r.total} catches</span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
                  <div className="th-text-muted">Avg weight <span className="th-text font-medium">{r.avg} lbs</span></div>
                  <div className="th-text-muted">Quality (≥{threshold}lb) <span className="th-text font-medium">{r.quality}</span></div>
                  <div className="th-text-muted">Top lure <span className="th-text font-medium">{r.topLure}</span></div>
                  {r.best && (
                    <div className="th-text-muted">Best fish <span className="text-emerald-400 font-medium">{(r.best.weightLbs + r.best.weightOz / 16).toFixed(1)} lbs</span></div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Seasonal breakdown (all years combined) */}
      <div className="th-surface rounded-xl border th-border overflow-hidden">
        <div className="px-4 py-3 border-b th-border">
          <h3 className="th-text font-semibold text-sm">Seasonal Patterns — All Years</h3>
          <p className="th-text-muted text-xs mt-0.5">Spring Mar–May · Summer Jun–Aug · Fall Sep–Nov · Winter Dec–Feb</p>
        </div>
        <div className="divide-y th-border">
          {seasonRows.map(r => (
            <div key={r.season} className="px-4 py-3">
              <div className="flex items-center justify-between mb-1">
                <span className="th-text font-semibold text-sm">{SEASON_ICON[r.season]} {r.season}</span>
                <span className="th-text-muted text-xs">{r.total} catches</span>
              </div>
              {r.total > 0 ? (
                <div className="grid grid-cols-2 gap-x-4 text-xs">
                  <div className="th-text-muted">Avg weight <span className="th-text font-medium">{r.avg} lbs</span></div>
                  <div className="th-text-muted">Top lure <span className="th-text font-medium">{r.topLure}</span></div>
                  {r.best && (
                    <div className="th-text-muted">Best fish <span className="text-emerald-400 font-medium">{(r.best.weightLbs + r.best.weightOz / 16).toFixed(1)} lbs</span></div>
                  )}
                </div>
              ) : (
                <p className="th-text-muted text-xs">No data for this season yet.</p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Season x Lure cross-tab */}
      <div className="th-surface rounded-xl border th-border p-4">
        <h3 className="th-text font-semibold text-sm mb-3">Top Lure Per Season</h3>
        <div className="space-y-2">
          {SEASONS.map(s => {
            const ms = SEASON_MONTHS[s]
            const sFish = lmb.filter(f => ms.includes(new Date(f.timestamp).getMonth() + 1))
            if (sFish.length === 0) return null
            const lureCounts = sFish.reduce<Record<string, number>>((a, f) => { a[f.lureType] = (a[f.lureType] ?? 0) + 1; return a }, {})
            const sorted = Object.entries(lureCounts).sort((a, b) => b[1] - a[1]).slice(0, 3)
            return (
              <div key={s}>
                <div className="th-text-muted text-xs font-semibold mb-1">{SEASON_ICON[s]} {s}</div>
                <div className="flex flex-wrap gap-1.5">
                  {sorted.map(([lure, count]) => (
                    <span key={lure} className="text-xs px-2 py-1 th-surface-deep border th-border rounded-lg th-text">
                      {lure} <span className="th-text-muted">({count})</span>
                    </span>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function PatternReview({ settings }: Props) {
  const [tab, setTab] = useState<Tab>('size')
  const [allFish, setAllFish]     = useState<LandedFish[]>([])
  const [sessions, setSessions]   = useState<Session[]>([])
  const [loading, setLoading]     = useState(true)
  const [yearFilter, setYearFilter]     = useState<number | 'all'>('all')
  const [seasonFilter, setSeasonFilter] = useState<Season | 'all'>('all')
  const [monthFilter, setMonthFilter]   = useState<number | 'all'>('all')

  useEffect(() => {
    Promise.all([getLandedFish(), getAllSessions()]).then(([f, s]) => {
      setAllFish(f); setSessions(s); setLoading(false)
    })
  }, [])

  const availableYears = useMemo(() => {
    const ys = new Set(allFish.map(f => getYear(f.timestamp)))
    return [...ys].sort((a, b) => b - a)
  }, [allFish])

  // Months that have data in the selected year (0-indexed)
  const availableMonths = useMemo(() => {
    if (yearFilter === 'all') return []
    const ms = new Set(
      allFish
        .filter(f => getYear(f.timestamp) === yearFilter)
        .map(f => new Date(f.timestamp).getMonth())
    )
    return [...ms].sort((a, b) => a - b)
  }, [allFish, yearFilter])

  const filteredFish = useMemo(() => {
    return allFish.filter(f => {
      if (yearFilter !== 'all' && getYear(f.timestamp) !== yearFilter) return false
      if (seasonFilter !== 'all' && getSeason(f.timestamp) !== seasonFilter) return false
      if (monthFilter !== 'all' && new Date(f.timestamp).getMonth() !== monthFilter) return false
      return true
    })
  }, [allFish, yearFilter, seasonFilter, monthFilter])

  const filteredSessions = useMemo(() => {
    return sessions.filter(s => {
      const ts = s.startTime ?? 0
      if (yearFilter !== 'all' && getYear(ts) !== yearFilter) return false
      if (seasonFilter !== 'all' && getSeason(ts) !== seasonFilter) return false
      if (monthFilter !== 'all' && new Date(ts).getMonth() !== monthFilter) return false
      return true
    })
  }, [sessions, yearFilter, seasonFilter, monthFilter])

  const isFiltered = yearFilter !== 'all' || seasonFilter !== 'all' || monthFilter !== 'all'
  const filterLabel = [
    yearFilter !== 'all' ? String(yearFilter) : '',
    monthFilter !== 'all' ? MONTH_SHORT[monthFilter] : seasonFilter !== 'all' ? seasonFilter : '',
  ].filter(Boolean).join(' · ')

  return (
    <div className="flex flex-col pb-24" style={{ minHeight: 'calc(100vh - 60px)' }}>
      <div className="px-4 pt-4 pb-2">
        <h1 className="text-xl font-bold th-text mb-0.5">Pattern Review</h1>
        <p className="th-text-muted text-xs">
          {isFiltered
            ? `${filteredFish.length} catches · ${filterLabel}`
            : `${allFish.length} total catches`}
        </p>
      </div>

      {/* Year filter */}
      {availableYears.length > 1 && (
        <div className="flex gap-2 overflow-x-auto px-4 pb-1.5 scrollbar-hide">
          <button
            onClick={() => { setYearFilter('all'); setMonthFilter('all') }}
            className={`shrink-0 px-4 py-2 rounded-xl text-xs font-semibold border transition-colors min-h-[38px] ${
              yearFilter === 'all'
                ? 'th-btn-primary border-transparent'
                : 'th-surface th-text-muted th-border'
            }`}
          >All Years</button>
          {availableYears.map(y => (
            <button
              key={y}
              onClick={() => { setYearFilter(yearFilter === y ? 'all' : y); setMonthFilter('all') }}
              className={`shrink-0 px-4 py-2 rounded-xl text-xs font-semibold border transition-colors min-h-[38px] ${
                yearFilter === y
                  ? 'th-btn-primary border-transparent'
                  : 'th-surface th-text-muted th-border'
              }`}
            >{y}</button>
          ))}
        </div>
      )}

      {/* Month filter — only shown when a year is selected */}
      {yearFilter !== 'all' && availableMonths.length > 1 && (
        <div className="flex gap-2 overflow-x-auto px-4 pb-1.5 scrollbar-hide">
          <button
            onClick={() => setMonthFilter('all')}
            className={`shrink-0 px-3 py-2 rounded-xl text-xs font-semibold border transition-colors min-h-[34px] ${
              monthFilter === 'all'
                ? 'th-btn-primary border-transparent'
                : 'th-surface th-text-muted th-border'
            }`}
          >All Months</button>
          {availableMonths.map(m => (
            <button
              key={m}
              onClick={() => setMonthFilter(monthFilter === m ? 'all' : m)}
              className={`shrink-0 px-3 py-2 rounded-xl text-xs font-semibold border transition-colors min-h-[34px] ${
                monthFilter === m
                  ? 'th-btn-primary border-transparent'
                  : 'th-surface th-text-muted th-border'
              }`}
            >{MONTH_SHORT[m]}</button>
          ))}
        </div>
      )}

      {/* Season filter */}
      <div className="flex gap-2 overflow-x-auto px-4 pb-2 scrollbar-hide">
        <button
          onClick={() => { setSeasonFilter('all'); setMonthFilter('all') }}
          className={`shrink-0 px-4 py-2 rounded-xl text-xs font-semibold border transition-colors min-h-[38px] ${
            seasonFilter === 'all'
              ? 'th-btn-primary border-transparent'
              : 'th-surface th-text-muted th-border'
          }`}
        >All Seasons</button>
        {SEASONS.map(s => (
          <button
            key={s}
            onClick={() => { setSeasonFilter(seasonFilter === s ? 'all' : s); setMonthFilter('all') }}
            className={`shrink-0 px-4 py-2 rounded-xl text-xs font-semibold border transition-colors min-h-[38px] ${
              seasonFilter === s
                ? 'th-btn-primary border-transparent'
                : 'th-surface th-text-muted th-border'
            }`}
          >{SEASON_ICON[s]} {s}</button>
        ))}
      </div>

      {/* Tab bar */}
      <div className="flex overflow-x-auto gap-1.5 px-4 pb-3 scrollbar-hide">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`shrink-0 px-4 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap transition-colors min-h-[42px] ${
              tab === t.id
                ? 'th-btn-primary shadow-lg'
                : 'th-surface th-text-muted th-border border'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-4 pt-1">
        {loading ? (
          <div className="text-center py-12 th-text-muted">Loading…</div>
        ) : allFish.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-5xl mb-4">🎣</div>
            <p className="th-text-muted">No catches logged yet.</p>
            <p className="th-text-muted text-sm mt-1">Start a session or import historical data.</p>
          </div>
        ) : tab === 'history' ? (
          <HistoryView allFish={allFish} settings={settings} />
        ) : tab === 'map' ? (
          <CatchMap key={`${yearFilter}-${seasonFilter}`} fish={filteredFish} settings={settings} />
        ) : filteredFish.length === 0 ? (
          <div className="text-center py-12">
            <p className="th-text-muted">No catches match this filter.</p>
            <button
              onClick={() => { setYearFilter('all'); setSeasonFilter('all'); setMonthFilter('all') }}
              className="mt-4 px-4 py-2.5 th-surface border th-border rounded-xl th-accent-text text-sm font-medium"
            >Clear Filters</button>
          </div>
        ) : (
          <>
            {tab === 'size'    && <SizeProgression fish={filteredFish} settings={settings} />}
            {tab === 'lure'    && <LurePerformance fish={filteredFish} settings={settings} />}
            {tab === 'time'    && <TimeWindows fish={filteredFish} sessions={filteredSessions} />}
            {tab === 'chat'    && <AIChat fish={filteredFish} sessions={filteredSessions} settings={settings} />}
          </>
        )}
      </div>
    </div>
  )
}
