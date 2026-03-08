import { useState, useEffect, useRef, useCallback } from 'react'
import Anthropic from '@anthropic-ai/sdk'
import type {
  AppSettings,
  Session,
  DebriefConversation,
  DebriefMessage,
  CatchEvent,
  LandedFish,
} from '../../types'
import {
  saveDebrief,
  getDebriefForSession,
  getAllDebriefs,
  bulkDeleteDebriefs,
  getEventsForSession,
  getAllEvents,
  getAllSessions,
} from '../../db/database'
import { nanoid } from '../logger/nanoid'
import { speakText, cancelSpeech, hasSpeech } from '../../utils/speech'
import { compactMessages } from '../../ai/patternMemory'

interface DebriefSessionCache {
  sessionId: string
  events:    CatchEvent[]
  allFish:   LandedFish[]
  session:   Session
}

// ─── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  settings: AppSettings
  pendingSession: Session | null
  onPendingConsumed: () => void
}

// ─── Grouped structure ────────────────────────────────────────────────────────

type GroupedDebriefs = {
  year: number
  months: { month: number; label: string; debriefs: DebriefConversation[] }[]
}[]

// ─── Constants ────────────────────────────────────────────────────────────────

const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function groupDebriefs(debriefs: DebriefConversation[]): GroupedDebriefs {
  const map = new Map<number, Map<number, DebriefConversation[]>>()
  for (const d of debriefs) {
    const dt = new Date(d.sessionDate)
    const y = dt.getFullYear()
    const m = dt.getMonth()
    if (!map.has(y)) map.set(y, new Map())
    if (!map.get(y)!.has(m)) map.get(y)!.set(m, [])
    map.get(y)!.get(m)!.push(d)
  }
  return [...map.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, months]) => ({
      year,
      months: [...months.entries()]
        .sort((a, b) => b[0] - a[0])
        .map(([month, ds]) => ({
          month,
          label: MONTH_LABELS[month],
          debriefs: ds.sort((a, b) => b.updatedAt - a.updatedAt),
        })),
    }))
}

function formatSessionDuration(session: Session): string {
  if (!session.endTime) return ''
  const ms = session.endTime - session.startTime
  const h = Math.floor(ms / 3600000)
  const m = Math.round((ms % 3600000) / 60000)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen).trimEnd() + '\u2026'
}

// ─── Streaming AI ─────────────────────────────────────────────────────────────

async function* streamDebriefResponse(
  apiKey: string,
  messages: DebriefMessage[],
  sessionData: { session: Session; events: CatchEvent[]; allFish: LandedFish[] }
): AsyncGenerator<string> {
  const { session, events, allFish } = sessionData

  const landed = events.filter((e): e is LandedFish => e.type === 'Landed Fish')
  const strikes = events.filter(e => e.type === 'Quality Strike \u2014 Missed').length
  const follows = events.filter(e => e.type === 'Follow \u2014 Did Not Strike').length

  const duration = session.endTime ? formatSessionDuration(session) : 'ongoing'

  const sessionDate = new Date(session.date).toLocaleDateString([], {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

  const catchLogLines = landed.map(f => {
    const t = new Date(f.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    const weight = `${f.weightLbs}lb ${f.weightOz}oz`
    return [
      `${t}: ${f.species} ${weight}`,
      `on ${f.lureType}${f.lureColor ? ` (${f.lureColor})` : ''}`,
      f.waterDepth ? `depth: ${f.waterDepth}` : '',
      f.waterColumn ? `column: ${f.waterColumn}` : '',
      f.retrieveStyle ? `retrieve: ${f.retrieveStyle}` : '',
      f.structure ? `structure: ${f.structure}` : '',
    ].filter(Boolean).join(', ')
  })

  const condParts = [
    session.conditions.airTempF != null ? `Air ${session.conditions.airTempF}\u00b0F` : '',
    session.conditions.waterTempF != null ? `Water ${session.conditions.waterTempF}\u00b0F` : '',
    session.conditions.windSpeedMph != null
      ? `Wind ${session.conditions.windSpeedMph}mph ${session.conditions.windDirection ?? ''}`.trim()
      : '',
    session.conditions.skyCondition ? `Sky: ${session.conditions.skyCondition}` : '',
    session.conditions.baroTrend ? `Baro ${session.conditions.baroTrend}` : '',
    session.conditions.waterClarity ? `Clarity: ${session.conditions.waterClarity}` : '',
    session.conditions.waterLevelVsNormal ? `Level: ${session.conditions.waterLevelVsNormal}` : '',
    session.conditions.moonPhase ? `Moon: ${session.conditions.moonPhase}` : '',
  ].filter(Boolean).join(' | ')

  // Historical summary
  const totalHistoricalFish = allFish.length
  const lmBass = allFish.filter(f => f.species === 'Largemouth Bass')
  const personalBest = lmBass.reduce<LandedFish | null>((best, f) => {
    const w = f.weightLbs + f.weightOz / 16
    const bw = best ? best.weightLbs + best.weightOz / 16 : 0
    return w > bw ? f : best
  }, null)

  const lureCounts = new Map<string, number>()
  for (const f of allFish) {
    lureCounts.set(f.lureType, (lureCounts.get(f.lureType) ?? 0) + 1)
  }
  const topLures = [...lureCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([type, count]) => `${type} (${count} fish)`)

  const avgWeight =
    allFish.length > 0
      ? (
          allFish.reduce((sum, f) => sum + f.weightLbs + f.weightOz / 16, 0) / allFish.length
        ).toFixed(1)
      : 'N/A'

  const system = [
    'You are an expert largemouth bass fishing coach for Lake Monroe, Bloomington Indiana.',
    'You are reviewing a completed session with the angler after they return from the water.',
    '',
    'SESSION DETAILS:',
    `- Date: ${sessionDate}`,
    `- Launch Site: ${session.launchSite}`,
    `- Duration: ${duration}`,
    `- Conditions: ${condParts || 'not recorded'}`,
    '',
    'SESSION RESULTS:',
    `- Fish landed: ${landed.length}`,
    `- Quality strikes missed: ${strikes}`,
    `- Follows/sightings: ${follows}`,
    catchLogLines.length > 0 ? `\nCATCH LOG:\n${catchLogLines.join('\n')}` : 'No catches recorded.',
    session.notes ? `\nANGLER NOTES: ${session.notes}` : '',
    '',
    'HISTORICAL CONTEXT (angler\'s full log):',
    `- Total fish logged across all sessions: ${totalHistoricalFish}`,
    personalBest
      ? `- Personal best: ${personalBest.weightLbs}lb ${personalBest.weightOz}oz ${personalBest.species} on ${personalBest.lureType}`
      : '- No personal best recorded yet',
    `- Average fish weight: ${avgWeight} lbs`,
    topLures.length > 0 ? `- Top producing lures: ${topLures.join(', ')}` : '',
    '',
    'COACHING STYLE:',
    '- Be conversational, warm, and encouraging \u2014 like a guide debriefing at the dock',
    '- Reference specific data from their session and history when relevant',
    '- Keep responses to 2-4 short paragraphs',
    '- Use plain language, no jargon explanations needed (they know how to fish)',
    '- Ask a follow-up question to keep the dialogue going',
    '- Note patterns that connect this session to their historical data when applicable',
  ]
    .filter(s => s !== '')
    .join('\n')

  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })

  const stream = client.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages: messages.map(m => ({ role: m.role, content: m.content })),
  })

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      yield event.delta.text
    }
  }
}

// ─── ConversationCard sub-component ──────────────────────────────────────────

interface ConversationCardProps {
  debrief: DebriefConversation
  isSelectMode: boolean
  isSelected: boolean
  onTap: () => void
  onToggleSelect: () => void
  onLongPressStart: () => void
  onLongPressEnd: () => void
}

function ConversationCard({
  debrief,
  isSelectMode,
  isSelected,
  onTap,
  onToggleSelect,
  onLongPressStart,
  onLongPressEnd,
}: ConversationCardProps) {
  const dateStr = new Date(debrief.sessionDate).toLocaleDateString([], {
    weekday: 'short', month: 'short', day: 'numeric',
  })
  const msgCount = debrief.messages.length
  const lastMsg = debrief.messages[debrief.messages.length - 1]
  const preview = lastMsg ? truncateText(lastMsg.content, 80) : 'No messages yet'
  const timeStr = formatRelativeTime(debrief.updatedAt)

  const handleTap = () => {
    if (isSelectMode) {
      onToggleSelect()
    } else {
      onTap()
    }
  }

  return (
    <div
      className={`th-surface rounded-2xl border th-border overflow-hidden flex items-stretch transition-all${isSelected ? ' ring-2 ring-[var(--th-accent)]' : ''}`}
    >
      {isSelectMode && (
        <button
          onClick={onToggleSelect}
          className="flex items-center justify-center px-3 min-w-[48px] min-h-[48px] shrink-0"
          aria-label={isSelected ? 'Deselect' : 'Select'}
        >
          <div
            className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors${
              isSelected
                ? ' bg-[var(--th-accent)] border-[var(--th-accent)]'
                : ' border-[var(--th-border)] th-surface'
            }`}
          >
            {isSelected && (
              <svg
                className="w-3.5 h-3.5 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={3}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
          </div>
        </button>
      )}

      <button
        className="flex-1 flex items-start justify-between px-4 py-3 text-left gap-3 min-h-[64px]"
        onClick={handleTap}
        onTouchStart={isSelectMode ? undefined : onLongPressStart}
        onTouchEnd={isSelectMode ? undefined : onLongPressEnd}
        onTouchCancel={isSelectMode ? undefined : onLongPressEnd}
        onMouseDown={isSelectMode ? undefined : onLongPressStart}
        onMouseUp={isSelectMode ? undefined : onLongPressEnd}
        onMouseLeave={isSelectMode ? undefined : onLongPressEnd}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="th-text font-semibold text-sm">{dateStr}</span>
            <span className="th-accent-text text-xs font-medium">
              {msgCount} message{msgCount !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="th-text-muted text-xs mt-0.5 truncate">{debrief.sessionLaunchSite}</div>
          <div
            className="th-text-muted text-xs mt-1 leading-relaxed"
            style={{
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {preview}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <span className="th-text-muted text-xs">{timeStr}</span>
        </div>
      </button>
    </div>
  )
}

// ─── MessageBubble sub-component ──────────────────────────────────────────────

interface MessageBubbleProps {
  message: DebriefMessage
  isStreaming: boolean
  speakingMsgIdx: number | null
  messageIdx: number
  totalMessages: number
  onSpeak: (idx: number, text: string) => void
  onStopSpeak: () => void
}

function MessageBubble({
  message,
  isStreaming,
  speakingMsgIdx,
  messageIdx,
  totalMessages,
  onSpeak,
  onStopSpeak,
}: MessageBubbleProps) {
  const isUser = message.role === 'user'
  const isCurrentlyStreaming = isStreaming && messageIdx === totalMessages - 1
  const isSpeaking = speakingMsgIdx === messageIdx

  return (
    <div className={`flex${isUser ? ' justify-end' : ' justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3${
          isUser
            ? ' bg-[var(--th-accent)] text-white rounded-br-sm'
            : ' th-surface border th-border rounded-bl-sm'
        }`}
      >
        <p className={`text-sm leading-relaxed whitespace-pre-wrap${isUser ? ' text-white' : ' th-text'}`}>
          {message.content}
          {isCurrentlyStreaming && (
            <span className="inline-block w-2 h-4 bg-[var(--th-accent-text)] ml-1 align-middle animate-pulse rounded-sm" />
          )}
        </p>

        {!isUser && message.content && !isCurrentlyStreaming && hasSpeech && (
          <div className="mt-2 flex justify-end">
            <button
              onClick={() => (isSpeaking ? onStopSpeak() : onSpeak(messageIdx, message.content))}
              className="flex items-center gap-1 px-2 py-1 rounded-lg th-text-muted transition-colors min-w-[44px] min-h-[36px] justify-center"
              aria-label={isSpeaking ? 'Stop speaking' : 'Read aloud'}
            >
              {isSpeaking ? (
                <svg
                  className="w-4 h-4 th-accent-text"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <rect x="6" y="6" width="4" height="12" rx="1" />
                  <rect x="14" y="6" width="4" height="12" rx="1" />
                </svg>
              ) : (
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M11 5L6 9H2v6h4l5 4V5z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07"
                  />
                </svg>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main Debrief Component ───────────────────────────────────────────────────

export default function Debrief({ settings, pendingSession, onPendingConsumed }: Props) {
  // ── Core state ────────────────────────────────────────────────────────────────
  const [debriefs, setDebriefs] = useState<DebriefConversation[]>([])
  const [loading, setLoading] = useState(true)
  const [openConversation, setOpenConversation] = useState<DebriefConversation | null>(null)

  // Conversation input + streaming
  const [inputText, setInputText] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamError, setStreamError] = useState('')

  // Cached session data — fetched once per open conversation
  const [debriefCache, setDebriefCache] = useState<DebriefSessionCache | null>(null)

  // Voice
  const [speakingMsgIdx, setSpeakingMsgIdx] = useState<number | null>(null)

  // Accordion
  const [openMonths, setOpenMonths] = useState<Set<string>>(new Set())

  // Multi-select
  const [isSelectMode, setIsSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Refs
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const pendingHandledRef = useRef(false)

  // ── Load debriefs on mount ────────────────────────────────────────────────────
  useEffect(() => {
    loadAllDebriefs()
  }, [])

  async function loadAllDebriefs() {
    setLoading(true)
    const all = await getAllDebriefs()
    setDebriefs(all)
    setOpenMonths(prev => {
      if (prev.size > 0) return prev
      if (all.length > 0) {
        const d = new Date(all[0].sessionDate)
        return new Set([`${d.getFullYear()}-${d.getMonth()}`])
      }
      return prev
    })
    setLoading(false)
  }

  // ── Cache session data when conversation opens ────────────────────────────────
  useEffect(() => {
    if (!openConversation) { setDebriefCache(null); return }
    if (debriefCache?.sessionId === openConversation.sessionId) return
    void Promise.all([
      getEventsForSession(openConversation.sessionId),
      getAllEvents(),
      getAllSessions(),
    ]).then(([sessionEvents, allEvents, allSessions]) => {
      const session = allSessions.find(s => s.id === openConversation.sessionId)
      if (!session) return
      setDebriefCache({
        sessionId: openConversation.sessionId,
        events:    sessionEvents,
        allFish:   allEvents.filter((e): e is LandedFish => e.type === 'Landed Fish'),
        session,
      })
    })
  }, [openConversation?.sessionId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handle pendingSession ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!pendingSession || pendingHandledRef.current) return
    pendingHandledRef.current = true
    handlePendingSession(pendingSession)
  }, [pendingSession]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!pendingSession) {
      pendingHandledRef.current = false
    }
  }, [pendingSession])

  const handlePendingSession = useCallback(
    async (session: Session) => {
      if (!settings.anthropicApiKey) {
        onPendingConsumed()
        return
      }

      const existing = await getDebriefForSession(session.id)
      if (existing) {
        onPendingConsumed()
        setOpenConversation(existing)
        return
      }

      const now = Date.now()
      const newDebrief: DebriefConversation = {
        id: nanoid(),
        sessionId: session.id,
        sessionDate: session.date,
        sessionLaunchSite: session.launchSite,
        messages: [],
        createdAt: now,
        updatedAt: now,
      }

      await saveDebrief(newDebrief)
      onPendingConsumed()
      setDebriefs(prev => [newDebrief, ...prev])
      setOpenConversation(newDebrief)

      triggerOpeningMessage(newDebrief, session)
    },
    [settings.anthropicApiKey, onPendingConsumed] // eslint-disable-line react-hooks/exhaustive-deps
  )

  // ── AI opening message ────────────────────────────────────────────────────────
  const triggerOpeningMessage = useCallback(
    async (conversation: DebriefConversation, session: Session) => {
      if (!settings.anthropicApiKey) return

      setIsStreaming(true)
      setStreamError('')

      const [sessionEvents, allEvents, allSessions] = await Promise.all([
        getEventsForSession(session.id),
        getAllEvents(),
        getAllSessions(),
      ])

      void allSessions // used for context awareness, not directly needed here

      const allFish = allEvents.filter((e): e is LandedFish => e.type === 'Landed Fish')

      // Populate cache so sendMessage doesn't re-fetch
      setDebriefCache({ sessionId: session.id, events: sessionEvents, allFish, session })
      const landed = sessionEvents.filter((e): e is LandedFish => e.type === 'Landed Fish')

      const sessionDateStr = new Date(session.date).toLocaleDateString([], {
        weekday: 'long', month: 'long', day: 'numeric',
      })
      const duration = session.endTime ? formatSessionDuration(session) : ''

      const topFish = landed
        .sort((a, b) => b.weightLbs + b.weightOz / 16 - (a.weightLbs + a.weightOz / 16))
        .slice(0, 3)
        .map(f => `${f.weightLbs}lb ${f.weightOz}oz ${f.species} on ${f.lureType}`)
        .join(', ')

      const openingPrompt = [
        `I just got off the water from my session on ${sessionDateStr} at ${session.launchSite}`,
        duration ? ` (${duration})` : '',
        `. I landed ${landed.length} fish`,
        topFish ? ` \u2014 best ones: ${topFish}` : '',
        '. Give me your opening coaching debrief.',
      ].join('')

      const openingUserMsg: DebriefMessage = {
        role: 'user',
        content: openingPrompt,
        timestamp: Date.now(),
      }

      const assistantPlaceholder: DebriefMessage = {
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
      }

      const withMessages: DebriefConversation = {
        ...conversation,
        messages: [openingUserMsg, assistantPlaceholder],
        updatedAt: Date.now(),
      }
      setOpenConversation(withMessages)

      try {
        const gen = streamDebriefResponse(settings.anthropicApiKey, [openingUserMsg], {
          session,
          events: sessionEvents,
          allFish,
        })

        let fullContent = ''
        for await (const chunk of gen) {
          fullContent += chunk
          setOpenConversation(prev => {
            if (!prev) return prev
            const msgs = [...prev.messages]
            msgs[msgs.length - 1] = {
              role: 'assistant',
              content: fullContent,
              timestamp: Date.now(),
            }
            return { ...prev, messages: msgs }
          })
        }

        const finalDebrief: DebriefConversation = {
          ...conversation,
          messages: [
            openingUserMsg,
            { role: 'assistant', content: fullContent, timestamp: Date.now() },
          ],
          updatedAt: Date.now(),
        }
        await saveDebrief(finalDebrief)
        setOpenConversation(finalDebrief)
        setDebriefs(prev => {
          const idx = prev.findIndex(d => d.id === finalDebrief.id)
          if (idx >= 0) {
            const updated = [...prev]
            updated[idx] = finalDebrief
            return updated
          }
          return [finalDebrief, ...prev]
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        setStreamError(`Error: ${msg}`)
      }

      setIsStreaming(false)
    },
    [settings.anthropicApiKey]
  )

  // ── Scroll to bottom on new messages ─────────────────────────────────────────
  useEffect(() => {
    if (openConversation) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [openConversation?.messages.length, isStreaming]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Send user message ─────────────────────────────────────────────────────────
  const sendMessage = useCallback(async () => {
    if (!inputText.trim() || isStreaming || !openConversation) return
    if (!settings.anthropicApiKey) {
      setStreamError('Add your Anthropic API key in Settings.')
      return
    }

    setStreamError('')

    const userMsg: DebriefMessage = {
      role: 'user',
      content: inputText.trim(),
      timestamp: Date.now(),
    }
    const assistantPlaceholder: DebriefMessage = {
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    }

    const priorMessages = [...openConversation.messages]
    const updatedMessages = [...priorMessages, userMsg, assistantPlaceholder]

    setInputText('')
    setOpenConversation(prev =>
      prev ? { ...prev, messages: updatedMessages, updatedAt: Date.now() } : prev
    )
    setIsStreaming(true)

    // Use cached session data — fall back to re-fetch if not ready
    let cacheData = debriefCache?.sessionId === openConversation.sessionId ? debriefCache : null
    if (!cacheData) {
      const [sessionEvents, allEvents, allSessions] = await Promise.all([
        getEventsForSession(openConversation.sessionId),
        getAllEvents(),
        getAllSessions(),
      ])
      const session = allSessions.find(s => s.id === openConversation.sessionId)
      if (!session) {
        setStreamError('Could not find session data.')
        setIsStreaming(false)
        return
      }
      const allFish = allEvents.filter((e): e is LandedFish => e.type === 'Landed Fish')
      cacheData = { sessionId: openConversation.sessionId, events: sessionEvents, allFish, session }
      setDebriefCache(cacheData)
    }

    const { session, events: sessionEvents, allFish } = cacheData

    // API gets all messages except the empty placeholder; compact long histories
    const historyForApi = compactMessages([...priorMessages, userMsg])

    try {
      const gen = streamDebriefResponse(settings.anthropicApiKey, historyForApi, {
        session,
        events: sessionEvents,
        allFish,
      })

      let fullContent = ''
      for await (const chunk of gen) {
        fullContent += chunk
        setOpenConversation(prev => {
          if (!prev) return prev
          const msgs = [...prev.messages]
          msgs[msgs.length - 1] = {
            role: 'assistant',
            content: fullContent,
            timestamp: Date.now(),
          }
          return { ...prev, messages: msgs }
        })
      }

      const finalMessages: DebriefMessage[] = [
        ...priorMessages,
        userMsg,
        { role: 'assistant', content: fullContent, timestamp: Date.now() },
      ]
      const finalDebrief: DebriefConversation = {
        ...openConversation,
        messages: finalMessages,
        updatedAt: Date.now(),
      }
      await saveDebrief(finalDebrief)
      setOpenConversation(finalDebrief)
      setDebriefs(prev => {
        const idx = prev.findIndex(d => d.id === finalDebrief.id)
        if (idx >= 0) {
          const updated = [...prev]
          updated[idx] = finalDebrief
          // Bubble to top within the list
          return [updated[idx], ...updated.filter((_, i) => i !== idx)]
        }
        return [finalDebrief, ...prev]
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setStreamError(`Error: ${msg}`)
      // Remove the placeholder
      setOpenConversation(prev =>
        prev ? { ...prev, messages: prev.messages.slice(0, -1) } : prev
      )
    }

    setIsStreaming(false)
  }, [inputText, isStreaming, openConversation, settings.anthropicApiKey])

  // ── Voice ─────────────────────────────────────────────────────────────────────
  const handleSpeak = useCallback((idx: number, text: string) => {
    if (speakingMsgIdx === idx) {
      cancelSpeech()
      setSpeakingMsgIdx(null)
      return
    }
    cancelSpeech()
    setSpeakingMsgIdx(idx)
    speakText(text, { onEnd: () => setSpeakingMsgIdx(null) })
  }, [speakingMsgIdx])

  const handleStopSpeak = useCallback(() => {
    cancelSpeech()
    setSpeakingMsgIdx(null)
  }, [])

  // ── Long-press ────────────────────────────────────────────────────────────────
  const startLongPress = useCallback((debriefId: string) => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current)
    longPressTimer.current = setTimeout(() => {
      setIsSelectMode(true)
      setSelectedIds(new Set([debriefId]))
      longPressTimer.current = null
    }, 500)
  }, [])

  const endLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }, [])

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }, [])

  const exitSelectMode = useCallback(() => {
    setIsSelectMode(false)
    setSelectedIds(new Set())
    setConfirmingDelete(false)
  }, [])

  // ── Delete selected ───────────────────────────────────────────────────────────
  const handleDeleteSelected = useCallback(async () => {
    setDeleting(true)
    const ids = [...selectedIds]
    await bulkDeleteDebriefs(ids)
    setDebriefs(prev => prev.filter(d => !ids.includes(d.id)))
    exitSelectMode()
    setDeleting(false)
  }, [selectedIds, exitSelectMode])

  // ── Open pending debrief from inbox card ──────────────────────────────────────
  const openPendingFromCard = useCallback(
    async (session: Session) => {
      if (!settings.anthropicApiKey) return
      const existing = await getDebriefForSession(session.id)
      if (existing) {
        setOpenConversation(existing)
      } else {
        await handlePendingSession(session)
      }
    },
    [settings.anthropicApiKey, handlePendingSession]
  )

  // ── Month accordion ───────────────────────────────────────────────────────────
  const toggleMonth = useCallback((key: string) => {
    setOpenMonths(prev => {
      const n = new Set(prev)
      n.has(key) ? n.delete(key) : n.add(key)
      return n
    })
  }, [])

  // ─────────────────────────────────────────────────────────────────────────────
  // CONVERSATION VIEW
  // ─────────────────────────────────────────────────────────────────────────────
  if (openConversation) {
    const sessionDateStr = new Date(openConversation.sessionDate).toLocaleDateString([], {
      weekday: 'short', month: 'short', day: 'numeric',
    })

    // Filter the auto-generated opening prompt from visible messages
    const visibleMessages = openConversation.messages.filter((msg, idx) => {
      if (
        msg.role === 'user' &&
        idx === 0 &&
        msg.content.startsWith('I just got off the water from my session on')
      ) {
        return false
      }
      return true
    })

    return (
      <div className="flex flex-col" style={{ height: 'calc(100vh - 60px)' }}>
        {/* Header */}
        <div className="th-surface-deep border-b th-border px-4 py-3 flex items-center gap-3 shrink-0">
          <button
            onClick={() => {
              setOpenConversation(null)
              cancelSpeech()
              setSpeakingMsgIdx(null)
              setStreamError('')
            }}
            className="th-accent-text font-medium text-sm min-w-[44px] min-h-[44px] flex items-center"
          >
            {'← Back'}
          </button>
          <div className="flex-1 min-w-0">
            <div className="th-text font-semibold text-sm leading-tight">{sessionDateStr}</div>
            <div className="th-text-muted text-xs truncate">
              {openConversation.sessionLaunchSite}
            </div>
          </div>
        </div>

        {/* No API key banner */}
        {!settings.anthropicApiKey && (
          <div className="mx-4 mt-4 p-3 rounded-xl border border-amber-700/40 bg-amber-900/20">
            <p className="text-amber-300 text-sm">
              Add your Anthropic API key in Settings to use AI Debrief.
            </p>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto scrollbar-hide px-4 py-4 space-y-4">
          {visibleMessages.length === 0 && !isStreaming && (
            <div className="text-center py-16">
              <p className="th-text-muted text-sm">Starting your debrief\u2026</p>
            </div>
          )}

          {visibleMessages.map(msg => {
            const actualIdx = openConversation.messages.indexOf(msg)
            return (
              <MessageBubble
                key={actualIdx}
                message={msg}
                isStreaming={isStreaming}
                speakingMsgIdx={speakingMsgIdx}
                messageIdx={actualIdx}
                totalMessages={openConversation.messages.length}
                onSpeak={handleSpeak}
                onStopSpeak={handleStopSpeak}
              />
            )
          })}

          {streamError && (
            <div className="mx-auto max-w-sm p-3 rounded-xl border border-red-700/40 bg-red-900/20">
              <p className="text-red-300 text-sm">{streamError}</p>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Text input */}
        <div className="px-4 py-3 border-t th-border th-surface-deep shrink-0">
          <div className="flex gap-2 items-end">
            <textarea
              ref={textareaRef}
              className="flex-1 th-surface border th-border rounded-xl px-3 py-3 th-text text-sm resize-none min-h-[44px] max-h-[120px] leading-relaxed"
              style={{ outline: 'none' }}
              placeholder={
                isStreaming ? 'Coach is responding\u2026' : 'Ask a follow-up question\u2026'
              }
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  sendMessage()
                }
              }}
              disabled={isStreaming || !settings.anthropicApiKey}
              rows={1}
            />
            <button
              onClick={sendMessage}
              disabled={isStreaming || !inputText.trim() || !settings.anthropicApiKey}
              className="px-4 py-3 th-btn-primary rounded-xl font-bold text-base disabled:opacity-40 shrink-0 min-w-[48px] min-h-[44px] flex items-center justify-center"
              aria-label="Send message"
            >
              {isStreaming ? (
                <span className="text-sm">\u2026</span>
              ) : (
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18"
                  />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // INBOX VIEW
  // ─────────────────────────────────────────────────────────────────────────────

  const grouped = groupDebriefs(debriefs)

  return (
    <div className="pb-32">
      {/* Header */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold th-text">Debrief</h1>
          {isSelectMode && (
            <button
              onClick={exitSelectMode}
              className="th-text-muted text-sm min-h-[44px] px-2"
            >
              Cancel
            </button>
          )}
        </div>
        <p className="th-text-muted text-sm mt-0.5">
          {isSelectMode
            ? `${selectedIds.size} selected`
            : debriefs.length === 0
            ? 'AI coaching conversations for each session'
            : `${debriefs.length} debrief${debriefs.length !== 1 ? 's' : ''}`}
        </p>
      </div>

      {/* No API key banner */}
      {!settings.anthropicApiKey && (
        <div className="mx-4 mb-4 p-3 rounded-xl border border-amber-700/40 bg-amber-900/20">
          <p className="text-amber-300 text-sm">
            Add your Anthropic API key in Settings to enable AI Debrief.
          </p>
        </div>
      )}

      {/* Pending session card */}
      {pendingSession && !isSelectMode && (
        <div className="px-4 mb-5">
          <div
            className="th-surface rounded-2xl border-2 p-4"
            style={{ borderColor: 'var(--th-accent)', boxShadow: '0 4px 20px var(--th-card-glow)' }}
          >
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="th-accent-text font-bold text-sm mb-1">
                  New session ended \u2014 start your debrief
                </div>
                <div className="th-text font-semibold text-base truncate">
                  {pendingSession.launchSite}
                </div>
                <div className="th-text-muted text-xs mt-1">
                  {new Date(pendingSession.date).toLocaleDateString([], {
                    weekday: 'short', month: 'short', day: 'numeric',
                  })}
                  {pendingSession.endTime
                    ? ` \u00b7 ${formatSessionDuration(pendingSession)}`
                    : ''}
                </div>
              </div>
            </div>
            <button
              onClick={() => openPendingFromCard(pendingSession)}
              disabled={!settings.anthropicApiKey}
              className="mt-3 w-full py-3 th-btn-primary rounded-xl font-bold text-sm disabled:opacity-40 min-h-[44px]"
            >
              Start Debrief
            </button>
          </div>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="text-center py-16">
          <p className="th-text-muted text-sm">Loading\u2026</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && debriefs.length === 0 && !pendingSession && (
        <div className="text-center py-20 px-8">
          <div className="text-5xl mb-4">{'🎣'}</div>
          <p className="th-text-muted text-sm">Sessions you debrief will appear here.</p>
          <p className="th-text-muted text-xs mt-2">
            Complete a session to start an AI coaching conversation.
          </p>
        </div>
      )}

      {/* Grouped accordion */}
      {!loading &&
        grouped.map(({ year, months }) => (
          <div key={year}>
            {/* Year header */}
            <div className="px-4 py-2 flex items-center gap-3">
              <span className="text-sm font-bold th-text-muted tracking-wider">{year}</span>
              <div
                className="flex-1 h-px th-border"
                style={{ backgroundColor: 'var(--th-border)' }}
              />
            </div>

            {months.map(({ month, label, debriefs: mDebriefs }) => {
              const monthKey = `${year}-${month}`
              const isMonthOpen = openMonths.has(monthKey)

              return (
                <div key={month} className="mb-1">
                  {/* Month toggle button */}
                  <button
                    onClick={() => toggleMonth(monthKey)}
                    className="w-full flex items-center justify-between px-4 py-2.5 text-left min-h-[44px]"
                  >
                    <span className="text-xs font-bold th-text-muted uppercase tracking-widest">
                      {label} \u00b7 {mDebriefs.length} debrief
                      {mDebriefs.length !== 1 ? 's' : ''}
                    </span>
                    <span className="th-text-muted text-xs ml-2">
                      {isMonthOpen ? '\u25b2' : '\u25bc'}
                    </span>
                  </button>

                  {isMonthOpen && (
                    <div className="space-y-2 px-3 pb-2 accordion-enter">
                      {mDebriefs.map(debrief => (
                        <ConversationCard
                          key={debrief.id}
                          debrief={debrief}
                          isSelectMode={isSelectMode}
                          isSelected={selectedIds.has(debrief.id)}
                          onTap={() => setOpenConversation(debrief)}
                          onToggleSelect={() => toggleSelect(debrief.id)}
                          onLongPressStart={() => startLongPress(debrief.id)}
                          onLongPressEnd={endLongPress}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ))}

      {/* Multi-select delete bar */}
      {isSelectMode && (
        <div
          className="fixed bottom-16 inset-x-0 px-4 pb-4 pt-3 th-surface-deep border-t th-border"
          style={{ zIndex: 40 }}
        >
          {confirmingDelete ? (
            <div>
              <p className="th-text text-sm font-medium mb-3 text-center">
                Delete {selectedIds.size} debrief{selectedIds.size !== 1 ? 's' : ''}? This cannot
                be undone.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handleDeleteSelected}
                  disabled={deleting}
                  className="flex-1 py-3 bg-red-700 text-white rounded-xl text-sm font-bold disabled:opacity-50 min-h-[48px]"
                >
                  {deleting ? 'Deleting\u2026' : 'Yes, Delete'}
                </button>
                <button
                  onClick={() => setConfirmingDelete(false)}
                  className="flex-1 py-3 th-surface border th-border rounded-xl th-text text-sm min-h-[48px]"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmingDelete(true)}
              disabled={selectedIds.size === 0}
              className="w-full py-3 bg-red-700/80 text-white rounded-xl text-sm font-bold disabled:opacity-40 min-h-[48px]"
            >
              Delete Selected ({selectedIds.size})
            </button>
          )}
        </div>
      )}
    </div>
  )
}
