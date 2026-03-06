import { useState, useRef, useEffect } from 'react'
import type { LandedFish, Session, AppSettings } from '../../types'
import type { ChatMessage } from '../../api/claude'
import { chatWithPatternData } from '../../api/claude'
import SpeakButton from '../layout/SpeakButton'
import { useSpeech } from '../../hooks/useSpeech'

interface Props {
  fish: LandedFish[]
  sessions: Session[]
  settings: AppSettings
}

const EXAMPLE_QUESTIONS = [
  "What conditions have produced my biggest largemouth?",
  "What's my best lure color in stained water on overcast mornings?",
  "What depth and column have produced the most fish over 3 lbs?",
  "Are my custom pours outperforming store bought on spinnerbaits?",
]

export default function AIChat({ fish, sessions, settings }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const { speak, pause, resume, stop, speaking, paused } = useSpeech()

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streaming])

  const send = async (query: string) => {
    if (!query.trim() || streaming) return
    if (!settings.anthropicApiKey) {
      setError('Add your Anthropic API key in Settings.')
      return
    }
    setError('')
    const userMsg: ChatMessage = { role: 'user', content: query }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setStreaming(true)

    const assistantMsg: ChatMessage = { role: 'assistant', content: '' }
    setMessages(prev => [...prev, assistantMsg])

    try {
      const gen = chatWithPatternData(
        settings.anthropicApiKey,
        [...messages, userMsg],
        fish,
        sessions
      )
      let full = ''
      for await (const chunk of gen) {
        full += chunk
        setMessages(prev => {
          const updated = [...prev]
          updated[updated.length - 1] = { role: 'assistant', content: full }
          return updated
        })
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(`Error: ${msg}`)
      setMessages(prev => prev.slice(0, -1))
    }
    setStreaming(false)
  }

  return (
    <div className="flex flex-col pb-6" style={{ minHeight: '60vh' }}>
      {!settings.anthropicApiKey && (
        <div className="bg-amber-900/20 border border-amber-700 rounded-xl p-3 mb-4">
          <p className="text-amber-300 text-sm">Add your Anthropic API key in Settings to use AI Chat.</p>
        </div>
      )}

      {messages.length === 0 && (
        <div className="mb-4 space-y-2">
          <p className="text-slate-400 text-xs uppercase tracking-wide font-medium mb-2">Example questions</p>
          {EXAMPLE_QUESTIONS.map(q => (
            <button
              key={q}
              onClick={() => send(q)}
              className="w-full text-left px-3 py-3 bg-slate-800 rounded-xl text-slate-300 text-sm border border-slate-700 active:bg-slate-700"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 space-y-3 mb-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${
              msg.role === 'user'
                ? 'bg-emerald-700 text-white rounded-br-sm'
                : 'bg-slate-800 text-slate-200 border border-slate-700 rounded-bl-sm'
            }`}>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
              {msg.role === 'assistant' && msg.content && !streaming && (
                <div className="mt-2">
                  <SpeakButton text={msg.content} speak={speak} pause={pause} resume={resume} stop={stop} speaking={speaking} paused={paused} />
                </div>
              )}
              {msg.role === 'assistant' && streaming && i === messages.length - 1 && (
                <span className="inline-block w-2 h-4 bg-emerald-400 ml-1 align-middle animate-pulse" />
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {error && <p className="text-red-400 text-sm mb-2">{error}</p>}

      <div className="flex gap-2 sticky bottom-0 bg-slate-950 pt-2 pb-2">
        <textarea
          className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-3 text-slate-100 text-sm resize-none min-h-[48px] max-h-[120px]"
          placeholder="Ask about your patterns… (use mic key to dictate)"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send(input)
            }
          }}
          disabled={streaming}
          rows={1}
        />
        <button
          onClick={() => send(input)}
          disabled={streaming || !input.trim()}
          className="px-4 py-3 bg-emerald-600 rounded-xl text-white font-semibold disabled:opacity-40 shrink-0"
        >
          {streaming ? '…' : '↑'}
        </button>
      </div>
    </div>
  )
}
