import { useState, useEffect, useRef, useCallback } from 'react'
import type { Session, AppSettings } from './types'
import { getSettings, saveSettings, exportAllDataFull } from './db/database'
import { loadGoogleIdentityServices, syncToGoogleDrive, getDriveStatus } from './api/googleDrive'
import BottomNav from './components/layout/BottomNav'
import type { NavTab } from './components/layout/BottomNav'
import PreSessionBriefing from './components/briefing/PreSessionBriefing'
import SessionLogger from './components/logger/SessionLogger'
import PatternReview from './components/patterns/PatternReview'
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

function getAutoTheme(): string {
  const h = new Date().getHours()
  if (h >= 5 && h < 9)   return 'dawn'
  if (h >= 9 && h < 18)  return 'daylight'
  if (h >= 18 && h < 22) return 'dusk'
  return 'midnight'
}

const FONT_SIZES: Record<string, string> = { small: '17px', normal: '20px', large: '24px' }

function applyTheme(settings: AppSettings) {
  const theme = !settings.colorTheme || settings.colorTheme === 'auto'
    ? getAutoTheme()
    : settings.colorTheme
  document.documentElement.setAttribute('data-theme', theme)
  document.documentElement.style.fontSize = FONT_SIZES[settings.fontSize ?? 'normal']
}

export default function App() {
  const [tab, setTab] = useState<NavTab>('briefing')
  const [settings, setSettings] = useState<AppSettings>({
    anthropicApiKey: '',
    sizeThresholdLbs: 3,
    customLureTypes: [],
    onboardingDone: false,
    colorTheme: 'auto',
  })
  const [activeSession, setActiveSession] = useState<Session | null>(loadPersistedSession)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    getSettings().then(s => { setSettings(s); applyTheme(s); setReady(true) })
  }, [])

  useEffect(() => {
    loadGoogleIdentityServices(GOOGLE_CLIENT_ID).catch(() => {})
  }, [])

  useEffect(() => {
    if (ready) applyTheme(settings)
  }, [settings, ready])

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
    if (s.anthropicApiKey && !s.onboardingDone) {
      const updated = { ...s, onboardingDone: true }
      saveSettings(updated); setSettings(updated)
    }
  }

  // Splash screen while IndexedDB loads
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

  // Welcome screen on first launch before API key is set
  if (!settings.anthropicApiKey && !settings.onboardingDone) {
    return (
      <div className="th-base min-h-screen">
        <WelcomeScreen onGetStarted={() => {
          const updated = { ...settings, onboardingDone: true }
          saveSettings(updated); setSettings(updated); setTab('settings')
        }} />
      </div>
    )
  }

  return (
    <div className="th-base min-h-screen th-text">
      <OfflineBanner />

      {activeSession && tab !== 'logger' && (
        <button
          onClick={() => setTab('logger')}
          className="fixed top-0 inset-x-0 z-40 py-3 px-4 th-banner text-sm font-semibold tracking-wide"
        >
          🎣 {activeSession.launchSite} · Session active — tap to log
        </button>
      )}

      <main
        className={`overflow-y-auto ${activeSession && tab !== 'logger' ? 'pt-8' : ''}`}
        style={{ minHeight: 'calc(100vh - 60px)', paddingBottom: '60px' }}
      >
        {tab === 'briefing' && (
          <PreSessionBriefing
            settings={settings}
            activeSession={activeSession}
            onSessionStart={handleSessionStart}
            onGoToLogger={() => setTab('logger')}
          />
        )}
        {tab === 'logger' && (
          <SessionLogger
            settings={settings}
            activeSession={activeSession}
            onSessionChanged={handleSessionChanged}
          />
        )}
        {tab === 'patterns' && <PatternReview settings={settings} />}
        {tab === 'settings' && <Settings settings={settings} onUpdate={handleSettingsUpdate} />}
      </main>

      <BottomNav active={tab} onChange={setTab} />
    </div>
  )
}

// ── Welcome screen ─────────────────────────────────────────────────────────────
function WelcomeScreen({ onGetStarted }: { onGetStarted: () => void }) {
  const features = [
    { icon: '🤖', title: 'AI Briefings',   desc: 'Pre-session strategy powered by Claude' },
    { icon: '🎣', title: 'On-Water Guide', desc: 'Live coaching, voice tips, and lure swaps' },
    { icon: '📊', title: 'Pattern Review', desc: 'Charts and AI chat over your catch history' },
    { icon: '🗺',  title: 'GPS Logging',   desc: 'Map every catch with coordinates' },
  ]
  return (
    <div className="flex flex-col min-h-screen px-6 pb-12 max-w-sm mx-auto">
      <div className="flex-1 flex flex-col items-center justify-center text-center pt-16 pb-8">
        <div className="text-7xl mb-5">🎣</div>
        <h1 className="th-text font-bold text-3xl tracking-tight mb-1">Lake Monroe Guide</h1>
        <p className="th-accent-text font-semibold text-sm mb-4">Bloomington, Indiana</p>
        <p className="th-text-muted text-sm leading-relaxed max-w-xs">
          Your AI-powered bass fishing companion — from pre-dawn planning to post-session debrief.
        </p>
      </div>

      <div className="space-y-2.5 mb-8">
        {features.map(f => (
          <div key={f.title} className="flex items-center gap-4 th-surface rounded-2xl px-4 py-3.5 border th-border">
            <span className="text-2xl shrink-0">{f.icon}</span>
            <div className="text-left">
              <div className="th-text font-semibold text-sm">{f.title}</div>
              <div className="th-text-muted text-xs mt-0.5">{f.desc}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        <button
          onClick={onGetStarted}
          className="w-full py-4 th-btn-primary rounded-2xl font-bold text-base shadow-lg"
        >
          Get Started — Add API Key
        </button>
        <p className="th-text-muted text-xs text-center leading-relaxed">
          Requires a free Anthropic API key.{'\n'}No subscription. No per-session charges.
        </p>
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
