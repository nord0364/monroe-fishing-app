import { useState, useEffect, useRef, useCallback } from 'react'
import type { Session, AppSettings, SunriseSunsetCache } from './types'
import { getSettings, saveSettings, exportAllDataFull } from './db/database'
import { loadGoogleIdentityServices, syncToGoogleDrive, getDriveStatus } from './api/googleDrive'
import { fetchMoonData } from './api/moon'
import BottomNav from './components/layout/BottomNav'
import type { NavTab } from './components/layout/BottomNav'
import PreSessionBriefing from './components/briefing/PreSessionBriefing'
import SessionLogger from './components/logger/SessionLogger'
import TrophyRoom from './components/patterns/TrophyRoom'
import Debrief from './components/debrief/Debrief'
import Tackle from './components/tackle/Tackle'
import Settings from './components/settings/Settings'

const GOOGLE_CLIENT_ID = '739245351229-s64vg3piu45jrhg98ovqi7ik51k5rfpm.apps.googleusercontent.com'
const SESSION_STORAGE_KEY = 'active-session'

function loadPersistedSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function persistSession(session: Session | null) {
  if (session) sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
  else sessionStorage.removeItem(SESSION_STORAGE_KEY)
}

// ── Adaptive theme phase detection ─────────────────────────────────────────────
function parseTimeToMinutes(timeStr: string): number {
  const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i)
  if (!match) return 0
  let h = parseInt(match[1])
  const m = parseInt(match[2])
  const period = match[3].toUpperCase()
  if (period === 'PM' && h !== 12) h += 12
  if (period === 'AM' && h === 12) h = 0
  return h * 60 + m
}

function getAdaptivePhase(cache?: SunriseSunsetCache): string {
  // Fallback: typical southern Indiana mid-season times
  const sunriseMin = cache?.sunrise ? parseTimeToMinutes(cache.sunrise) : 375  // 6:15 AM
  const sunsetMin  = cache?.sunset  ? parseTimeToMinutes(cache.sunset)  : 1220  // 8:20 PM
  const now = new Date()
  const cur = now.getHours() * 60 + now.getMinutes()
  if (cur < sunriseMin)          return 'adaptive-predawn'
  if (cur < sunriseMin + 60)     return 'adaptive-golden'   // Dawn golden hour
  if (cur < sunsetMin - 60)      return 'adaptive-daytime'
  if (cur < sunsetMin + 60)      return 'adaptive-golden'   // Dusk golden hour
  return 'adaptive-night'
}

const FONT_SIZES: Record<string, string> = { small: '17px', normal: '20px', large: '24px' }

function applyTheme(settings: AppSettings) {
  const theme = settings.colorTheme ?? 'adaptive'
  let dataTheme: string

  if (theme === 'adaptive') {
    dataTheme = getAdaptivePhase(settings.sunriseSunsetCache)
  } else if (theme === 'auto') {
    // Let CSS media query handle it, but also set explicitly for non-media contexts
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    dataTheme = prefersDark ? 'dark' : 'light'
  } else {
    dataTheme = theme  // 'dark' | 'light'
  }

  document.documentElement.setAttribute('data-theme', dataTheme)
  document.documentElement.style.fontSize = FONT_SIZES[settings.fontSize ?? 'normal']
}

export default function App() {
  const [tab, setTab]         = useState<NavTab | null>(null)  // null = home screen
  const [showSettings, setShowSettings] = useState(false)
  const [settings, setSettings] = useState<AppSettings>({
    anthropicApiKey: '',
    sizeThresholdLbs: 3,
    customLureTypes: [],
    onboardingDone: false,
    colorTheme: 'adaptive',
  })
  const [activeSession, setActiveSession] = useState<Session | null>(loadPersistedSession)
  const [ready, setReady] = useState(false)
  // For Debrief — carry ended session into Debrief tab
  const [pendingDebriefSession, setPendingDebriefSession] = useState<Session | null>(null)

  useEffect(() => {
    getSettings().then(s => { setSettings(s); applyTheme(s); setReady(true) })
  }, [])

  useEffect(() => {
    loadGoogleIdentityServices(GOOGLE_CLIENT_ID).catch(() => {})
  }, [])

  // Apply theme whenever settings change
  useEffect(() => {
    if (ready) applyTheme(settings)
  }, [settings, ready])

  // For adaptive theme: re-evaluate phase every minute
  useEffect(() => {
    if ((settings.colorTheme ?? 'adaptive') !== 'adaptive') return
    const tick = () => applyTheme(settings)
    const id = setInterval(tick, 60_000)
    return () => clearInterval(id)
  }, [settings])

  // Fetch and cache sunrise/sunset daily — always, regardless of current theme
  // so the cache is warm if the user switches to Adaptive.
  useEffect(() => {
    if (!ready) return
    const today = new Date().toISOString().slice(0, 10)
    if (settings.sunriseSunsetCache?.date === today) return  // Already fresh for today
    fetchMoonData().then(data => {
      if (data.sunrise && data.sunset) {
        const cache: SunriseSunsetCache = {
          sunrise: data.sunrise,
          sunset: data.sunset,
          date: today,
          fetchedAt: Date.now(),
        }
        const updated = { ...settings, sunriseSunsetCache: cache }
        saveSettings(updated)
        setSettings(updated)
      }
    }).catch(() => {})
  }, [ready])

  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const triggerDriveSync = useCallback(() => {
    if (getDriveStatus() !== 'connected') return
    if (syncTimer.current) clearTimeout(syncTimer.current)
    syncTimer.current = setTimeout(async () => {
      try { const json = await exportAllDataFull(); await syncToGoogleDrive(json) } catch {}
    }, 2000)
  }, [])

  const handleSessionStart = (session: Session) => {
    setActiveSession(session); persistSession(session)
  }
  const handleSessionChanged = (session: Session | null) => {
    setActiveSession(session); persistSession(session); triggerDriveSync()
  }
  const handleSettingsUpdate = (s: AppSettings) => {
    setSettings(s)
  }

  // When session ends, prompt debrief
  const handleSessionEnd = (session: Session) => {
    setPendingDebriefSession(session)
    setActiveSession(null)
    persistSession(null)
    triggerDriveSync()
  }

  // Splash while loading
  if (!ready) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen th-base gap-4">
        <div className="text-7xl animate-pulse">🎣</div>
        <div className="text-center">
          <p className="th-text font-bold text-xl tracking-wide">Lake Monroe Guide</p>
          <p className="th-text-muted text-sm mt-1">Loading…</p>
        </div>
      </div>
    )
  }

  // Settings overlay
  if (showSettings) {
    return (
      <div className="th-base min-h-screen th-text">
        <div className="flex items-center gap-3 px-4 py-3 th-surface-deep border-b th-border">
          <button onClick={() => setShowSettings(false)} className="th-accent-text font-semibold text-sm py-2 pr-3 min-h-[44px]">
            ← Back
          </button>
          <span className="th-text font-bold">Settings</span>
        </div>
        <Settings settings={settings} onUpdate={handleSettingsUpdate} />
      </div>
    )
  }

  // Home screen — shown when no tab is selected
  if (tab === null) {
    return (
      <div className="th-base min-h-screen th-text relative">
        <OfflineBanner />
        {/* First-launch API key prompt */}
        {!settings.onboardingDone && !settings.anthropicApiKey && (
          <ApiKeyOverlay onSave={async (key) => {
            const updated = { ...settings, anthropicApiKey: key, onboardingDone: true }
            await saveSettings(updated); handleSettingsUpdate(updated)
          }} />
        )}
        <HomeScreen
          activeSession={activeSession}
          settings={settings}
          onNavigate={(t) => {
            setTab(t)
            if (!settings.onboardingDone) {
              const updated = { ...settings, onboardingDone: true }
              saveSettings(updated); setSettings(updated)
            }
          }}
          onSettings={() => setShowSettings(true)}
        />
      </div>
    )
  }

  return (
    <div className="th-base min-h-screen th-text">
      <OfflineBanner />

      {/* Active session banner when away from Log */}
      {activeSession && tab !== 'log' && (
        <button
          onClick={() => setTab('log')}
          className="fixed top-0 inset-x-0 z-40 py-3 px-4 th-banner text-sm font-semibold tracking-wide"
        >
          🎣 {activeSession.launchSite} · Session active — tap to log
        </button>
      )}

      <main
        className={`overflow-y-auto ${activeSession && tab !== 'log' ? 'pt-8' : ''}`}
        style={{ minHeight: 'calc(100vh - 58px)', paddingBottom: '58px' }}
      >
        {tab === 'scout' && (
          <PreSessionBriefing
            settings={settings}
            activeSession={activeSession}
            onSessionStart={handleSessionStart}
            onGoToLogger={() => setTab('log')}
          />
        )}
        {tab === 'log' && (
          <SessionLogger
            settings={settings}
            activeSession={activeSession}
            onSessionChanged={handleSessionChanged}
            onSessionEnded={(session) => {
              handleSessionEnd(session)
              setTab('debrief')
            }}
          />
        )}
        {tab === 'debrief' && (
          <Debrief
            settings={settings}
            pendingSession={pendingDebriefSession}
            onPendingConsumed={() => setPendingDebriefSession(null)}
          />
        )}
        {tab === 'trophy' && <TrophyRoom settings={settings} />}
        {tab === 'tackle' && <Tackle settings={settings} onSettingsUpdate={handleSettingsUpdate} />}
      </main>

      <BottomNav active={tab} onChange={setTab} />
    </div>
  )
}

// ── Home screen ────────────────────────────────────────────────────────────────
const HOME_CARDS: {
  tab: NavTab
  icon: string
  label: string
  desc: string
}[] = [
  { tab: 'scout',   icon: '🌅', label: 'Scout',       desc: 'AI briefing, conditions & session launch' },
  { tab: 'log',     icon: '🎣', label: 'Log',          desc: 'Active session · catch entry · history' },
  { tab: 'debrief', icon: '💬', label: 'Debrief',      desc: 'Post-session AI coaching conversations' },
  { tab: 'trophy',  icon: '🏆', label: 'Trophy Room',  desc: 'Photos, personal bests & pattern analysis' },
  { tab: 'tackle',  icon: '🧰', label: 'Tackle',        desc: 'Lure, hook & spoon inventory' },
]

function HomeScreen({
  activeSession, onNavigate, onSettings,
}: {
  activeSession: Session | null
  settings?: AppSettings
  onNavigate: (tab: NavTab) => void
  onSettings: () => void
}) {
  return (
    <div className="flex flex-col min-h-screen max-w-sm mx-auto px-4 pb-10">
      {/* Header */}
      <div className="flex items-center justify-between pt-safe pt-12 pb-6">
        <div>
          <h1 className="th-text font-bold text-2xl tracking-tight leading-tight">Lake Monroe</h1>
          <p className="th-accent-text font-semibold text-xs tracking-widest uppercase">Bass Guide</p>
        </div>
        <button
          onClick={onSettings}
          className="w-11 h-11 flex items-center justify-center th-surface rounded-2xl border th-border th-text-muted text-xl"
          aria-label="Settings"
        >
          ⚙️
        </button>
      </div>

      {/* Active session alert */}
      {activeSession && (
        <button
          onClick={() => onNavigate('log')}
          className="mb-4 w-full py-3.5 px-4 rounded-2xl th-banner font-semibold text-sm text-left flex items-center gap-3"
        >
          <span className="text-xl shrink-0">🎣</span>
          <div className="flex-1 min-w-0">
            <div className="font-bold truncate">{activeSession.launchSite}</div>
            <div className="text-xs opacity-80 font-normal">Session in progress — tap to log</div>
          </div>
          <span className="shrink-0 text-lg">→</span>
        </button>
      )}

      {/* Destination cards */}
      <div className="flex flex-col gap-3 flex-1">
        {HOME_CARDS.map((card, i) => (
          <button
            key={card.tab}
            onClick={() => onNavigate(card.tab)}
            className="w-full flex items-center gap-4 px-5 py-4 th-surface rounded-3xl border th-border text-left transition-all active:scale-[0.98] th-card-glow"
            style={{ animationDelay: `${i * 40}ms` }}
          >
            <span
              className="text-3xl shrink-0 w-12 h-12 flex items-center justify-center rounded-2xl th-surface-deep"
            >
              {card.icon}
            </span>
            <div className="flex-1 min-w-0">
              <div className="th-text font-bold text-base leading-tight">{card.label}</div>
              <div className="th-text-muted text-xs mt-0.5 leading-relaxed">{card.desc}</div>
            </div>
            <span className="th-text-muted text-base shrink-0">›</span>
          </button>
        ))}
      </div>

      {/* Footer */}
      <div className="pt-6 text-center">
        <p className="th-text-muted text-xs opacity-50">Bloomington, Indiana</p>
      </div>
    </div>
  )
}

// ── First-launch API key overlay ───────────────────────────────────────────────
function ApiKeyOverlay({ onSave }: { onSave: (key: string) => void }) {
  const [key, setKey] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!key.trim()) return
    setSaving(true)
    onSave(key.trim())
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-4 pb-8 sm:pb-0"
         style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
      <div className="w-full max-w-sm th-surface rounded-3xl border th-border p-6 space-y-4">
        <div className="text-center">
          <div className="text-4xl mb-3">🤖</div>
          <h2 className="th-text font-bold text-lg">Add Your API Key</h2>
          <p className="th-text-muted text-sm mt-1 leading-relaxed">
            Required for AI briefings, coaching, and pattern chat. Get yours at{' '}
            <span className="th-accent-text font-medium">console.anthropic.com</span>.
          </p>
          <p className="th-text-muted text-xs mt-2">Estimated cost: $2–5 for a full season.</p>
        </div>
        <input
          type="password"
          className="w-full th-surface-deep border th-border rounded-2xl px-4 py-3.5 th-text font-mono text-sm"
          placeholder="sk-ant-api03-..."
          value={key}
          onChange={e => setKey(e.target.value)}
          autoComplete="off" autoCorrect="off" spellCheck={false}
        />
        <div className="flex gap-3">
          <button
            onClick={handleSave}
            disabled={!key.trim() || saving}
            className="flex-1 py-3.5 th-btn-primary rounded-2xl font-bold text-sm disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save Key'}
          </button>
          <button
            onClick={() => onSave('')}
            className="px-4 py-3.5 th-surface-deep border th-border rounded-2xl th-text-muted text-sm"
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Offline / update banner ────────────────────────────────────────────────────
function OfflineBanner() {
  const [online, setOnline] = useState(navigator.onLine)
  const [updateReady, setUpdateReady] = useState(false)

  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('controllerchange', () => setUpdateReady(true))
    }
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  if (updateReady) return (
    <div className="fixed top-0 inset-x-0 z-50 py-1.5 px-4 bg-emerald-700 text-emerald-100 text-xs text-center font-medium">
      ✨ App updated — <button className="underline font-bold" onClick={() => window.location.reload()}>tap to reload</button>
    </div>
  )
  if (!online) return (
    <div className="fixed top-0 inset-x-0 z-50 py-1.5 px-4 bg-amber-700 text-amber-100 text-xs text-center font-medium">
      📡 Offline — Logging and GPS work normally. AI and weather require connection.
    </div>
  )
  return null
}
