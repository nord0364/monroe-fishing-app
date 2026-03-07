import { useState, useEffect } from 'react'
import type { Session, CatchEvent, AppSettings } from '../../types'
import {
  getEventsForSession, getAllEvents, saveSession,
  getAllSessions, deleteSessionWithEvents, deleteEvent,
} from '../../db/database'
import CatchEntry from './CatchEntry'
import BriefingView from '../briefing/BriefingView'
import PostSessionReview from './PostSessionReview'

interface Props {
  settings: AppSettings
  activeSession: Session | null
  onSessionChanged: (session: Session | null) => void
  onSessionEnded?: (session: Session) => void  // Called instead of onSessionChanged(null) when session ends
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

export default function SessionLogger({ settings, activeSession, onSessionChanged, onSessionEnded }: Props) {
  const [events, setEvents]           = useState<CatchEvent[]>([])
  const [view, setView]               = useState<'log' | 'entry' | 'briefing' | 'wrapup'>('log')
  const [sessions, setSessions]       = useState<Session[]>([])
  const [eventCounts, setEventCounts] = useState<Record<string, number>>({})
  const [expandedId, setExpandedId]   = useState<string | null>(null)
  const [deleteId, setDeleteId]       = useState<string | null>(null)
  const [deleting, setDeleting]       = useState(false)
  const [openMonths, setOpenMonths]   = useState<Set<string>>(new Set())
  // For ending session — keep ended session in local state for wrapup view
  const [endedSession, setEndedSession] = useState<Session | null>(null)
  // For adding catches to past sessions from history
  const [contextSession, setContextSession] = useState<Session | null>(null)
  // For deleting events from active or past sessions
  const [deletingEventId, setDeletingEventId] = useState<string | null>(null)
  // Past session events (for history expanded view)
  const [pastSessionEvents, setPastSessionEvents] = useState<Record<string, CatchEvent[]>>({})

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
    setOpenMonths(prev => {
      if (prev.size > 0) return prev
      const grouped = groupSessions(all)
      if (grouped.length > 0 && grouped[0].months.length > 0) {
        const { year, months } = grouped[0]
        return new Set([`${year}-${months[0].month}`])
      }
      return prev
    })
  }

  const loadPastSessionEvents = async (sessionId: string) => {
    const evs = await getEventsForSession(sessionId)
    evs.sort((a, b) => b.timestamp - a.timestamp)
    setPastSessionEvents(prev => ({ ...prev, [sessionId]: evs }))
  }

  const goToWrapup = async () => {
    if (!activeSession) return
    const updated: Session = { ...activeSession, endTime: Date.now() }
    await saveSession(updated)
    setEndedSession(updated)
    setView('wrapup')
    // Note: onSessionChanged is called from finishSession, not here
  }

  const finishSession = () => {
    if (onSessionEnded && endedSession) {
      onSessionEnded(endedSession)
    } else {
      onSessionChanged(null)
    }
    setEndedSession(null)
    setEvents([])
    setView('log')
    loadData()
  }

  const handleDeleteEvent = async (eventId: string, sessionId: string) => {
    setDeletingEventId(null)
    await deleteEvent(eventId)
    // Refresh events
    if (activeSession && sessionId === activeSession.id) {
      const evs = await getEventsForSession(activeSession.id)
      evs.sort((a, b) => b.timestamp - a.timestamp)
      setEvents(evs)
    }
    if (pastSessionEvents[sessionId]) {
      await loadPastSessionEvents(sessionId)
    }
    // Update counts
    setEventCounts(prev => {
      const c = { ...prev }
      c[sessionId] = Math.max(0, (c[sessionId] ?? 1) - 1)
      return c
    })
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

  const onEventSaved = () => {
    setContextSession(null)
    setView('log')
    loadData()
    // Refresh past session events if we added to one
    if (contextSession && contextSession.id !== activeSession?.id) {
      loadPastSessionEvents(contextSession.id)
    }
  }

  // ── Wrapup / post-session review ─────────────────────────────────────────────
  if (view === 'wrapup' && endedSession) {
    return (
      <PostSessionReview
        session={endedSession}
        apiKey={settings.anthropicApiKey}
        onBackToSession={() => { setEndedSession(null); loadData(); setView('log') }}
        onDone={finishSession}
      />
    )
  }

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
    const entrySession = contextSession ?? activeSession!
    return (
      <div className="flex flex-col" style={{ height: 'calc(100vh - 60px)' }}>
        <div className="flex items-center gap-3 px-4 py-3 th-surface-deep border-b th-border">
          <button onClick={() => { setContextSession(null); setView('log') }} className="th-accent-text font-medium text-sm min-w-[44px] py-2">
            ← Back
          </button>
          <div className="flex-1 min-w-0">
            <span className="th-text font-semibold">Log Event</span>
            {contextSession && contextSession.id !== activeSession?.id && (
              <p className="th-text-muted text-xs truncate">{contextSession.launchSite}</p>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          <CatchEntry session={entrySession} settings={settings} onSaved={onEventSaved} />
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
                {new Date(activeSession.startTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                {' — now · '}{events.length} event{events.length !== 1 ? 's' : ''}
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
                onClick={goToWrapup}
                className="px-3 py-2.5 bg-red-900/60 border border-red-700/50 rounded-xl text-red-300 text-xs font-semibold min-h-[44px]"
              >
                End
              </button>
            </div>
          </div>
        </div>

        {/* Events list */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {events.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-4xl mb-3">🎣</div>
              <p className="th-text-muted text-sm">No events yet.</p>
              <p className="th-text-muted text-xs mt-1">Tap the button below to log your first catch.</p>
            </div>
          ) : (
            events.map(ev => (
              <EventCard
                key={ev.id}
                event={ev}
                deletingId={deletingEventId}
                onDeleteRequest={id => setDeletingEventId(id === deletingEventId ? null : id)}
                onDeleteConfirm={id => handleDeleteEvent(id, activeSession.id)}
              />
            ))
          )}
        </div>

        {/* Log Event button */}
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
          <div className="px-4 py-2 flex items-center gap-3">
            <span className="text-sm font-bold th-text-muted tracking-wider">{year}</span>
            <div className="flex-1 h-px th-border" />
          </div>

          {months.map(({ month, label, sessions: mSessions }) => {
            const monthKey    = `${year}-${month}`
            const isMonthOpen = openMonths.has(monthKey)
            const toggleMonth = () => setOpenMonths(prev => {
              const n = new Set(prev)
              n.has(monthKey) ? n.delete(monthKey) : n.add(monthKey)
              return n
            })

            return (
              <div key={month} className="mb-1">
                <button
                  onClick={toggleMonth}
                  className="w-full flex items-center justify-between px-4 py-2.5 text-left min-h-[44px]"
                >
                  <span className="text-xs font-bold th-text-muted uppercase tracking-widest">
                    {label} · {mSessions.length} session{mSessions.length !== 1 ? 's' : ''}
                  </span>
                  <span className="th-text-muted text-xs ml-2">{isMonthOpen ? '▲' : '▼'}</span>
                </button>

                {isMonthOpen && (
                  <div className="space-y-1 px-3 pb-1">
                    {mSessions.map(s => {
                      const isExpanded = expandedId === s.id
                      const isDeleting = deleteId === s.id
                      const count      = eventCounts[s.id] ?? 0
                      const displayDate = s.plannedDate ?? s.date
                      const dateStr = new Date(displayDate).toLocaleDateString([], {
                        weekday: 'short', month: 'short', day: 'numeric',
                      })
                      const startStr = new Date(s.startTime).toLocaleTimeString([], {
                        hour: 'numeric', minute: '2-digit',
                      })
                      const endStr = s.endTime
                        ? new Date(s.endTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
                        : null
                      const duration = s.endTime ? formatDuration(s.endTime - s.startTime) : null
                      const timeLabel = s.plannedWindow
                        ? `Planned ${s.plannedWindow}`
                        : endStr
                          ? `${startStr} – ${endStr} · ${duration}`
                          : startStr

                      return (
                        <div key={s.id} className="th-surface rounded-2xl border th-border overflow-hidden">
                          <button
                            className="w-full flex items-start justify-between px-4 py-3 text-left gap-3 min-h-[56px]"
                            onClick={() => {
                              setExpandedId(isExpanded ? null : s.id)
                              setDeleteId(null)
                              if (!isExpanded) loadPastSessionEvents(s.id)
                            }}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="th-text font-semibold text-sm">{dateStr}</span>
                                {s.plannedDate && (
                                  <span className="text-amber-400 text-xs font-semibold">Planned</span>
                                )}
                                {count > 0 && (
                                  <span className="th-accent-text text-xs font-medium">{count} event{count !== 1 ? 's' : ''}</span>
                                )}
                              </div>
                              <div className="th-text-muted text-xs mt-0.5 truncate">{s.launchSite}</div>
                              <div className="th-text text-xs mt-1 font-medium opacity-70">{timeLabel}</div>
                            </div>
                            <span className="th-text-muted text-sm shrink-0 mt-0.5">
                              {isExpanded ? '▲' : s.aiBriefingStructured ? '📋' : '▼'}
                            </span>
                          </button>

                          {isExpanded && (
                            <div className="border-t th-border">
                              {isDeleting ? (
                                <div className="p-4">
                                  <p className="th-text text-sm mb-4 font-medium">
                                    Delete this session and all its catch records? This cannot be undone.
                                  </p>
                                  <div className="flex gap-3">
                                    <button onClick={() => handleDelete(s.id)} disabled={deleting}
                                      className="flex-1 py-3 bg-red-700 text-white rounded-xl text-sm font-bold disabled:opacity-50">
                                      {deleting ? 'Deleting…' : 'Yes, Delete'}
                                    </button>
                                    <button onClick={() => setDeleteId(null)}
                                      className="flex-1 py-3 th-surface border th-border rounded-xl th-text text-sm">
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  {/* Briefing summary */}
                                  <div className="p-4">
                                    {s.aiBriefingStructured ? (
                                      <BriefingView
                                        briefing={s.aiBriefingStructured}
                                        conditions={s.conditions}
                                        launchSite={s.launchSite}
                                        sessionDate={displayDate}
                                      />
                                    ) : (
                                      <SessionConditionsDisplay
                                        conditions={s.conditions}
                                        narrative={s.aiBriefing}
                                      />
                                    )}
                                  </div>

                                  {/* Past session event list */}
                                  {(pastSessionEvents[s.id]?.length ?? 0) > 0 && (
                                    <div className="px-4 pb-2">
                                      <div className="text-xs font-bold th-text-muted uppercase tracking-wide mb-2">Catches</div>
                                      <div className="space-y-1.5">
                                        {pastSessionEvents[s.id].map(ev => (
                                          <PastEventRow
                                            key={ev.id}
                                            event={ev}
                                            deletingId={deletingEventId}
                                            onDeleteRequest={id => setDeletingEventId(id === deletingEventId ? null : id)}
                                            onDeleteConfirm={id => handleDeleteEvent(id, s.id)}
                                          />
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {/* Add catch + delete session */}
                                  <div className="px-4 pb-4 space-y-2">
                                    <button
                                      onClick={() => { setContextSession(s); setView('entry') }}
                                      className="w-full py-2.5 th-surface-deep border th-border rounded-xl th-accent-text text-sm font-semibold"
                                    >
                                      + Add Catch to This Session
                                    </button>
                                    <button onClick={() => setDeleteId(s.id)}
                                      className="w-full py-2.5 border border-red-800/60 text-red-400 rounded-xl text-sm font-medium">
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
                )}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

// ── Active session EventCard with delete ─────────────────────────────────────
const EVENT_ICONS: Record<string, string> = {
  'Landed Fish':             '🐟',
  'Quality Strike — Missed': '⚡',
  'Follow — Did Not Strike': '👀',
  'Visual Sighting':         '🔭',
}

function EventCard({ event, deletingId, onDeleteRequest, onDeleteConfirm }: {
  event: CatchEvent
  deletingId: string | null
  onDeleteRequest: (id: string) => void
  onDeleteConfirm: (id: string) => void
}) {
  const time = new Date(event.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  const confirming = deletingId === event.id

  return (
    <div className={`th-surface rounded-2xl border th-border transition-all ${confirming ? 'border-red-700/50' : ''}`}>
      <div className="flex items-start gap-3 p-3.5">
        <span className="text-2xl mt-0.5 shrink-0">{EVENT_ICONS[event.type]}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="th-text text-sm font-semibold">{event.type}</span>
            <span className="th-text font-semibold text-xs shrink-0 opacity-60">{time}</span>
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
        <button
          onClick={() => onDeleteRequest(event.id)}
          className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg opacity-30 hover:opacity-70 th-text text-base"
        >
          ✕
        </button>
      </div>
      {confirming && (
        <div className="px-3.5 pb-3.5 flex gap-2">
          <button
            onClick={() => onDeleteConfirm(event.id)}
            className="flex-1 py-2 bg-red-700 text-white rounded-xl text-xs font-bold"
          >
            Delete
          </button>
          <button
            onClick={() => onDeleteRequest(event.id)}
            className="flex-1 py-2 th-surface-deep border th-border rounded-xl th-text text-xs"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}

// ── Past session event row ────────────────────────────────────────────────────
function PastEventRow({ event, deletingId, onDeleteRequest, onDeleteConfirm }: {
  event: CatchEvent
  deletingId: string | null
  onDeleteRequest: (id: string) => void
  onDeleteConfirm: (id: string) => void
}) {
  const time = new Date(event.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  const confirming = deletingId === event.id
  return (
    <div className={`th-surface-deep rounded-xl border th-border ${confirming ? 'border-red-700/50' : ''}`}>
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span className="text-base shrink-0">{EVENT_ICONS[event.type]}</span>
        <div className="flex-1 min-w-0">
          <div className="th-text text-xs font-semibold">{event.type}</div>
          {event.type === 'Landed Fish' && (
            <div className="th-text-muted text-xs">
              {event.species} · {event.weightLbs}lb {event.weightOz}oz · {event.lureType}
            </div>
          )}
          {(event.type === 'Quality Strike — Missed' || event.type === 'Follow — Did Not Strike') && (
            <div className="th-text-muted text-xs">{event.lureType}</div>
          )}
        </div>
        <span className="th-text-muted text-xs shrink-0">{time}</span>
        <button
          onClick={() => onDeleteRequest(event.id)}
          className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg opacity-30 hover:opacity-70 th-text text-xs"
        >
          ✕
        </button>
      </div>
      {confirming && (
        <div className="px-3 pb-2.5 flex gap-2">
          <button onClick={() => onDeleteConfirm(event.id)}
            className="flex-1 py-1.5 bg-red-700 text-white rounded-lg text-xs font-bold">
            Delete
          </button>
          <button onClick={() => onDeleteRequest(event.id)}
            className="flex-1 py-1.5 th-surface border th-border rounded-lg th-text text-xs">
            Cancel
          </button>
        </div>
      )}
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
