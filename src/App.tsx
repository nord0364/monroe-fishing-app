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

// Persist active session across app refreshes
const SESSION_STORAGE_KEY = 'active-session'

function loadPersistedSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function persistSession(session: Session | null) {
  if (session) {
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
  } else {
    sessionStorage.removeItem(SESSION_STORAGE_KEY)
  }
}

function getAutoTheme(): string {
  const h = new Date().getHours()
  if (h >= 5 && h < 9)  return 'dawn'
  if (h >= 9 && h < 18) return 'daylight'
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
    getSettings().then(s => {
      setSettings(s)
      applyTheme(s)
      setReady(true)
      if (!s.anthropicApiKey && !s.onboardingDone) {
        setTab('settings')
      }
    })
  }, [])

  // Load Google Identity Services on startup
  useEffect(() => {
    loadGoogleIdentityServices(GOOGLE_CLIENT_ID).catch(() => {})
  }, [])

  useEffect(() => {
    if (ready) applyTheme(settings)
  }, [settings, ready])

  // Debounced Drive sync — fires 2 s after last session change
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const triggerDriveSync = useCallback(() => {
    if (getDriveStatus() !== 'connected') return
    if (syncTimer.current) clearTimeout(syncTimer.current)
    syncTimer.current = setTimeout(async () => {
      try {
        const json = await exportAllDataFull()
        await syncToGoogleDrive(json)
      } catch {}
    }, 2000)
  }, [])

  const handleSessionStart = (session: Session) => {
    setActiveSession(session)
    persistSession(session)
    // Don't auto-navigate — user reads the briefing first, then taps Go to Logger
  }

  const handleSessionChanged = (session: Session | null) => {
    setActiveSession(session)
    persistSession(session)
    triggerDriveSync()
  }

  const handleSettingsUpdate = (s: AppSettings) => {
    setSettings(s)
    if (s.anthropicApiKey && !s.onboardingDone) {
      const updated = { ...s, onboardingDone: true }
      saveSettings(updated)
      setSettings(updated)
    }
  }

  if (!ready) {
    return (
      <div className="flex items-center justify-center min-h-screen th-base">
        <div className="text-center">
          <div className="text-5xl mb-4">🎣</div>
          <p className="th-text-muted">Loading…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="th-base min-h-screen th-text">
      <OfflineBanner />

      {activeSession && tab !== 'logger' && (
        <button
          onClick={() => setTab('logger')}
          className="fixed top-0 inset-x-0 z-40 py-3 px-4 th-banner text-sm text-center font-semibold tracking-wide"
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

function OfflineBanner() {
  const [online, setOnline] = useState(navigator.onLine)
  const [updateReady, setUpdateReady] = useState(false)

  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)

    // Detect when a new service worker takes control — prompt to reload
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('controllerchange', () => setUpdateReady(true))
    }

    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  if (updateReady) {
    return (
      <div className="fixed top-0 inset-x-0 z-50 py-1.5 px-4 bg-emerald-700 text-emerald-100 text-xs text-center font-medium">
        ✨ App updated — <button className="underline font-bold" onClick={() => window.location.reload()}>tap to reload</button>
      </div>
    )
  }

  if (!online) {
    return (
      <div className="fixed top-0 inset-x-0 z-50 py-1.5 px-4 bg-amber-700 text-amber-100 text-xs text-center font-medium">
        📡 Offline — Logging and GPS work normally. AI and weather require connection.
      </div>
    )
  }

  return null
}
