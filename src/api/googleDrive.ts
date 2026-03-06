// Google Drive backup for Monroe Fishing App
// Scope: drive.file — the app can only see files it created, nothing else in Drive.

const SCOPE         = 'https://www.googleapis.com/auth/drive.file'
const FOLDER_ID_KEY = 'gdrive_folder_id'
const CONNECTED_KEY = 'gdrive_connected'

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
            client_id: string; scope: string
            callback: (r: GTokenResponse) => void
          }) => GTokenClient
        }
      }
    }
  }
}

// ── Module state ──────────────────────────────────────────────────────────────
export type DriveStatus = 'disconnected' | 'connected' | 'expired' | 'syncing' | 'error'

let _tc:      GTokenClient | null = null
let _token:   string | null       = null
let _expiry:  number              = 0
let _folder:  string | null       = localStorage.getItem(FOLDER_ID_KEY)
let _status:  DriveStatus         = localStorage.getItem(CONNECTED_KEY) ? 'expired' : 'disconnected'
let _inflight = false

const _listeners = new Set<(s: DriveStatus) => void>()

export const getDriveStatus   = (): DriveStatus => _status
export const wasEverConnected = (): boolean => !!localStorage.getItem(CONNECTED_KEY)

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
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) { _initClient(clientId); resolve(); return }
    if (document.getElementById('gsi-script')) {
      // script already injected but not loaded yet — wait for it
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
    setStatus('connected')
  } else {
    setStatus('error')
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
        _folder = null // force re-lookup on reconnect
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
  localStorage.removeItem(FOLDER_ID_KEY)
  localStorage.removeItem(CONNECTED_KEY)
  setStatus('disconnected')
}

// ── Drive helpers ─────────────────────────────────────────────────────────────
function hasValidToken(): boolean {
  if (_token && Date.now() < _expiry) return true
  if (_token || localStorage.getItem(CONNECTED_KEY)) {
    _token = null
    setStatus('expired')
  }
  return false
}

async function driveGet(url: string): Promise<Response> {
  return fetch(url, { headers: { Authorization: `Bearer ${_token}` } })
}

async function getOrCreateFolder(): Promise<string> {
  if (_folder) return _folder
  const q   = encodeURIComponent("name='Monroe Fishing App' and mimeType='application/vnd.google-apps.folder' and trashed=false")
  const sr  = await driveGet(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`)
  const sd  = await sr.json() as { files?: { id: string }[] }
  if (sd.files?.length) {
    _folder = sd.files[0].id
    localStorage.setItem(FOLDER_ID_KEY, _folder)
    return _folder
  }
  const cr = await fetch('https://www.googleapis.com/drive/v3/files', {
    method:  'POST',
    headers: { Authorization: `Bearer ${_token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ name: 'Monroe Fishing App', mimeType: 'application/vnd.google-apps.folder' }),
  })
  const cd = await cr.json() as { id: string }
  _folder  = cd.id
  localStorage.setItem(FOLDER_ID_KEY, _folder)
  return _folder
}

// ── Sync ──────────────────────────────────────────────────────────────────────
export async function syncToGoogleDrive(jsonData: string): Promise<void> {
  if (_inflight) return
  if (!hasValidToken()) return
  _inflight = true
  setStatus('syncing')
  try {
    const folder   = await getOrCreateFolder()
    const fileName = 'fishing-backup.json'
    const q   = encodeURIComponent(`name='${fileName}' and '${folder}' in parents and trashed=false`)
    const sr  = await driveGet(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`)
    const sd  = await sr.json() as { files?: { id: string }[] }
    const existing = sd.files?.[0]?.id

    const boundary = 'fishing_app_' + Date.now()
    const meta = JSON.stringify({
      name:     fileName,
      mimeType: 'application/json',
      ...(existing ? {} : { parents: [folder] }),
    })
    const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${jsonData}\r\n--${boundary}--`

    const url    = existing
      ? `https://www.googleapis.com/upload/drive/v3/files/${existing}?uploadType=multipart`
      : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart'
    const res = await fetch(url, {
      method:  existing ? 'PATCH' : 'POST',
      headers: {
        Authorization:  `Bearer ${_token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    })
    if (!res.ok) throw new Error('Upload failed')
    setStatus('connected')
  } catch {
    setStatus('error')
  } finally {
    _inflight = false
  }
}
