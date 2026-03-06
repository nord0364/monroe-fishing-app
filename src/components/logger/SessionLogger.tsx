import { useState, useEffect } from 'react'
import type { Session, CatchEvent, AppSettings } from '../../types'
import {
  getEventsForSession, getAllEvents, saveSession,
  getAllSessions, deleteSessionWithEvents,
} from '../../db/database'
import CatchEntry from './CatchEntry'
import BriefingView from '../briefing/BriefingView'

interface Props {
  settings: AppSettings
  activeSession: Session | null
  onSessionChanged: (session: Session | null) => void
}

const MONTH_LABELS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

type GroupedSessions = {
  year: number
  months: { month: number; label: string; sessions: Session[] }[]
}[]

function groupSessions(sessions: Session[]): GroupedSessions {
  const map = new Map<number, Map<number, Session[]>>()
  for (const s of sessions) {
    const d = new Date(s.date)
    const y = d.getFullYear()
    const m = d.getMonth()
    if (!map.has(y)) map.set(y, new Map())
    if (!map.get(y)!.has(m)) map.get(y)!.set(m, [])
    map.get(y)!.get(m)!.push(s)
  }
  return [...map.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, months]) => ({
      year,
      months: [...months.entries()]
        .sort((a, b) => b[0] - a[0])
        .map(([month, sessions]) => ({ month, label: MONTH_LABELS[month], sessions })),
    }))
}

function formatDuration(ms: number): string {
  const h = Math.floor(ms / 3600000)
  const m = Math.round((ms % 3600000) / 60000)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export default function SessionLogger({ settings, activeSession, onSessionChanged }: Props) {
  const [events, setEvents]           = useState<CatchEvent[]>([])
  const [view, setView]               = useState<'log' | 'entry' | 'briefing'>('log')
  const [sessions, setSessions]       = useState<Session[]>([])
  const [eventCounts, setEventCounts] = useState<Record<string, number>>({})
  const [expandedId, setExpandedId]   = useState<string | null>(null)
  const [deleteId, setDeleteId]       = useState<string | null>(null)
  const [deleting, setDeleting]       = useState(false)

  useEffect(() => { loadData() }, [activeSession])

  async function loadData() {
    if (activeSession) {
      const evs = await getEventsForSession(activeSession.id)
      evs.sort((a, b) => b.timestamp - a.timestamp)
      setEvents(evs)
    }
    const [all, allEvs] = await Promise.all([getAllSessions(), getAllEvents()])
    setSessions(all)
    const counts: Record<string, number> = {}
    for (const e of allEvs) {
      counts[e.sessionId] = (counts[e.sessionId] ?? 0) + 1
    }
    setEventCounts(counts)
  }

  const endSession = async () => {
    if (!activeSession) return
    const updated: Session = { ...activeSession, endTime: Date.now() }
    await saveSession(updated)
    onSessionChanged(null)
    setEvents([])
    setView('log')
  }

  const handleDelete = async (id: string) => {
    setDeleting(true)
    await deleteSessionWithEvents(id)
    setSessions(prev => prev.filter(s => s.id !== id))
    setEventCounts(prev => { const c = { ...prev }; delete c[id]; return c })
    setDeleteId(null)
    setExpandedId(null)
    setDeleting(false)
  }

  const onEventSaved = () => { setView('log'); loadData() }

  // ── Briefing view ────────────────────────────────────────────────────────────
  if (view === 'briefing') {
    return (
      <div className="flex flex-col" style={{ height: 'calc(100vh - 60px)' }}>
        <div className="flex items-center gap-3 px-4 py-3 th-surface-deep border-b th-border">
          <button onClick={() => setView('log')} className="th-accent-text font-medium text-sm min-w-[44px] py-2">
            ← Back
          </button>
          <span className="th-text font-semibold">Session Briefing</span>
        </div>
        <div className="flex-1 overflow-y-auto p-4 pb-8 max-w-lg mx-auto w-full">
          {activeSession?.aiBriefingStructured ? (
            <BriefingView
              briefing={activeSession.aiBriefingStructured}
              conditions={activeSession.conditions}
              launchSite={activeSession.launchSite}
              sessionDate={activeSession.date}
            />
          ) : (
            <SessionConditionsDisplay
              conditions={activeSession!.conditions}
              narrative={activeSession?.aiBriefing}
            />
          )}
        </div>
      </div>
    )
  }

  // ── Entry form ───────────────────────────────────────────────────────────────
  if (view === 'entry') {
    return (
      <div className="flex flex-col" style={{ height: 'calc(100vh - 60px)' }}>
        <div className="flex items-center gap-3 px-4 py-3 th-surface-deep border-b th-border">
          <button onClick={() => setView('log')} className="th-accent-text font-medium text-sm min-w-[44px] py-2">
            ← Back
          </button>
          <span className="th-text font-semibold">Log Event</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          <CatchEntry session={activeSession!} settings={settings} onSaved={onEventSaved} />
        </div>
      </div>
    )
  }

  // ── Active session ───────────────────────────────────────────────────────────
  if (activeSession) {
    return (
      <div className="flex flex-col" style={{ height: 'calc(100vh - 60px)' }}>
        {/* Header */}
        <div className="th-surface-deep border-b th-border px-4 pt-3 pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="th-text font-bold text-base leading-tight truncate">
                {activeSession.launchSite}
              </div>
              <div className="th-text-muted text-xs mt-0.5">
                Started {new Date(activeSession.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                {' · '}{events.length} event{events.length !== 1 ? 's' : ''}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setView('briefing')}
                className="px-3 py-2.5 th-surface border th-border rounded-xl th-text text-xs font-medium min-h-[44px]"
              >
                📋 Briefing
              </button>
              <button
                onClick={endSession}
                className="px-3 py-2.5 bg-red-900/60 border border-red-700/50 rounded-xl text-red-300 text-xs font-semibold min-h-[44px]"
              >
                End
              </button>
            </div>
          </div>
        </div>

        {/* Events list — scrollable middle */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {events.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-4xl mb-3">🎣</div>
              <p className="th-text-muted text-sm">No events yet.</p>
              <p className="th-text-muted text-xs mt-1">Tap the button below to log your first catch.</p>
            </div>
          ) : (
            events.map(ev => <EventCard key={ev.id} event={ev} />)
          )}
        </div>

        {/* Log Event — sticky at bottom, thumb-reachable */}
        <div className="px-4 py-3 border-t th-border th-surface-deep">
          <button
            onClick={() => setView('entry')}
            className="w-full py-4 th-btn-primary rounded-2xl font-bold text-lg shadow-lg active:scale-[0.98] transition-transform"
          >
            + Log Event
          </button>
        </div>
      </div>
    )
  }

  // ── History list ─────────────────────────────────────────────────────────────
  const grouped = groupSessions(sessions)

  return (
    <div className="pb-24">
      <div className="px-4 pt-4 pb-3">
        <h1 className="text-xl font-bold th-text">On-Water Logger</h1>
        <p className="th-text-muted text-sm mt-0.5">
          {sessions.length === 0
            ? 'No sessions yet — generate a briefing to start.'
            : `${sessions.length} session${sessions.length !== 1 ? 's' : ''} logged`}
        </p>
      </div>

      {grouped.length === 0 && (
        <div className="text-center py-16">
          <div className="text-5xl mb-4">🌅</div>
          <p className="th-text-muted">Head to Briefing to plan your first session.</p>
        </div>
      )}

      {grouped.map(({ year, months }) => (
        <div key={year}>
          {/* Year divider */}
          <div className="px-4 py-2 flex items-center gap-3">
            <span className="text-base font-bold th-text-muted tracking-wide">{year}</span>
            <div className="flex-1 h-px th-border" />
          </div>

          {months.map(({ month, label, sessions: mSessions }) => (
            <div key={month} className="mb-1">
              {/* Month label */}
              <div className="px-4 py-1.5">
                <span className="text-xs font-semibold th-text-muted uppercase tracking-widest">
                  {label} · {mSessions.length} session{mSessions.length !== 1 ? 's' : ''}
                </span>
              </div>

              {/* Session cards */}
              <div className="space-y-1 px-3">
                {mSessions.map(s => {
                  const isExpanded = expandedId === s.id
                  const isDeleting = deleteId === s.id
                  const count = eventCounts[s.id] ?? 0
                  const dateStr = new Date(s.date).toLocaleDateString([], {
                    weekday: 'short', month: 'short', day: 'numeric',
                  })
                  const startStr = new Date(s.startTime).toLocaleTimeString([], {
                    hour: '2-digit', minute: '2-digit',
                  })
                  const duration = s.endTime
                    ? formatDuration(s.endTime - s.startTime)
                    : null

                  return (
                    <div
                      key={s.id}
                      className="th-surface rounded-2xl border th-border overflow-hidden"
                    >
                      {/* Row — tap to expand */}
                      <button
                        className="w-full flex items-center justify-between px-4 py-3.5 text-left gap-3 min-h-[60px]"
                        onClick={() => {
                          setExpandedId(isExpanded ? null : s.id)
                          setDeleteId(null)
                        }}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2">
                            <span className="th-text font-semibold text-sm">{dateStr}</span>
                            {count > 0 && (
                              <span className="th-accent-text text-xs font-medium">{count} events</span>
                            )}
                          </div>
                          <div className="th-text-muted text-xs mt-0.5 truncate">
                            {s.launchSite}
                            {duration && <span> · {startStr} · {duration}</span>}
                          </div>
                        </div>
                        <span className="th-text-muted text-sm shrink-0">
                          {isExpanded ? '▲' : s.aiBriefingStructured ? '📋' : '▼'}
                        </span>
                      </button>

                      {/* Expanded content */}
                      {isExpanded && (
                        <div className="border-t th-border">
                          {/* Delete confirmation */}
                          {isDeleting ? (
                            <div className="p-4">
                              <p className="th-text text-sm mb-4 font-medium">
                                Delete this session and all its catch records? This cannot be undone.
                              </p>
                              <div className="flex gap-3">
                                <button
                                  onClick={() => handleDelete(s.id)}
                                  disabled={deleting}
                                  className="flex-1 py-3 bg-red-700 text-white rounded-xl text-sm font-bold disabled:opacity-50"
                                >
                                  {deleting ? 'Deleting…' : 'Yes, Delete'}
                                </button>
                                <button
                                  onClick={() => setDeleteId(null)}
                                  className="flex-1 py-3 th-surface border th-border rounded-xl th-text text-sm"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="p-4">
                                {s.aiBriefingStructured ? (
                                  <BriefingView
                                    briefing={s.aiBriefingStructured}
                                    conditions={s.conditions}
                                    launchSite={s.launchSite}
                                    sessionDate={s.date}
                                  />
                                ) : (
                                  <SessionConditionsDisplay
                                    conditions={s.conditions}
                                    narrative={s.aiBriefing}
                                  />
                                )}
                              </div>
                              <div className="px-4 pb-4">
                                <button
                                  onClick={() => setDeleteId(s.id)}
                                  className="w-full py-2.5 border border-red-800/60 text-red-400 rounded-xl text-sm font-medium"
                                >
                                  Delete Session
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

// ── Event card ───────────────────────────────────────────────────────────────
function EventCard({ event }: { event: CatchEvent }) {
  const time = new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const icons: Record<string, string> = {
    'Landed Fish':               '🐟',
    'Quality Strike — Missed':   '⚡',
    'Follow — Did Not Strike':   '👀',
    'Visual Sighting':           '🔭',
  }

  return (
    <div className="th-surface rounded-2xl p-3.5 border th-border">
      <div className="flex items-start gap-3">
        <span className="text-2xl mt-0.5 shrink-0">{icons[event.type]}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <span className="th-text text-sm font-semibold">{event.type}</span>
            <span className="th-text-muted text-xs shrink-0">{time}</span>
          </div>
          {event.type === 'Landed Fish' && (
            <div className="th-text-muted text-xs mt-1 space-y-0.5">
              <div>{event.species} · <span className="th-accent-text font-medium">{event.weightLbs}lb {event.weightOz}oz</span></div>
              <div>{event.lureType}{event.lureColor ? ` · ${event.lureColor}` : ''}</div>
            </div>
          )}
          {(event.type === 'Quality Strike — Missed' || event.type === 'Follow — Did Not Strike') && (
            <div className="th-text-muted text-xs mt-1">{event.lureType}</div>
          )}
          {event.coords && (
            <div className="th-text-muted text-xs mt-1 opacity-50">
              📍 {event.coords.lat.toFixed(4)}, {event.coords.lng.toFixed(4)}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Conditions display ───────────────────────────────────────────────────────
function SessionConditionsDisplay({
  conditions, narrative,
}: {
  conditions: Session['conditions']
  narrative?: string
}) {
  const rows = [
    ['Air',   conditions.airTempF   != null ? `${conditions.airTempF}°F`   : undefined],
    ['Water', conditions.waterTempF != null ? `${conditions.waterTempF}°F` : undefined],
    ['Wind',  conditions.windSpeedMph != null
      ? `${conditions.windSpeedMph}mph ${conditions.windDirection ?? ''}`.trim()
      : undefined],
    ['Sky',   conditions.skyCondition],
    ['Baro',  conditions.baroPressureInHg != null
      ? `${conditions.baroPressureInHg} inHg (${conditions.baroTrend ?? ''})`
      : undefined],
    ['Water Level', conditions.waterLevelFt != null
      ? `${conditions.waterLevelFt} ft (${conditions.waterLevelVsNormal ?? ''})`
      : undefined],
    ['Clarity', conditions.waterClarity],
    ['Moon',  conditions.moonPhase
      ? `${conditions.moonPhase} ${conditions.moonIlluminationPct ?? '?'}%`
      : undefined],
  ] as [string, string | undefined][]

  return (
    <div className="space-y-4">
      <div className="th-surface-deep rounded-xl p-4 space-y-2">
        <h3 className="th-text font-semibold text-sm mb-3">Conditions</h3>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          {rows.filter(([, v]) => v).map(([label, value]) => (
            <div key={label}>
              <div className="th-text-muted text-xs">{label}</div>
              <div className="th-text text-sm font-medium">{value}</div>
            </div>
          ))}
        </div>
      </div>
      {narrative && (
        <div className="th-surface-deep rounded-xl p-4">
          <h3 className="th-text font-semibold text-sm mb-2">AI Briefing</h3>
          <p className="th-text-muted text-sm leading-relaxed">{narrative}</p>
        </div>
      )}
    </div>
  )
}
