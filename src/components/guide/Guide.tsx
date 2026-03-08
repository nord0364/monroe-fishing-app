import { useState, useEffect, useRef, useCallback } from 'react'
import type { Session, AppSettings, CatchEvent, StandaloneGuideEntry, Rod } from '../../types'
import {
  getEventsForSession, saveEvent, saveStandaloneGuideEntry,
  getAllStandaloneGuideEntries, deleteStandaloneGuideEntry,
  bulkDeleteStandaloneGuideEntries, getAllSessions, saveSession, getAllRods,
} from '../../db/database'
import {
  buildGuideSystemPrompt, streamGuideResponse, generateCheckpointSummary,
  generateAnalysisSummary, mentionsHistory, type GuideMessage,
} from '../../api/guideAI'
import { loadPatternCache } from '../../ai/patternMemory'
import { speakText, cancelSpeech, hasSpeech } from '../../utils/speech'
import { nanoid } from '../logger/nanoid'
import type Anthropic from '@anthropic-ai/sdk'

// ─── Constants ────────────────────────────────────────────────────────────────

const COMPACT_AT   = 16  // 8 exchanges × 2 messages
const COMPACT_DROP = 8   // drop oldest 8 messages (4 exchanges) per compaction
const RECENT_ANALYSES_COUNT = 3  // how many past session analyses to load

// ─── Image resize ─────────────────────────────────────────────────────────────

async function resizeImage(dataUrl: string, maxPx = 1200, quality = 0.82): Promise<string> {
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width  = Math.round(img.width  * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.src = dataUrl
  })
}

function extractBase64(dataUrl: string): { data: string; mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' } {
  const [header, data] = dataUrl.split(',')
  const mediaType = (header.match(/:(.*?);/)?.[1] ?? 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
  return { data, mediaType }
}

// ─── History Accordion ────────────────────────────────────────────────────────

function groupByMonth(entries: StandaloneGuideEntry[]): Map<string, StandaloneGuideEntry[]> {
  const map = new Map<string, StandaloneGuideEntry[]>()
  for (const e of entries) {
    const d = new Date(e.createdAt)
    const key = `${d.getFullYear()}-${d.getMonth()}`
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(e)
  }
  return map
}

function firstSentence(text: string): string {
  const match = text.match(/^[^.!?]+[.!?]/)
  return match ? match[0] : text.slice(0, 100)
}

interface HistoryProps {
  entries: StandaloneGuideEntry[]
  onDelete: (id: string) => void
  onBulkDelete: (ids: string[]) => void
}

function GuideHistory({ entries, onDelete, onBulkDelete }: HistoryProps) {
  const [openMonths, setOpenMonths]   = useState<Set<string>>(new Set())
  const [confirmId, setConfirmId]     = useState<string | null>(null)
  const [bulkMonth, setBulkMonth]     = useState<string | null>(null)
  const [bulkConfirm, setBulkConfirm] = useState<string | null>(null)
  const longPressRef                   = useRef<ReturnType<typeof setTimeout> | null>(null)

  const grouped   = groupByMonth(entries)
  const monthKeys = [...grouped.keys()]

  useEffect(() => {
    if (monthKeys.length > 0 && openMonths.size === 0) {
      setOpenMonths(new Set([monthKeys[0]]))
    }
  }, [entries.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const monthLabel = (key: string) => {
    const [year, month] = key.split('-').map(Number)
    return new Date(year, month).toLocaleString([], { month: 'long', year: 'numeric' })
  }

  const toggleMonth = (key: string) =>
    setOpenMonths(prev => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s })

  const startLongPress = (key: string) => {
    longPressRef.current = setTimeout(() => setBulkMonth(key), 500)
  }
  const cancelLongPress = () => {
    if (longPressRef.current) { clearTimeout(longPressRef.current); longPressRef.current = null }
  }

  if (entries.length === 0) {
    return (
      <div className="text-center py-10">
        <p className="th-text-muted text-sm">No standalone Guide sessions yet.</p>
        <p className="th-text-muted text-xs mt-1">Ask anything below to start a new conversation.</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <p className="th-text-muted text-xs uppercase tracking-wide font-semibold px-1">Previous Sessions</p>
      {monthKeys.map(key => {
        const monthEntries = grouped.get(key)!
        const isOpen       = openMonths.has(key)
        const isBulkTarget = bulkMonth === key

        return (
          <div key={key} className="th-surface rounded-xl border th-border overflow-hidden">
            <div className="flex items-center">
              <button
                className="flex-1 flex items-center justify-between px-3 py-2.5"
                onClick={() => { cancelLongPress(); toggleMonth(key) }}
                onPointerDown={() => startLongPress(key)}
                onPointerUp={cancelLongPress}
                onPointerLeave={cancelLongPress}
              >
                <span className="th-text text-sm font-semibold">{monthLabel(key)}</span>
                <span className="th-text-muted text-xs">{isOpen ? '▲' : '▼'}</span>
              </button>
            </div>

            {isBulkTarget && (
              <div className="px-3 pb-3 th-danger-bg border-t th-border">
                <p className="th-danger-text text-xs py-2">Delete all {monthEntries.length} sessions from {monthLabel(key)}?</p>
                {bulkConfirm === key ? (
                  <div className="flex gap-2">
                    <button onClick={() => { onBulkDelete(monthEntries.map(e => e.id)); setBulkMonth(null); setBulkConfirm(null) }}
                      className="flex-1 py-2 bg-red-700 rounded-lg text-white text-xs font-semibold">
                      Delete All
                    </button>
                    <button onClick={() => { setBulkMonth(null); setBulkConfirm(null) }}
                      className="flex-1 py-2 th-surface border th-border rounded-lg th-text-muted text-xs">
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button onClick={() => setBulkConfirm(key)}
                      className="flex-1 py-2 bg-red-700 rounded-lg text-white text-xs font-semibold">
                      Confirm Delete
                    </button>
                    <button onClick={() => setBulkMonth(null)}
                      className="flex-1 py-2 th-surface border th-border rounded-lg th-text-muted text-xs">
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            )}

            {isOpen && (
              <div className="divide-y th-border border-t th-border">
                {monthEntries.map(entry => {
                  const d = new Date(entry.createdAt)
                  const dateStr = d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                  const isConfirming = confirmId === entry.id

                  return (
                    <div key={entry.id} className="px-3 py-2.5">
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="th-text-muted text-xs mb-0.5">{dateStr}</div>
                          <p className="th-text text-sm leading-snug">{firstSentence(entry.summary)}</p>
                        </div>
                        {isConfirming ? (
                          <div className="flex gap-1 shrink-0">
                            <button onClick={() => { onDelete(entry.id); setConfirmId(null) }}
                              className="px-2 py-1 bg-red-700 rounded-lg text-white text-xs font-semibold">
                              Delete
                            </button>
                            <button onClick={() => setConfirmId(null)}
                              className="px-2 py-1 th-surface-deep border th-border rounded-lg th-text-muted text-xs">
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => setConfirmId(entry.id)}
                            className="shrink-0 px-2 py-1 th-text-muted text-xs opacity-50 active:opacity-100">
                            ✕
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Main Guide component ─────────────────────────────────────────────────────

interface Props {
  session: Session | null
  settings: AppSettings
  onClose: () => void
  isTab?: boolean           // render inline (no fixed overlay wrapper)
  postSessionMode?: boolean // auto-generate opening analysis, save analysisummary
}

export default function Guide({ session, settings, onClose, isTab, postSessionMode }: Props) {
  const [messages, setMessages]               = useState<GuideMessage[]>([])
  const [input, setInput]                     = useState('')
  const [streaming, setStreaming]             = useState(false)
  const [error, setError]                     = useState<string | null>(null)
  const [retryContent, setRetryContent]       = useState<Anthropic.Messages.MessageParam['content'] | null>(null)
  const [attachedImage, setAttachedImage]     = useState<string | null>(null)
  const [online, setOnline]                   = useState(navigator.onLine)
  const [speakingId, setSpeakingId]           = useState<string | null>(null)
  const [sessionEvents, setSessionEvents]     = useState<CatchEvent[]>([])
  const [patternInjected, setPatternInjected] = useState(false)
  const [standaloneHistory, setStandaloneHistory] = useState<StandaloneGuideEntry[]>([])
  const [recentAnalyses, setRecentAnalyses]   = useState<string[]>([])
  const [openingDone, setOpeningDone]         = useState(false)
  const [rodInventory, setRodInventory]       = useState<Rod[]>([])

  const chatEndRef             = useRef<HTMLDivElement>(null)
  const imgInputRef            = useRef<HTMLInputElement>(null)
  const textareaRef            = useRef<HTMLTextAreaElement>(null)
  const currentStandaloneId    = useRef<string>(nanoid())
  const exchangeCountRef       = useRef(0)  // tracks pairs in postSessionMode for checkpoint trigger

  const apiKey = settings.anthropicApiKey

  // ── Online detection ────────────────────────────────────────────────────────
  useEffect(() => {
    const on  = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online',  on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  // ── Fetch session events + recent analyses on open ───────────────────────────
  useEffect(() => {
    getAllRods().then(setRodInventory).catch(() => {})
    if (session) {
      getEventsForSession(session.id).then(setSessionEvents).catch(() => {})
      // Load recent session analyses for context
      getAllSessions().then(sessions => {
        const withAnalysis = sessions
          .filter(s => s.analysisummary && s.id !== session.id)
          .sort((a, b) => b.date - a.date)
          .slice(0, RECENT_ANALYSES_COUNT)
          .map(s => s.analysisummary!)
        setRecentAnalyses(withAnalysis)
      }).catch(() => {})
    } else {
      getAllStandaloneGuideEntries().then(setStandaloneHistory).catch(() => {})
    }
    return () => { cancelSpeech() }
  }, [session])

  // ── Auto-expand textarea ─────────────────────────────────────────────────────
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    const lineHeight = 20
    const minH = 3 * lineHeight + 16  // 3 rows + padding
    const maxH = 6 * lineHeight + 16  // 6 rows + padding
    ta.style.height = `${Math.min(Math.max(ta.scrollHeight, minH), maxH)}px`
  }, [input])

  // ── Scroll chat to bottom ────────────────────────────────────────────────────
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streaming])

  // ── TTS ──────────────────────────────────────────────────────────────────────
  const speak = useCallback((text: string, id: string) => {
    cancelSpeech()
    if (speakingId === id) { setSpeakingId(null); return }
    setSpeakingId(id)
    speakText(text, { onEnd: () => setSpeakingId(null) })
  }, [speakingId])

  // ── Save analysisummary to session record ─────────────────────────────────────
  const saveAnalysisSummary = useCallback((msgs: GuideMessage[]) => {
    if (!apiKey || !session || !postSessionMode || msgs.length < 2) return
    generateAnalysisSummary(apiKey, msgs).then(summary => {
      if (!summary || !session) return
      void saveSession({ ...session, analysisummary: summary })
    }).catch(() => {})
  }, [apiKey, session, postSessionMode])

  // ── Save checkpoint (background, non-blocking) ────────────────────────────────
  const saveCheckpoint = useCallback((msgs: GuideMessage[]) => {
    if (!apiKey || msgs.length < 4) return
    generateCheckpointSummary(apiKey, msgs).then(summary => {
      if (!summary) return
      if (session) {
        void saveEvent({
          type: 'Guide Summary',
          id: nanoid(),
          sessionId: session.id,
          timestamp: Date.now(),
          content: summary,
        })
      } else {
        const entry: StandaloneGuideEntry = {
          id: currentStandaloneId.current,
          createdAt: Date.now(),
          summary,
        }
        void saveStandaloneGuideEntry(entry).then(() =>
          getAllStandaloneGuideEntries().then(setStandaloneHistory)
        )
      }
    }).catch(() => {})
  }, [apiKey, session])

  // ── Rolling window compaction ─────────────────────────────────────────────────
  const compactIfNeeded = useCallback((msgs: GuideMessage[]): GuideMessage[] => {
    if (msgs.length <= COMPACT_AT) return msgs

    const toCompact = msgs.slice(0, COMPACT_DROP)
    const toKeep    = msgs.slice(COMPACT_DROP)

    saveCheckpoint(toCompact)

    const recap: GuideMessage = {
      id: nanoid(),
      role: 'user',
      content: '[Earlier conversation was summarized and saved. Continuing from that context.]',
    }
    const ack: GuideMessage = {
      id: nanoid(),
      role: 'assistant',
      content: 'Understood. Continuing from our earlier discussion.',
    }

    return [recap, ack, ...toKeep]
  }, [saveCheckpoint])

  // ── Build system prompt ───────────────────────────────────────────────────────
  const getSystemPrompt = useCallback((userText: string): string => {
    const includePattern = patternInjected || mentionsHistory(userText)
    if (includePattern && !patternInjected) setPatternInjected(true)
    const patternSummary = includePattern ? (loadPatternCache()?.summary) : undefined
    return buildGuideSystemPrompt(
      session, sessionEvents, patternSummary, recentAnalyses,
      session?.selectedRods ?? undefined,
      rodInventory.length > 0 ? rodInventory : undefined,
    )
  }, [session, sessionEvents, patternInjected, recentAnalyses, rodInventory])

  // ── Core send ─────────────────────────────────────────────────────────────────
  const doSend = useCallback(async (
    userText: string,
    apiContent: Anthropic.Messages.MessageParam['content'],
    displayText: string,
    hasImage: boolean,
    existingMessages?: GuideMessage[],
  ) => {
    setError(null)
    setRetryContent(null)

    const base = existingMessages ?? messages
    const userMsg: GuideMessage = { id: nanoid(), role: 'user', content: displayText, hasImage }
    const newMessages = [...base, userMsg]
    const compacted = compactIfNeeded(newMessages)
    setMessages([...compacted, { id: nanoid(), role: 'assistant', content: '' }])
    setStreaming(true)

    if (session) void getEventsForSession(session.id).then(setSessionEvents)

    const systemPrompt = getSystemPrompt(userText)
    let reply = ''

    try {
      const gen = streamGuideResponse(apiKey, systemPrompt, compacted, apiContent)
      for await (const chunk of gen) {
        reply += chunk
        setMessages(prev => {
          const arr = [...prev]
          arr[arr.length - 1] = { ...arr[arr.length - 1], content: reply }
          return arr
        })
      }

      const replyId = nanoid()
      setMessages(prev => {
        const arr = [...prev]
        arr[arr.length - 1] = { ...arr[arr.length - 1], id: replyId }
        return arr
      })
      if (hasSpeech) {
        setSpeakingId(replyId)
        speakText(reply, { onEnd: () => setSpeakingId(null) })
      }

      if (hasImage && session && reply) {
        void saveEvent({
          type: 'Guide Image Analysis',
          id: nanoid(),
          sessionId: session.id,
          timestamp: Date.now(),
          content: reply,
        })
      }

      if (hasImage && !session && reply) {
        saveCheckpoint([...compacted, userMsg, { id: replyId, role: 'assistant' as const, content: reply }])
      }

      // In post-session mode: save analysisummary every 4 exchanges
      if (postSessionMode) {
        exchangeCountRef.current += 1
        if (exchangeCountRef.current % 4 === 0) {
          const finalMsgs = [...compacted, userMsg, { id: replyId, role: 'assistant' as const, content: reply }]
          saveAnalysisSummary(finalMsgs)
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      setRetryContent(apiContent)
      setMessages(prev => prev.slice(0, -1))
    } finally {
      setStreaming(false)
    }
  }, [messages, compactIfNeeded, getSystemPrompt, apiKey, session, postSessionMode, saveAnalysisSummary, saveCheckpoint])

  // ── Auto-generate opening analysis in post-session mode ───────────────────────
  useEffect(() => {
    if (!postSessionMode || !apiKey || !online || openingDone || sessionEvents.length === 0) return
    if (!session) return
    setOpeningDone(true)
    const prompt = 'Please give me a concise post-session analysis. Cover what worked, what the data suggests about current patterns, and 1–2 actionable takeaways for next time.'
    void doSend(prompt, prompt, prompt, false, [])
  }, [postSessionMode, apiKey, online, openingDone, sessionEvents, session]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Send message ─────────────────────────────────────────────────────────────
  const sendMessage = useCallback(async () => {
    const text = input.trim()
    if ((!text && !attachedImage) || streaming || !online || !apiKey) return

    setInput('')

    if (attachedImage) {
      const resized = await resizeImage(attachedImage)
      const { data, mediaType } = extractBase64(resized)
      const apiContent: Anthropic.Messages.MessageParam['content'] = [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data } },
        { type: 'text', text: text || 'Please analyze this image and advise me.' },
      ]
      setAttachedImage(null)
      await doSend(text, apiContent, text || '[Photo attached]', true)
    } else {
      await doSend(text, text, text, false)
    }
  }, [input, attachedImage, streaming, online, apiKey, doSend])

  // ── Retry last failed message ─────────────────────────────────────────────────
  const retry = useCallback(() => {
    if (!retryContent) return
    const content = retryContent
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')
    setMessages(prev => prev.filter(m => m !== lastUserMsg))
    void doSend(
      typeof content === 'string' ? content : '',
      content,
      lastUserMsg?.content ?? '',
      lastUserMsg?.hasImage ?? false,
    )
  }, [retryContent, messages, doSend])

  // ── Camera / image attach ─────────────────────────────────────────────────────
  const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => { setAttachedImage(ev.target?.result as string) }
    reader.readAsDataURL(file)
    e.target.value = ''
  }, [])

  // ── On close — save final checkpoint + analysisummary ────────────────────────
  const handleClose = useCallback(() => {
    if (messages.length >= 4) {
      saveCheckpoint(messages)
      if (postSessionMode) saveAnalysisSummary(messages)
    }
    onClose()
  }, [messages, saveCheckpoint, postSessionMode, saveAnalysisSummary, onClose])

  // ─── Render ──────────────────────────────────────────────────────────────────
  const showHistory = !session && !postSessionMode && messages.length === 0

  const wrapperClass = isTab
    ? 'th-base flex flex-col h-full'
    : 'fixed inset-0 z-50 th-base flex flex-col'

  const headerTitle = postSessionMode
    ? 'Post-Session Analysis'
    : session
      ? 'Guide'
      : 'Guide'

  return (
    <div className={wrapperClass} style={{ paddingTop: isTab ? 0 : 'env(safe-area-inset-top)' }}>
      {/* Header */}
      <div className="th-surface-deep border-b th-border px-4 py-3 flex items-center gap-3 shrink-0">
        <button onClick={handleClose} className="th-text-muted text-sm font-semibold min-w-[44px] min-h-[44px] flex items-center">
          ← Back
        </button>
        <div className="flex-1">
          <span className="th-text font-bold text-base">{headerTitle}</span>
          {session && !postSessionMode && (
            <span className="th-text-muted text-xs ml-2">{session.launchSite}</span>
          )}
          {postSessionMode && session && (
            <span className="th-text-muted text-xs ml-2">
              {new Date(session.date).toLocaleDateString([], { month: 'short', day: 'numeric' })} · {session.launchSite}
            </span>
          )}
        </div>
        {!online && (
          <span className="text-xs px-2 py-1 bg-amber-900/40 border border-amber-700/60 rounded-lg text-amber-300">
            Offline
          </span>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">

        {showHistory && (
          <GuideHistory
            entries={standaloneHistory}
            onDelete={async id => {
              await deleteStandaloneGuideEntry(id)
              setStandaloneHistory(prev => prev.filter(e => e.id !== id))
            }}
            onBulkDelete={async ids => {
              await bulkDeleteStandaloneGuideEntries(ids)
              setStandaloneHistory(prev => prev.filter(e => !ids.includes(e.id)))
            }}
          />
        )}

        {/* Post-session waiting indicator */}
        {postSessionMode && messages.length === 0 && !streaming && (
          <div className="text-center py-8">
            <p className="th-text-muted text-sm animate-pulse">Analyzing your session…</p>
          </div>
        )}

        {!apiKey && (
          <div className="bg-amber-900/20 border border-amber-700/60 rounded-xl p-3">
            <p className="text-amber-300 text-sm">Add your Anthropic API key in Settings to use Guide.</p>
          </div>
        )}

        {messages.map((msg, i) => {
          const isAssistant    = msg.role === 'assistant'
          const isLastStreaming = streaming && i === messages.length - 1
          const msgId          = msg.id

          return (
            <div key={msgId} className={`flex ${isAssistant ? 'justify-start' : 'justify-end'}`}>
              <div className={`max-w-[88%] rounded-2xl px-3 py-2.5 text-sm leading-relaxed ${
                isAssistant
                  ? 'th-surface border th-border th-text rounded-tl-sm'
                  : 'th-btn-selected text-white rounded-tr-sm'
              }`}>
                {isAssistant ? (
                  <>
                    <p className="whitespace-pre-wrap">
                      {msg.content || (isLastStreaming
                        ? <span className="th-text-muted animate-pulse text-xs">Thinking…</span>
                        : null)}
                    </p>
                    {msg.content && !isLastStreaming && hasSpeech && (
                      <button
                        onClick={() => speak(msg.content, msgId)}
                        className={`mt-1.5 text-xs px-2 py-1 rounded-lg transition-opacity ${
                          speakingId === msgId ? 'th-accent-text opacity-100' : 'th-text-muted opacity-40 active:opacity-80'
                        }`}
                      >
                        {speakingId === msgId ? '⏹ Stop' : '🔊'}
                      </button>
                    )}
                  </>
                ) : (
                  <p className="whitespace-pre-wrap">
                    {msg.hasImage && <span className="opacity-70 mr-1">📷</span>}
                    {msg.content}
                  </p>
                )}
              </div>
            </div>
          )
        })}

        {error && (
          <div className="bg-red-900/30 border border-red-700/60 rounded-xl p-3 flex items-start gap-2">
            <div className="flex-1">
              <p className="text-red-300 text-sm">Error: {error}</p>
            </div>
            {retryContent && (
              <button
                onClick={retry}
                className="shrink-0 text-xs px-3 py-1.5 bg-red-800/60 border border-red-700/60 rounded-lg text-red-200 font-semibold"
              >
                Retry
              </button>
            )}
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Image preview */}
      {attachedImage && (
        <div className="px-4 pb-1 flex items-center gap-2 shrink-0">
          <img src={attachedImage} alt="Attached" className="h-14 w-14 object-cover rounded-lg border th-border" />
          <button onClick={() => setAttachedImage(null)} className="th-text-muted text-sm px-2 py-1">✕</button>
          <span className="th-text-muted text-xs">Photo ready to send</span>
        </div>
      )}

      {!online && (
        <div className="px-4 pb-1 shrink-0">
          <p className="text-amber-400 text-xs text-center">Guide requires a connection.</p>
        </div>
      )}

      {/* Input bar */}
      <div className="th-surface-deep border-t th-border px-3 py-2 flex gap-2 items-end shrink-0"
           style={{ paddingBottom: isTab ? '8px' : 'max(env(safe-area-inset-bottom), 8px)' }}>

        {/* Camera */}
        <button
          onClick={() => imgInputRef.current?.click()}
          disabled={streaming}
          className="shrink-0 w-10 h-10 flex items-center justify-center th-surface border th-border rounded-xl th-text-muted text-lg disabled:opacity-30"
          title="Attach photo"
        >
          📷
        </button>
        <input ref={imgInputRef} type="file" accept="image/*" capture="environment"
          onChange={handleImageSelect} className="hidden" />

        {/* Text input */}
        <textarea
          ref={textareaRef}
          className="flex-1 th-surface border th-border rounded-xl px-3 py-2.5 th-text text-sm resize-none"
          style={{ minHeight: '76px', maxHeight: '136px' }}
          placeholder={online ? 'Ask anything — attach a photo if it helps.' : 'Offline — reconnect to use Guide.'}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendMessage() }
          }}
          disabled={streaming || !online}
          rows={3}
        />

        {/* Send */}
        <button
          onClick={() => void sendMessage()}
          disabled={(!input.trim() && !attachedImage) || streaming || !online || !apiKey}
          className="shrink-0 w-10 h-10 flex items-center justify-center th-btn-primary rounded-xl font-bold text-lg disabled:opacity-40"
          title={!online ? 'Guide requires a connection' : undefined}
        >
          {streaming ? <span className="text-xs animate-pulse">…</span> : '↑'}
        </button>
      </div>
    </div>
  )
}
