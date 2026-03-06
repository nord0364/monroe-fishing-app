import { useState, useEffect, useRef } from 'react'
import type { Session, AIBriefing } from '../../types'
import { getEventsForSession, getLandedFish } from '../../db/database'
import { chatWithSessionGuide, type ChatMessage } from '../../api/claude'

interface Props {
  session: Session
  briefing: AIBriefing
  apiKey: string
  onGoToLogger: () => void
}

const CONFIDENCE_BADGE: Record<string, string> = {
  High:   'th-badge-high',
  Medium: 'bg-amber-800 text-amber-200',
  Low:    'bg-slate-700 th-text-muted',
}

export default function InSessionGuide({ session, briefing, apiKey, onGoToLogger }: Props) {
  const [expandedRec, setExpandedRec]     = useState<number | null>(null)
  const [expandedSec, setExpandedSec]     = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput]       = useState('')
  const [streaming, setStreaming] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Scroll chat to bottom whenever messages change
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streaming])

  const sendMessage = async () => {
    const text = input.trim()
    if (!text || streaming) return

    const updated: ChatMessage[] = [...messages, { role: 'user', content: text }]
    setMessages(updated)
    setInput('')
    setStreaming(true)

    // Load latest session data so guide has real-time context
    const events = await getEventsForSession(session.id)
    const history = await getLandedFish()

    let reply = ''
    setMessages(m => [...m, { role: 'assistant', content: '' }])

    try {
      const gen = chatWithSessionGuide(apiKey, updated, session.launchSite, session.conditions, briefing, history, events)
      for await (const chunk of gen) {
        reply += chunk
        setMessages(m => {
          const arr = [...m]
          arr[arr.length - 1] = { role: 'assistant', content: reply }
          return arr
        })
      }
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
    c.baroTrend  ? `Baro ${c.baroTrend}`  : null,
    c.waterClarity ?? null,
  ].filter(Boolean) as string[]

  const sections = [
    { key: 'start',   icon: '📍', title: 'Where to Start',   text: briefing.startingArea },
    { key: 'primary', icon: '🎣', title: 'Primary Pattern',   text: briefing.primaryPattern },
    { key: 'backup',  icon: '🔄', title: 'Backup Plan',       text: briefing.backupPattern },
    { key: 'notes',   icon: '📋', title: 'Field Notes',       text: briefing.narrative },
  ].filter(s => s.text)

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 60px)' }}>
      {/* Scrollable briefing area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-2">

        {/* Conditions bar */}
        <div className="th-surface rounded-xl border th-border p-3">
          <div className="flex flex-wrap gap-1.5">
            {condChips.map((c, i) => (
              <span key={i} className="text-xs px-2 py-1 th-surface border th-border rounded-full th-text-muted">
                {c}
              </span>
            ))}
          </div>
          {briefing.conditionsSummary && (
            <p className="th-text-muted text-xs mt-2 italic leading-snug">{briefing.conditionsSummary}</p>
          )}
        </div>

        {/* Compact recs */}
        <div className="space-y-2">
          {briefing.recommendations.map(rec => {
            const open = expandedRec === rec.rank
            return (
              <div key={rec.rank} className="th-surface rounded-xl border th-border overflow-hidden">
                <button onClick={() => setExpandedRec(open ? null : rec.rank)} className="w-full text-left px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${CONFIDENCE_BADGE[rec.confidence] ?? ''}`}>
                      #{rec.rank}
                    </span>
                    <span className="th-text font-semibold text-sm flex-1">{rec.lureType}</span>
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

        {/* Collapsible strategy sections */}
        {sections.map(sec => (
          <div key={sec.key} className="th-surface rounded-xl border th-border overflow-hidden">
            <button
              onClick={() => setExpandedSec(expandedSec === sec.key ? null : sec.key)}
              className="w-full flex items-center justify-between px-3 py-2.5 text-left"
            >
              <span className="th-text text-sm font-medium flex items-center gap-2">
                {sec.icon} {sec.title}
              </span>
              <span className="th-text-muted text-xs">{expandedSec === sec.key ? '▲' : '▼'}</span>
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
            {messages.map((m, i) => (
              <div key={i} className={`rounded-xl px-3 py-2.5 text-sm leading-relaxed ${
                m.role === 'user'
                  ? 'th-btn-selected text-white ml-6'
                  : 'th-surface border th-border th-text mr-6'
              }`}>
                {m.content || (streaming && i === messages.length - 1
                  ? <span className="th-text-muted animate-pulse">Thinking…</span>
                  : '')}
              </div>
            ))}
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Sticky footer: chat input + logger button */}
      <div className="th-surface-deep border-t th-border p-3 space-y-2">
        <div className="flex gap-2">
          <input
            className="flex-1 th-surface border th-border rounded-xl px-3 py-2.5 th-text text-sm placeholder:th-text-muted"
            placeholder="Ask your guide… (bites? switch lures? try deeper?)"
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
        <button
          onClick={onGoToLogger}
          className="w-full py-2.5 th-surface border th-border rounded-xl th-text text-sm font-medium"
        >
          📝 Go to Logger
        </button>
      </div>
    </div>
  )
}
