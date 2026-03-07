import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import type { EnvironmentalConditions, Session, LaunchSite, AppSettings } from '../../types'
import { fetchWeather, fetchForecastWeather } from '../../api/weather'
import { fetchMoonData } from '../../api/moon'
import { fetchWaterData } from '../../api/water'
import { generatePreSessionBriefing, askPreSessionQuestion } from '../../api/claude'
import { saveSession, getLandedFish, getAllOwnedLures, getAllRodSetups } from '../../db/database'
import { LAUNCH_SITES } from '../../constants'
import QuickSelect from '../layout/QuickSelect'
import { nanoid } from '../logger/nanoid'
import BriefingView from './BriefingView'
import InSessionGuide from './InSessionGuide'
import type { AIBriefing } from '../../types'

const BRIEFING_STORAGE_KEY = (sessionId: string) => `briefing-${sessionId}`

function saveBriefingToStorage(sessionId: string, data: { briefing: AIBriefing; conditions: EnvironmentalConditions; launchSite: string; date: number }) {
  try { sessionStorage.setItem(BRIEFING_STORAGE_KEY(sessionId), JSON.stringify(data)) } catch {}
}

function loadBriefingFromStorage(sessionId: string) {
  try {
    const raw = sessionStorage.getItem(BRIEFING_STORAGE_KEY(sessionId))
    return raw ? JSON.parse(raw) as { briefing: AIBriefing; conditions: EnvironmentalConditions; launchSite: string; date: number } : null
  } catch { return null }
}

interface Props {
  settings: AppSettings
  activeSession: Session | null
  onSessionStart: (session: Session) => void
  onGoToLogger: () => void
}

type Step = 'idle' | 'loading' | 'review' | 'generating' | 'ready'
type DateMode = 'today' | 'tomorrow' | 'custom'

const DOTS = ['', '.', '..', '...']

// Hours available for time window picker (4 AM – 8 PM)
const HOURS = Array.from({ length: 17 }, (_, i) => i + 4)

function fmtHour(h: number) {
  if (h === 0)   return '12 AM'
  if (h < 12)    return `${h} AM`
  if (h === 12)  return '12 PM'
  return `${h - 12} PM`
}

function toDateStr(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export default function PreSessionBriefing({ settings, activeSession, onSessionStart, onGoToLogger }: Props) {
  const [step, setStep]             = useState<Step>('idle')
  const [conditions, setConditions] = useState<EnvironmentalConditions>({})
  const [launchSite, setLaunchSite] = useState<LaunchSite | string>('')
  const [customSite, setCustomSite] = useState('')
  const [waterClarity, setWaterClarity]             = useState<'Clear' | 'Stained' | 'Muddy' | null>(null)
  const [baroTrend, setBaroTrend]                   = useState<'Rising' | 'Falling' | 'Steady' | null>(null)
  const [waterLevelVsNormal, setWaterLevelVsNormal] = useState<'High' | 'Normal' | 'Low' | null>(null)
  const [baroTrendAuto, setBaroTrendAuto]           = useState(false)
  const [waterLevelAuto, setWaterLevelAuto]         = useState(false)
  const [briefingData, setBriefingData]             = useState<AIBriefing | null>(null)
  const [briefingSession, setBriefingSession]       = useState<Session | null>(null)
  const [loadError, setLoadError]                   = useState('')
  const [apiError, setApiError]                     = useState('')
  const [dotIdx, setDotIdx]                         = useState(0)

  // Quick question (on review step)
  const [qaInput, setQaInput]       = useState('')
  const [qaAnswer, setQaAnswer]     = useState('')
  const [qaStreaming, setQaStreaming] = useState(false)
  const qaEndRef = useRef<HTMLDivElement>(null)

  // ── Session planning: date & time window ────────────────────────────────────
  const [dateMode, setDateMode]       = useState<DateMode>('today')
  const [customDateStr, setCustomDateStr] = useState('')   // YYYY-MM-DD
  const [startHour, setStartHour]     = useState(6)        // 6 AM default
  const [endHour, setEndHour]         = useState(11)       // 11 AM default

  const targetDate: Date = useMemo(() => {
    if (dateMode === 'today') return new Date()
    if (dateMode === 'tomorrow') {
      const d = new Date(); d.setDate(d.getDate() + 1); return d
    }
    // custom — parse the date string as local time
    if (customDateStr) {
      const [y, m, day] = customDateStr.split('-').map(Number)
      return new Date(y, m - 1, day)
    }
    return new Date()
  }, [dateMode, customDateStr])

  const isFuture   = dateMode !== 'today'
  const isSameDate = !isFuture

  const targetDateLabel = targetDate.toLocaleDateString([], {
    weekday: 'long', month: 'long', day: 'numeric',
  })

  // Tomorrow's date string for the custom picker default
  const tomorrowStr = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() + 1); return toDateStr(d)
  }, [])

  // Restore briefing when navigating back to this tab
  useEffect(() => {
    if (activeSession) {
      const saved = loadBriefingFromStorage(activeSession.id)
      if (saved) {
        setBriefingData(saved.briefing)
        setConditions(saved.conditions)
        setLaunchSite(saved.launchSite)
        setBriefingSession(activeSession)
        setStep('ready')
      }
    }
  }, [activeSession?.id])

  // Animated dots during generation
  useEffect(() => {
    if (step !== 'generating') return
    const t = setInterval(() => setDotIdx(i => (i + 1) % 4), 500)
    return () => clearInterval(t)
  }, [step])

  const askQuestion = async () => {
    const q = qaInput.trim()
    if (!q || qaStreaming || !settings.anthropicApiKey) return
    const site = launchSite === 'Other' ? customSite : String(launchSite)
    setQaInput('')
    setQaAnswer('')
    setQaStreaming(true)
    const mergedConds: EnvironmentalConditions = {
      ...conditions,
      waterClarity: waterClarity ?? undefined,
      baroTrend: baroTrend ?? undefined,
      waterLevelVsNormal: waterLevelVsNormal ?? undefined,
    }
    try {
      const gen = askPreSessionQuestion(settings.anthropicApiKey, q, mergedConds, site || 'Lake Monroe')
      for await (const chunk of gen) {
        setQaAnswer(a => a + chunk)
        qaEndRef.current?.scrollIntoView({ behavior: 'smooth' })
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setQaAnswer(`Error: ${msg}`)
    } finally {
      setQaStreaming(false)
    }
  }

  const loadConditions = useCallback(async () => {
    setStep('loading')
    setLoadError('')
    try {
      const weatherFetch = isFuture
        ? fetchForecastWeather(targetDate, startHour, endHour)
        : fetchWeather()

      const [weather, moon, water] = await Promise.all([
        weatherFetch,
        fetchMoonData(isFuture ? targetDate : undefined),
        fetchWaterData(),
      ])
      const merged = { ...weather, ...moon, ...water }
      setConditions(merged)
      if (merged.baroTrend)          { setBaroTrend(merged.baroTrend); setBaroTrendAuto(true) }
      if (merged.waterLevelVsNormal) { setWaterLevelVsNormal(merged.waterLevelVsNormal); setWaterLevelAuto(true) }
      setStep('review')
    } catch (e) {
      setLoadError(
        isFuture
          ? 'Forecast load failed — you can still set conditions manually below.'
          : 'Some data failed to load — you can still override below.'
      )
      setStep('review')
    }
  }, [isFuture, targetDate, startHour, endHour])

  const startSession = async () => {
    if (!settings.anthropicApiKey) { setApiError('Please add your Anthropic API key in Settings first.'); return }
    const site = launchSite === 'Other' ? customSite : launchSite
    if (!site)         { setApiError('Please select a launch site.'); return }
    if (!waterClarity) { setApiError('Please select water clarity.'); return }

    const finalConditions: EnvironmentalConditions = {
      ...conditions,
      waterClarity: waterClarity ?? undefined,
      baroTrend: baroTrend ?? undefined,
      waterLevelVsNormal: waterLevelVsNormal ?? undefined,
    }

    setStep('generating')
    setApiError('')

    // plannedWindow is stored on the session if planning ahead
    const windowStr = isFuture ? `${fmtHour(startHour)} – ${fmtHour(endHour)}` : undefined

    // Build context string for the AI prompt
    const sessionContextStr = isFuture
      ? `PLANNING AHEAD — Session planned for ${targetDateLabel}, ${fmtHour(startHour)} – ${fmtHour(endHour)}.\n` +
        `This briefing is being generated in advance on ${new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}.\n` +
        `All weather conditions below are FORECASTED for the planned session window. Water temperature is current (forecast unavailable).\n` +
        `Frame all guidance for the planned session time — use future tense ("conditions will favor...", "expect...").`
      : new Date().toLocaleString()

    const session: Session = {
      id: nanoid(),
      date: targetDate.setHours(startHour, 0, 0, 0),
      launchSite: site,
      startTime: Date.now(),
      conditions: finalConditions,
      ...(isFuture && { plannedDate: targetDate.getTime(), plannedWindow: windowStr }),
    }

    try {
      const [history, ownedLures, rodSetups] = await Promise.all([
        getLandedFish(),
        getAllOwnedLures(),
        getAllRodSetups(),
      ])
      const briefing = await generatePreSessionBriefing(
        settings.anthropicApiKey,
        finalConditions,
        site,
        history,
        ownedLures,
        rodSetups,
        undefined,
        sessionContextStr,
      )

      session.aiBriefing = briefing.narrative
      session.aiBriefingStructured = briefing

      await saveSession(session)
      onSessionStart(session)

      setBriefingData(briefing)
      setBriefingSession(session)
      saveBriefingToStorage(session.id, { briefing, conditions: finalConditions, launchSite: site, date: session.date })
      setStep('ready')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setApiError(`AI error: ${msg}`)
      setStep('review')
    }
  }

  const resetBriefing = () => {
    setBriefingData(null)
    setBriefingSession(null)
    setConditions({})
    setLaunchSite('')
    setWaterClarity(null)
    setBaroTrend(null)
    setWaterLevelVsNormal(null)
    setBaroTrendAuto(false)
    setWaterLevelAuto(false)
    setLoadError('')
    setApiError('')
    setStep('idle')
  }

  // ── Ready ───────────────────────────────────────────────────────────────────
  if (step === 'ready' && briefingData) {
    const session = briefingSession ?? activeSession
    if (session) {
      return (
        <InSessionGuide
          session={session}
          briefing={briefingData}
          apiKey={settings.anthropicApiKey}
          onGoToLogger={onGoToLogger}
          onNewBriefing={resetBriefing}
        />
      )
    }
    return (
      <div className="p-4 pb-24 max-w-lg mx-auto">
        <BriefingView
          briefing={briefingData}
          conditions={conditions}
          launchSite={String(launchSite)}
          onGoToLogger={onGoToLogger}
        />
        <button
          onClick={resetBriefing}
          className="w-full mt-3 py-3 th-surface border th-border rounded-xl th-text-muted text-sm"
        >
          🔭 Plan Another Trip
        </button>
      </div>
    )
  }

  // ── Generating ──────────────────────────────────────────────────────────────
  if (step === 'generating') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
        <div className="text-5xl mb-6 animate-bounce">🤖</div>
        <p className="th-text font-semibold text-base mb-1">
          {isFuture ? `Building your forecast briefing${DOTS[dotIdx]}` : `Analyzing conditions${DOTS[dotIdx]}`}
        </p>
        <p className="th-text-muted text-sm">
          {isFuture
            ? `Reviewing forecasted conditions for ${targetDateLabel} and your catch history.`
            : 'Reviewing your catch history and today\'s data to build your briefing.'}
        </p>
      </div>
    )
  }

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (step === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
        <div className="text-4xl mb-4 animate-pulse">{isFuture ? '🔭' : '🌤️'}</div>
        <p className="th-text-muted">
          {isFuture
            ? `Fetching forecast for ${targetDateLabel}, ${fmtHour(startHour)}–${fmtHour(endHour)}…`
            : 'Fetching weather, moon, and water data…'}
        </p>
      </div>
    )
  }

  // ── Review form ─────────────────────────────────────────────────────────────
  if (step === 'review') {
    return (
      <div className="p-4 pb-24 max-w-lg mx-auto">
        <h1 className="text-xl font-bold th-text mb-0.5">Pre-Session Briefing</h1>
        <p className="th-text-muted text-sm mb-4">Lake Monroe · Bloomington, IN</p>

        {/* Forecast badge */}
        {isFuture && (
          <div className="flex items-center gap-2 px-3 py-2 mb-4 rounded-xl border border-amber-600/40 bg-amber-900/20">
            <span className="text-amber-400 text-sm">🔭</span>
            <div>
              <span className="text-amber-300 text-xs font-semibold">
                Forecast for {targetDateLabel}
              </span>
              <span className="text-amber-400/70 text-xs ml-2">
                {fmtHour(startHour)} – {fmtHour(endHour)}
              </span>
            </div>
            <span className="text-amber-500/60 text-xs ml-auto">Water temp is current</span>
          </div>
        )}

        <div className="space-y-5">
          {/* Conditions summary */}
          <div className="th-surface rounded-xl p-4 space-y-3">
            <h2 className="font-semibold th-text text-sm uppercase tracking-wide">
              {isFuture ? 'Forecasted Conditions' : 'Current Conditions'}
            </h2>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <CondRow label="Sunrise"  value={conditions.sunrise} />
              <CondRow label="Sunset"   value={conditions.sunset} />
              <CondRow label="Moon"     value={conditions.moonPhase} />
              <CondRow label="Illum."   value={conditions.moonIlluminationPct != null ? `${conditions.moonIlluminationPct}%` : undefined} />
              <CondRow label="Air Temp" value={conditions.airTempF != null ? `${conditions.airTempF}°F` : undefined} />
              <CondRow label="Wind"     value={conditions.windSpeedMph != null ? `${conditions.windSpeedMph}mph ${conditions.windDirection ?? ''}` : undefined} />
              <CondRow label="Sky"      value={conditions.skyCondition} />
              <CondRow label="Baro"     value={conditions.baroPressureInHg != null ? `${conditions.baroPressureInHg} inHg` : undefined} />
              <CondRow label="Water °F" value={conditions.waterTempF != null ? `${conditions.waterTempF}°F` : undefined} />
              <CondRow label="Level"    value={conditions.waterLevelFt != null ? `${conditions.waterLevelFt} ft` : undefined} />
            </div>
          </div>

          {/* Temp overrides */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="section-label">Air Temp (°F)</label>
              <input type="number"
                className="w-full th-surface border th-border rounded-xl px-3 py-3 th-text text-base"
                value={conditions.airTempF ?? ''}
                onChange={e => setConditions(c => ({ ...c, airTempF: parseFloat(e.target.value) || undefined }))}
                placeholder="Override"
              />
            </div>
            <div>
              <label className="section-label">Water Temp (°F)</label>
              <input type="number"
                className="w-full th-surface border th-border rounded-xl px-3 py-3 th-text text-base"
                value={conditions.waterTempF ?? ''}
                onChange={e => setConditions(c => ({ ...c, waterTempF: parseFloat(e.target.value) || undefined }))}
                placeholder="Override"
              />
            </div>
          </div>

          <QuickSelect label="Launch Site" options={LAUNCH_SITES as LaunchSite[]} value={launchSite as LaunchSite} onChange={setLaunchSite} />
          {launchSite === 'Other' && (
            <input className="w-full th-surface border th-border rounded-xl px-3 py-3 th-text"
              placeholder="Enter launch site name" value={customSite} onChange={e => setCustomSite(e.target.value)} />
          )}

          <QuickSelect label="Water Clarity" options={['Clear', 'Stained', 'Muddy'] as const}
            value={waterClarity} onChange={setWaterClarity} columns={3} />

          <QuickSelect label="Barometric Trend" options={['Rising', 'Falling', 'Steady'] as const}
            value={baroTrend} onChange={v => { setBaroTrend(v); setBaroTrendAuto(false) }} columns={3}
            autoDetected={baroTrendAuto && baroTrend != null} />

          <QuickSelect label="Water Level vs Normal" options={['High', 'Normal', 'Low'] as const}
            value={waterLevelVsNormal} onChange={v => { setWaterLevelVsNormal(v); setWaterLevelAuto(false) }} columns={3}
            autoDetected={waterLevelAuto && waterLevelVsNormal != null} />

          {loadError && <p className="text-amber-400 text-sm bg-amber-900/20 rounded-xl p-3">{loadError}</p>}
          {apiError  && <p className="text-red-400 text-sm bg-red-900/20 rounded-xl p-3">{apiError}</p>}

          {/* Quick question */}
          {settings.anthropicApiKey && (
            <div className="th-surface rounded-xl border th-border p-3 space-y-2">
              <div className="text-xs font-bold th-text-muted uppercase tracking-wide">
                Quick Question
              </div>
              <div className="flex gap-2">
                <input
                  className="flex-1 th-surface-deep border th-border rounded-xl px-3 py-2.5 th-text text-sm placeholder:th-text-muted"
                  placeholder="Ask about these conditions before your briefing…"
                  value={qaInput}
                  onChange={e => setQaInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); askQuestion() } }}
                  disabled={qaStreaming}
                />
                <button
                  onClick={askQuestion}
                  disabled={!qaInput.trim() || qaStreaming}
                  className="px-4 py-2.5 th-btn-primary rounded-xl font-medium text-sm disabled:opacity-40"
                >
                  {qaStreaming ? '…' : 'Ask'}
                </button>
              </div>
              {(qaAnswer || qaStreaming) && (
                <div className="th-surface-deep rounded-xl px-3 py-2.5 text-sm th-text leading-relaxed">
                  {qaAnswer || <span className="th-text-muted animate-pulse">Thinking…</span>}
                  <div ref={qaEndRef} />
                </div>
              )}
            </div>
          )}

          <button onClick={startSession} disabled={!settings.anthropicApiKey}
            className="w-full py-4 th-btn-primary rounded-2xl font-bold text-lg disabled:opacity-40 shadow-lg">
            Generate AI Briefing & Start Session
          </button>
        </div>
      </div>
    )
  }

  // ── Idle ─────────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 pb-24 max-w-lg mx-auto">
      <h1 className="text-xl font-bold th-text mb-0.5">Pre-Session Briefing</h1>
      <p className="th-text-muted text-sm mb-5">Lake Monroe · Bloomington, IN</p>

      {/* ── Session planning card ──────────────────────────────────────────── */}
      <div className="th-surface rounded-2xl border th-border p-4 mb-4 space-y-4">
        <h2 className="th-text font-semibold text-sm">When are you fishing?</h2>

        {/* Date selector */}
        <div>
          <span className="section-label">Session date</span>
          <div className="flex gap-2">
            {(['today', 'tomorrow', 'custom'] as DateMode[]).map(m => (
              <button key={m} onClick={() => {
                setDateMode(m)
                if (m === 'custom' && !customDateStr) setCustomDateStr(tomorrowStr)
              }}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold capitalize border transition-colors min-h-[42px] ${
                  dateMode === m ? 'th-btn-primary border-transparent' : 'th-surface-deep th-text-muted th-border'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          {dateMode === 'custom' && (
            <input
              type="date"
              className="w-full mt-2 th-surface-deep border th-border rounded-xl px-3 py-2.5 th-text text-sm"
              value={customDateStr}
              min={tomorrowStr}
              onChange={e => setCustomDateStr(e.target.value)}
            />
          )}
        </div>

        {/* Time window — always shown */}
        <div>
          <span className="section-label">Planned fishing window</span>
          <div className="flex items-center gap-2">
            <select
              className="flex-1 th-surface-deep border th-border rounded-xl px-3 py-2.5 th-text text-sm"
              value={startHour}
              onChange={e => {
                const v = parseInt(e.target.value)
                setStartHour(v)
                if (v >= endHour) setEndHour(Math.min(v + 3, 20))
              }}
            >
              {HOURS.filter(h => h < 20).map(h => (
                <option key={h} value={h}>{fmtHour(h)}</option>
              ))}
            </select>
            <span className="th-text-muted text-sm shrink-0">to</span>
            <select
              className="flex-1 th-surface-deep border th-border rounded-xl px-3 py-2.5 th-text text-sm"
              value={endHour}
              onChange={e => setEndHour(parseInt(e.target.value))}
            >
              {HOURS.filter(h => h > startHour).map(h => (
                <option key={h} value={h}>{fmtHour(h)}</option>
              ))}
            </select>
          </div>
          <p className="th-text-muted text-xs mt-1.5">
            {isFuture
              ? `Forecast will be averaged across ${fmtHour(startHour)} – ${fmtHour(endHour)} on ${targetDateLabel}.`
              : `Current conditions will be loaded. Time window used for AI context.`}
          </p>
        </div>
      </div>

      <button
        onClick={loadConditions}
        className="w-full py-4 th-btn-primary rounded-2xl font-bold text-lg shadow-lg active:scale-[0.98] transition-transform"
      >
        {isSameDate ? '🌤 Load Today\'s Conditions' : `🔭 Load Forecast · ${targetDateLabel}`}
      </button>
    </div>
  )
}

function CondRow({ label, value }: { label: string; value?: string | number }) {
  return (
    <>
      <span className="th-text-muted text-xs">{label}</span>
      <span className="th-text text-xs font-medium">{value ?? '—'}</span>
    </>
  )
}
