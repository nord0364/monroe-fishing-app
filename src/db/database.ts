import { openDB } from 'idb'
import type { DBSchema, IDBPDatabase } from 'idb'
import type {
  Session, CatchEvent, AppSettings, OwnedLure, RodSetup, Rod,
  DebriefConversation, PersonalBestPin, StandaloneGuideEntry, SoftPlastic,
} from '../types'

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
  debriefs: {
    key: string
    value: DebriefConversation
    indexes: { 'by-session': string; 'by-updated': number }
  }
  personalBests: {
    key: string
    value: PersonalBestPin
    indexes: { 'by-species': string }
  }
  guideEntries: {
    key: string
    value: StandaloneGuideEntry
    indexes: { 'by-date': number }
  }
  rods: {
    key: string
    value: Rod
    indexes: { 'by-added': number }
  }
  softPlastics: {
    key: string
    value: SoftPlastic
    indexes: { 'by-added': number }
  }
}

let _db: IDBPDatabase<FishingDB> | null = null

async function getDB(): Promise<IDBPDatabase<FishingDB>> {
  if (_db) return _db
  _db = await openDB<FishingDB>('fishing-tracker', 6, {
    async upgrade(db, oldVersion, _newVersion, transaction) {
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
      if (oldVersion < 3) {
        const debriefStore = db.createObjectStore('debriefs', { keyPath: 'id' })
        debriefStore.createIndex('by-session', 'sessionId')
        debriefStore.createIndex('by-updated', 'updatedAt')
        const pbStore = db.createObjectStore('personalBests', { keyPath: 'id' })
        pbStore.createIndex('by-species', 'species')
      }
      if (oldVersion < 4) {
        const guideStore = db.createObjectStore('guideEntries', { keyPath: 'id' })
        guideStore.createIndex('by-date', 'createdAt')
      }
      if (oldVersion < 5) {
        const rodStore = db.createObjectStore('rods', { keyPath: 'id' })
        rodStore.createIndex('by-added', 'addedAt')
      }
      if (oldVersion < 6) {
        // Create softPlastics store
        const spStore = db.createObjectStore('softPlastics', { keyPath: 'id' })
        spStore.createIndex('by-added', 'addedAt')

        // Migrate existing ownedLures data
        const lureStore = transaction.objectStore('ownedLures')
        const allLures: OwnedLure[] = await lureStore.getAll()
        for (const lure of allLures) {
          const cat = lure.category ?? 'lure'
          if (cat === 'spoon') {
            // Spoons → lure with lureType='Spoon'
            const migrated: OwnedLure = { ...lure, category: 'lure', lureType: 'Spoon' }
            delete (migrated as unknown as Record<string, unknown>).spoonStyle
            await lureStore.put(migrated)
          } else if (lure.lureType === 'Wacky Rig') {
            // Wacky Rig lures → hook with hookStyle='Wacky'
            const migrated: OwnedLure = {
              ...lure,
              category: 'hook',
              hookStyle: 'Wacky',
              hookType: 'standard',
              lureType: undefined,
            }
            await lureStore.put(migrated)
          } else if (lure.lureType === 'Ned Rig') {
            // Ned Rig lures → hook with hookStyle='Ned'
            const migrated: OwnedLure = {
              ...lure,
              category: 'hook',
              hookStyle: 'Ned',
              hookType: 'standard',
              lureType: undefined,
            }
            await lureStore.put(migrated)
          } else if (lure.lureType === 'Texas Rig') {
            // Texas Rig lures → delete
            await lureStore.delete(lure.id)
          }
        }
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

export async function deleteSessionWithEvents(sessionId: string): Promise<void> {
  const db = await getDB()
  const events = await db.getAllFromIndex('events', 'by-session', sessionId)
  await db.delete('sessions', sessionId)
  for (const e of events) await db.delete('events', e.id)
  // Also delete any debrief for this session
  const debriefs = await db.getAllFromIndex('debriefs', 'by-session', sessionId)
  for (const d of debriefs) await db.delete('debriefs', d.id)
}

export async function bulkDeleteSessions(sessionIds: string[]): Promise<void> {
  for (const id of sessionIds) await deleteSessionWithEvents(id)
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

export async function bulkDeleteEvents(eventIds: string[]): Promise<void> {
  const db = await getDB()
  for (const id of eventIds) await db.delete('events', id)
}

// updateEvent is an alias for saveEvent (put handles both insert and update)
export { saveEvent as updateEvent }

export async function getLandedFish() {
  const events = await getAllEvents()
  return events.filter(e => e.type === 'Landed Fish') as import('../types').LandedFish[]
}

// ─── Debriefs ─────────────────────────────────────────────────────────────────

export async function saveDebrief(debrief: DebriefConversation): Promise<void> {
  const db = await getDB()
  await db.put('debriefs', debrief)
}

export async function getDebriefForSession(sessionId: string): Promise<DebriefConversation | undefined> {
  const db = await getDB()
  const results = await db.getAllFromIndex('debriefs', 'by-session', sessionId)
  return results[0]
}

export async function getAllDebriefs(): Promise<DebriefConversation[]> {
  const db = await getDB()
  const all = await db.getAllFromIndex('debriefs', 'by-updated')
  return all.reverse()
}

export async function deleteDebrief(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('debriefs', id)
}

export async function bulkDeleteDebriefs(ids: string[]): Promise<void> {
  const db = await getDB()
  for (const id of ids) await db.delete('debriefs', id)
}

// ─── Personal Bests ───────────────────────────────────────────────────────────

export async function savePersonalBest(pb: PersonalBestPin): Promise<void> {
  const db = await getDB()
  await db.put('personalBests', pb)
}

export async function getAllPersonalBests(): Promise<PersonalBestPin[]> {
  const db = await getDB()
  return db.getAll('personalBests')
}

export async function deletePersonalBest(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('personalBests', id)
}

// ─── Standalone Guide Entries ─────────────────────────────────────────────────

export async function saveStandaloneGuideEntry(entry: StandaloneGuideEntry): Promise<void> {
  const db = await getDB()
  await db.put('guideEntries', entry)
}

export async function getAllStandaloneGuideEntries(): Promise<StandaloneGuideEntry[]> {
  const db = await getDB()
  const all = await db.getAllFromIndex('guideEntries', 'by-date')
  return all.reverse()
}

export async function deleteStandaloneGuideEntry(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('guideEntries', id)
}

export async function bulkDeleteStandaloneGuideEntries(ids: string[]): Promise<void> {
  const db = await getDB()
  for (const id of ids) await db.delete('guideEntries', id)
}

// ─── Settings ─────────────────────────────────────────────────────────────────

const SETTINGS_KEY = 'app-settings'

export async function getSettings(): Promise<AppSettings> {
  const db = await getDB()
  const s = await db.get('settings', SETTINGS_KEY)
  const base: AppSettings = s ?? {
    anthropicApiKey: '',
    sizeThresholdLbs: 3,
    customLureTypes: [],
    onboardingDone: false,
  }
  // Migrate old colorTheme values to new system
  if (base.colorTheme) {
    const old = base.colorTheme as string
    if (['midnight', 'dawn', 'daylight', 'dusk', 'auto'].includes(old)) {
      base.colorTheme = 'adaptive'
    } else if (old === 'white') {
      base.colorTheme = 'light'
    }
  }
  // Migrate old 3-option fontSize → fontSizeStep index
  if (base.fontSizeStep == null && base.fontSize) {
    const map: Record<string, number> = { small: 3, normal: 6, large: 8 }
    base.fontSizeStep = map[base.fontSize] ?? 3
  }
  return base
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
  const lures = await db.getAll('ownedLures')
  return lures.sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0))
}

export async function deleteOwnedLure(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('ownedLures', id)
}

export async function bulkDeleteOwnedLures(ids: string[]): Promise<void> {
  const db = await getDB()
  for (const id of ids) await db.delete('ownedLures', id)
}

export async function bulkSaveOwnedLures(items: OwnedLure[]): Promise<void> {
  const db = await getDB()
  for (const item of items) await db.put('ownedLures', item)
}

export async function saveRodSetup(rod: RodSetup): Promise<void> {
  const db = await getDB()
  await db.put('rodSetups', rod)
}

export async function getAllRodSetups(): Promise<RodSetup[]> {
  const db = await getDB()
  const rods = await db.getAll('rodSetups')
  return rods.sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0))
}

export async function deleteRodSetup(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('rodSetups', id)
}

// ─── Soft Plastics ────────────────────────────────────────────────────────────

export async function saveSoftPlastic(sp: SoftPlastic): Promise<void> {
  const db = await getDB()
  await db.put('softPlastics', sp)
}

export async function getAllSoftPlastics(): Promise<SoftPlastic[]> {
  const db = await getDB()
  const all = await db.getAllFromIndex('softPlastics', 'by-added')
  return all.reverse()
}

export async function deleteSoftPlastic(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('softPlastics', id)
}

export async function bulkDeleteSoftPlastics(ids: string[]): Promise<void> {
  const db = await getDB()
  for (const id of ids) await db.delete('softPlastics', id)
}

// ─── Rod Catalog ──────────────────────────────────────────────────────────────

export async function saveRod(rod: Rod): Promise<void> {
  const db = await getDB()
  await db.put('rods', rod)
}

export async function getAllRods(): Promise<Rod[]> {
  const db = await getDB()
  const rods = await db.getAllFromIndex('rods', 'by-added')
  return rods.reverse()
}

export async function deleteRod(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('rods', id)
}

export async function bulkDeleteRods(ids: string[]): Promise<void> {
  const db = await getDB()
  for (const id of ids) await db.delete('rods', id)
}

// ─── Export ───────────────────────────────────────────────────────────────────

export async function exportAllDataFull(): Promise<string> {
  const [sessions, events, settings, ownedLures, rodSetups, debriefs] = await Promise.all([
    getAllSessions(), getAllEvents(), getSettings(), getAllOwnedLures(), getAllRodSetups(), getAllDebriefs(),
  ])
  return JSON.stringify({
    exportedAt: new Date().toISOString(),
    version: 3,
    sessions, events, ownedLures, rodSetups, debriefs,
    settings: { ...settings, anthropicApiKey: '[REDACTED]' },
  }, null, 2)
}

export async function exportAllDataJSON(): Promise<string> {
  const [sessions, events, settings, ownedLures, rodSetups, debriefs] = await Promise.all([
    getAllSessions(), getAllEvents(), getSettings(), getAllOwnedLures(), getAllRodSetups(), getAllDebriefs(),
  ])
  return JSON.stringify({
    exportedAt: new Date().toISOString(),
    version: 3,
    sessions,
    events,
    ownedLures: ownedLures.map(l => ({ ...l, photoDataUrl: l.photoDataUrl ? '[photo]' : undefined })),
    rodSetups:  rodSetups.map(r => ({ ...r, photoDataUrl: r.photoDataUrl ? '[photo]' : undefined })),
    debriefs,
    settings: { ...settings, anthropicApiKey: '[REDACTED]' },
  }, null, 2)
}

export async function exportTackleJSON(): Promise<string> {
  const lures = await getAllOwnedLures()
  return JSON.stringify({
    exportedAt: new Date().toISOString(),
    version: 1,
    tackle: lures.map(l => ({ ...l, photoDataUrl: l.photoDataUrl ? '[photo]' : undefined })),
  }, null, 2)
}

export async function exportCatchesCSV(): Promise<string> {
  const events = await getLandedFish()
  const headers = [
    'Date', 'Time', 'Session ID', 'Species', 'Weight (lbs)',
    'Length (in)', 'Lure Type', 'Lure Weight', 'Lure Color', 'Custom Pour',
    'Water Depth', 'Water Column', 'Retrieve Style', 'Structure',
    'Latitude', 'Longitude', 'Notes',
  ]
  const rows = events.map(e => [
    new Date(e.timestamp).toLocaleDateString(),
    new Date(e.timestamp).toLocaleTimeString(),
    e.sessionId,
    e.species,
    (e.weightLbs + e.weightOz / 16).toFixed(1),
    e.lengthInches,
    e.lureType,
    e.lureWeight,
    `"${e.lureColor}"`,
    e.customPour ? 'Yes' : 'No',
    e.waterDepth ?? '',
    e.waterColumn ?? '',
    e.retrieveStyle ?? '',
    e.structure ?? '',
    e.coords?.lat ?? '',
    e.coords?.lng ?? '',
    `"${(e.notes ?? '').replace(/"/g, '""')}"`,
  ])
  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
}

// ─── Entry count (for restore conflict detection) ──────────────────────────────

export async function getEntryCount(): Promise<{ sessions: number; events: number; total: number }> {
  const db = await getDB()
  const [sessions, events] = await Promise.all([db.count('sessions'), db.count('events')])
  return { sessions, events, total: sessions + events }
}

// ─── Full replace (used by restore — clears everything then imports) ────────────

export async function replaceAllData(data: {
  sessions?: Session[]; events?: CatchEvent[]
  ownedLures?: OwnedLure[]; rodSetups?: RodSetup[]
  debriefs?: DebriefConversation[]
}): Promise<{ sessions: number; events: number }> {
  const db = await getDB()
  await Promise.all([
    db.clear('sessions'),
    db.clear('events'),
    db.clear('debriefs'),
    db.clear('ownedLures'),
    db.clear('rodSetups'),
  ])
  let sc = 0, ec = 0
  for (const s of data.sessions   ?? []) { await db.put('sessions', s); sc++ }
  for (const e of data.events     ?? []) { await db.put('events',   e); ec++ }
  for (const d of data.debriefs   ?? []) await db.put('debriefs', d)
  const now = Date.now()
  for (const l of data.ownedLures ?? []) {
    if ((l as OwnedLure & { photoDataUrl?: string }).photoDataUrl !== '[photo]')
      await db.put('ownedLures', { ...l, addedAt: l.addedAt ?? now })
  }
  for (const r of data.rodSetups  ?? []) {
    if ((r as RodSetup & { photoDataUrl?: string }).photoDataUrl !== '[photo]')
      await db.put('rodSetups', { ...r, addedAt: r.addedAt ?? now })
  }
  return { sessions: sc, events: ec }
}

// ─── Merge-import from backup ──────────────────────────────────────────────────
export async function bulkImportData(data: {
  sessions?: Session[]; events?: CatchEvent[]
  ownedLures?: OwnedLure[]; rodSetups?: RodSetup[]
  debriefs?: DebriefConversation[]
}): Promise<{ sessions: number; events: number }> {
  const db = await getDB()
  let sc = 0, ec = 0
  for (const s of data.sessions ?? [])   { await db.put('sessions', s); sc++ }
  for (const e of data.events   ?? [])   { await db.put('events',   e); ec++ }
  const now = Date.now()
  for (const l of data.ownedLures ?? []) {
    if ((l as OwnedLure & { photoDataUrl?: string }).photoDataUrl !== '[photo]')
      await db.put('ownedLures', { ...l, addedAt: l.addedAt ?? now })
  }
  for (const r of data.rodSetups  ?? []) {
    if ((r as RodSetup & { photoDataUrl?: string }).photoDataUrl !== '[photo]')
      await db.put('rodSetups', { ...r, addedAt: r.addedAt ?? now })
  }
  for (const d of data.debriefs ?? []) {
    await db.put('debriefs', d)
  }
  return { sessions: sc, events: ec }
}
