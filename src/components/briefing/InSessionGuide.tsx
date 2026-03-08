import { useState, useEffect, useRef, useCallback } from 'react'
import type { Session, AIBriefing, CatchEvent, LandedFish } from '../../types'
import { getEventsForSession, getLandedFish } from '../../db/database'
import { chatWithSessionGuide, type ChatMessage } from '../../api/claude'
import { speakText, cancelSpeech, hasSpeech } from '../../utils/speech'
import { compactMessages } from '../../ai/patternMemory'

interface Props {
  session: Session
  briefing: AIBriefing
  apiKey: string
  onGoToLogger: () => void
  onNewBriefing?: () => void
}

const CONFIDENCE_BADGE: Record<string, string> = {
  High:   'th-badge-high',
  Medium: 'bg-amber-800 text-amber-200',
  Low:    'bg-slate-700 th-text-muted',
}

function SpeakBtn({
  id, speakingId, onPress,
}: { id: string; speakingId: string | null; onPress: () => void }) {
  if (!hasSpeech) return null
  const active = speakingId === id
  return (
    <button
      onClick={e => { e.stopPropagation(); onPress() }}
      className={`shrink-0 w-9 h-9 flex items-center justify-center rounded-lg transition-opacity text-sm ${
        active ? 'opacity-100 th-surface border th-border' : 'opacity-35 hover:opacity-70'
      }`}
      title={active ? 'Stop' : 'Read aloud'}
    >
      {active ? '⏹' : '🔊'}
    </button>
  )
}

export default function InSessionGuide({ session, briefing, apiKey, onGoToLogger, onNewBriefing }: Props) {
  const [expandedRec, setExpandedRec] = useState<number | null>(null)
  const [expandedSec, setExpandedSec] = useState<string | null>(null)
  const [messages, setMessages]       = useState<ChatMessage[]>([])
  const [input, setInput]             = useState('')
  const [streaming, setStreaming]     = useState(false)
  const [speakingId, setSpeakingId]   = useState<string | null>(null)
  // Cache session data — fetch once on mount, refresh on new catches logged
  const [sessionEvents, setSessionEvents] = useState<CatchEvent[]>([])
  const [catchHistory, setCatchHistory]   = useState<LandedFish[]>([])
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Cancel speech on unmount
  useEffect(() => () => { cancelSpeech() }, [])

  // Fetch session events + catch history once on mount
  useEffect(() => {
    void Promise.all([
      getEventsForSession(session.id),
      getLandedFish(),
    ]).then(([events, history]) => {
      setSessionEvents(events)
      setCatchHistory(history)
    })
  }, [session.id])

  // Scroll chat to bottom whenever messages change
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streaming])

  const speak = useCallback((text: string, id: string) => {
    cancelSpeech()
    if (speakingId === id) { setSpeakingId(null); return }
    setSpeakingId(id)
    speakText(text, { onEnd: () => setSpeakingId(null) })
  }, [speakingId])

  const sendMessage = async () => {
    const text = input.trim()
    if (!text || streaming) return

    // Refresh session events in background so we always have the latest catches
    void getEventsForSession(session.id).then(setSessionEvents)

    const newMessages: ChatMessage[] = [...messages, { role: 'user', content: text }]
    const compacted = compactMessages(newMessages)
    setMessages(newMessages)
    setInput('')
    setStreaming(true)

    const assistantIdx = newMessages.length // index of the soon-to-be-appended assistant msg

    let reply = ''
    setMessages(m => [...m, { role: 'assistant', content: '' }])

    try {
      const gen = chatWithSessionGuide(apiKey, compacted, session.launchSite, session.conditions, briefing, catchHistory, sessionEvents)
      for await (const chunk of gen) {
        reply += chunk
        setMessages(m => {
          const arr = [...m]
          arr[arr.length - 1] = { role: 'assistant', content: reply }
          return arr
        })
      }
      // Auto-read the completed response
      const autoId = `msg-${assistantIdx}`
      setSpeakingId(autoId)
      speakText(reply, { onEnd: () => setSpeakingId(null) })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setMessages(m => {
        const arr = [...m]
        arr[arr.length - 1] = { role: 'assistant', content: `Error: ${msg}` }
        return arr
      })
    } finally {
      setStreaming(false)
    }
  }

  const c = session.conditions
  const condChips = [
    c.airTempF   != null ? `${c.airTempF}°F air`   : null,
    c.waterTempF != null ? `${c.waterTempF}°F water` : null,
    c.windSpeedMph != null ? `${c.windSpeedMph}mph ${c.windDirection ?? ''}`.trim() : null,
    c.baroTrend
      ? `Baro ${c.baroTrend}${c.baroTrendMb != null ? ` ${Math.abs(c.baroTrendMb).toFixed(1)} mb` : ''}`
      : null,
    c.dewpointF    != null ? `Dewpoint ${c.dewpointF}°F`  : null,
    c.skyCoverPct  != null ? `Sky ${c.skyCoverPct}%`       : null,
    c.precipProbPct != null ? `Rain ${c.precipProbPct}%`   : null,
    c.waterClarity ?? null,
  ].filter(Boolean) as string[]

  const sections = [
    { key: 'start',   icon: '📍', title: 'Where to Start',  text: briefing.startingArea },
    { key: 'primary', icon: '🎣', title: 'Primary Pattern',  text: briefing.primaryPattern },
    { key: 'backup',  icon: '🔄', title: 'Backup Plan',      text: briefing.backupPattern },
    { key: 'notes',   icon: '📋', title: 'Field Notes',      text: briefing.narrative },
  ].filter(s => s.text)

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 60px)' }}>
      {/* Scrollable briefing + chat area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-2">

        {/* Conditions bar */}
        <div className="th-surface rounded-xl border th-border p-3">
          <div className="flex items-start gap-2">
            <div className="flex flex-wrap gap-1.5 flex-1">
              {condChips.map((chip, i) => (
                <span key={i} className="text-xs px-2 py-1 th-surface border th-border rounded-full th-text-muted">
                  {chip}
                </span>
              ))}
            </div>
            {briefing.conditionsSummary && (
              <SpeakBtn id="conditions" speakingId={speakingId}
                onPress={() => speak(briefing.conditionsSummary!, 'conditions')} />
            )}
          </div>
          {briefing.conditionsSummary && (
            <p className="th-text-muted text-xs mt-2 italic leading-snug">{briefing.conditionsSummary}</p>
          )}
        </div>

        {/* Compact recs with 🔊 */}
        <div className="space-y-2">
          {briefing.recommendations.map(rec => {
            const open = expandedRec === rec.rank
            const recText = `${rec.lureType}, ${rec.weight}, ${rec.color}. ${rec.depthBand}. ${rec.retrieveStyle}. ${rec.reasoning}.${rec.suggestedRod ? ` Suggested rod: ${rec.suggestedRod}.` : ''}`
            const recId = `rec-${rec.rank}`
            return (
              <div key={rec.rank} className="th-surface rounded-xl border th-border overflow-hidden">
                <button onClick={() => setExpandedRec(open ? null : rec.rank)} className="w-full text-left px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${CONFIDENCE_BADGE[rec.confidence] ?? ''}`}>
                      #{rec.rank}
                    </span>
                    <span className="th-text font-semibold text-sm flex-1">{rec.lureType}</span>
                    <SpeakBtn id={recId} speakingId={speakingId} onPress={() => speak(recText, recId)} />
                    <span className="th-text-muted text-xs">{open ? '▲' : '▼'}</span>
                  </div>
                  <div className="th-text-muted text-xs mt-1 ml-7">
                    {rec.weight} · {rec.color} · {rec.depthBand}
                  </div>
                </button>
                {open && (
                  <div className="px-3 pb-3 border-t th-border pt-2 space-y-1.5">
                    <div className="text-xs th-text-muted grid grid-cols-2 gap-1">
                      <span><span className="opacity-60">Retrieve: </span>{rec.retrieveStyle}</span>
                      <span><span className="opacity-60">Column: </span>{rec.waterColumn}</span>
                    </div>
                    <p className="th-text text-sm leading-relaxed">{rec.reasoning}</p>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Strategy sections with 🔊 */}
        {sections.map(sec => (
          <div key={sec.key} className="th-surface rounded-xl border th-border overflow-hidden">
            <button
              onClick={() => setExpandedSec(expandedSec === sec.key ? null : sec.key)}
              className="w-full flex items-center justify-between px-3 py-2.5 text-left"
            >
              <span className="th-text text-sm font-medium flex items-center gap-2">
                {sec.icon} {sec.title}
              </span>
              <div className="flex items-center gap-1">
                <SpeakBtn id={sec.key} speakingId={speakingId} onPress={() => speak(sec.text!, sec.key)} />
                <span className="th-text-muted text-xs">{expandedSec === sec.key ? '▲' : '▼'}</span>
              </div>
            </button>
            {expandedSec === sec.key && (
              <div className="px-3 pb-3 border-t th-border pt-2">
                <p className="th-text text-sm leading-relaxed">{sec.text}</p>
              </div>
            )}
          </div>
        ))}

        {/* Chat messages */}
        {messages.length > 0 && (
          <div className="space-y-2 pt-1">
            <div className="text-xs th-text-muted font-semibold uppercase tracking-wide px-1">Guide Chat</div>
            {messages.map((m, i) => {
              const msgId = `msg-${i}`
              const isAssistant = m.role === 'assistant'
              const isLastStreaming = streaming && i === messages.length - 1
              return (
                <div key={i} className={`rounded-xl px-3 py-2.5 text-sm leading-relaxed ${
                  isAssistant
                    ? 'th-surface border th-border th-text mr-4'
                    : 'th-btn-selected text-white ml-6'
                }`}>
                  {isAssistant ? (
                    <div className="flex items-start gap-2">
                      <span className="flex-1">
                        {m.content || (isLastStreaming
                          ? <span className="th-text-muted animate-pulse">Thinking…</span>
                          : '')}
                      </span>
                      {m.content && !isLastStreaming && (
                        <SpeakBtn id={msgId} speakingId={speakingId}
                          onPress={() => speak(m.content, msgId)} />
                      )}
                    </div>
                  ) : m.content}
                </div>
              )
            })}
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Sticky footer */}
      <div className="th-surface-deep border-t th-border p-3 space-y-2">
        {/* Chat label */}
        <div className="flex items-center gap-2 px-0.5">
          <span className="text-xs font-bold th-text-muted uppercase tracking-wide">Ask Your Guide</span>
          {streaming && <span className="text-xs th-accent-text animate-pulse">Thinking…</span>}
        </div>
        <div className="flex gap-2">
          <input
            className="flex-1 th-surface border th-border rounded-xl px-3 py-2.5 th-text text-sm placeholder:th-text-muted"
            placeholder="Not biting? Switch lures? Try deeper?"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
            disabled={streaming}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || streaming}
            className="px-4 py-2.5 th-btn-primary rounded-xl font-medium text-sm disabled:opacity-40"
          >
            Ask
          </button>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onGoToLogger}
            className="flex-1 py-2.5 th-surface border th-border rounded-xl th-text text-sm font-medium"
          >
            📝 Logger
          </button>
          {onNewBriefing && (
            <button
              onClick={onNewBriefing}
              className="flex-1 py-2.5 th-surface border th-border rounded-xl th-text-muted text-sm font-medium"
            >
              🔭 New Briefing
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
