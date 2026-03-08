import { useState, useEffect } from 'react'
import type { Session, CatchEvent, LandedFish } from '../../types'
import { getEventsForSession } from '../../db/database'
import { cancelSpeech } from '../../utils/speech'

interface Props {
  session: Session
  apiKey: string
  onBackToSession: () => void
  onDone: () => void
  onOpenGuide?: (session: Session) => void
}

function formatDuration(ms: number) {
  const h = Math.floor(ms / 3600000)
  const m = Math.round((ms % 3600000) / 60000)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export default function PostSessionReview({ session, apiKey, onBackToSession, onDone, onOpenGuide }: Props) {
  const [events, setEvents] = useState<CatchEvent[]>([])

  useEffect(() => {
    getEventsForSession(session.id).then(setEvents)
    return () => { cancelSpeech() }
  }, [session.id])

  const landed   = events.filter(e => e.type === 'Landed Fish') as LandedFish[]
  const strikes  = events.filter(e => e.type === 'Quality Strike — Missed').length
  const follows  = events.filter(e => e.type === 'Follow — Did Not Strike').length
  const duration = session.endTime
    ? formatDuration(session.endTime - session.startTime)
    : formatDuration(Date.now() - session.startTime)

  const topWeight = landed.reduce((best, f) => {
    const w = f.weightLbs + f.weightOz / 16
    return w > best ? w : best
  }, 0)

  const topLure = (() => {
    const counts: Record<string, number> = {}
    for (const ev of landed) counts[ev.lureType] = (counts[ev.lureType] ?? 0) + 1
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
    return top ? top[0] : null
  })()

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 60px)' }}>
      <div className="flex-1 overflow-y-auto p-4 pb-6 space-y-4 max-w-lg mx-auto w-full">

        {/* Header */}
        <div>
          <h2 className="th-text font-bold text-lg">Session Wrap-Up</h2>
          <p className="th-text-muted text-sm">{session.launchSite} · {duration}</p>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Fish Landed" value={String(landed.length)} />
          <StatCard label="Session Time" value={duration} />
          {topWeight > 0 && (
            <StatCard label="Top Fish" value={`${topWeight.toFixed(1)} lbs`} />
          )}
          {topLure && (
            <StatCard label="Top Lure" value={topLure} />
          )}
          {strikes > 0 && (
            <StatCard label="Missed Strikes" value={String(strikes)} />
          )}
          {follows > 0 && (
            <StatCard label="Follows" value={String(follows)} />
          )}
        </div>

        {/* AI Analysis */}
        <div className="th-surface rounded-2xl border th-border overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b th-border">
            <span className="th-text font-semibold text-sm">📊 Session Analysis</span>
          </div>
          {session.analysisummary ? (
            <div className="px-4 py-3 space-y-3">
              <p className="th-text text-sm leading-relaxed">{session.analysisummary}</p>
              <button
                onClick={() => onOpenGuide?.(session)}
                disabled={!apiKey}
                className="w-full py-2.5 th-surface-deep border th-border rounded-xl th-text-muted font-medium text-sm disabled:opacity-40"
              >
                Continue in Guide →
              </button>
            </div>
          ) : (
            <div className="px-4 py-4 text-center">
              <p className="th-text-muted text-sm mb-3">
                Open Guide for a full post-session analysis and coaching conversation.
              </p>
              <button
                onClick={() => onOpenGuide?.(session)}
                disabled={!apiKey}
                className="px-5 py-2.5 th-btn-primary rounded-xl font-medium text-sm disabled:opacity-40"
              >
                Analyze Session
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Footer actions */}
      <div className="th-surface-deep border-t th-border p-4 space-y-2">
        <button
          onClick={onBackToSession}
          className="w-full py-3.5 th-surface border th-border rounded-2xl th-text font-semibold text-sm"
        >
          ← Back to Session (add more catches)
        </button>
        <button
          onClick={onDone}
          className="w-full py-4 bg-red-900/60 border border-red-700/50 rounded-2xl text-red-300 font-bold text-base"
        >
          Done — Close Session
        </button>
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="th-surface rounded-xl border th-border p-3 text-center">
      <div className="th-text font-bold text-xl">{value}</div>
      <div className="th-text-muted text-xs mt-0.5">{label}</div>
    </div>
  )
}
