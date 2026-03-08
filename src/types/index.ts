// ─── Core Types ──────────────────────────────────────────────────────────────

export type Species =
  | 'Largemouth Bass'
  | 'Smallmouth Bass'
  | 'Crappie'
  | 'Channel Catfish'
  | 'Flathead Catfish'
  | 'Bluegill'
  | 'Walleye'
  | 'White Bass/Drum'
  | 'Other'

export type WaterDepth =
  | 'Under 2 ft'
  | '2 to 4 ft'
  | '4 to 7 ft'
  | '7 to 12 ft'
  | '12 to 18 ft'
  | '18 ft plus'

export type WaterColumn =
  | 'Surface'
  | 'Subsurface top 2 ft'
  | 'Mid-column'
  | 'Near bottom'
  | 'Bottom contact'

export type LureType =
  | 'Spinnerbait'
  | 'Swim Jig'
  | 'Chatterbait'
  | 'Football Jig'
  | 'Flipping Jig'
  | 'Wacky Rig'
  | 'Texas Rig'
  | 'Buzzbait'
  | 'Swimbait'
  | 'Crankbait'
  | 'Topwater'
  | 'Drop Shot'
  | 'Spoon'
  | 'Other'
  | string

export type LureWeight =
  | 'Weightless'
  | '3/16 oz'
  | '1/4 oz'
  | '3/8 oz'
  | '1/2 oz'
  | '3/4 oz'
  | 'Other'

export type RetrieveStyle =
  | 'Slow roll'
  | 'Steady'
  | 'Burn'
  | 'Hop'
  | 'Drag'
  | 'Swim'
  | 'Pop'
  | 'Walk the dog'
  | 'Other'

export type StructureCover =
  | 'Open water'
  | 'Dock'
  | 'Laydown'
  | 'Brush pile'
  | 'Rock'
  | 'Weed edge'
  | 'Point'
  | 'Creek channel'
  | 'Flat'
  | 'Other'

export type WaterClarity = 'Clear' | 'Stained' | 'Muddy'
export type BaroTrend = 'Rising' | 'Falling' | 'Steady'
export type WaterLevelVsNormal = 'High' | 'Normal' | 'Low'
export type EventType = 'Landed Fish' | 'Quality Strike — Missed' | 'Follow — Did Not Strike' | 'Visual Sighting'
export type EstimatedSize = 'Small' | 'Medium' | 'Large' | 'Toad'

export type LaunchSite =
  | 'Cartop Launch'
  | "Moore's Creek"
  | 'Pine Grove'
  | 'Cut Right Marina'
  | "Allen's Creek"
  | 'Paynetown SRA'
  | 'Fairfax SRA'
  | 'Other'

// ─── Tackle Types ─────────────────────────────────────────────────────────────

export type TackleCategory = 'lure' | 'hook' | 'spoon'

export type TackleOrigin = 'Hand Poured by Me' | 'Homemade — Other' | 'Store Bought'

export type TackleCondition = 'New' | 'Good' | 'Retired'

export type HookStyle = 'Worm Hook' | 'EWG' | 'Wacky' | 'Ned' | 'Drop Shot' | 'Treble' | 'Other'

export type SpoonStyle = 'Casting' | 'Trolling' | 'Jigging'

// ─── Catch Entry ─────────────────────────────────────────────────────────────

export interface GPSCoords {
  lat: number
  lng: number
  accuracy?: number
  manual?: boolean
}

export interface LandedFish {
  type: 'Landed Fish'
  id: string
  sessionId: string
  timestamp: number
  coords?: GPSCoords
  species: Species
  weightLbs: number
  weightOz: number
  lengthInches: number
  waterDepth?: WaterDepth
  waterColumn?: WaterColumn
  lureType: LureType
  lureWeight: LureWeight
  lureColor: string
  customPour: boolean
  homemade?: boolean
  retrieveStyle?: RetrieveStyle
  structure?: StructureCover
  photoDataUrl?: string
  notes?: string
  isHistorical?: boolean
  historicalDate?: number
}

export interface QualityStrike {
  type: 'Quality Strike — Missed'
  id: string
  sessionId: string
  timestamp: number
  coords?: GPSCoords
  lureType: LureType
  waterDepth?: WaterDepth
  waterColumn?: WaterColumn
  notes?: string
  isHistorical?: boolean
  historicalDate?: number
}

export interface FollowNoStrike {
  type: 'Follow — Did Not Strike'
  id: string
  sessionId: string
  timestamp: number
  coords?: GPSCoords
  lureType: LureType
  estimatedSize: EstimatedSize
  notes?: string
  isHistorical?: boolean
  historicalDate?: number
}

export interface VisualSighting {
  type: 'Visual Sighting'
  id: string
  sessionId: string
  timestamp: number
  coords?: GPSCoords
  estimatedSize: EstimatedSize
  behavior?: string
  notes?: string
  isHistorical?: boolean
  historicalDate?: number
}

export interface GuideEvent {
  type: 'Guide Summary' | 'Guide Image Analysis'
  id: string
  sessionId: string
  timestamp: number
  coords?: GPSCoords
  content: string
}

export type CatchEvent = LandedFish | QualityStrike | FollowNoStrike | VisualSighting | GuideEvent

// ─── Standalone Guide (home screen history) ───────────────────────────────────

export interface StandaloneGuideEntry {
  id: string
  createdAt: number
  summary: string
}

// ─── Session ─────────────────────────────────────────────────────────────────

export interface EnvironmentalConditions {
  airTempF?: number
  windSpeedMph?: number
  windDirection?: string
  skyCondition?: string
  baroPressureInHg?: number
  baroTrend?: BaroTrend
  baroTrendMb?: number       // numeric delta in mb (positive = rising)
  dewpointF?: number
  skyCoverPct?: number       // 0–100
  precipProbPct?: number     // 0–100
  weatherUpdatedAt?: number  // timestamp of last successful weather fetch
  waterTempF?: number
  waterTempSource?: string   // e.g. 'USGS gauge' | 'Open-Meteo estimate' | 'cached'
  waterDataAge?: number      // ms since cached value was fetched (present when serving cache)
  waterLevelFt?: number
  waterLevelVsNormal?: WaterLevelVsNormal
  waterClarity?: WaterClarity
  moonPhase?: string
  moonIlluminationPct?: number
  moonrise?: string
  moonset?: string
  sunrise?: string
  sunset?: string
}

export interface Session {
  id: string
  date: number
  launchSite: LaunchSite | string
  startTime: number
  endTime?: number
  conditions: EnvironmentalConditions
  notes?: string
  aiBriefing?: string
  aiBriefingStructured?: AIBriefing
  plannedDate?: number
  plannedWindow?: string
  analysisummary?: string  // 4–8 sentence post-session analysis, saved by Guide
}

// ─── Debrief ─────────────────────────────────────────────────────────────────

export interface DebriefMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

export interface DebriefConversation {
  id: string
  sessionId: string
  sessionDate: number        // For accordion grouping
  sessionLaunchSite: string  // For display
  messages: DebriefMessage[]
  createdAt: number
  updatedAt: number
}

// ─── Settings ────────────────────────────────────────────────────────────────

export type ColorTheme = 'adaptive' | 'dark' | 'light' | 'auto'
export type FontSize = 'small' | 'normal' | 'large'  // legacy — kept for migration

export interface SunriseSunsetCache {
  sunrise: string   // "6:15 AM"
  sunset: string    // "8:20 PM"
  date: string      // "2026-03-07"
  fetchedAt: number
}

export interface AppSettings {
  anthropicApiKey: string
  sizeThresholdLbs: number
  customLureTypes: string[]
  onboardingDone: boolean
  colorTheme?: ColorTheme
  fontSize?: FontSize       // legacy — migrated to fontSizeStep on load
  fontSizeStep?: number     // 0–8 index into [14,15,16,17,18,19,20,22,24], default 3 (17px)
  sunriseSunsetCache?: SunriseSunsetCache
  googleClientId?: string  // optional override; app ships with a working default
}

// ─── Gear Catalog ─────────────────────────────────────────────────────────────

export interface OwnedLure {
  id: string
  category?: TackleCategory      // undefined = 'lure' for legacy records
  // Lure + Spoon shared fields
  lureType?: string              // required for lures/spoons; undefined for hooks
  subType?: string               // e.g. "Hard" for swimbait, "Weighted" for wacky rig
  weight?: string                // legacy field kept; optional for hooks
  weightNA?: boolean             // weight not applicable (e.g. topwater frog)
  color: string                  // primary color (required, legacy compat)
  secondaryColor?: string
  bladeConfig?: string           // for spinnerbaits and chatterbaits
  brand?: string
  origin?: TackleOrigin          // 3-way: Hand Poured by Me | Homemade — Other | Store Bought
  condition?: TackleCondition
  // Hook-specific fields
  hookStyle?: HookStyle
  hookSize?: string              // e.g. "3/0", "5/0"
  quantity?: number
  // Spoon-specific fields
  spoonStyle?: SpoonStyle
  // Shared
  photoDataUrl?: string
  notes?: string
  addedAt: number
}

export interface RodSetup {
  id: string
  name: string
  rodPower?: 'Heavy' | 'Medium-Heavy' | 'Medium' | 'Medium-Light' | 'Light'
  rodAction?: 'Fast' | 'Moderate-Fast' | 'Moderate' | 'Slow'
  rodLength?: string
  lineType?: 'Fluorocarbon' | 'Monofilament' | 'Braid' | 'Braid + Fluoro Leader'
  lineWeightLbs?: number
  reelBrand?: string
  notes?: string
  photoDataUrl?: string
  addedAt: number
}

// ─── Personal Bests ───────────────────────────────────────────────────────────

export interface PersonalBestPin {
  id: string
  species: Species
  sessionId: string
  eventId: string
  weightLbs: number
  weightOz: number
  lengthInches?: number
  notes?: string           // "caught by length, no scale"
  isPinned: boolean        // user-designated override
  pinnedAt?: number
}

// ─── AI Response ─────────────────────────────────────────────────────────────

export interface AIBriefing {
  recommendations: BriefingRecommendation[]
  conditionsSummary?: string
  startingArea?: string
  primaryPattern?: string
  backupPattern?: string
  narrative: string
}

export interface BriefingRecommendation {
  rank: number
  lureType: string
  weight: string
  color: string
  retrieveStyle: string
  depthBand: string
  waterColumn: string
  confidence: 'High' | 'Medium' | 'Low'
  reasoning: string
  suggestedRod?: string
  inInventory?: boolean
}
