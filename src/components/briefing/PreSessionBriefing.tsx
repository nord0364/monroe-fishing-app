import { useState, useCallback, useEffect } from 'react'
import type { EnvironmentalConditions, Session, LaunchSite, AppSettings } from '../../types'
import { fetchWeather } from '../../api/weather'
import { fetchMoonData } from '../../api/moon'
import { fetchWaterData } from '../../api/water'
import { generatePreSessionBriefing } from '../../api/claude'
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

const DOTS = ['', '.', '..', '...']

export default function PreSessionBriefing({ settings, activeSession, onSessionStart, onGoToLogger }: Props) {
  const [step, setStep] = useState<Step>('idle')
  const [conditions, setConditions] = useState<EnvironmentalConditions>({})
  const [launchSite, setLaunchSite] = useState<LaunchSite | string>('')
  const [customSite, setCustomSite] = useState('')
  const [waterClarity, setWaterClarity] = useState<'Clear' | 'Stained' | 'Muddy' | null>(null)
  const [baroTrend, setBaroTrend] = useState<'Rising' | 'Falling' | 'Steady' | null>(null)
  const [waterLevelVsNormal, setWaterLevelVsNormal] = useState<'High' | 'Normal' | 'Low' | null>(null)
  const [baroTrendAuto, setBaroTrendAuto] = useState(false)
  const [waterLevelAuto, setWaterLevelAuto] = useState(false)
  const [briefingData, setBriefingData] = useState<AIBriefing | null>(null)
  const [briefingSession, setBriefingSession] = useState<Session | null>(null)
  const [loadError, setLoadError] = useState('')
  const [apiError, setApiError] = useState('')
  const [dotIdx, setDotIdx] = useState(0)

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

  const loadConditions = useCallback(async () => {
    setStep('loading')
    setLoadError('')
    try {
      const [weather, moon, water] = await Promise.all([fetchWeather(), fetchMoonData(), fetchWaterData()])
      const merged = { ...weather, ...moon, ...water }
      setConditions(merged)
      if (merged.baroTrend)          { setBaroTrend(merged.baroTrend); setBaroTrendAuto(true) }
      if (merged.waterLevelVsNormal) { setWaterLevelVsNormal(merged.waterLevelVsNormal); setWaterLevelAuto(true) }
      setStep('review')
    } catch {
      setLoadError('Some data failed to load — you can still override below.')
      setStep('review')
    }
  }, [])

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

    const session: Session = {
      id: nanoid(),
      date: Date.now(),
      launchSite: site,
      startTime: Date.now(),
      conditions: finalConditions,
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
      )

      session.aiBriefing = briefing.narrative
      session.aiBriefingStructured = briefing

      await saveSession(session)
      onSessionStart(session)  // saves to app state, no navigation

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

  // ── Ready: in-session guide (session active) OR one-time briefing view ──────
  if (step === 'ready' && briefingData) {
    const session = briefingSession ?? activeSession
    if (session) {
      // Active session — show the full in-session guide (briefing + AI chat)
      return (
        <InSessionGuide
          session={session}
          briefing={briefingData}
          apiKey={settings.anthropicApiKey}
          onGoToLogger={onGoToLogger}
        />
      )
    }
    // No session (shouldn't normally happen but handle gracefully)
    return (
      <div className="p-4 pb-24 max-w-lg mx-auto">
        <BriefingView
          briefing={briefingData}
          conditions={conditions}
          launchSite={String(launchSite)}
          onGoToLogger={onGoToLogger}
        />
        <button
          onClick={() => { setBriefingData(null); setBriefingSession(null); setStep('idle') }}
          className="w-full mt-3 py-3 th-surface border th-border rounded-xl th-text-muted text-sm"
        >
          Start a New Session
        </button>
      </div>
    )
  }

  // ── Generating: spinner ─────────────────────────────────────────────────────
  if (step === 'generating') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
        <div className="text-5xl mb-6 animate-bounce">🤖</div>
        <p className="th-text font-semibold text-base mb-1">Analyzing conditions{DOTS[dotIdx]}</p>
        <p className="th-text-muted text-sm">Reviewing your catch history and today's data to build your briefing.</p>
      </div>
    )
  }

  // ── Idle ────────────────────────────────────────────────────────────────────
  if (step === 'idle') {
    return (
      <div className="p-4 pb-24 max-w-lg mx-auto">
        <h1 className="text-xl font-bold th-text mb-1">Pre-Session Briefing</h1>
        <p className="th-text-muted text-sm mb-6">Lake Monroe · Bloomington, IN</p>
        <button
          onClick={loadConditions}
          className="w-full py-4 th-btn-primary rounded-xl font-semibold text-lg shadow-lg"
        >
          Load Today's Conditions
        </button>
      </div>
    )
  }

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (step === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
        <div className="text-4xl mb-4 animate-pulse">🌤️</div>
        <p className="th-text-muted">Fetching weather, moon, and water data…</p>
      </div>
    )
  }

  // ── Review form ─────────────────────────────────────────────────────────────
  return (
    <div className="p-4 pb-24 max-w-lg mx-auto">
      <h1 className="text-xl font-bold th-text mb-1">Pre-Session Briefing</h1>
      <p className="th-text-muted text-sm mb-4">Lake Monroe · Bloomington, IN</p>

      <div className="space-y-5">
        {/* Conditions summary */}
        <div className="th-surface rounded-xl p-4 space-y-3">
          <h2 className="font-semibold th-text text-sm uppercase tracking-wide">Current Conditions</h2>
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
            <label className="block text-xs th-text-muted mb-1 font-medium uppercase tracking-wide">Air Temp (°F)</label>
            <input
              type="number"
              className="w-full th-surface border th-border rounded-lg px-3 py-3 th-text text-base"
              value={conditions.airTempF ?? ''}
              onChange={e => setConditions(c => ({ ...c, airTempF: parseFloat(e.target.value) || undefined }))}
              placeholder="Override"
            />
          </div>
          <div>
            <label className="block text-xs th-text-muted mb-1 font-medium uppercase tracking-wide">Water Temp (°F)</label>
            <input
              type="number"
              className="w-full th-surface border th-border rounded-lg px-3 py-3 th-text text-base"
              value={conditions.waterTempF ?? ''}
              onChange={e => setConditions(c => ({ ...c, waterTempF: parseFloat(e.target.value) || undefined }))}
              placeholder="Override"
            />
          </div>
        </div>

        {/* Launch Site */}
        <QuickSelect
          label="Launch Site"
          options={LAUNCH_SITES as LaunchSite[]}
          value={launchSite as LaunchSite}
          onChange={setLaunchSite}
        />
        {launchSite === 'Other' && (
          <input
            className="w-full th-surface border th-border rounded-lg px-3 py-3 th-text"
            placeholder="Enter launch site name"
            value={customSite}
            onChange={e => setCustomSite(e.target.value)}
          />
        )}

        {/* Water Clarity */}
        <QuickSelect
          label="Water Clarity"
          options={['Clear', 'Stained', 'Muddy'] as const}
          value={waterClarity}
          onChange={setWaterClarity}
          columns={3}
        />

        {/* Baro Trend — auto-detected */}
        <QuickSelect
          label="Barometric Trend"
          options={['Rising', 'Falling', 'Steady'] as const}
          value={baroTrend}
          onChange={v => { setBaroTrend(v); setBaroTrendAuto(false) }}
          columns={3}
          autoDetected={baroTrendAuto && baroTrend != null}
        />

        {/* Water Level — auto-detected */}
        <QuickSelect
          label="Water Level vs Normal"
          options={['High', 'Normal', 'Low'] as const}
          value={waterLevelVsNormal}
          onChange={v => { setWaterLevelVsNormal(v); setWaterLevelAuto(false) }}
          columns={3}
          autoDetected={waterLevelAuto && waterLevelVsNormal != null}
        />

        {loadError && <p className="text-amber-400 text-sm bg-amber-900/20 rounded-lg p-3">{loadError}</p>}
        {apiError  && <p className="text-red-400 text-sm bg-red-900/20 rounded-lg p-3">{apiError}</p>}

        <button
          onClick={startSession}
          disabled={!settings.anthropicApiKey}
          className="w-full py-4 th-btn-primary rounded-xl font-semibold text-lg disabled:opacity-40 shadow-lg"
        >
          Generate AI Briefing & Start Session
        </button>
      </div>
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
