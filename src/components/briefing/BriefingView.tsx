import { useState, useEffect, useCallback } from 'react'
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

function SpeakButton({ active, onPress }: { active: boolean; onPress: () => void }) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onPress() }}
      className={`ml-2 shrink-0 px-1.5 py-0.5 rounded text-base transition-opacity ${active ? 'opacity-100' : 'opacity-40 hover:opacity-80'}`}
      title={active ? 'Stop reading' : 'Read aloud'}
    >
      {active ? '⏹' : '🔊'}
    </button>
  )
}

function Section({
  title, icon, children, speakText, speakingId, currentSpeakingId, onSpeak,
}: {
  title: string; icon: string; children: React.ReactNode
  speakText?: string; speakingId?: string; currentSpeakingId?: string | null; onSpeak?: (text: string, id: string) => void
}) {
  const [open, setOpen] = useState(true)
  const isActive = !!speakingId && currentSpeakingId === speakingId
  return (
    <div className="th-surface rounded-xl border th-border overflow-hidden">
      <div className="flex items-center px-4 py-3">
        <button onClick={() => setOpen(o => !o)} className="flex-1 text-left flex items-center gap-2">
          <span className="font-semibold th-text text-sm flex items-center gap-2">
            <span>{icon}</span>{title}
          </span>
          <span className="th-text-muted text-xs ml-2">{open ? '▲' : '▼'}</span>
        </button>
        {speakText && speakingId && onSpeak && (
          <SpeakButton active={isActive} onPress={() => onSpeak(speakText, speakingId)} />
        )}
      </div>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  )
}

export default function BriefingView({ briefing, conditions, launchSite, sessionDate, onGoToLogger }: Props) {
  const [expandedRec, setExpandedRec] = useState<number | null>(null)
  const [speakingId, setSpeakingId] = useState<string | null>(null)

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
    if (briefing.conditionsSummary) parts.push(`Conditions summary: ${briefing.conditionsSummary}.`)
    briefing.recommendations.forEach(r => {
      parts.push(`Recommendation ${r.rank}: ${r.lureType}, ${r.weight}, ${r.color}. Depth: ${r.depthBand}. Retrieve: ${r.retrieveStyle}. ${r.reasoning}.`)
    })
    if (briefing.startingArea)   parts.push(`Where to start: ${briefing.startingArea}`)
    if (briefing.primaryPattern) parts.push(`Primary pattern: ${briefing.primaryPattern}`)
    if (briefing.backupPattern)  parts.push(`Backup plan: ${briefing.backupPattern}`)
    if (briefing.narrative)      parts.push(`Field notes: ${briefing.narrative}`)
    return parts.join(' ')
  }

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
          {window.speechSynthesis && (
            <button
              onClick={() => speak(buildFullText(), 'full')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border th-border th-surface-deep text-sm font-medium transition-colors ${
                speakingId === 'full' ? 'th-accent-text' : 'th-text-muted'
              }`}
            >
              {speakingId === 'full' ? '⏹ Stop' : '🔊 Read All'}
            </button>
          )}
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
          const recText = `Recommendation ${rec.rank}: ${rec.lureType}, ${rec.weight}, ${rec.color}. Depth: ${rec.depthBand}. Retrieve: ${rec.retrieveStyle}. ${rec.reasoning}.${rec.suggestedRod ? ` Suggested rod: ${rec.suggestedRod}.` : ''}`
          const recId = `rec-${rec.rank}`
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
                  {window.speechSynthesis && (
                    <SpeakButton active={speakingId === recId} onPress={() => speak(recText, recId)} />
                  )}
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
        <Section title="Where to Start" icon="📍"
          speakText={briefing.startingArea} speakingId="start" currentSpeakingId={speakingId} onSpeak={speak}>
          <p className="th-text text-sm leading-relaxed">{briefing.startingArea}</p>
        </Section>
      )}

      {briefing.primaryPattern && (
        <Section title="Primary Pattern" icon="🎣"
          speakText={briefing.primaryPattern} speakingId="primary" currentSpeakingId={speakingId} onSpeak={speak}>
          <p className="th-text text-sm leading-relaxed">{briefing.primaryPattern}</p>
        </Section>
      )}

      {briefing.backupPattern && (
        <Section title="Backup Plan" icon="🔄"
          speakText={briefing.backupPattern} speakingId="backup" currentSpeakingId={speakingId} onSpeak={speak}>
          <p className="th-text text-sm leading-relaxed">{briefing.backupPattern}</p>
        </Section>
      )}

      {briefing.narrative && (
        <Section title="Field Notes" icon="📋"
          speakText={briefing.narrative} speakingId="notes" currentSpeakingId={speakingId} onSpeak={speak}>
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
