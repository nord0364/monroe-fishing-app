import { useState } from 'react'
import type { AIBriefing, EnvironmentalConditions } from '../../types'

interface Props {
  briefing: AIBriefing
  conditions: EnvironmentalConditions
  launchSite: string
  sessionDate?: number
  onGoToLogger?: () => void
}

const CONFIDENCE_STYLE: Record<string, string> = {
  High:   'th-badge-high',
  Medium: 'bg-amber-800 text-amber-200',
  Low:    'bg-slate-700 th-text-muted',
}

function ConditionChip({ icon, value }: { icon: string; value?: string | number }) {
  if (!value) return null
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs th-surface th-text border th-border whitespace-nowrap">
      {icon} {value}
    </span>
  )
}

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="th-surface rounded-xl border th-border overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <span className="font-semibold th-text text-sm flex items-center gap-2">
          <span>{icon}</span>{title}
        </span>
        <span className="th-text-muted text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  )
}

export default function BriefingView({ briefing, conditions, launchSite, sessionDate, onGoToLogger }: Props) {
  const [expandedRec, setExpandedRec] = useState<number | null>(null)

  const condChips = [
    { icon: '🌡', value: conditions.airTempF != null ? `${conditions.airTempF}°F air` : undefined },
    { icon: '💧', value: conditions.waterTempF != null ? `${conditions.waterTempF}°F water` : undefined },
    { icon: '💨', value: conditions.windSpeedMph != null ? `${conditions.windSpeedMph}mph ${conditions.windDirection ?? ''}`.trim() : undefined },
    { icon: '☁️', value: conditions.skyCondition },
    { icon: '📊', value: conditions.baroTrend ? `Baro ${conditions.baroTrend}` : conditions.baroPressureInHg != null ? `${conditions.baroPressureInHg} inHg` : undefined },
    { icon: '🌊', value: conditions.waterLevelVsNormal ? `${conditions.waterLevelVsNormal} water` : undefined },
    { icon: '👁', value: conditions.waterClarity },
    { icon: '🌙', value: conditions.moonPhase },
  ]

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="th-surface rounded-xl border th-border p-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="th-accent-text font-semibold text-base">Briefing Ready ✓</div>
            <div className="th-text-muted text-xs mt-0.5">
              {sessionDate ? new Date(sessionDate).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) : ''} · {launchSite}
            </div>
          </div>
        </div>
        {/* Conditions strip */}
        <div className="flex flex-wrap gap-1.5">
          {condChips.map((c, i) => <ConditionChip key={i} icon={c.icon} value={c.value} />)}
        </div>
        {briefing.conditionsSummary && (
          <p className="th-text-muted text-xs mt-3 leading-relaxed italic">{briefing.conditionsSummary}</p>
        )}
      </div>

      {/* Recommendations */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold th-text-muted uppercase tracking-wide px-1">Recommendations</h3>
        {briefing.recommendations.map(rec => {
          const isOpen = expandedRec === rec.rank
          return (
            <div key={rec.rank} className="th-surface rounded-xl border th-border overflow-hidden">
              <button
                onClick={() => setExpandedRec(isOpen ? null : rec.rank)}
                className="w-full text-left px-4 py-3"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded ${CONFIDENCE_STYLE[rec.confidence] ?? ''}`}>
                    #{rec.rank} {rec.confidence}
                  </span>
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="th-text font-semibold text-base">{rec.lureType}</span>
                  <span className="th-text-muted text-xs shrink-0">{isOpen ? '▲' : '▼ details'}</span>
                </div>
                <div className="th-text-muted text-xs mt-1 space-y-0.5">
                  <div>{rec.weight} · {rec.color}</div>
                  <div>{rec.depthBand} · {rec.waterColumn}</div>
                </div>
              </button>
              {isOpen && (
                <div className="px-4 pb-4 border-t th-border pt-3 space-y-2">
                  <div className="flex flex-wrap gap-3 text-xs">
                    <span className="th-text"><span className="th-text-muted">Retrieve: </span>{rec.retrieveStyle}</span>
                    <span className="th-text"><span className="th-text-muted">Depth: </span>{rec.depthBand}</span>
                    <span className="th-text"><span className="th-text-muted">Column: </span>{rec.waterColumn}</span>
                  </div>
                  <p className="th-text text-sm leading-relaxed">{rec.reasoning}</p>
                  {rec.suggestedRod && (
                    <div className="mt-2 text-xs th-text-muted">
                      🎯 Rod: <span className="th-text font-medium">{rec.suggestedRod}</span>
                    </div>
                  )}
                  {rec.inInventory === false && (
                    <div className="mt-1 text-xs text-amber-400">⚠️ Not in your inventory</div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Structured sections */}
      {briefing.startingArea && (
        <Section title="Where to Start" icon="📍">
          <p className="th-text text-sm leading-relaxed">{briefing.startingArea}</p>
        </Section>
      )}

      {briefing.primaryPattern && (
        <Section title="Primary Pattern" icon="🎣">
          <p className="th-text text-sm leading-relaxed">{briefing.primaryPattern}</p>
        </Section>
      )}

      {briefing.backupPattern && (
        <Section title="Backup Plan" icon="🔄">
          <p className="th-text text-sm leading-relaxed">{briefing.backupPattern}</p>
        </Section>
      )}

      {briefing.narrative && (
        <Section title="Field Notes" icon="📋">
          <p className="th-text text-sm leading-relaxed">{briefing.narrative}</p>
        </Section>
      )}

      {/* Go to Logger */}
      {onGoToLogger && (
        <button
          onClick={onGoToLogger}
          className="w-full py-4 th-btn-primary rounded-xl font-semibold text-base shadow-lg"
        >
          🎣 Start Logging →
        </button>
      )}
    </div>
  )
}
