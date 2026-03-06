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
  waterColumn?: WaterColumn
  lureType: LureType
  lureWeight: LureWeight
  lureColor: string
  customPour: boolean
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

export type CatchEvent = LandedFish | QualityStrike | FollowNoStrike | VisualSighting

// ─── Session ─────────────────────────────────────────────────────────────────

export interface EnvironmentalConditions {
  airTempF?: number
  windSpeedMph?: number
  windDirection?: string
  skyCondition?: string
  baroPressureInHg?: number
  baroTrend?: BaroTrend
  waterTempF?: number
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
  // Set when planning ahead (briefing generated before session date)
  plannedDate?: number    // ms timestamp of the planned session date
  plannedWindow?: string  // e.g. "6:00 AM – 11:00 AM"
}

// ─── Settings ────────────────────────────────────────────────────────────────

export type ColorTheme = 'auto' | 'midnight' | 'dawn' | 'daylight' | 'dusk' | 'white'
export type FontSize = 'small' | 'normal' | 'large'

export interface AppSettings {
  anthropicApiKey: string
  sizeThresholdLbs: number
  customLureTypes: string[]
  onboardingDone: boolean
  colorTheme?: ColorTheme
  fontSize?: FontSize
}

// ─── Gear Catalog ─────────────────────────────────────────────────────────────

export interface OwnedLure {
  id: string
  lureType: string
  weight: string
  color: string
  brand?: string
  notes?: string
  photoDataUrl?: string
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
