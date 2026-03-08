import type { LandedFish, Session } from '../types'

const STORAGE_KEY    = 'pattern_intelligence_v1'
const REFRESH_THRESHOLD = 10  // refresh after 10 new catches

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PatternCache {
  catchCountSnapshot: number
  generatedAt:        number
  summary:            string
}

// ── Persistence ───────────────────────────────────────────────────────────────

export function loadPatternCache(): PatternCache | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as PatternCache) : null
  } catch {
    return null
  }
}

export function savePatternCache(cache: PatternCache): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cache)) } catch {}
}

export function clearPatternCache(): void {
  localStorage.removeItem(STORAGE_KEY)
}

// ── Freshness check ───────────────────────────────────────────────────────────

export function needsRefresh(currentCount: number): boolean {
  const cached = loadPatternCache()
  if (!cached) return true
  return currentCount - cached.catchCountSnapshot >= REFRESH_THRESHOLD
}

// ── Summary generator (programmatic, zero API cost) ───────────────────────────

export function generatePatternSummary(catches: LandedFish[], sessions: Session[]): string {
  if (catches.length === 0) {
    return `No catch history yet (${sessions.length} sessions logged). Weight recommendations toward Lake Monroe largemouth bass seasonal defaults.`
  }

  const lines: string[] = [
    `PATTERN INTELLIGENCE — ${catches.length} total catches across ${sessions.length} sessions:`,
  ]

  // Top lure types by catch count
  const lureMap = new Map<string, number>()
  for (const c of catches) lureMap.set(c.lureType, (lureMap.get(c.lureType) ?? 0) + 1)
  const topLures = [...lureMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
  lines.push(`Top lures: ${topLures.map(([l, n]) => `${l} (${n}x)`).join(', ')}`)

  // Top 3 fish by weight
  const top3 = [...catches]
    .sort((a, b) => (b.weightLbs + b.weightOz / 16) - (a.weightLbs + a.weightOz / 16))
    .slice(0, 3)
  lines.push(`Best fish: ${top3.map(f => `${(f.weightLbs + f.weightOz / 16).toFixed(1)} lbs on ${f.lureType} (${f.lureColor})`).join('; ')}`)

  // Same-month pattern
  const currentMonth = new Date().getMonth()
  const monthNames   = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const thisMonth    = catches.filter(c => new Date(c.timestamp).getMonth() === currentMonth)
  if (thisMonth.length >= 2) {
    const mMap = new Map<string, number>()
    for (const c of thisMonth) mMap.set(c.lureType, (mMap.get(c.lureType) ?? 0) + 1)
    const mTop = [...mMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
    lines.push(`${monthNames[currentMonth]} (${thisMonth.length} catches): ${mTop.map(([l, n]) => `${l} (${n}x)`).join(', ')}`)
  }

  // Water column
  const colMap = new Map<string, number>()
  for (const c of catches) if (c.waterColumn) colMap.set(c.waterColumn, (colMap.get(c.waterColumn) ?? 0) + 1)
  if (colMap.size > 0) {
    const top = [...colMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
    lines.push(`Column: ${top.map(([c, n]) => `${c} (${n}x)`).join(', ')}`)
  }

  // Retrieve style
  const retMap = new Map<string, number>()
  for (const c of catches) if (c.retrieveStyle) retMap.set(c.retrieveStyle, (retMap.get(c.retrieveStyle) ?? 0) + 1)
  if (retMap.size > 0) {
    const top = [...retMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
    lines.push(`Retrieve: ${top.map(([r, n]) => `${r} (${n}x)`).join(', ')}`)
  }

  // Structure
  const strMap = new Map<string, number>()
  for (const c of catches) if (c.structure) strMap.set(c.structure, (strMap.get(c.structure) ?? 0) + 1)
  if (strMap.size > 0) {
    const top = [...strMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
    lines.push(`Structure: ${top.map(([s, n]) => `${s} (${n}x)`).join(', ')}`)
  }

  // Species (if multiple)
  const specMap = new Map<string, number>()
  for (const c of catches) specMap.set(c.species, (specMap.get(c.species) ?? 0) + 1)
  if (specMap.size > 1) {
    const top = [...specMap.entries()].sort((a, b) => b[1] - a[1])
    lines.push(`Species: ${top.map(([s, n]) => `${s} (${n}x)`).join(', ')}`)
  }

  return lines.join('\n')
}

// ── Rolling conversation compaction ───────────────────────────────────────────
// Collapses oldest exchanges into a text summary when conversation exceeds windowSize.

export function compactMessages<T extends { role: string; content: string }>(
  messages: T[],
  windowSize = 6,
): T[] {
  const maxMessages = windowSize * 2  // user + assistant pairs
  if (messages.length <= maxMessages) return messages

  const toCompact = messages.slice(0, messages.length - maxMessages)
  const toKeep    = messages.slice(messages.length - maxMessages)

  const summaryLines: string[] = ['[Earlier conversation summary:']
  for (let i = 0; i < toCompact.length - 1; i += 2) {
    const q = toCompact[i]
    const a = toCompact[i + 1]
    if (q && a) {
      const qText = q.content.slice(0, 80)  + (q.content.length > 80  ? '…' : '')
      const aText = a.content.slice(0, 120) + (a.content.length > 120 ? '…' : '')
      summaryLines.push(`Q: ${qText} → A: ${aText}`)
    }
  }
  summaryLines.push(']')

  const base = toCompact[0]
  const summaryMsg = { ...base, role: 'user',      content: summaryLines.join('\n') } as T
  const ackMsg     = { ...base, role: 'assistant', content: 'Understood, I have context from our earlier discussion.' } as T

  return [summaryMsg, ackMsg, ...toKeep]
}
