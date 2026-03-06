import { useState, useEffect } from 'react'
import type { AppSettings, ColorTheme, FontSize } from '../../types'
import { saveSettings, exportAllDataJSON, exportCatchesCSV, bulkImportData } from '../../db/database'
import {
  getDriveStatus, wasEverConnected, onDriveStatusChange,
  connectGoogleDrive, disconnectGoogleDrive, syncToGoogleDrive,
  downloadBackupFromDrive, type DriveStatus,
} from '../../api/googleDrive'
import HistoricalImport from './HistoricalImport'
import SpreadsheetImport from './SpreadsheetImport'
import LureCatalog from '../gear/LureCatalog'
import RodCatalog from '../gear/RodCatalog'
import CatchManager from './CatchManager'

interface Props {
  settings: AppSettings
  onUpdate: (s: AppSettings) => void
}

const THEME_OPTIONS: { value: ColorTheme; label: string; desc: string }[] = [
  { value: 'auto',     label: '⏱ Auto',     desc: 'Changes by time of day' },
  { value: 'midnight', label: '🌑 Midnight', desc: 'Deep slate + emerald' },
  { value: 'dawn',     label: '🌄 Dawn',     desc: 'Warm amber morning' },
  { value: 'daylight', label: '☀️ Daylight', desc: 'Navy + sky blue' },
  { value: 'dusk',     label: '🌇 Dusk',     desc: 'Warm orange evening' },
]

const FONT_OPTIONS: { value: FontSize; label: string }[] = [
  { value: 'small',  label: 'Regular' },
  { value: 'normal', label: 'Large' },
  { value: 'large',  label: 'XL' },
]

type View = 'main' | 'import' | 'csv-import' | 'lures' | 'rods' | 'catches'

export default function Settings({ settings, onUpdate }: Props) {
  const [view, setView]         = useState<View>('main')
  const [apiKey, setApiKey]     = useState(settings.anthropicApiKey)
  const [threshold, setThreshold] = useState(String(settings.sizeThresholdLbs))
  const [newLure, setNewLure]   = useState('')
  const [saved, setSaved]       = useState(false)
  const [driveStatus, setDriveStatus]   = useState<DriveStatus>(getDriveStatus())
  const [driveConnecting, setDriveConnecting] = useState(false)
  const [driveSyncing, setDriveSyncing] = useState(false)
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null)
  const [restoreState, setRestoreState] = useState<'idle' | 'fetching' | 'confirm' | 'importing' | 'done' | 'error'>('idle')
  const [restorePreview, setRestorePreview] = useState<{ modifiedTime: string; sessions: number; catches: number; json: string } | null>(null)
  const [restoreResult, setRestoreResult] = useState<{ sessions: number; events: number } | null>(null)

  useEffect(() => onDriveStatusChange(s => {
    setDriveStatus(s)
    if (s === 'connected') setDriveSyncing(false)
  }), [])

  const handleDriveConnect = async () => {
    setDriveConnecting(true)
    try { await connectGoogleDrive() } catch {}
    setDriveConnecting(false)
  }

  const handleDriveSyncNow = async () => {
    setDriveSyncing(true)
    try {
      const json = await exportAllDataJSON()
      await syncToGoogleDrive(json)
      setLastSyncTime(Date.now())
    } catch {}
    setDriveSyncing(false)
  }

  const handleRestoreFetch = async () => {
    setRestoreState('fetching')
    try {
      const { json, modifiedTime } = await downloadBackupFromDrive()
      const data = JSON.parse(json)
      setRestorePreview({
        modifiedTime,
        sessions: data.sessions?.length ?? 0,
        catches:  data.events?.filter((e: { type: string }) => e.type === 'Landed Fish').length ?? 0,
        json,
      })
      setRestoreState('confirm')
    } catch (err) {
      console.error(err)
      setRestoreState('error')
    }
  }

  const handleRestoreConfirm = async () => {
    if (!restorePreview) return
    setRestoreState('importing')
    try {
      const data = JSON.parse(restorePreview.json)
      const result = await bulkImportData(data)
      setRestoreResult(result)
      setRestoreState('done')
    } catch {
      setRestoreState('error')
    }
  }

  const handleSave = async () => {
    const updated: AppSettings = {
      ...settings,
      anthropicApiKey: apiKey.trim(),
      sizeThresholdLbs: parseFloat(threshold) || 3,
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

  const setFontSize = async (fontSize: FontSize) => {
    const updated: AppSettings = { ...settings, fontSize }
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
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url
    a.download = `bass-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click(); URL.revokeObjectURL(url)
  }

  const downloadCSV = async () => {
    const csv = await exportCatchesCSV()
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url
    a.download = `bass-catches-${new Date().toISOString().slice(0, 10)}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  if (view === 'catches')    return <CatchManager onClose={() => setView('main')} />
  if (view === 'import')     return <HistoricalImport settings={settings} onClose={() => setView('main')} />
  if (view === 'csv-import') return <SpreadsheetImport onClose={() => setView('main')} />
  if (view === 'lures')      return <LureCatalog apiKey={apiKey} onClose={() => setView('main')} />
  if (view === 'rods')       return <RodCatalog  apiKey={apiKey} onClose={() => setView('main')} />

  const currentTheme    = settings.colorTheme ?? 'auto'
  const currentFontSize = settings.fontSize ?? 'normal'

  return (
    <div className="p-4 pb-24 max-w-lg mx-auto space-y-5">
      <h1 className="text-xl font-bold th-text">Settings</h1>

      {/* ── Gear Catalog ─────────────────────────────────────────────────── */}
      <div className="th-surface rounded-xl p-4 border th-border space-y-3">
        <div>
          <h2 className="font-semibold th-text text-sm">My Gear Catalog</h2>
          <p className="th-text-muted text-xs mt-1">
            Catalog your lures and rod setups. The AI will prioritize your owned lures in briefing recommendations and suggest which rod to use.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setView('lures')}
            className="flex flex-col items-center gap-1.5 py-4 th-surface-deep border th-border rounded-xl"
          >
            <span className="text-2xl">🎣</span>
            <span className="th-text text-sm font-medium">Lure Catalog</span>
            <span className="th-text-muted text-xs">Photo + details</span>
          </button>
          <button
            onClick={() => setView('rods')}
            className="flex flex-col items-center gap-1.5 py-4 th-surface-deep border th-border rounded-xl"
          >
            <span className="text-2xl">🎯</span>
            <span className="th-text text-sm font-medium">Rod Setups</span>
            <span className="th-text-muted text-xs">Rod + line + reel</span>
          </button>
        </div>
      </div>

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
        <h2 className="font-semibold th-text text-sm">Text Size</h2>
        <div className="flex gap-2">
          {FONT_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setFontSize(opt.value)}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                currentFontSize === opt.value ? 'th-btn-selected border-transparent' : 'th-surface-deep'
              }`}
              style={currentFontSize !== opt.value ? { borderColor: 'var(--th-border)', color: 'var(--th-text)' } : {}}
            >
              {opt.label}
            </button>
          ))}
        </div>
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
        {apiKey && (
          <p className="th-accent-text text-xs">✓ Key stored locally on device only.</p>
        )}
      </div>

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
          <button onClick={() => setView('catches')} className="w-full py-3 th-surface-deep border th-border rounded-lg th-text text-sm font-medium">
            Browse / Edit Catches
          </button>
          <button onClick={() => setView('csv-import')} className="w-full py-3 th-surface-deep border th-border rounded-lg th-text text-sm font-medium">
            Import from Spreadsheet (CSV)
          </button>
          <button onClick={() => setView('import')} className="w-full py-3 th-surface-deep border th-border rounded-lg th-text text-sm font-medium">
            Enter Historical Catches Manually
          </button>
        </div>
      </div>

      {/* ── Google Drive ─────────────────────────────────────────────────── */}
      <div className="th-surface rounded-xl p-4 border th-border space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold th-text text-sm">Google Drive Backup</h2>
          {driveStatus === 'connected' && <span className="text-xs text-green-400 font-medium">✓ Connected</span>}
          {driveStatus === 'syncing'   && <span className="text-xs text-sky-400 font-medium animate-pulse">↑ Syncing…</span>}
          {driveStatus === 'expired'   && <span className="text-xs text-amber-400 font-medium">⚠ Reconnect needed</span>}
          {driveStatus === 'error'     && <span className="text-xs text-red-400 font-medium">✕ Sync error</span>}
        </div>

        {(driveStatus === 'disconnected' && !wasEverConnected()) ? (
          <>
            <p className="th-text-muted text-xs leading-relaxed">
              Silently backs up all catches, sessions, and gear to a <strong className="th-text">Monroe Fishing App</strong> folder in your Google Drive after each session. Only files this app created are accessible — nothing else in your Drive is visible to the app.
            </p>
            <button
              onClick={handleDriveConnect}
              disabled={driveConnecting}
              className="w-full py-3 th-btn-primary rounded-xl text-sm font-semibold disabled:opacity-50"
            >
              {driveConnecting ? 'Connecting…' : '🔗 Connect Google Drive'}
            </button>
          </>
        ) : (driveStatus === 'expired' || (driveStatus === 'disconnected' && wasEverConnected())) ? (
          <>
            <p className="th-text-muted text-xs">Access token expired. Reconnect to resume automatic backups.</p>
            <div className="flex gap-2">
              <button onClick={handleDriveConnect} disabled={driveConnecting}
                className="flex-1 py-2.5 th-btn-primary rounded-xl text-sm font-semibold disabled:opacity-50">
                {driveConnecting ? 'Reconnecting…' : '🔗 Reconnect'}
              </button>
              <button onClick={disconnectGoogleDrive}
                className="px-4 py-2.5 th-surface border th-border rounded-xl text-sm th-text">
                Disconnect
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="th-text-muted text-xs">
              Auto-syncs 2 s after each catch or session end.{' '}
              {lastSyncTime ? `Last sync: ${new Date(lastSyncTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Syncs to Monroe Fishing App folder.'}
            </p>
            {driveStatus === 'error' && (
              <p className="text-red-400 text-xs">Last sync failed. Check your connection and try again.</p>
            )}
            <div className="flex gap-2">
              <button onClick={handleDriveSyncNow} disabled={driveSyncing || driveStatus === 'syncing'}
                className="flex-1 py-2.5 th-btn-primary rounded-xl text-sm font-semibold disabled:opacity-50">
                {driveSyncing || driveStatus === 'syncing' ? '↑ Syncing…' : '↑ Sync Now'}
              </button>
              <button onClick={disconnectGoogleDrive}
                className="px-4 py-2.5 th-surface border th-border rounded-xl text-sm th-text">
                Disconnect
              </button>
            </div>

            {/* Restore from Drive */}
            <div className="pt-1 border-t th-border">
              <p className="th-text-muted text-xs mb-2">
                On a new device? Restore your data from the Drive backup to sync across devices.
              </p>
              {restoreState === 'idle' && (
                <button onClick={handleRestoreFetch}
                  className="w-full py-2.5 th-surface-deep border th-border rounded-xl text-sm th-text font-medium">
                  ↓ Restore from Google Drive
                </button>
              )}
              {restoreState === 'fetching' && (
                <p className="text-xs th-text-muted text-center animate-pulse">Fetching backup…</p>
              )}
              {restoreState === 'confirm' && restorePreview && (
                <div className="th-surface-deep rounded-xl border th-border p-3 space-y-2">
                  <p className="th-text text-sm font-semibold">Backup found</p>
                  <p className="th-text-muted text-xs">
                    Saved: {new Date(restorePreview.modifiedTime).toLocaleString()}<br />
                    {restorePreview.sessions} sessions · {restorePreview.catches} catches
                  </p>
                  <p className="th-text-muted text-xs">Existing data is kept — this merges, not overwrites.</p>
                  <div className="flex gap-2">
                    <button onClick={handleRestoreConfirm}
                      className="flex-1 py-2 th-btn-primary rounded-lg text-xs font-semibold">
                      Import
                    </button>
                    <button onClick={() => setRestoreState('idle')}
                      className="flex-1 py-2 th-surface border th-border rounded-lg text-xs th-text">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              {restoreState === 'importing' && (
                <p className="text-xs th-text-muted text-center animate-pulse">Importing…</p>
              )}
              {restoreState === 'done' && restoreResult && (
                <div className="th-surface-deep rounded-xl border th-border p-3">
                  <p className="text-green-400 text-sm font-semibold">✓ Import complete</p>
                  <p className="th-text-muted text-xs mt-1">
                    {restoreResult.sessions} sessions · {restoreResult.events} catches merged.
                  </p>
                  <p className="th-text-muted text-xs mt-1">Reload the app to see all restored data.</p>
                  <button onClick={() => window.location.reload()}
                    className="mt-2 w-full py-2 th-btn-primary rounded-lg text-xs font-semibold">
                    Reload Now
                  </button>
                </div>
              )}
              {restoreState === 'error' && (
                <div className="space-y-1">
                  <p className="text-red-400 text-xs">Restore failed. Make sure Drive is connected and a backup exists.</p>
                  <button onClick={() => setRestoreState('idle')}
                    className="text-xs th-accent-text underline">Try again</button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Export ───────────────────────────────────────────────────────── */}
      <div className="th-surface rounded-xl p-4 border th-border space-y-3">
        <h2 className="font-semibold th-text text-sm">Export Data</h2>
        <p className="th-text-muted text-xs">All data stored locally. Export for backup, sharing, or spreadsheet review.</p>
        <button onClick={downloadJSON} className="w-full py-3 th-surface-deep border th-border rounded-lg th-text text-sm font-medium">
          Export Full Backup (JSON) — sessions, catches, gear
        </button>
        <button onClick={downloadCSV} className="w-full py-3 th-surface-deep border th-border rounded-lg th-text text-sm font-medium">
          Export Catch Log (CSV) — spreadsheet ready
        </button>
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
    </div>
  )
}
