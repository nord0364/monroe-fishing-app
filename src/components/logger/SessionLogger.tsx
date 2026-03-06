import { useState, useEffect } from 'react'
import type { Session, CatchEvent, AppSettings } from '../../types'
import { getEventsForSession, saveSession, getAllSessions } from '../../db/database'
import CatchEntry from './CatchEntry'
import BriefingView from '../briefing/BriefingView'

interface Props {
  settings: AppSettings
  activeSession: Session | null
  onSessionChanged: (session: Session | null) => void
}

export default function SessionLogger({ settings, activeSession, onSessionChanged }: Props) {
  const [events, setEvents] = useState<CatchEvent[]>([])
  const [view, setView] = useState<'log' | 'entry' | 'briefing'>('log')
  const [sessions, setSessions] = useState<Session[]>([])
  const [expandedSession, setExpandedSession] = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [activeSession])

  async function loadData() {
    if (activeSession) {
      const evs = await getEventsForSession(activeSession.id)
      evs.sort((a, b) => b.timestamp - a.timestamp)
      setEvents(evs)
    }
    const all = await getAllSessions()
    setSessions(all)
  }

  const endSession = async () => {
    if (!activeSession) return
    const updated: Session = { ...activeSession, endTime: Date.now() }
    await saveSession(updated)
    onSessionChanged(null)
    setEvents([])
    setView('log')
  }

  const onEventSaved = () => {
    setView('log')
    loadData()
  }

  // ── No active session: history list ─────────────────────────────────────────
  if (!activeSession) {
    return (
      <div className="p-4 pb-24">
        <h1 className="text-xl font-bold th-text mb-1">On-Water Logger</h1>
        <p className="th-text-muted text-sm mb-6">No active session. Generate a briefing to start one.</p>

        {sessions.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-xs font-semibold th-text-muted uppercase tracking-wide">Recent Sessions</h2>
            {sessions.slice(0, 10).map(s => (
              <div key={s.id} className="th-surface rounded-xl border th-border overflow-hidden">
                <button
                  onClick={() => setExpandedSession(expandedSession === s.id ? null : s.id)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left"
                >
                  <div>
                    <div className="th-text font-medium text-sm">
                      {new Date(s.date).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                    </div>
                    <div className="th-text-muted text-xs mt-0.5">
                      {s.launchSite}
                    </div>
                    <div className="th-text-muted text-xs mt-0.5">
                      {new Date(s.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      {s.endTime && ` – ${new Date(s.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                      {s.endTime && ` · ${formatDuration(s.endTime - s.startTime)}`}
                    </div>
                  </div>
                  <span className="th-text-muted text-xs">
                    {expandedSession === s.id ? '▲' : s.aiBriefingStructured ? '📋 ▼' : '▼'}
                  </span>
                </button>
                {expandedSession === s.id && (
                  <div className="border-t th-border px-4 py-4">
                    {s.aiBriefingStructured ? (
                      <BriefingView
                        briefing={s.aiBriefingStructured}
                        conditions={s.conditions}
                        launchSite={s.launchSite}
                        sessionDate={s.date}
                      />
                    ) : (
                      <SessionConditionsDisplay conditions={s.conditions} narrative={s.aiBriefing} />
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ── Briefing view ────────────────────────────────────────────────────────────
  if (view === 'briefing') {
    return (
      <div>
        <div className="flex items-center gap-3 px-4 py-3 th-surface-deep border-b th-border sticky top-0 z-10">
          <button onClick={() => setView('log')} className="th-accent-text font-medium text-sm">← Back</button>
          <span className="th-text font-semibold">Session Briefing</span>
        </div>
        <div className="p-4 pb-24 max-w-lg mx-auto overflow-y-auto">
          {activeSession.aiBriefingStructured ? (
            <BriefingView
              briefing={activeSession.aiBriefingStructured}
              conditions={activeSession.conditions}
              launchSite={activeSession.launchSite}
              sessionDate={activeSession.date}
            />
          ) : (
            <SessionConditionsDisplay conditions={activeSession.conditions} narrative={activeSession.aiBriefing} />
          )}
        </div>
      </div>
    )
  }

  // ── Entry form ───────────────────────────────────────────────────────────────
  if (view === 'entry') {
    return (
      <div>
        <div className="flex items-center gap-3 px-4 py-3 th-surface-deep border-b th-border sticky top-0 z-10">
          <button onClick={() => setView('log')} className="th-accent-text font-medium text-sm">← Back</button>
          <span className="th-text font-semibold">Log Event</span>
        </div>
        <div className="overflow-y-auto" style={{ height: 'calc(100vh - 120px)' }}>
          <CatchEntry session={activeSession} settings={settings} onSaved={onEventSaved} />
        </div>
      </div>
    )
  }

  // ── Active session log ───────────────────────────────────────────────────────
  return (
    <div className="flex flex-col pb-24" style={{ height: 'calc(100vh - 60px)' }}>
      {/* Header */}
      <div className="th-surface-deep border-b th-border px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="th-text font-semibold">{activeSession.launchSite}</div>
            <div className="th-text-muted text-xs">
              {new Date(activeSession.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {events.length} event{events.length !== 1 ? 's' : ''}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setView('briefing')}
              className="px-3 py-2 th-surface border th-border rounded-lg th-text text-xs font-medium"
            >
              📋 Briefing
            </button>
            <button
              onClick={endSession}
              className="px-3 py-2 bg-red-800 rounded-lg text-red-200 text-xs font-medium"
            >
              End
            </button>
          </div>
        </div>
      </div>

      {/* Log Event button */}
      <button
        onClick={() => setView('entry')}
        className="mx-4 mt-4 py-3.5 th-btn-primary rounded-xl font-semibold text-base shadow-lg"
      >
        + Log Event
      </button>

      {/* Events list */}
      <div className="flex-1 overflow-y-auto px-4 mt-4 space-y-2">
        {events.length === 0 ? (
          <p className="th-text-muted text-sm text-center py-8">No events logged yet. Tap above to log your first catch.</p>
        ) : (
          events.map(ev => <EventCard key={ev.id} event={ev} />)
        )}
      </div>
    </div>
  )
}

function formatDuration(ms: number): string {
  const h = Math.floor(ms / 3600000)
  const m = Math.round((ms % 3600000) / 60000)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function EventCard({ event }: { event: CatchEvent }) {
  const time = new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const icons: Record<string, string> = {
    'Landed Fish': '🐟',
    'Quality Strike — Missed': '⚡',
    'Follow — Did Not Strike': '👀',
    'Visual Sighting': '🔭',
  }

  return (
    <div className="th-surface rounded-xl p-3 border th-border">
      <div className="flex items-start gap-2">
        <span className="text-lg mt-0.5">{icons[event.type]}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <span className="th-text text-sm font-medium">{event.type}</span>
            <span className="th-text-muted text-xs shrink-0">{time}</span>
          </div>
          {event.type === 'Landed Fish' && (
            <div className="th-text-muted text-xs mt-0.5">
              {event.species} · {event.weightLbs}lb {event.weightOz}oz · {event.lureType}
            </div>
          )}
          {(event.type === 'Quality Strike — Missed' || event.type === 'Follow — Did Not Strike') && (
            <div className="th-text-muted text-xs mt-0.5">{event.lureType}</div>
          )}
          {event.coords && (
            <div className="th-text-muted text-xs mt-0.5 opacity-50">
              📍 {event.coords.lat.toFixed(4)}, {event.coords.lng.toFixed(4)}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function SessionConditionsDisplay({ conditions, narrative }: { conditions: Session['conditions']; narrative?: string }) {
  const rows = [
    ['Air Temp', conditions.airTempF != null ? `${conditions.airTempF}°F` : undefined],
    ['Water Temp', conditions.waterTempF != null ? `${conditions.waterTempF}°F` : undefined],
    ['Wind', conditions.windSpeedMph != null ? `${conditions.windSpeedMph}mph ${conditions.windDirection ?? ''}` : undefined],
    ['Sky', conditions.skyCondition],
    ['Baro', conditions.baroPressureInHg != null ? `${conditions.baroPressureInHg} inHg (${conditions.baroTrend ?? ''})` : undefined],
    ['Water Level', conditions.waterLevelFt != null ? `${conditions.waterLevelFt} ft (${conditions.waterLevelVsNormal ?? ''})` : undefined],
    ['Clarity', conditions.waterClarity],
    ['Moon', conditions.moonPhase ? `${conditions.moonPhase} ${conditions.moonIlluminationPct ?? '?'}%` : undefined],
  ] as [string, string | undefined][]

  return (
    <div className="space-y-4">
      <div className="th-surface rounded-xl p-4 space-y-2">
        <h3 className="th-text font-semibold text-sm">Conditions</h3>
        <div className="grid grid-cols-2 gap-2">
          {rows.filter(([, v]) => v).map(([label, value]) => (
            <div key={label}>
              <div className="th-text-muted text-xs">{label}</div>
              <div className="th-text text-sm font-medium">{value}</div>
            </div>
          ))}
        </div>
      </div>
      {narrative && (
        <div className="th-surface rounded-xl p-4">
          <h3 className="th-text font-semibold text-sm mb-2">AI Briefing</h3>
          <p className="th-text text-sm leading-relaxed opacity-80">{narrative}</p>
        </div>
      )}
    </div>
  )
}
