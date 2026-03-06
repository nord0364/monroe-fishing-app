import { openDB } from 'idb'
import type { DBSchema, IDBPDatabase } from 'idb'
import type { Session, CatchEvent, AppSettings, OwnedLure, RodSetup } from '../types'

interface FishingDB extends DBSchema {
  sessions: {
    key: string
    value: Session
    indexes: { 'by-date': number }
  }
  events: {
    key: string
    value: CatchEvent
    indexes: { 'by-session': string; 'by-timestamp': number }
  }
  settings: {
    key: string
    value: AppSettings
  }
  pendingApiCalls: {
    key: string
    value: { id: string; url: string; timestamp: number }
  }
  ownedLures: {
    key: string
    value: OwnedLure
    indexes: { 'by-added': number }
  }
  rodSetups: {
    key: string
    value: RodSetup
    indexes: { 'by-added': number }
  }
}

let _db: IDBPDatabase<FishingDB> | null = null

async function getDB(): Promise<IDBPDatabase<FishingDB>> {
  if (_db) return _db
  _db = await openDB<FishingDB>('fishing-tracker', 2, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        const sessionsStore = db.createObjectStore('sessions', { keyPath: 'id' })
        sessionsStore.createIndex('by-date', 'date')
        const eventsStore = db.createObjectStore('events', { keyPath: 'id' })
        eventsStore.createIndex('by-session', 'sessionId')
        eventsStore.createIndex('by-timestamp', 'timestamp')
        db.createObjectStore('settings', { keyPath: 'id' })
        db.createObjectStore('pendingApiCalls', { keyPath: 'id' })
      }
      if (oldVersion < 2) {
        const lureStore = db.createObjectStore('ownedLures', { keyPath: 'id' })
        lureStore.createIndex('by-added', 'addedAt')
        const rodStore = db.createObjectStore('rodSetups', { keyPath: 'id' })
        rodStore.createIndex('by-added', 'addedAt')
      }
    },
  })
  return _db
}

// ─── Sessions ─────────────────────────────────────────────────────────────────

export async function saveSession(session: Session): Promise<void> {
  const db = await getDB()
  await db.put('sessions', session)
}

export async function getSession(id: string): Promise<Session | undefined> {
  const db = await getDB()
  return db.get('sessions', id)
}

export async function getAllSessions(): Promise<Session[]> {
  const db = await getDB()
  const sessions = await db.getAllFromIndex('sessions', 'by-date')
  return sessions.reverse()
}

export async function deleteSession(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('sessions', id)
}

// ─── Events ───────────────────────────────────────────────────────────────────

export async function saveEvent(event: CatchEvent): Promise<void> {
  const db = await getDB()
  await db.put('events', event)
}

export async function getEventsForSession(sessionId: string): Promise<CatchEvent[]> {
  const db = await getDB()
  return db.getAllFromIndex('events', 'by-session', sessionId)
}

export async function getAllEvents(): Promise<CatchEvent[]> {
  const db = await getDB()
  const events = await db.getAllFromIndex('events', 'by-timestamp')
  return events.reverse()
}

export async function deleteEvent(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('events', id)
}

export async function getLandedFish() {
  const events = await getAllEvents()
  return events.filter(e => e.type === 'Landed Fish') as import('../types').LandedFish[]
}

// ─── Settings ─────────────────────────────────────────────────────────────────

const SETTINGS_KEY = 'app-settings'

export async function getSettings(): Promise<AppSettings> {
  const db = await getDB()
  const s = await db.get('settings', SETTINGS_KEY)
  return s ?? {
    anthropicApiKey: '',
    sizeThresholdLbs: 3,
    customLureTypes: [],
    onboardingDone: false,
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const db = await getDB()
  await db.put('settings', { ...settings, id: SETTINGS_KEY } as AppSettings & { id: string })
}

// ─── Gear Catalog ─────────────────────────────────────────────────────────────

export async function saveOwnedLure(lure: OwnedLure): Promise<void> {
  const db = await getDB()
  await db.put('ownedLures', lure)
}

export async function getAllOwnedLures(): Promise<OwnedLure[]> {
  const db = await getDB()
  const lures = await db.getAllFromIndex('ownedLures', 'by-added')
  return lures.reverse()
}

export async function deleteOwnedLure(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('ownedLures', id)
}

export async function saveRodSetup(rod: RodSetup): Promise<void> {
  const db = await getDB()
  await db.put('rodSetups', rod)
}

export async function getAllRodSetups(): Promise<RodSetup[]> {
  const db = await getDB()
  const rods = await db.getAllFromIndex('rodSetups', 'by-added')
  return rods.reverse()
}

export async function deleteRodSetup(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('rodSetups', id)
}

// ─── Export ───────────────────────────────────────────────────────────────────

export async function exportAllDataJSON(): Promise<string> {
  const [sessions, events, settings, ownedLures, rodSetups] = await Promise.all([
    getAllSessions(),
    getAllEvents(),
    getSettings(),
    getAllOwnedLures(),
    getAllRodSetups(),
  ])
  return JSON.stringify({
    exportedAt: new Date().toISOString(),
    sessions,
    events,
    ownedLures: ownedLures.map(l => ({ ...l, photoDataUrl: l.photoDataUrl ? '[photo]' : undefined })),
    rodSetups:  rodSetups.map(r => ({ ...r, photoDataUrl: r.photoDataUrl ? '[photo]' : undefined })),
    settings: { ...settings, anthropicApiKey: '[REDACTED]' },
  }, null, 2)
}

export async function exportCatchesCSV(): Promise<string> {
  const events = await getLandedFish()
  const headers = [
    'Date', 'Time', 'Session ID', 'Species', 'Weight (lbs)', 'Weight (oz)',
    'Length (in)', 'Lure Type', 'Lure Weight', 'Lure Color', 'Custom Pour',
    'Water Depth', 'Water Column', 'Retrieve Style', 'Structure',
    'Latitude', 'Longitude', 'Notes',
  ]
  const rows = events.map(e => [
    new Date(e.timestamp).toLocaleDateString(),
    new Date(e.timestamp).toLocaleTimeString(),
    e.sessionId,
    e.species,
    e.weightLbs,
    e.weightOz,
    e.lengthInches,
    e.lureType,
    e.lureWeight,
    `"${e.lureColor}"`,
    e.customPour ? 'Yes' : 'No',
    e.waterDepth,
    e.waterColumn,
    e.retrieveStyle ?? '',
    e.structure ?? '',
    e.coords?.lat ?? '',
    e.coords?.lng ?? '',
    `"${(e.notes ?? '').replace(/"/g, '""')}"`,
  ])
  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
}
