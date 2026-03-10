import { useState, useEffect, useCallback } from 'react'
import type { AIBriefing, EnvironmentalConditions, RodBriefing } from '../../types'
import { speakText, cancelSpeech, hasSpeech } from '../../utils/speech'

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
    cancelSpeech()
    if (speakingId === id) { setSpeakingId(null); return }
    setSpeakingId(id)
    speakText(text, { onEnd: () => setSpeakingId(null) })
  }, [speakingId])

  useEffect(() => () => { cancelSpeech() }, [])

  const buildFullText = () => {
    const parts: string[] = []
    if (briefing.conditionsSummary) parts.push(briefing.conditionsSummary)
    if (briefing.rodSetups) {
      briefing.rodSetups.forEach(rs => {
        parts.push(`${rs.rodNickname}: ${rs.primary.lureType}, ${rs.primary.weight}, ${rs.primary.color}. ${rs.primary.depthBand}. ${rs.primary.retrieveStyle}.${rs.primary.trailer ? ` Trailer: ${rs.primary.trailer}.` : ''} ${rs.primary.reasoning}`)
        if (rs.backup) parts.push(`Backup: ${rs.backup.lureType}, ${rs.backup.color}. ${rs.backup.reasoning}`)
      })
    } else {
      (briefing.recommendations ?? []).forEach((r, i) => {
        const intro = i === 0 ? 'Your top pick is' : i === 1 ? 'Second option,' : 'Third,'
        parts.push(`${intro} ${r.lureType} in ${r.color}, ${r.weight}. ${r.depthBand}. ${r.retrieveStyle}. ${r.reasoning}.`)
        if (r.suggestedRod) parts.push(`Suggested rod: ${r.suggestedRod}.`)
      })
    }
    if (briefing.startingArea)   parts.push(`Where to start: ${briefing.startingArea}`)
    if (briefing.primaryPattern) parts.push(`Primary pattern: ${briefing.primaryPattern}`)
    if (briefing.backupPattern)  parts.push(`If that's not working: ${briefing.backupPattern}`)
    if (briefing.narrative)      parts.push(briefing.narrative)
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
          {hasSpeech && (
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

      {/* ── Recommendations / Rod Setups ────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between px-1 mb-2">
          <h3 className="text-xs font-bold th-text-muted uppercase tracking-widest">
            {briefing.rodSetups ? 'Rod Setups' : 'Recommendations'}
          </h3>
        </div>

        {briefing.rodSetups ? (
          // ── New rod-organized format ──
          <div className="space-y-2">
            {briefing.rodSetups.map(rs => (
              <RodCard key={rs.rodNickname} rs={rs} speakingId={speakingId} onSpeak={speak} />
            ))}
          </div>
        ) : (
          // ── Legacy flat recommendations format ──
          <div className="space-y-2">
            {(briefing.recommendations ?? []).map(rec => {
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
                        {hasSpeech && (
                          <SpeakButton
                            active={speakingId === recId}
                            onPress={() => speak(recText, recId)}
                          />
                        )}
                        <span className="th-text-muted text-xs pl-1">{isOpen ? '▲' : '▼'}</span>
                      </div>
                    </div>
                    <div className="th-text font-bold text-lg leading-tight">{rec.lureType}</div>
                    <div className="th-text-muted text-sm mt-1 space-y-0.5">
                      <div>{rec.weight} · {rec.color}</div>
                      <div>{rec.depthBand} · {rec.retrieveStyle}</div>
                    </div>
                  </button>
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
        )}
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

// ── Rod setup card ────────────────────────────────────────────────────────────
function RodCard({
  rs, speakingId, onSpeak,
}: {
  rs: RodBriefing
  speakingId: string | null
  onSpeak: (t: string, id: string) => void
}) {
  const [showBackup, setShowBackup]             = useState(false)
  const [showPrimaryReason, setShowPrimaryReason] = useState(false)
  const speakId = `rod-${rs.rodNickname}`
  const speakText = [
    `${rs.rodNickname}:`,
    `Primary: ${rs.primary.lureType}, ${rs.primary.weight}, ${rs.primary.color}. ${rs.primary.depthBand}. ${rs.primary.retrieveStyle}.${rs.primary.trailer ? ` Trailer: ${rs.primary.trailer}.` : ''} ${rs.primary.reasoning}`,
    rs.backup ? `Backup: ${rs.backup.lureType}, ${rs.backup.weight}, ${rs.backup.color}. ${rs.backup.reasoning}` : null,
  ].filter(Boolean).join(' ')

  return (
    <div className="th-surface rounded-2xl border th-border overflow-hidden">
      {/* Rod header */}
      <div className="px-4 py-3 flex items-center justify-between border-b th-border">
        <div className="flex items-center gap-2">
          <span className="text-base">🎣</span>
          <span className="th-text font-bold text-sm">{rs.rodNickname}</span>
          {rs.weakMatch && (
            <span className="text-amber-500 text-xs font-medium">· not ideal for today</span>
          )}
        </div>
        {hasSpeech && (
          <SpeakButton active={speakingId === speakId} onPress={() => onSpeak(speakText, speakId)} />
        )}
      </div>

      {/* Primary setup */}
      <div className="px-4 py-3">
        <div className="text-xs font-bold th-text-muted uppercase tracking-wide mb-2">Primary</div>
        <button className="w-full text-left" onClick={() => setShowPrimaryReason(o => !o)}>
          <div className="th-text font-bold text-lg leading-tight">{rs.primary.lureType}</div>
          <div className="th-text-muted text-sm mt-1 space-y-0.5">
            <div>{rs.primary.weight} · {rs.primary.color}</div>
            <div>{rs.primary.depthBand} · {rs.primary.retrieveStyle}</div>
            {rs.primary.trailer && (
              <div className="text-emerald-400 text-xs mt-0.5">+ {rs.primary.trailer}</div>
            )}
          </div>
          <span className="th-text-muted text-xs mt-1 inline-block">
            {showPrimaryReason ? '▲ Hide reasoning' : '▼ Why this setup'}
          </span>
        </button>
        {showPrimaryReason && (
          <p className="th-text text-sm leading-relaxed mt-2 pt-2 border-t th-border">
            {rs.primary.reasoning}
          </p>
        )}
        {rs.weakMatch && rs.weakMatchReason && (
          <p className="text-amber-400 text-xs mt-2 leading-snug">{rs.weakMatchReason}</p>
        )}
      </div>

      {/* Backup setup */}
      {rs.backup && (
        <div className="border-t th-border px-4 py-3">
          <button className="w-full text-left" onClick={() => setShowBackup(o => !o)}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold th-text-muted uppercase tracking-wide">Backup</span>
              <span className="th-text-muted text-xs">{showBackup ? '▲' : '▼'}</span>
            </div>
            {!showBackup && (
              <div className="th-text-muted text-sm mt-1">
                {rs.backup.lureType} · {rs.backup.color}
              </div>
            )}
          </button>
          {showBackup && (
            <div className="mt-2">
              <div className="th-text font-semibold">{rs.backup.lureType}</div>
              <div className="th-text-muted text-sm space-y-0.5 mt-1">
                <div>{rs.backup.weight} · {rs.backup.color}</div>
                <div>{rs.backup.depthBand} · {rs.backup.retrieveStyle}</div>
                {rs.backup.trailer && (
                  <div className="text-emerald-400 text-xs">+ {rs.backup.trailer}</div>
                )}
              </div>
              <p className="th-text text-sm leading-relaxed mt-2">{rs.backup.reasoning}</p>
            </div>
          )}
        </div>
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
          {hasSpeech && (
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
