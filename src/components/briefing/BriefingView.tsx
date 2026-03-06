import { useState, useEffect, useCallback } from 'react'
import type { AIBriefing, EnvironmentalConditions } from '../../types'

interface Props {
  briefing: AIBriefing
  conditions: EnvironmentalConditions
  launchSite: string
  sessionDate?: number
  onGoToLogger?: () => void
}

// Confidence: color-coded left border + label
const CONF_BORDER: Record<string, string> = {
  High:   'border-l-emerald-500',
  Medium: 'border-l-amber-500',
  Low:    'border-l-slate-500',
}
const CONF_LABEL: Record<string, string> = {
  High:   'text-emerald-400',
  Medium: 'text-amber-400',
  Low:    'text-slate-400',
}

function SpeakButton({ active, onPress }: { active: boolean; onPress: () => void }) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onPress() }}
      className={`shrink-0 w-10 h-10 flex items-center justify-center rounded-xl transition-opacity ${
        active ? 'opacity-100 th-surface border th-border' : 'opacity-35 hover:opacity-70'
      }`}
      title={active ? 'Stop' : 'Read aloud'}
    >
      {active ? '⏹' : '🔊'}
    </button>
  )
}

// Compact chip for condition data
function CondChip({ icon, value }: { icon: string; value?: string | number }) {
  if (!value) return null
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs th-surface-deep th-text border th-border whitespace-nowrap font-medium">
      {icon} {value}
    </span>
  )
}

export default function BriefingView({
  briefing, conditions, launchSite, sessionDate, onGoToLogger,
}: Props) {
  const [expandedRec, setExpandedRec] = useState<number | null>(null)
  const [speakingId, setSpeakingId]   = useState<string | null>(null)

  const speak = useCallback((text: string, id: string) => {
    if (!window.speechSynthesis) return
    window.speechSynthesis.cancel()
    if (speakingId === id) { setSpeakingId(null); return }
    const utt = new SpeechSynthesisUtterance(text)
    utt.rate = 0.88
    utt.onend   = () => setSpeakingId(null)
    utt.onerror = () => setSpeakingId(null)
    setSpeakingId(id)
    window.speechSynthesis.speak(utt)
  }, [speakingId])

  useEffect(() => () => { window.speechSynthesis?.cancel() }, [])

  const buildFullText = () => {
    const parts: string[] = []
    if (briefing.conditionsSummary) parts.push(`Today's conditions: ${briefing.conditionsSummary}.`)
    briefing.recommendations.forEach(r => {
      parts.push(`Recommendation ${r.rank}: ${r.lureType}, ${r.weight}, ${r.color}. ${r.depthBand}. ${r.retrieveStyle}. ${r.reasoning}.`)
    })
    if (briefing.startingArea)   parts.push(`Where to start: ${briefing.startingArea}`)
    if (briefing.primaryPattern) parts.push(`Primary pattern: ${briefing.primaryPattern}`)
    if (briefing.backupPattern)  parts.push(`Backup plan: ${briefing.backupPattern}`)
    if (briefing.narrative)      parts.push(`Field notes: ${briefing.narrative}`)
    return parts.join(' ')
  }

  const condChips = [
    { icon: '🌅', value: conditions.sunrise ? `Sunrise ${conditions.sunrise}` : undefined },
    { icon: '🌇', value: conditions.sunset  ? `Sunset ${conditions.sunset}`   : undefined },
    { icon: '🌡', value: conditions.airTempF   != null ? `${conditions.airTempF}°F air`   : undefined },
    { icon: '💧', value: conditions.waterTempF != null ? `${conditions.waterTempF}°F water` : undefined },
    { icon: '💨', value: conditions.windSpeedMph != null
        ? `${conditions.windSpeedMph}mph ${conditions.windDirection ?? ''}`.trim() : undefined },
    { icon: '☁️', value: conditions.skyCondition },
    { icon: '📊', value: conditions.baroTrend
        ? `Baro ${conditions.baroTrend}`
        : conditions.baroPressureInHg != null ? `${conditions.baroPressureInHg} inHg` : undefined },
    { icon: '🌊', value: conditions.waterLevelVsNormal ? `${conditions.waterLevelVsNormal} water` : undefined },
    { icon: '👁', value: conditions.waterClarity },
    { icon: '🌙', value: conditions.moonPhase },
    { icon: '✨', value: conditions.moonIlluminationPct != null ? `${conditions.moonIlluminationPct}% illum.` : undefined },
  ]

  return (
    <div className="space-y-4">

      {/* ── Header card ────────────────────────────────────────────────────── */}
      <div className="th-surface rounded-2xl border th-border p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <div className="th-text font-bold text-base leading-snug">{launchSite}</div>
            <div className="th-text-muted text-xs mt-0.5">
              {sessionDate
                ? new Date(sessionDate).toLocaleDateString([], {
                    weekday: 'long', month: 'long', day: 'numeric',
                  })
                : 'Today'}
            </div>
          </div>
          {window.speechSynthesis && (
            <button
              onClick={() => speak(buildFullText(), 'full')}
              className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl border th-border th-surface-deep text-sm font-medium transition-colors min-h-[40px] ${
                speakingId === 'full' ? 'th-accent-text' : 'th-text-muted'
              }`}
            >
              {speakingId === 'full' ? '⏹ Stop' : '🔊 Read All'}
            </button>
          )}
        </div>

        {/* AI insight — lead with the insight, not the data */}
        {briefing.conditionsSummary && (
          <p className="th-text text-sm leading-relaxed mb-3 font-medium">
            {briefing.conditionsSummary}
          </p>
        )}

        {/* Conditions chips — secondary context */}
        <div className="flex flex-wrap gap-1.5">
          {condChips.map((c, i) => <CondChip key={i} icon={c.icon} value={c.value} />)}
        </div>
      </div>

      {/* ── Recommendations ─────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between px-1 mb-2">
          <h3 className="text-xs font-bold th-text-muted uppercase tracking-widest">
            Recommendations
          </h3>
        </div>

        <div className="space-y-2">
          {briefing.recommendations.map(rec => {
            const isOpen = expandedRec === rec.rank
            const recText = `${rec.lureType}, ${rec.weight}, ${rec.color}. ${rec.depthBand}. ${rec.retrieveStyle}. ${rec.reasoning}.${rec.suggestedRod ? ` Suggested rod: ${rec.suggestedRod}.` : ''}`
            const recId = `rec-${rec.rank}`
            const confBorder = CONF_BORDER[rec.confidence] ?? 'border-l-slate-500'
            const confLabel  = CONF_LABEL[rec.confidence]  ?? 'text-slate-400'

            return (
              <div
                key={rec.rank}
                className={`th-surface rounded-2xl border th-border overflow-hidden border-l-4 ${confBorder}`}
              >
                <button
                  className="w-full text-left px-4 py-3.5 min-h-[72px]"
                  onClick={() => setExpandedRec(isOpen ? null : rec.rank)}
                >
                  {/* Rank + confidence + speak */}
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="th-text-muted text-xs font-bold">#{rec.rank}</span>
                      <span className={`text-xs font-bold uppercase tracking-wide ${confLabel}`}>
                        {rec.confidence}
                      </span>
                      {rec.inInventory === false && (
                        <span className="text-amber-500 text-xs">· not in bag</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {window.speechSynthesis && (
                        <SpeakButton
                          active={speakingId === recId}
                          onPress={() => speak(recText, recId)}
                        />
                      )}
                      <span className="th-text-muted text-xs pl-1">{isOpen ? '▲' : '▼'}</span>
                    </div>
                  </div>

                  {/* Lure name — largest, most important */}
                  <div className="th-text font-bold text-lg leading-tight">{rec.lureType}</div>

                  {/* Key specs — always visible */}
                  <div className="th-text-muted text-sm mt-1 space-y-0.5">
                    <div>{rec.weight} · {rec.color}</div>
                    <div>{rec.depthBand} · {rec.retrieveStyle}</div>
                  </div>
                </button>

                {/* Expanded: full reasoning */}
                {isOpen && (
                  <div className="px-4 pb-4 border-t th-border pt-3 space-y-3">
                    <p className="th-text text-sm leading-relaxed">{rec.reasoning}</p>
                    {rec.suggestedRod && (
                      <div className="flex items-start gap-2 p-3 th-surface-deep rounded-xl">
                        <span className="text-base">🎯</span>
                        <div>
                          <div className="th-text-muted text-xs font-semibold mb-0.5">Suggested Rod</div>
                          <div className="th-text text-sm font-medium">{rec.suggestedRod}</div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Strategy sections ───────────────────────────────────────────────── */}
      {briefing.startingArea && (
        <StrategyCard
          icon="📍" title="Where to Start"
          text={briefing.startingArea}
          speakId="start" speakingId={speakingId} onSpeak={speak}
        />
      )}

      {briefing.primaryPattern && (
        <StrategyCard
          icon="🎣" title="Primary Pattern"
          text={briefing.primaryPattern}
          speakId="primary" speakingId={speakingId} onSpeak={speak}
        />
      )}

      {briefing.backupPattern && (
        <StrategyCard
          icon="🔄" title="Backup Plan"
          text={briefing.backupPattern}
          speakId="backup" speakingId={speakingId} onSpeak={speak}
        />
      )}

      {briefing.narrative && (
        <StrategyCard
          icon="📋" title="Field Notes"
          text={briefing.narrative}
          speakId="notes" speakingId={speakingId} onSpeak={speak}
        />
      )}

      {/* ── Go to Logger ─────────────────────────────────────────────────────── */}
      {onGoToLogger && (
        <button
          onClick={onGoToLogger}
          className="w-full py-4 th-btn-primary rounded-2xl font-bold text-lg shadow-lg active:scale-[0.98] transition-transform"
        >
          🎣 Start Logging →
        </button>
      )}
    </div>
  )
}

// ── Strategy card ─────────────────────────────────────────────────────────────
function StrategyCard({
  icon, title, text, speakId, speakingId, onSpeak,
}: {
  icon: string; title: string; text: string
  speakId: string; speakingId: string | null; onSpeak: (t: string, id: string) => void
}) {
  const [open, setOpen] = useState(true)
  const isActive = speakingId === speakId

  return (
    <div className="th-surface rounded-2xl border th-border overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-3.5 min-h-[56px] text-left gap-3"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-2.5">
          <span className="text-lg">{icon}</span>
          <span className="th-text font-semibold text-sm">{title}</span>
        </div>
        <div className="flex items-center gap-1">
          {window.speechSynthesis && (
            <SpeakButton active={isActive} onPress={() => onSpeak(text, speakId)} />
          )}
          <span className="th-text-muted text-xs">{open ? '▲' : '▼'}</span>
        </div>
      </button>
      {open && (
        <div className="px-4 pb-4 border-t th-border pt-3">
          <p className="th-text text-sm leading-relaxed">{text}</p>
        </div>
      )}
    </div>
  )
}
