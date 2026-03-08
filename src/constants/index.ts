import type { LaunchSite, LureType, Species, WaterColumn, WaterDepth, LureWeight, RetrieveStyle, StructureCover } from '../types'

export const LAKE_MONROE_COORDS = { lat: 39.0117, lng: -86.5083 }

export const USGS_STATION = '03366500'

// ─── Font size slider ─────────────────────────────────────────────────────────
export const FONT_SIZE_STEPS = [14, 15, 16, 17, 18, 19, 20, 22, 24]
export const DEFAULT_FONT_STEP = 3  // 17px

export const LAUNCH_SITES: (LaunchSite | string)[] = [
  "Cartop Launch",
  "Moore's Creek",
  "Pine Grove",
  "Cut Right Marina",
  "Allen's Creek",
  "Paynetown SRA",
  "Fairfax SRA",
  "Other",
]

export const SPECIES: Species[] = [
  'Largemouth Bass',
  'Smallmouth Bass',
  'Crappie',
  'Channel Catfish',
  'Flathead Catfish',
  'Bluegill',
  'Walleye',
  'White Bass/Drum',
  'Other',
]

export const WATER_DEPTHS: WaterDepth[] = [
  'Under 2 ft',
  '2 to 4 ft',
  '4 to 7 ft',
  '7 to 12 ft',
  '12 to 18 ft',
  '18 ft plus',
]

export const WATER_COLUMNS: WaterColumn[] = [
  'Surface',
  'Subsurface top 2 ft',
  'Mid-column',
  'Near bottom',
  'Bottom contact',
]

export const DEFAULT_LURE_TYPES: LureType[] = [
  'Spinnerbait',
  'Swim Jig',
  'Chatterbait',
  'Football Jig',
  'Flipping Jig',
  'Wacky Rig',
  'Texas Rig',
  'Buzzbait',
  'Swimbait',
  'Crankbait',
  'Topwater',
  'Drop Shot',
  'Spoon',
  'Other',
]

export const LURE_WEIGHTS: LureWeight[] = [
  'Weightless',
  '3/16 oz',
  '1/4 oz',
  '3/8 oz',
  '1/2 oz',
  '3/4 oz',
  'Other',
]

export const RETRIEVE_STYLES: RetrieveStyle[] = [
  'Slow roll',
  'Steady',
  'Burn',
  'Hop',
  'Drag',
  'Swim',
  'Pop',
  'Walk the dog',
  'Other',
]

export const STRUCTURE_TYPES: StructureCover[] = [
  'Open water',
  'Dock',
  'Laydown',
  'Brush pile',
  'Rock',
  'Weed edge',
  'Point',
  'Creek channel',
  'Flat',
  'Other',
]
