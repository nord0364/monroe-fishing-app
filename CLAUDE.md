# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Lake Monroe Bass Tracker** — A progressive web app (PWA) for largemouth bass fishing pattern tracking and AI-powered fishing guidance on Lake Monroe, Indiana. The app runs on phones, tablets, and desktops, uses browser-local storage (IndexedDB) for offline-first data persistence, and integrates the Anthropic Claude API for AI briefings and guides.

## Key Technologies

- **Framework**: React 19 with TypeScript
- **Build Tool**: Vite 7
- **Styling**: Tailwind CSS 4 with custom adaptive theme system
- **Maps**: Leaflet with OpenStreetMap tiles
- **Charts**: Recharts
- **Database**: IndexedDB via `idb` library (offline-first)
- **PWA**: vite-plugin-pwa (service workers, offline caching, installability)
- **AI**: Anthropic Claude SDK (browser-based API calls)
- **Google Drive Sync**: Google Identity Services + Google Drive API
- **Weather Data**: Open-Meteo, National Weather Service, NOAA USGS water data
- **Moon Data**: Sunrise/sunset via API, moon phases computed locally

## Build & Development Commands

```bash
npm run dev      # Start Vite dev server (HMR enabled) on http://localhost:5173/monroe-fishing-app/
npm run build    # TypeScript check + Vite production build → dist/
npm run lint     # ESLint check (no auto-fix)
npm run preview  # Preview production build locally
```

**Note**: The `base` in vite.config.ts is set to `/monroe-fishing-app/`, so local dev runs at a subpath. GitHub Pages deployment uses this same base path.

## Architecture

### Entry Point & Theme System

- **src/main.tsx**: React app mount
- **src/App.tsx**: Main app component with global state (activeSession, settings, modal overlays)
- **src/index.css**: Tailwind imports + 4 theme definitions:
  - `adaptive` (default) — time-aware dark mode that shifts across 4 phases (predawn, golden, daytime, night) tied to sunrise/sunset
  - `dark` — fixed polished dark theme
  - `light` — bright outdoor use theme
  - `auto` — system preference (dark/light)
  
Theme applied via `data-theme` attribute on `<html>` element and `--base-font-size` CSS variable (9-step slider: 14–24px).

### Core Data Model (src/types/index.ts)

Comprehensive TypeScript types for:
- **Sessions**: Environmental conditions (weather, water, barometric), metadata, AI briefing
- **Catch Events**: `LandedFish` (species, weight, lure, depth, structure, GPS), `QualityStrike` (missed), `FollowNoStrike`, `VisualSighting`, `GuideEvent`
- **Environmental Conditions**: Air/water temp, wind, barometric trend, moon phase, sunrise/sunset, water clarity
- **Tackle Inventory**: `OwnedLure` (type, weight, color, brand, origin, photos), `Rod` (power, action, line, lure range), `RodSetup`, `SoftPlastic` (body style, rigging, condition)
- **AI Responses**: `AIBriefing` (rod-organized or flat format), `RodBriefing` (primary/backup setups with reasoning)
- **Personal Bests**: Species-indexed catch records, user-pinnable overrides
- **Settings**: Anthropic API key, color theme, font size, Google Drive sync state

### Component Structure (src/components/)

- **layout/** — Bottom navigation, quick-select lure picker, speak button
- **briefing/** — `PreSessionBriefing` (generates AI briefing before trip), `BriefingView` (displays after trip), `InSessionGuide` (AI chat during active session)
- **logger/** — `SessionLogger` (log catch events, pause/end session)
- **patterns/** — Trophy room, lure performance, depth/structure, time windows, catch map (Leaflet), post-session analysis
- **tackle/** — Inventory management UI for owned lures, hooks, spoons, soft plastics (with AI photo ID)
- **gear/** — Rod and lure catalogs
- **settings/** — App settings, data export/import, historical catch upload, Google Drive sync toggle

### Database (src/db/database.ts)

IndexedDB schema (version 6) with object stores:
- `sessions` (by date index)
- `events` (by sessionId, timestamp)
- `settings` (single global config)
- `ownedLures` (by addedAt)
- `rods` (by addedAt)
- `softPlastics` (by addedAt)
- `debriefs` (post-session AI chat conversations, by sessionId and updatedAt)
- `personalBests` (by species)
- `guideEntries` (standalone home-screen AI responses)
- `pendingApiCalls` (retry queue, internal)

**Key Functions**:
- `getSettings()` / `saveSettings()`
- `addSession()` / `getSession()` / `updateSession()`
- `addEvent()` / `getEventsBySession()`
- `exportAllDataFull()` — Full JSON export for Google Drive sync
- `runTackleStoreMigration()` / `runOwnedLureDataMigration()` — Data schema upgrades

### API Integrations (src/api/)

- **claude.ts** — Core AI: `generatePreSessionBriefing()`, `analyzeSession()`, `identifySoftPlastic()`, rod-lure matching, inventory-aware recommendations
- **googleDrive.ts** — OAuth2 sign-in, sync sessions/events/settings to Drive, handle retries and conflicts
- **guideAI.ts** — In-session chatbot, multi-turn conversations with session context
- **weather.ts** — Fetch air temp, wind, sky condition from National Weather Service or Open-Meteo
- **water.ts** — USGS water level & temp, Open-Meteo fallback
- **moon.ts** — Sunrise/sunset (cached daily), moon phase, illumination, moonrise/moonset

### AI / Pattern Memory (src/ai/)

- **patternMemory.ts** — Extracts successful patterns from catch history (species, lure, depth, structure, time, season) for use in briefing prompts

### Utilities (src/utils/)

- **speech.ts** — Text-to-speech via Web Speech API (browser native, not API-dependent)
- **tacklePhotoSync.ts** — Queue and retry logic for uploading tackle photos to Google Drive
- **useGeolocation.ts** / **useSpeech.ts** — React hooks for GPS and voice input

### Constants & Data (src/constants/, src/data/)

- **constants/index.ts** — Enum-like arrays for lure types, water depths, retrieve styles, structure types, soft plastic styles/colors, species, launch sites
- **data/launchPointContext.ts** — Detailed metadata for 8 Lake Monroe launch sites (max range, structures, depths, seasonal notes)

## Key Development Notes

### Offline-First Design

- **All data lives in IndexedDB**, not a server. Sessions and events are persisted locally.
- **Google Drive sync is opt-in** via OAuth2 and happens in background post-session.
- PWA service workers cache map tiles and API responses (Open-Meteo, USGS, NOAA) for offline resilience.

### API Key Management

- **Anthropic API key** stored in IndexedDB (browser-local only, user enters it in Settings)
- **Never transmitted to any backend** — all Claude API calls happen client-side via `@anthropic-ai/sdk` with `dangerouslyAllowBrowser: true`
- **Google Drive OAuth2** uses app's registered client ID (defaults to hardcoded `DEFAULT_CLIENT_ID`, user can override in Settings)

### Session & Active Session State

- **Active session** persisted in `sessionStorage` (lost on page close) and IndexedDB (survives refresh)
- **Session lifecycle**: Start → Log events → End → PostSessionReview (shows catch stats & optional AI analysis)
- **Guide overlay** available during active session (in-session AI chat) and post-session (full analysis)

### Photo Upload & Tackle Inventory

- Tackle photos captured as canvas DataURLs (`photoDataUrl`)
- Photos with `photoPendingUpload: true` queued for Drive upload after sync
- `photoUploadAttempts` counter prevents infinite retries (max 3)
- Successful uploads store `drivePhotoFileId` for future reference

### Environmental Data Fetching

- **Weather** — Fetched real-time before pre-session briefing, cached 30 min
- **Water data** — USGS gauge level/temp, cached 1 hour
- **Moon/sunrise/sunset** — Sunrise/sunset cached daily, moon phase computed
- **All cache expiry logic** in API modules; pre-briefing component triggers fresh fetch if stale

### Rod-Lure Matching Algorithm

In `claude.ts`, `buildRodInventoryBlock()`:
1. Filters active lures (non-retired, category != 'hook')
2. Checks each lure's weight against rod's min/max range (±1/16 oz tolerance)
3. Maps compatible soft plastic trailers per lure type (e.g., jigs → craws/creatures)
4. Passes rod compatibility block to Claude prompt for inventory-aware recommendations

### AI Briefing Formats

**Old format** (pre rod-selection):
```typescript
AIBriefing {
  recommendations: BriefingRecommendation[]  // flat list with rank, lure, weight, color, retrieve, depth, confidence
  narrative: string
}
```

**New format** (when user selects rods before session):
```typescript
AIBriefing {
  rodSetups: RodBriefing[]  // organized by rod nickname, includes primary + backup setup
  narrative: string
}
```

Both formats include `conditionsSummary`, `startingArea`, `primaryPattern`, `backupPattern` when available.

### Testing & Linting

- **No unit test framework** configured (Jest/Vitest not present)
- **ESLint** (`eslint.config.js`) includes:
  - `@eslint/js` base + `typescript-eslint` recommended
  - `eslint-plugin-react-hooks` + `eslint-plugin-react-refresh`
  - `jsx: "react-jsx"` (new JSX transform, no React import needed per file)
- **TypeScript** strict mode enabled, no unused locals/params allowed
- Run `npm run lint` to check; ESLint config has no auto-fix rules, so fixes are manual

### PWA Manifest & Deployment

- **Manifest** defined in `vite.config.ts`:
  - App name: "Lake Monroe Bass Tracker", short name "BassTracker"
  - Display: standalone (full screen on mobile)
  - Start URL: `/monroe-fishing-app/`
  - Icons: 192x192 and 512x512 (in public/)
- **GitHub Pages Deployment**: `.github/workflows/deploy.yml` triggers on push to main, runs `npm run build`, uploads dist/ artifact

## Common Development Tasks

### Adding a New Catch Event Type

1. Define type in `src/types/index.ts` (extends `CatchEvent` union)
2. Add UI form in `src/components/logger/` 
3. Update `addEvent()` in `src/db/database.ts` to accept new type
4. Update `exportAllDataFull()` if new fields need sync

### Modifying AI Briefing Logic

1. **Pre-session**: Edit `generatePreSessionBriefing()` in `src/api/claude.ts`
   - Adjust system prompt, catch history context, inventory matching
2. **Post-session**: Edit `analyzeSession()` in `src/api/claude.ts`
3. **In-session chat**: Edit message handling in `src/components/briefing/InSessionGuide.tsx`

### Adding a New Theme Phase

1. Add new phase name (e.g., `adaptive-dusk`) to `src/index.css` CSS variable definitions
2. Compute phase logic in `App.tsx`, `getAdaptivePhase()` function (based on sunrise/sunset times)
3. Set `document.documentElement.setAttribute('data-theme', phaseString)` in `applyTheme()`

### Integrating a New External API

1. Create module in `src/api/` (e.g., `src/api/myService.ts`)
2. Define fetch + caching logic, error handling, return typed response
3. Call from component or App.tsx, trigger refresh on stale check
4. Add PWA cache rule in `vite.config.ts` (VitePWA runtimeCaching) if needed for offline support
5. Document cache expiry TTL in comments

### Debugging IndexedDB

Browser DevTools → Application → IndexedDB → fishing-tracker → browse stores. Or use console:
```javascript
const db = await indexedDB.open('fishing-tracker', 6);
const tx = db.transaction('sessions');
tx.objectStore('sessions').getAll().onsuccess = (e) => console.log(e.target.result);
```

## Troubleshooting

### Pre-session briefing fails to generate

1. Check Anthropic API key in Settings (valid, not expired)
2. Check network — weather/water APIs may be down (fallbacks in place)
3. Check browser console for error details
4. Verify `conditions` object has required fields (may need manual entry if auto-fetch failed)

### Photos don't upload to Google Drive

1. Ensure user is signed in to Google (Settings toggle)
2. Check `photoPendingUpload` flag in tackle inventory
3. Look for `photoUploadAttempts` > 3 (will skip retrying)
4. Check browser console for Drive API errors (rate limit, permissions)

### PWA not updating on deploy

Service worker may be cached. Users can manually refresh or uninstall/reinstall app. Or force cache bust in vite.config.ts if needed.

### Dates appear in wrong timezone

App uses browser's local timezone throughout. All timestamps are Unix milliseconds (timezone-agnostic). Rendering happens via `new Date(timestamp).toLocaleDateString()` which respects browser locale.

