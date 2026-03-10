import { useState, useEffect } from 'react'
import type { AppSettings, ColorTheme } from '../../types'
import { hasSpeech } from '../../utils/speech'
import { FONT_SIZE_STEPS, DEFAULT_FONT_STEP } from '../../constants'
import { saveSettings, exportAllDataJSON, exportCatchesCSV, exportTackleJSON, getEntryCount, replaceAllData, getLandedFish, getAllSessions } from '../../db/database'
import { loadPatternCache, generatePatternSummary, savePatternCache } from '../../ai/patternMemory'
import {
  getDriveStatus, wasEverConnected, onDriveStatusChange, getLastSyncTime, hasSyncQueued,
  connectGoogleDrive, disconnectGoogleDrive, syncToGoogleDrive,
  listBackupFiles, downloadFileById, deleteBackupFile,
  loadGoogleIdentityServices, DEFAULT_CLIENT_ID,
  type DriveStatus, type BackupFile,
} from '../../api/googleDrive'
import HistoricalImport from './HistoricalImport'
import SpreadsheetImport from './SpreadsheetImport'
import CatchManager from './CatchManager'

interface Props {
  settings: AppSettings
  onUpdate: (s: AppSettings) => void
}

const THEME_OPTIONS: { value: ColorTheme; label: string; desc: string }[] = [
  { value: 'adaptive', label: '🌅 Adaptive', desc: 'Shifts with sunrise/sunset — 4 phases' },
  { value: 'dark',     label: '🌑 Dark',     desc: 'Fixed polished dark mode' },
  { value: 'light',    label: '☀️ Light',    desc: 'Clean light mode for full sun' },
  { value: 'auto',     label: '📱 Auto',     desc: 'Follows your phone system setting' },
]


type View = 'main' | 'import' | 'csv-import' | 'catches' | 'drive-restore' | 'drive-manage'

function fmtBytes(bytes?: string): string {
  if (!bytes) return ''
  const n = parseInt(bytes, 10)
  if (isNaN(n)) return ''
  if (n < 1024)       return `${n} B`
  if (n < 1048576)    return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1048576).toFixed(1)} MB`
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// ── Restore view ──────────────────────────────────────────────────────────────
type RestorePhase =
  | 'listing' | 'listed' | 'loading-file'
  | 'preview' | 'conflict' | 'final-confirm'
  | 'restoring' | 'done' | 'error'

interface RestorePreview {
  file:         BackupFile
  json:         string
  backupSessions: number
  backupEvents: number
  localTotal:   number
}

function DriveRestoreView({ onClose }: { onClose: () => void }) {
  const [phase, setPhase]     = useState<RestorePhase>('listing')
  const [files, setFiles]     = useState<BackupFile[]>([])
  const [preview, setPreview] = useState<RestorePreview | null>(null)
  const [result, setResult]   = useState<{ sessions: number; events: number } | null>(null)
  const [error, setError]     = useState('')

  useEffect(() => {
    listBackupFiles()
      .then(f => { setFiles(f); setPhase('listed') })
      .catch(e => { setError(String(e)); setPhase('error') })
  }, [])

  const selectFile = async (file: BackupFile) => {
    setPhase('loading-file')
    try {
      const json  = await downloadFileById(file.id)
      const data  = JSON.parse(json)
      const local = await getEntryCount()
      setPreview({
        file,
        json,
        backupSessions: data.sessions?.length ?? 0,
        backupEvents:   data.events?.length ?? 0,
        localTotal:     local.total,
      })
      const backupTotal = (data.sessions?.length ?? 0) + (data.events?.length ?? 0)
      setPhase(backupTotal < local.total ? 'conflict' : 'preview')
    } catch (e) {
      setError(String(e)); setPhase('error')
    }
  }

  const doRestore = async () => {
    if (!preview) return
    setPhase('restoring')
    try {
      const data = JSON.parse(preview.json)
      const r    = await replaceAllData(data)
      setResult(r)
      setPhase('done')
    } catch (e) {
      setError(String(e)); setPhase('error')
    }
  }

  return (
    <div className="p-4 pb-20 max-w-lg mx-auto space-y-4">
      <div className="flex items-center gap-3 py-1">
        <button onClick={onClose} className="th-accent-text font-semibold text-sm min-h-[44px] pr-3">← Back</button>
        <span className="th-text font-bold">Restore from Backup</span>
      </div>

      {/* Listing */}
      {phase === 'listing' && (
        <p className="th-text-muted text-sm text-center animate-pulse py-12">Fetching backup files…</p>
      )}

      {/* File list */}
      {phase === 'listed' && (
        <>
          {files.length === 0 ? (
            <div className="th-surface rounded-xl border th-border p-6 text-center space-y-2">
              <p className="text-2xl">📭</p>
              <p className="th-text font-semibold text-sm">No backups found</p>
              <p className="th-text-muted text-xs">Run a sync from Settings to create your first backup.</p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="th-text-muted text-xs px-1">{files.length} backup{files.length !== 1 ? 's' : ''} — tap one to restore from it</p>
              {files.map(f => (
                <button
                  key={f.id}
                  onClick={() => selectFile(f)}
                  className="w-full th-surface rounded-xl border th-border p-4 text-left flex items-center justify-between gap-3 active:opacity-70"
                >
                  <div className="min-w-0">
                    <p className="th-text text-sm font-medium">{fmtDate(f.createdTime)}</p>
                    {fmtBytes(f.size) && <p className="th-text-muted text-xs mt-0.5">{fmtBytes(f.size)}</p>}
                  </div>
                  <span className="th-text-muted text-base shrink-0">›</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* Loading selected file */}
      {phase === 'loading-file' && (
        <p className="th-text-muted text-sm text-center animate-pulse py-12">Downloading backup…</p>
      )}

      {/* Preview — entry counts match or backup has more */}
      {phase === 'preview' && preview && (
        <div className="space-y-3">
          <div className="th-surface rounded-xl border th-border p-4 space-y-2">
            <p className="th-text font-semibold text-sm">Selected backup</p>
            <p className="th-text-muted text-xs">{fmtDate(preview.file.createdTime)}</p>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div className="th-surface-deep rounded-lg p-3 text-center">
                <p className="th-text font-bold text-lg">{preview.backupSessions}</p>
                <p className="th-text-muted text-xs">sessions</p>
              </div>
              <div className="th-surface-deep rounded-lg p-3 text-center">
                <p className="th-text font-bold text-lg">{preview.backupEvents}</p>
                <p className="th-text-muted text-xs">catch events</p>
              </div>
            </div>
          </div>
          <button onClick={() => setPhase('final-confirm')} className="w-full py-3 th-btn-primary rounded-xl text-sm font-semibold">
            Continue to Restore →
          </button>
          <button onClick={() => setPhase('listed')} className="w-full py-3 th-surface border th-border rounded-xl text-sm th-text">
            Choose a different file
          </button>
        </div>
      )}

      {/* Conflict warning — backup has fewer entries than local */}
      {phase === 'conflict' && preview && (
        <div className="space-y-3">
          <div className="rounded-xl border-2 border-amber-500/60 th-warning-bg p-4 space-y-2">
            <p className="th-warning-text font-semibold text-sm">⚠ Backup contains less data than your device</p>
            <p className="th-text-muted text-xs leading-relaxed">
              This backup has{' '}
              <strong className="th-text">{preview.backupSessions + preview.backupEvents} entries</strong>{' '}
              but your device currently has{' '}
              <strong className="th-text">{preview.localTotal} entries</strong>.
              Restoring this backup will permanently delete the entries that are not in it.
            </p>
          </div>
          <div className="th-surface rounded-xl border th-border p-4 space-y-1">
            <p className="th-text font-semibold text-sm">Backup contents</p>
            <p className="th-text-muted text-xs">{fmtDate(preview.file.createdTime)}</p>
            <p className="th-text-muted text-xs">{preview.backupSessions} sessions · {preview.backupEvents} catch events</p>
          </div>
          <button onClick={() => setPhase('final-confirm')} className="w-full py-3 rounded-xl text-sm font-semibold border-2 border-amber-500/60 th-warning-text">
            I understand — continue anyway
          </button>
          <button onClick={() => setPhase('listed')} className="w-full py-3 th-surface border th-border rounded-xl text-sm th-text">
            Choose a different file
          </button>
        </div>
      )}

      {/* Final destructive confirmation */}
      {phase === 'final-confirm' && preview && (
        <div className="space-y-3">
          <div className="rounded-xl border-2 border-red-500/60 th-danger-bg p-4 space-y-3">
            <p className="th-danger-text font-bold text-sm">⚠ This will replace ALL local data</p>
            <p className="th-text-muted text-xs leading-relaxed">
              All sessions, catches, debrief conversations, and gear on this device will be
              permanently deleted and replaced with the contents of the selected backup.
              This cannot be undone.
            </p>
            <div className="th-surface-deep rounded-lg p-3 text-xs th-text-muted space-y-0.5">
              <p>Restoring: {fmtDate(preview.file.createdTime)}</p>
              <p>{preview.backupSessions} sessions · {preview.backupEvents} catch events</p>
            </div>
          </div>
          <button
            onClick={doRestore}
            className="w-full py-3.5 rounded-xl text-sm font-bold border-2 border-red-500 th-danger-text active:opacity-70"
          >
            Replace All Data — I Understand
          </button>
          <button onClick={() => setPhase('listed')} className="w-full py-3 th-surface border th-border rounded-xl text-sm th-text">
            Cancel
          </button>
        </div>
      )}

      {/* Restoring */}
      {phase === 'restoring' && (
        <p className="th-text-muted text-sm text-center animate-pulse py-12">Restoring data…</p>
      )}

      {/* Done */}
      {phase === 'done' && result && (
        <div className="th-surface rounded-xl border th-border p-6 space-y-3 text-center">
          <p className="text-4xl">✅</p>
          <p className="text-green-400 font-bold">Restore complete</p>
          <p className="th-text-muted text-xs">
            {result.sessions} sessions and {result.events} catch events restored.
          </p>
          <button onClick={() => window.location.reload()} className="w-full py-3 th-btn-primary rounded-xl text-sm font-semibold">
            Reload App
          </button>
        </div>
      )}

      {/* Error */}
      {phase === 'error' && (
        <div className="space-y-3">
          <div className="th-surface rounded-xl border border-red-500/40 p-4 space-y-1">
            <p className="text-red-400 font-semibold text-sm">Something went wrong</p>
            {error && <p className="th-text-muted text-xs">{error}</p>}
          </div>
          <button onClick={() => { setPhase('listing'); setError(''); listBackupFiles().then(f => { setFiles(f); setPhase('listed') }).catch(e => { setError(String(e)); setPhase('error') }) }}
            className="w-full py-3 th-btn-primary rounded-xl text-sm font-semibold">
            Try again
          </button>
          <button onClick={onClose} className="w-full py-3 th-surface border th-border rounded-xl text-sm th-text">
            Back to Settings
          </button>
        </div>
      )}
    </div>
  )
}

// ── Manage backups view ───────────────────────────────────────────────────────
function DriveManageView({ onClose }: { onClose: () => void }) {
  const [phase, setPhase]       = useState<'listing' | 'listed' | 'error'>('listing')
  const [files, setFiles]       = useState<BackupFile[]>([])
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deletingInFlight, setDeletingInFlight] = useState(false)
  const [error, setError]       = useState('')

  const loadFiles = () => {
    setPhase('listing')
    listBackupFiles()
      .then(f => { setFiles(f); setPhase('listed') })
      .catch(e => { setError(String(e)); setPhase('error') })
  }

  useEffect(() => { loadFiles() }, [])

  const handleDelete = async (fileId: string) => {
    setDeletingInFlight(true)
    try {
      await deleteBackupFile(fileId)
      setFiles(prev => prev.filter(f => f.id !== fileId))
      setDeletingId(null)
    } catch (e) {
      setError(String(e))
    }
    setDeletingInFlight(false)
  }

  return (
    <div className="p-4 pb-20 max-w-lg mx-auto space-y-4">
      <div className="flex items-center gap-3 py-1">
        <button onClick={onClose} className="th-accent-text font-semibold text-sm min-h-[44px] pr-3">← Back</button>
        <span className="th-text font-bold">Manage Backups</span>
      </div>

      {phase === 'listing' && (
        <p className="th-text-muted text-sm text-center animate-pulse py-12">Loading backup files…</p>
      )}

      {phase === 'error' && (
        <div className="space-y-3">
          <p className="text-red-400 text-sm">{error || 'Failed to load files.'}</p>
          <button onClick={loadFiles} className="w-full py-3 th-btn-primary rounded-xl text-sm font-semibold">Retry</button>
        </div>
      )}

      {phase === 'listed' && (
        <>
          {files.length === 0 ? (
            <div className="th-surface rounded-xl border th-border p-6 text-center space-y-2">
              <p className="text-2xl">📭</p>
              <p className="th-text font-semibold text-sm">No backups in Drive</p>
              <p className="th-text-muted text-xs">Backups appear here after your first sync.</p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="th-text-muted text-xs px-1">{files.length} backup file{files.length !== 1 ? 's' : ''} stored in Monroe Fishing App folder</p>
              {files.map(f => (
                <div key={f.id} className="th-surface rounded-xl border th-border p-4 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="th-text text-sm font-medium">{fmtDate(f.createdTime)}</p>
                      {fmtBytes(f.size) && <p className="th-text-muted text-xs mt-0.5">{fmtBytes(f.size)}</p>}
                    </div>
                    {deletingId !== f.id && (
                      <button
                        onClick={() => setDeletingId(f.id)}
                        className="shrink-0 px-3 py-2 rounded-lg border border-red-500/40 th-danger-text text-xs font-medium min-h-[36px]"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                  {deletingId === f.id && (
                    <div className="rounded-lg border border-red-500/40 th-danger-bg p-3 space-y-2">
                      <p className="th-danger-text text-xs font-medium">Delete this backup from Google Drive?</p>
                      <p className="th-text-muted text-xs">This cannot be undone. Local app data is not affected.</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleDelete(f.id)}
                          disabled={deletingInFlight}
                          className="flex-1 py-2 rounded-lg bg-red-700 text-white text-xs font-semibold disabled:opacity-40"
                        >
                          {deletingInFlight ? 'Deleting…' : 'Yes, Delete'}
                        </button>
                        <button
                          onClick={() => setDeletingId(null)}
                          className="flex-1 py-2 th-surface-deep border th-border rounded-lg text-xs th-text"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {error && <p className="text-red-400 text-xs px-1">{error}</p>}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Main Settings component ───────────────────────────────────────────────────
export default function Settings({ settings, onUpdate }: Props) {
  const [view, setView]         = useState<View>('main')
  const [apiKey, setApiKey]     = useState(settings.anthropicApiKey)
  const [threshold, setThreshold] = useState(String(settings.sizeThresholdLbs))
  const [googleClientId, setGoogleClientId] = useState(settings.googleClientId ?? '')
  const [showDriveInstructions, setShowDriveInstructions] = useState(false)
  const [newLure, setNewLure]   = useState('')
  const [saved, setSaved]       = useState(false)

  // Pattern intelligence
  const [patternCache, setPatternCache] = useState(() => loadPatternCache())
  const [patternRefreshing, setPatternRefreshing] = useState(false)

  // Drive state
  const [driveStatus, setDriveStatus]     = useState<DriveStatus>(getDriveStatus())
  const [driveConnecting, setDriveConnecting] = useState(false)
  const [driveSyncing, setDriveSyncing]   = useState(false)
  const [lastSyncTime, setLastSyncTime]   = useState<number | null>(getLastSyncTime())
  const [syncQueued, setSyncQueued]       = useState(hasSyncQueued())

  useEffect(() => onDriveStatusChange(s => {
    setDriveStatus(s)
    if (s === 'connected' || s === 'error') {
      setDriveSyncing(false)
      setLastSyncTime(getLastSyncTime())
      setSyncQueued(hasSyncQueued())
    }
    if (s === 'queued') setSyncQueued(true)
  }), [])

  const effectiveClientId = googleClientId.trim() || DEFAULT_CLIENT_ID

  const handleDriveConnect = async () => {
    setDriveConnecting(true)
    try {
      await loadGoogleIdentityServices(effectiveClientId)
      await connectGoogleDrive()
    } catch {}
    setDriveConnecting(false)
  }

  const handleDriveSyncNow = async () => {
    setDriveSyncing(true)
    try {
      const json = await exportAllDataJSON()
      await syncToGoogleDrive(json)
      setLastSyncTime(getLastSyncTime())
      setSyncQueued(false)
    } catch {}
    setDriveSyncing(false)
  }

  const handleRefreshPattern = async () => {
    setPatternRefreshing(true)
    const [fish, sessions] = await Promise.all([getLandedFish(), getAllSessions()])
    const summary = generatePatternSummary(fish, sessions)
    const cache = { catchCountSnapshot: fish.length, generatedAt: Date.now(), summary }
    savePatternCache(cache)
    setPatternCache(cache)
    setPatternRefreshing(false)
  }

  const handleSave = async () => {
    const updated: AppSettings = {
      ...settings,
      anthropicApiKey:  apiKey.trim(),
      sizeThresholdLbs: parseFloat(threshold) || 3,
      googleClientId:   googleClientId.trim() || undefined,
    }
    await saveSettings(updated)
    onUpdate(updated)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const setTheme = async (theme: ColorTheme) => {
    const updated: AppSettings = { ...settings, colorTheme: theme }
    await saveSettings(updated)
    onUpdate(updated)
  }

  const setFontSizeStep = async (step: number) => {
    const px = FONT_SIZE_STEPS[step] ?? 17
    document.documentElement.style.setProperty('--base-font-size', `${px}px`)
    try { localStorage.setItem('font-size-px', `${px}px`) } catch {}
    const updated: AppSettings = { ...settings, fontSizeStep: step }
    await saveSettings(updated)
    onUpdate(updated)
  }

  const addLure = async () => {
    if (!newLure.trim()) return
    const updated: AppSettings = {
      ...settings,
      customLureTypes: [...(settings.customLureTypes ?? []), newLure.trim()],
    }
    await saveSettings(updated)
    onUpdate(updated)
    setNewLure('')
  }

  const removeLure = async (lure: string) => {
    const updated: AppSettings = {
      ...settings,
      customLureTypes: settings.customLureTypes.filter(l => l !== lure),
    }
    await saveSettings(updated)
    onUpdate(updated)
  }

  const downloadJSON = async () => {
    const json = await exportAllDataJSON()
    const blob = new Blob([json], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a'); a.href = url
    a.download = `bass-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click(); URL.revokeObjectURL(url)
  }

  const downloadCSV = async () => {
    const csv  = await exportCatchesCSV()
    const blob = new Blob([csv], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a'); a.href = url
    a.download = `bass-catches-${new Date().toISOString().slice(0, 10)}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  const downloadTackle = async () => {
    const json = await exportTackleJSON()
    const blob = new Blob([json], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a'); a.href = url
    a.download = `tackle-export-${new Date().toISOString().slice(0, 10)}.json`
    a.click(); URL.revokeObjectURL(url)
  }

  if (view === 'catches')       return <CatchManager onClose={() => setView('main')} />
  if (view === 'import')        return <HistoricalImport settings={settings} onClose={() => setView('main')} />
  if (view === 'csv-import')    return <SpreadsheetImport onClose={() => setView('main')} />
  if (view === 'drive-restore') return <DriveRestoreView onClose={() => setView('main')} />
  if (view === 'drive-manage')  return <DriveManageView  onClose={() => setView('main')} />

  const currentTheme    = settings.colorTheme ?? 'adaptive'
  const currentFontStep = settings.fontSizeStep ?? DEFAULT_FONT_STEP
  const isActiveOrError = driveStatus === 'connected' || driveStatus === 'syncing' || driveStatus === 'queued' || driveStatus === 'error'
  const isExpiredOrWas  = driveStatus === 'expired' || (driveStatus === 'disconnected' && wasEverConnected())
  const isNeverConnected = driveStatus === 'disconnected' && !wasEverConnected()

  return (
    <div className="p-4 pb-24 max-w-lg mx-auto space-y-5">
      <h1 className="text-xl font-bold th-text">Settings</h1>

      {/* ── App Theme ────────────────────────────────────────────────────── */}
      <div className="th-surface rounded-xl p-4 border th-border space-y-3">
        <h2 className="font-semibold th-text text-sm">App Theme</h2>
        <div className="grid grid-cols-1 gap-1.5">
          {THEME_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setTheme(opt.value)}
              className={`flex items-center justify-between px-4 py-3 rounded-lg text-sm font-medium border transition-colors ${
                currentTheme === opt.value ? 'th-btn-selected border-transparent' : 'th-surface-deep'
              }`}
              style={currentTheme !== opt.value ? { borderColor: 'var(--th-border)' } : {}}
            >
              <span className={currentTheme === opt.value ? 'text-white' : 'th-text'}>{opt.label}</span>
              <span className={`text-xs ${currentTheme === opt.value ? 'text-white/70' : 'th-text-muted'}`}>
                {currentTheme === opt.value ? '✓ Active' : opt.desc}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Font Size ────────────────────────────────────────────────────── */}
      <div className="th-surface rounded-xl p-4 border th-border space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold th-text text-sm">Text Size</h2>
          <span className="th-text font-bold text-sm">{FONT_SIZE_STEPS[currentFontStep]}px</span>
        </div>
        <input
          type="range"
          min={0}
          max={FONT_SIZE_STEPS.length - 1}
          step={1}
          value={currentFontStep}
          onChange={e => setFontSizeStep(Number(e.target.value))}
          className="w-full accent-[color:var(--th-accent-text)] h-2 rounded-full"
        />
        <div className="flex justify-between th-text-muted" style={{ fontSize: '0.6rem' }}>
          <span>{FONT_SIZE_STEPS[0]}px</span>
          <span>{FONT_SIZE_STEPS[FONT_SIZE_STEPS.length - 1]}px</span>
        </div>
        <p className="th-text-muted text-sm leading-snug border-t th-border pt-3 mt-1">
          Smallmouth hit the shallows at first light — spinnerbait tight to the bank, slow roll.
        </p>
      </div>

      {/* ── API Key ──────────────────────────────────────────────────────── */}
      <div className="th-surface rounded-xl p-4 border th-border space-y-3">
        <h2 className="font-semibold th-text text-sm">Anthropic API Key</h2>
        <p className="th-text-muted text-xs leading-relaxed">
          Required for AI briefings and guide chat. Get yours at{' '}
          <span className="th-accent-text">console.anthropic.com</span>. Estimated cost: $2–$5 for a full season.
        </p>
        <input
          type="password"
          className="w-full th-surface-deep border th-border rounded-lg px-3 py-3 th-text text-sm font-mono"
          placeholder="sk-ant-..."
          value={apiKey}
          onChange={e => setApiKey(e.target.value)}
          autoComplete="off" autoCorrect="off" spellCheck={false}
        />
        {apiKey && <p className="th-accent-text text-xs">✓ Key stored locally on device only.</p>}
      </div>

      {/* ── Audio ────────────────────────────────────────────────────────── */}
      {hasSpeech && (
        <div className="th-surface rounded-xl p-4 border th-border">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold th-text text-sm">Read Responses Aloud</h2>
              <p className="th-text-muted text-xs mt-0.5 leading-snug">AI guide responses will be read using your device's text-to-speech</p>
            </div>
            <button
              onClick={() => {
                const s = { ...settings, readResponsesAloud: !(settings.readResponsesAloud ?? false) }
                onUpdate(s)
                saveSettings(s)
              }}
              className={`relative shrink-0 inline-flex h-6 w-11 items-center rounded-full border-2 transition-colors ${
                (settings.readResponsesAloud ?? false)
                  ? 'bg-[color:var(--th-accent-text)] border-[color:var(--th-accent-text)]'
                  : 'bg-transparent border-[color:var(--th-border)]'
              }`}
              aria-label="Toggle read responses aloud"
            >
              <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                (settings.readResponsesAloud ?? false) ? 'translate-x-5' : 'translate-x-0.5'
              }`} />
            </button>
          </div>
        </div>
      )}

      {/* ── Quality threshold ────────────────────────────────────────────── */}
      <div className="th-surface rounded-xl p-4 border th-border space-y-3">
        <h2 className="font-semibold th-text text-sm">Quality Fish Threshold</h2>
        <p className="th-text-muted text-xs">Filter pattern dashboards to significant catches only.</p>
        <div className="flex items-center gap-3">
          <input
            type="number"
            className="w-24 th-surface-deep border th-border rounded-lg px-3 py-3 th-text text-base"
            value={threshold}
            onChange={e => setThreshold(e.target.value)}
            min="0.5" max="10" step="0.5" inputMode="decimal"
          />
          <span className="th-text-muted text-sm">lbs and above</span>
        </div>
      </div>

      {/* ── Pattern Intelligence ─────────────────────────────────────────── */}
      <div className="th-surface rounded-xl p-4 border th-border space-y-3">
        <h2 className="font-semibold th-text text-sm">Pattern Intelligence</h2>
        <p className="th-text-muted text-xs leading-relaxed">
          AI coaching uses a computed summary of your catch patterns. It refreshes automatically after every 10 new catches.
        </p>
        {patternCache ? (
          <div className="text-xs th-text-muted space-y-0.5">
            <div>Last generated: <span className="th-text">{new Date(patternCache.generatedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span></div>
            <div>Catch snapshot: <span className="th-text">{patternCache.catchCountSnapshot} catches</span></div>
          </div>
        ) : (
          <p className="text-xs th-text-muted italic">No pattern data yet — generated automatically before your first AI session.</p>
        )}
        <button
          onClick={handleRefreshPattern}
          disabled={patternRefreshing}
          className="w-full py-2.5 th-surface-deep border th-border rounded-lg th-text text-sm font-medium disabled:opacity-50"
        >
          {patternRefreshing ? 'Refreshing…' : '↻ Refresh Pattern Analysis'}
        </button>
      </div>

      <button
        onClick={handleSave}
        className={`w-full py-3.5 rounded-xl font-semibold text-base th-btn-primary ${saved ? 'opacity-80' : ''}`}
      >
        {saved ? '✓ Saved' : 'Save Settings'}
      </button>

      {/* ── Custom lure types ────────────────────────────────────────────── */}
      <div className="th-surface rounded-xl p-4 border th-border space-y-3">
        <h2 className="font-semibold th-text text-sm">Custom Lure Types</h2>
        <p className="th-text-muted text-xs">Add lure types not in the default list for the catch logger.</p>
        {(settings.customLureTypes ?? []).map(lure => (
          <div key={lure} className="flex items-center justify-between">
            <span className="th-text text-sm">{lure}</span>
            <button onClick={() => removeLure(lure)} className="text-red-400 text-sm px-2 py-1">Remove</button>
          </div>
        ))}
        <div className="flex gap-2">
          <input
            className="flex-1 th-surface-deep border th-border rounded-lg px-3 py-2.5 th-text text-sm"
            placeholder="e.g. Ned Rig"
            value={newLure}
            onChange={e => setNewLure(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addLure()}
          />
          <button onClick={addLure} className="px-4 py-2 th-surface-deep border th-border rounded-lg th-text text-sm font-medium">Add</button>
        </div>
      </div>

      {/* ── Catch Data ───────────────────────────────────────────────────── */}
      <div className="th-surface rounded-xl p-4 border th-border">
        <h2 className="font-semibold th-text text-sm mb-1">Catch Data</h2>
        <p className="th-text-muted text-xs mb-3">Browse your catch log to fix inaccurate entries or remove duplicates.</p>
        <div className="flex flex-col gap-2">
          <button onClick={() => setView('catches')} className="w-full py-3 th-surface-deep border th-border rounded-lg th-text text-sm font-medium">Browse / Edit Catches</button>
          <button onClick={() => setView('csv-import')} className="w-full py-3 th-surface-deep border th-border rounded-lg th-text text-sm font-medium">Import from Spreadsheet (CSV)</button>
          <button onClick={() => setView('import')} className="w-full py-3 th-surface-deep border th-border rounded-lg th-text text-sm font-medium">Enter Historical Catches Manually</button>
        </div>
      </div>

      {/* ── Google Drive ─────────────────────────────────────────────────── */}
      <div className="th-surface rounded-xl p-4 border th-border space-y-4">

        {/* Header + status badge */}
        <div className="flex items-center justify-between">
          <h2 className="font-semibold th-text text-sm">Google Drive Backup</h2>
          <span className={`text-xs font-medium ${
            driveStatus === 'connected' ? 'text-green-400' :
            driveStatus === 'syncing'   ? 'text-sky-400'   :
            driveStatus === 'queued'    ? 'text-amber-400' :
            driveStatus === 'expired'   ? 'text-amber-400' :
            driveStatus === 'error'     ? 'text-red-400'   : 'th-text-muted'
          }`}>
            {driveStatus === 'connected' && '✓ Connected'}
            {driveStatus === 'syncing'   && <span className="animate-pulse">↑ Syncing…</span>}
            {driveStatus === 'queued'    && '⏳ Queued'}
            {driveStatus === 'expired'   && '⚠ Reconnect needed'}
            {driveStatus === 'error'     && '✕ Sync error'}
          </span>
        </div>

        {/* Client ID field + instructions */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="th-text-muted text-xs font-medium">Google Client ID</span>
            <button
              onClick={() => setShowDriveInstructions(v => !v)}
              className="text-xs th-accent-text min-h-[36px] px-1"
            >
              {showDriveInstructions ? 'Hide guide' : 'Setup guide'}
            </button>
          </div>
          <input
            type="text"
            className="w-full th-surface-deep border th-border rounded-lg px-3 py-2.5 th-text text-xs font-mono"
            placeholder="Using built-in default (works out of the box)"
            value={googleClientId}
            onChange={e => setGoogleClientId(e.target.value)}
            autoCorrect="off" autoCapitalize="off" spellCheck={false}
          />
          {googleClientId.trim() && (
            <p className="th-accent-text text-xs">✓ Using your own client ID — save Settings to apply.</p>
          )}

          {showDriveInstructions && (
            <div className="th-surface-deep border th-border rounded-lg p-4 space-y-3 text-xs th-text-muted leading-relaxed">
              <p className="th-text font-semibold text-sm">Google Cloud Setup</p>
              <p>The app works out of the box with the built-in credentials. Follow these steps only if you want to use your own Google Cloud project:</p>
              <ol className="list-decimal ml-4 space-y-2">
                <li>Go to <span className="th-accent-text font-medium">console.cloud.google.com</span> and sign in with your Google account.</li>
                <li>Click the project selector at the top → <strong className="th-text">New Project</strong> → give it a name → Create.</li>
                <li>In the left menu go to <strong className="th-text">APIs &amp; Services → Library</strong>. Search for <em>Google Drive API</em> and click Enable.</li>
                <li>Go to <strong className="th-text">APIs &amp; Services → Credentials</strong> → <strong className="th-text">Create Credentials → OAuth 2.0 Client ID</strong>.</li>
                <li>If prompted, configure the OAuth consent screen first: choose <strong className="th-text">External</strong>, fill in an app name (e.g. "Monroe Fishing"), and add your email. You can skip all optional fields.</li>
                <li>Back in Credentials, set Application type to <strong className="th-text">Web application</strong>.</li>
                <li>Under <strong className="th-text">Authorized JavaScript origins</strong> add exactly:
                  <div className="mt-1.5 rounded bg-black/20 px-3 py-2 font-mono text-xs th-text select-all break-all">
                    https://nord0364.github.io
                  </div>
                  No redirect URI is required for this app.
                </li>
                <li>Click <strong className="th-text">Create</strong>. Copy the <strong className="th-text">Client ID</strong> (ends in .apps.googleusercontent.com) and paste it in the field above.</li>
                <li>Tap <strong className="th-text">Save Settings</strong> at the top of this page, then connect below.</li>
              </ol>
            </div>
          )}
        </div>

        {/* Never-connected state */}
        {isNeverConnected && (
          <>
            <p className="th-text-muted text-xs leading-relaxed">
              Automatically backs up all catches, sessions, debrief conversations, and gear to a{' '}
              <strong className="th-text">Monroe Fishing App</strong> folder in your Google Drive after each session.
              Only files this app created are accessible — nothing else in your Drive is visible to the app.
            </p>
            <button
              onClick={handleDriveConnect}
              disabled={driveConnecting}
              className="w-full py-3 th-btn-primary rounded-xl text-sm font-semibold disabled:opacity-50"
            >
              {driveConnecting ? 'Connecting…' : '🔗 Connect Google Drive'}
            </button>
          </>
        )}

        {/* Expired / was-connected state */}
        {isExpiredOrWas && (
          <>
            <p className="th-text-muted text-xs">Access expired. Tap Reconnect to resume automatic backups.</p>
            <div className="flex gap-2">
              <button onClick={handleDriveConnect} disabled={driveConnecting}
                className="flex-1 py-2.5 th-btn-primary rounded-xl text-sm font-semibold disabled:opacity-50">
                {driveConnecting ? 'Reconnecting…' : '🔗 Reconnect'}
              </button>
              <button onClick={disconnectGoogleDrive}
                className="px-4 py-2.5 th-surface border th-border rounded-xl text-sm th-text min-h-[44px]">
                Disconnect
              </button>
            </div>
          </>
        )}

        {/* Active / connected / queued / error state */}
        {isActiveOrError && (
          <>
            {/* Sync status card */}
            <div className="th-surface-deep rounded-lg border th-border p-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="th-text-muted text-xs">Last backup</span>
                <span className="th-text text-xs font-medium">
                  {lastSyncTime
                    ? new Date(lastSyncTime).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                    : 'Never'}
                </span>
              </div>
              {syncQueued && driveStatus === 'queued' && (
                <div className="flex items-center gap-1.5">
                  <span className="text-amber-400 text-xs">⏳</span>
                  <span className="th-text-muted text-xs">Sync queued — will upload automatically when back online</span>
                </div>
              )}
              {driveStatus === 'error' && !syncQueued && (
                <p className="text-red-400 text-xs">Last sync failed. Check your connection or tap Sync Now.</p>
              )}
            </div>

            {/* Action buttons row */}
            <div className="flex gap-2">
              <button
                onClick={handleDriveSyncNow}
                disabled={driveSyncing || driveStatus === 'syncing'}
                className="flex-1 py-2.5 th-btn-primary rounded-xl text-sm font-semibold disabled:opacity-50 min-h-[44px]"
              >
                {driveSyncing || driveStatus === 'syncing' ? '↑ Syncing…' : '↑ Sync Now'}
              </button>
              <button
                onClick={disconnectGoogleDrive}
                className="px-4 py-2.5 th-surface border th-border rounded-xl text-sm th-text min-h-[44px]"
              >
                Disconnect
              </button>
            </div>

            {/* Restore + Manage row */}
            <div className="flex gap-2">
              <button
                onClick={() => setView('drive-restore')}
                className="flex-1 py-2.5 th-surface-deep border th-border rounded-xl text-sm th-text font-medium min-h-[44px]"
              >
                ↓ Restore
              </button>
              <button
                onClick={() => setView('drive-manage')}
                className="flex-1 py-2.5 th-surface-deep border th-border rounded-xl text-sm th-text font-medium min-h-[44px]"
              >
                📁 Manage Backups
              </button>
            </div>
          </>
        )}
      </div>

      {/* ── Export ───────────────────────────────────────────────────────── */}
      <div className="th-surface rounded-xl p-4 border th-border space-y-3">
        <h2 className="font-semibold th-text text-sm">Export Data</h2>
        <p className="th-text-muted text-xs">All data stored locally. Export for backup, sharing, or spreadsheet review.</p>
        <button onClick={downloadJSON} className="w-full py-3 th-surface-deep border th-border rounded-lg th-text text-sm font-medium">Export Full Backup (JSON) — sessions, catches, gear</button>
        <button onClick={downloadCSV} className="w-full py-3 th-surface-deep border th-border rounded-lg th-text text-sm font-medium">Export Catch Log (CSV) — spreadsheet ready</button>
        <button onClick={downloadTackle} className="w-full py-3 th-surface-deep border th-border rounded-lg th-text text-sm font-medium">Export Tackle Inventory (JSON) — lures &amp; hooks</button>
      </div>

      {/* ── About ────────────────────────────────────────────────────────── */}
      <div className="th-surface rounded-xl p-4 border th-border">
        <h2 className="font-semibold th-text text-sm mb-2">About</h2>
        <p className="th-text-muted text-xs leading-relaxed">
          Lake Monroe Bass Tracker · Progressive Web App<br />
          All data stays on your device. No account required.<br />
          AI powered by Claude (Anthropic). GPS via device hardware.<br />
          Weather: Open-Meteo + NWS · Moon: calculated · Water: USGS #03366500
        </p>
      </div>

      <p className="text-center th-text-muted text-xs pb-2">v1.4.0</p>
    </div>
  )
}
