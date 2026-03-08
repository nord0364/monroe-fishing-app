// Google Drive backup for Monroe Fishing App
// Scope: drive.file — the app can only see files it created, nothing else in Drive.

export const DEFAULT_CLIENT_ID = '739245351229-s64vg3piu45jrhg98ovqi7ik51k5rfpm.apps.googleusercontent.com'

const SCOPE            = 'https://www.googleapis.com/auth/drive.file'
const FOLDER_NAME      = 'Monroe Fishing App'
const FILE_PREFIX      = 'monroe-fishing-backup-'
const FOLDER_KEY       = 'gdrive_folder_id'
const CONNECTED_KEY    = 'gdrive_connected'
const LAST_SYNC_KEY    = 'gdrive_last_sync'
const SYNC_QUEUED_KEY  = 'gdrive_sync_queued'

// ── Type shims ────────────────────────────────────────────────────────────────
interface GTokenResponse {
  access_token?: string
  expires_in?:   number
  error?:        string
  error_description?: string
}
interface GTokenClient {
  requestAccessToken: (opts: { prompt: string }) => void
  callback: ((r: GTokenResponse) => void) | null
}
declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (cfg: {
            client_id: string
            scope:     string
            callback:  (r: GTokenResponse) => void
          }) => GTokenClient
        }
      }
    }
  }
}

// ── Public types ──────────────────────────────────────────────────────────────
export type DriveStatus = 'disconnected' | 'connected' | 'expired' | 'syncing' | 'queued' | 'error'

export interface BackupFile {
  id:           string
  name:         string
  modifiedTime: string
  createdTime:  string
  size?:        string   // bytes, as string from Drive API
}

// ── Module state ──────────────────────────────────────────────────────────────
let _tc:      GTokenClient | null = null
let _token:   string | null       = null
let _expiry:  number              = 0
let _folder:  string | null       = localStorage.getItem(FOLDER_KEY)
let _inflight = false
let _onlineListenerAdded = false

// Derive initial status from localStorage flags
let _status: DriveStatus = (() => {
  const connected = !!localStorage.getItem(CONNECTED_KEY)
  const queued    = !!localStorage.getItem(SYNC_QUEUED_KEY)
  if (!connected) return 'disconnected'
  return queued ? 'queued' : 'expired'   // token is not in memory yet → expired until re-authed
})()

// Callback to get a fresh JSON snapshot for queued-sync retry
let _dataProvider: (() => Promise<string>) | null = null

const _listeners = new Set<(s: DriveStatus) => void>()

// ── Public getters ────────────────────────────────────────────────────────────
export const getDriveStatus    = (): DriveStatus  => _status
export const wasEverConnected  = (): boolean      => !!localStorage.getItem(CONNECTED_KEY)
export const getLastSyncTime   = (): number | null => {
  const v = localStorage.getItem(LAST_SYNC_KEY)
  return v ? parseInt(v, 10) : null
}
export const hasSyncQueued = (): boolean => !!localStorage.getItem(SYNC_QUEUED_KEY)

export function setQueuedSyncProvider(fn: () => Promise<string>) {
  _dataProvider = fn
}

export function onDriveStatusChange(cb: (s: DriveStatus) => void): () => void {
  _listeners.add(cb)
  return () => _listeners.delete(cb)
}

function setStatus(s: DriveStatus) {
  _status = s
  _listeners.forEach(fn => fn(s))
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
export function loadGoogleIdentityServices(clientId: string): Promise<void> {
  // Register the online-retry listener once at module level
  if (!_onlineListenerAdded) {
    window.addEventListener('online', _handleOnline)
    _onlineListenerAdded = true
  }

  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) { _initClient(clientId); resolve(); return }
    if (document.getElementById('gsi-script')) {
      document.getElementById('gsi-script')!.addEventListener('load', () => { _initClient(clientId); resolve() })
      return
    }
    const s = document.createElement('script')
    s.id    = 'gsi-script'
    s.src   = 'https://accounts.google.com/gsi/client'
    s.async = true
    s.defer = true
    s.onload  = () => { _initClient(clientId); resolve() }
    s.onerror = reject
    document.head.appendChild(s)
  })
}

function _initClient(clientId: string) {
  if (!window.google?.accounts?.oauth2) return
  _tc = window.google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope:     SCOPE,
    callback:  _handleToken,
  })
}

function _handleToken(r: GTokenResponse) {
  if (r.access_token) {
    _token  = r.access_token
    _expiry = Date.now() + ((r.expires_in ?? 3600) - 120) * 1000
    localStorage.setItem(CONNECTED_KEY, '1')
    // If a sync was queued, fire it now automatically
    if (hasSyncQueued() && _dataProvider) {
      _dataProvider().then(json => syncToGoogleDrive(json)).catch(() => setStatus('connected'))
    } else {
      setStatus('connected')
    }
  } else {
    setStatus('error')
  }
}

function _handleOnline() {
  if (hasSyncQueued() && hasValidToken() && _dataProvider) {
    _dataProvider().then(json => syncToGoogleDrive(json)).catch(() => {})
  }
}

// ── Auth ──────────────────────────────────────────────────────────────────────
export function connectGoogleDrive(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!_tc) { reject(new Error('GIS not loaded yet')); return }
    const prev = _tc.callback
    _tc.callback = (r) => {
      _tc!.callback = prev
      if (r.access_token) {
        _token  = r.access_token
        _expiry = Date.now() + ((r.expires_in ?? 3600) - 120) * 1000
        _folder = null  // force re-lookup on reconnect
        localStorage.setItem(CONNECTED_KEY, '1')
        setStatus('connected')
        resolve()
      } else {
        setStatus('error')
        reject(new Error(r.error_description ?? r.error ?? 'Auth failed'))
      }
    }
    _tc.requestAccessToken({ prompt: 'select_account' })
  })
}

export function disconnectGoogleDrive() {
  _token  = null
  _expiry = 0
  _folder = null
  localStorage.removeItem(FOLDER_KEY)
  localStorage.removeItem(CONNECTED_KEY)
  localStorage.removeItem(SYNC_QUEUED_KEY)
  localStorage.removeItem(LAST_SYNC_KEY)
  setStatus('disconnected')
}

// ── Token helpers ─────────────────────────────────────────────────────────────
function hasValidToken(): boolean {
  if (_token && Date.now() < _expiry) return true
  if (_token || localStorage.getItem(CONNECTED_KEY)) {
    _token = null
    // Only downgrade to 'expired' if not already queued; preserves queue visibility
    if (_status !== 'queued') setStatus('expired')
  }
  return false
}

async function authedGet(url: string): Promise<Response> {
  return fetch(url, { headers: { Authorization: `Bearer ${_token}` } })
}

// ── Folder ────────────────────────────────────────────────────────────────────
async function getOrCreateFolder(): Promise<string> {
  if (_folder) return _folder
  const q  = encodeURIComponent(`name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`)
  const sr = await authedGet(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`)
  const sd = await sr.json() as { files?: { id: string }[] }
  if (sd.files?.length) {
    _folder = sd.files[0].id
    localStorage.setItem(FOLDER_KEY, _folder)
    return _folder
  }
  const cr = await fetch('https://www.googleapis.com/drive/v3/files', {
    method:  'POST',
    headers: { Authorization: `Bearer ${_token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }),
  })
  const cd = await cr.json() as { id: string }
  _folder  = cd.id
  localStorage.setItem(FOLDER_KEY, _folder)
  return _folder
}

// ── Filename ──────────────────────────────────────────────────────────────────
function makeFilename(): string {
  const now = new Date()
  const p   = (n: number) => String(n).padStart(2, '0')
  const d   = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
  const t   = `${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`
  return `${FILE_PREFIX}${d}-${t}.json`
}

// ── File listing ──────────────────────────────────────────────────────────────
export async function listBackupFiles(): Promise<BackupFile[]> {
  if (!hasValidToken()) await connectGoogleDrive()
  const folder = await getOrCreateFolder()
  const q = encodeURIComponent(
    `name contains '${FILE_PREFIX}' and '${folder}' in parents and trashed=false`
  )
  const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,modifiedTime,createdTime,size)&orderBy=createdTime+desc&pageSize=200`
  const sr  = await authedGet(url)
  const sd  = await sr.json() as { files?: BackupFile[] }
  const files = sd.files ?? []
  // Sort newest first by createdTime
  return files.sort((a, b) => new Date(b.createdTime).getTime() - new Date(a.createdTime).getTime())
}

// ── Download ──────────────────────────────────────────────────────────────────
export async function downloadFileById(fileId: string): Promise<string> {
  if (!hasValidToken()) await connectGoogleDrive()
  const fr = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${_token}` },
  })
  if (!fr.ok) throw new Error(`Download failed: ${fr.status}`)
  return fr.text()
}

// ── Delete ────────────────────────────────────────────────────────────────────
export async function deleteBackupFile(fileId: string): Promise<void> {
  if (!hasValidToken()) await connectGoogleDrive()
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method:  'DELETE',
    headers: { Authorization: `Bearer ${_token}` },
  })
  if (!res.ok && res.status !== 204) throw new Error(`Delete failed: ${res.status}`)
}

// ── Sync ──────────────────────────────────────────────────────────────────────
// Always writes a NEW timestamped file — never overwrites existing backups.
export async function syncToGoogleDrive(jsonData: string): Promise<void> {
  if (_inflight) return

  if (!navigator.onLine) {
    localStorage.setItem(SYNC_QUEUED_KEY, '1')
    setStatus('queued')
    return
  }

  if (!hasValidToken()) {
    localStorage.setItem(SYNC_QUEUED_KEY, '1')
    if (_status !== 'expired') setStatus('queued')
    return
  }

  _inflight = true
  setStatus('syncing')
  localStorage.removeItem(SYNC_QUEUED_KEY)

  try {
    const folder   = await getOrCreateFolder()
    const fileName = makeFilename()
    const boundary = 'fishing_app_boundary_' + Date.now()
    const meta     = JSON.stringify({ name: fileName, mimeType: 'application/json', parents: [folder] })
    const body     = [
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      meta,
      `--${boundary}`,
      'Content-Type: application/json',
      '',
      jsonData,
      `--${boundary}--`,
    ].join('\r\n')

    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${_token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    })
    if (!res.ok) throw new Error(`Upload failed: ${res.status}`)

    localStorage.setItem(LAST_SYNC_KEY, String(Date.now()))
    setStatus('connected')
  } catch {
    localStorage.setItem(SYNC_QUEUED_KEY, '1')
    setStatus('error')
  } finally {
    _inflight = false
  }
}
