// ─── Launch Point Context ─────────────────────────────────────────────────────
// Per-launch-site geographic context for Scout AI briefings.
// detailedSummary fields are placeholders — replace with Navionics survey data.

export interface LaunchPointContext {
  launchSiteId: string
  name: string
  maxRecommendedRange: number   // nautical miles from launch
  structures: string            // key structures within range
  depths: string                // depth profile notes
  seasonalNotes: string         // seasonal pattern notes
  detailedSummary: string       // TODO: REPLACE WITH NAVIONICS SUMMARY
}

export const LAUNCH_POINT_CONTEXTS: LaunchPointContext[] = [
  {
  launchSiteId: "cartop-launch",
  name: "Cartop Launch",
  maxRecommendedRange: 1.0,
  floodLaunchNote: "Standard launch from west bank. Monitor lake level — upper arm shallows on west side become inaccessible at low pool.",

  structures: [
    "Submerged road bed crossing the arm east-west at approximately 0.1 NM south — visible as linear feature at 10-13 ft, confirmed hard bottom by sonar overlay",
    "Three submerged bridge remnants between 0.4 and 0.6 NM south at 10-14 ft depth, sitting proud of surrounding 13-16 ft bottom, confirmed hard structure by sonar",
    "Creek Bed — Bob Pate Hollow entering from the east at 0.7-0.8 NM, defined channel dropping from shallow east bank flats into 15-20 ft",
    "Creek Bed — Butcher Branch entering from the west near upper arm just south of launch, very shallow (1-2 ft) transitioning to 5-8 ft at mouth",
    "North-south road bed running parallel to west shoreline in upper-mid arm at 16 ft",
    "Two isolated depth humps on east side of mid-arm channel, cresting at 11 ft and 13 ft above a 15-17 ft floor at approximately 0.4 NM south",
    "Steep isolated hump rising to 21 ft adjacent to the lower bridge remnant at 0.6 NM — tight contours, steep-sided",
    "Main creek bed running south through center of lower arm dropping to 19-23 ft in the southern section"
  ],

  depths: [
    "Upper arm near Cartop Launch: west bank 1-3 ft shallow shelf, drops to 8-12 ft in channel within 100 ft of shore",
    "Butcher Branch cove: 1-2 ft at back, 5-8 ft at mouth",
    "Mid-arm main channel: 12-16 ft standard, 17-18 ft in deeper cuts",
    "Road bed crossing at 0.1 NM: 10-13 ft over feature, 15-17 ft on south drop-off",
    "Bridge remnants 0.4-0.6 NM: structure at 10-14 ft, surrounding water 13-16 ft",
    "Isolated humps: crests 11-13 ft rising from 15-17 ft floor, 4-6 ft of relief",
    "Bob Pate Hollow creek mouth: surrounding flats 7-13 ft, channel 15-20 ft, east bank shallows 1-5 ft",
    "Lower arm approaching 1.0 NM: channel deepens to 19-23 ft, west bank steep from 4 ft to 18 ft in short distance"
  ],

  bottomComposition: [
    "Road bed and bridge remnants: confirmed hard bottom by sonar — gravel, compacted fill, concrete debris",
    "Main channel floor: mixed, softer in deepest sections, harder on and near structural features",
    "West bank upper arm slope: harder bottom near shoreline in sections per sonar, softer in deeper transition zones",
    "Creek channel floors: softer mud and silt in channel centers, harder at channel edges and lips",
    "Isolated humps: sonar indicates harder composition relative to surrounding floor"
  ],

  keySpots: [
    {
      name: "Submerged Road Bed Crossing",
      distance: "0.1 NM south of Cartop Launch",
      bearing: "155°",
      depth: "10-13 ft over feature, 15-17 ft south side",
      notes: "Hard linear structure crossing the full arm width. Fish the south-facing drop-off edge and any irregularities along the road bed. One of the closest high-percentage spots from Cartop — reachable within a short paddle. Work a jig or football jig along the edge and pause on the drop."
    },
    {
      name: "Shallow West Bank — Upper Arm",
      distance: "0.1-0.2 NM south, west bank",
      bearing: "180°",
      depth: "1-3 ft at bank, 8-12 ft channel edge",
      notes: "Labeled shallow area near launch. Primary spring value for pre-spawn and spawning fish. In warm months fish the bank-to-channel transition early morning with chatterbait or spinnerbait on the drop. Too exposed and shallow for midday summer fishing."
    },
    {
      name: "Butcher Branch Cove",
      distance: "0.15-0.25 NM south, west bank",
      bearing: "190-200°",
      depth: "1-2 ft back of cove, 5-8 ft at mouth",
      notes: "Very shallow west bank cove. Primary spawning zone in spring when water hits 62-68°F. Approach from outside and cast in — do not paddle into the cove. Texas rig or wacky rig worked slowly along the bottom transitions at the mouth."
    },
    {
      name: "Northern Bridge Remnant",
      distance: "0.4 NM south",
      bearing: "161°",
      depth: "11-12 ft on structure, 13-16 ft surrounding",
      notes: "First of three bridge remnants. Hard debris field. Fish all angles — the up-current face, the edges, and the drop to the east. Jig, football jig, or chatterbait worked tight to the structure."
    },
    {
      name: "Southern Bridge Remnant Pair",
      distance: "0.45-0.5 NM south",
      bearing: "161-164°",
      depth: "10-11 ft on structure, surrounding 13-16 ft",
      notes: "Two bridge remnants in close proximity — fish as a system. The channel between them and the east-side drop are worth working thoroughly. Hard bottom confirmed. The 21 ft isolated hump immediately adjacent to the lower bridge adds a secondary deep-water target."
    },
    {
      name: "Mid-Arm Isolated Humps",
      distance: "0.4-0.5 NM south, east side of channel",
      bearing: "166°",
      depth: "Crests at 11 ft and 13 ft, floor 15-17 ft",
      notes: "Two distinct rounded high spots with 4-6 ft of relief. The 11 ft hump is the more prominent. Shade relief and sonar confirm harder bottom. Best football jig target in the arm — fish the crest, the up-current side, and the transition to deeper water. These humps hold fish year-round."
    },
    {
      name: "Bob Pate Hollow Creek Mouth",
      distance: "0.7-0.8 NM south, east bank",
      bearing: "161°",
      depth: "7-13 ft on surrounding flats, 15-20 ft in creek channel",
      notes: "Defined creek channel entering from the east. The channel lip where it meets the main arm is the primary target — bass stage on the depth change. East bank shallow flats (1-5 ft) are productive in spring. Creek channel at 15-20 ft holds fish in summer heat and cold fronts. Swim jig or spinnerbait along the flat-to-channel edge, jig in the channel itself."
    },
    {
      name: "West Bank Road Bed",
      distance: "0.2-0.3 NM south, west bank",
      bearing: "180°",
      depth: "16 ft",
      notes: "North-south road bed paralleling west shoreline. Hard bottom. Secondary target — worth working on the way to or from the bridge cluster. Jig dragged slowly along the feature."
    },
    {
      name: "Southeast Shallow Area",
      distance: "0.8-1.0 NM, southeast as arm opens",
      bearing: "155-160°",
      depth: "1-7 ft, irregular bottom",
      notes: "Labeled shallow area on the southeast side as the arm begins to open toward the main lake. Irregular contours with pockets of slightly deeper water. Spring spawning area. In low light periods, topwater or buzzbait worked along the shallow edges."
    }
  ],

  seasonalNotes: [
    "Spring pre-spawn (water 50-62°F): bass stage on road bed crossing and bridge remnants in 10-16 ft. Isolated humps are excellent staging areas. Butcher Branch cove mouth activates as fish begin pushing shallow. Spinnerbait and swim jig along the depth transitions.",
    "Spawn (water 62-68°F): fish push into Butcher Branch cove, the west bank shallows near launch, and the east bank flats near Bob Pate Hollow. Southeast shallow area at arm opening is also active. Wacky rig and Texas rig.",
    "Post-spawn and summer: fish return to road bed, bridge remnants, and isolated humps. Bob Pate Hollow creek channel at 15-20 ft holds fish during heat. Predawn topwater on the shallow west bank before sun hits water.",
    "Fall: shad movement pulls bass up the arm. Upper arm near Cartop becomes productive again. Bridge remnants and road bed remain consistent. Watch for surface activity near cove mouths in low light.",
    "Predawn and early morning: shallow west bank from launch south to road bed is the priority in warm months. Chatterbait, spinnerbait, buzzbait worked fast along the bank before light, then transition to jigs on structure as sun rises."
  ],

  detailedSummary: "Cartop Launch sits on the west bank of a narrow arm that runs approximately 1.0 NM south-southeast before opening into the main lake body. The arm has a defined main channel at 12-18 ft flanked by steep banks, particularly the west side. The launch itself is adjacent to a labeled shallow area on the west bank (1-3 ft) and the very shallow Butcher Branch cove (1-2 ft) which is the primary spring spawning zone within immediate reach. The first major structure is a submerged road bed crossing the full arm width at 0.1 NM south — hard bottom at 10-13 ft with a drop to 15-17 ft on its south face, reachable within minutes of launch. Between 0.4 and 0.6 NM south sit three submerged bridge remnants confirmed as hard structure by sonar, at 10-14 ft in 13-16 ft surrounding water, with two isolated depth humps on the east side of the channel cresting at 11 and 13 ft — the highest-percentage mid-arm structure complex. A steep 21 ft isolated hump sits adjacent to the lower bridge remnant. Bob Pate Hollow creek enters from the east at 0.7-0.8 NM with defined channel edges, surrounding shallow flats, and 15-20 ft depth in the channel itself. The southeast shallow area at the arm opening provides additional spring and low-light opportunity. The entire arm is fishable within the 1.0 NM kayak range from Cartop, making this one of the most structure-rich launches on Monroe for a kayak angler. Priority sequence from launch: west bank shallow run predawn, road bed at 0.1 NM, bridge and hump complex at 0.4-0.6 NM, Bob Pate Hollow creek mouth at 0.8 NM."
},
  {
    launchSiteId: "Moore's Creek",
    name: "Moore's Creek",
    maxRecommendedRange: 1,
    structures: "Creek channel mouth, submerged timber along the old creek bed, grass edges in 3–5 ft, dock rows on the north bank.",
    depths: "Creek mouth 4–8 ft; channel drops to 12–18 ft quickly; shallow flats on south side 2–4 ft.",
    seasonalNotes: "Classic spring spawning area with protected water inside the creek arm. Summer: fish the channel edge early, then transition to deeper structure mid-day. Fall bass stack on the grass/timber transition.",
    detailedSummary: "TODO: REPLACE WITH NAVIONICS SUMMARY — Moore's Creek arm structure, creek channel contours, and holding areas by season.",
  },
  {
    launchSiteId: 'Pine Grove',
    name: 'Pine Grove',
    maxRecommendedRange: 1,
    structures: 'Rocky riprap along the park bank, point extending into the main basin, submerged brush piles, open flat to the south.',
    depths: 'Riprap edge 4–10 ft; point drops sharply to 15–22 ft on the lakeward side; flat south of launch 3–6 ft.',
    seasonalNotes: 'Riprap holds fish year-round. Best crankbait and jerkbait water in spring along the rocks. Summer: key on the point drop-off early. Fall migration moves fish back to the flat.',
    detailedSummary: 'TODO: REPLACE WITH NAVIONICS SUMMARY — Pine Grove point, riprap contours, and seasonal patterns.',
  },
  {
    launchSiteId: 'Cut Right Marina',
    name: 'Cut Right Marina',
    maxRecommendedRange: 1,
    structures: 'Dock field immediately adjacent, channel edge to the north, submerged laydowns near the mouth of the cove, riprap on the marina wall.',
    depths: 'Marina basin 6–10 ft; channel running north 12–20 ft; cove to the west 3–7 ft with timber.',
    seasonalNotes: 'Dock fishing is primary pattern in summer — shaded docks with deepest adjacent water hold the biggest fish. Spring: work the cove timber. Fall: channel edge and dock corners.',
    detailedSummary: 'TODO: REPLACE WITH NAVIONICS SUMMARY — Cut Right Marina dock field layout, channel contours, and prime structure by season.',
  },
  {
    launchSiteId: "Allen's Creek",
    name: "Allen's Creek",
    maxRecommendedRange: 1,
    structures: "Mouth of Allen's Creek, submerged timber in the upper creek arm, grass patches along the south bank, main lake points flanking the creek mouth.",
    depths: "Creek arm 2–6 ft with timber; mouth 6–10 ft; main lake flanks 10–16 ft.",
    seasonalNotes: "Top spring destination — warm, protected water accelerates spawn timing. Summer: work the shaded timber edges early before heat sets in. Fall: creek mouth draws feeding bass as shad school up.",
    detailedSummary: "TODO: REPLACE WITH NAVIONICS SUMMARY — Allen's Creek arm structure, spawning flats, and fall transition areas.",
  },
  {
    launchSiteId: 'Paynetown SRA',
    name: 'Paynetown SRA',
    maxRecommendedRange: 1,
    structures: 'Main lake access — large flat to the west, submerged road beds, brush piles, rocky points to the north and south of launch area.',
    depths: 'Flat 4–8 ft; road bed channels 8–14 ft; north point drops to 18+ ft; south rocky point 10–16 ft.',
    seasonalNotes: 'Best access to main lake structure and mid-lake brush piles. Summer: key on submerged road beds and brush in 10–14 ft. Spring: work the flat edges. Fall: points and road bed channel transitions.',
    detailedSummary: 'TODO: REPLACE WITH NAVIONICS SUMMARY — Paynetown main lake area, submerged road beds, brush pile locations, and seasonal patterns.',
  },
  {
    launchSiteId: 'Fairfax SRA',
    name: 'Fairfax SRA',
    maxRecommendedRange: 1,
    structures: 'Northern basin access — rocky shoreline, submerged points, laydown timber, smaller cove to the east with protected water.',
    depths: 'Shoreline 3–8 ft; points 8–14 ft; cove interior 2–6 ft; main basin channel nearby 16–24 ft.',
    seasonalNotes: 'Northern basin tends to warm faster in spring — good early-season option. Summer: fish the rocky points early and move to cove timber mid-morning. Fall: staging area for pre-winter bass movement.',
    detailedSummary: 'TODO: REPLACE WITH NAVIONICS SUMMARY — Fairfax northern basin structure, rocky points, and cove holding areas.',
  },
  {
    launchSiteId: 'Other',
    name: 'Other / Custom Launch',
    maxRecommendedRange: 1,
    structures: 'Varies by location. Look for visible structure within 0.5–1 nmi: dock rows, rocky shoreline, points, creek mouths, laydowns.',
    depths: 'Varies. Reference visible depth changes, current breaks, and transition zones.',
    seasonalNotes: 'Apply general Lake Monroe seasonal patterns: spring shallow, summer depth/shade/structure, fall transition points and creek mouths.',
    detailedSummary: 'No specific Navionics data available for this launch point. Recommendations based on general Lake Monroe patterns and visible structure.',
  },
]

export function getLaunchPointContext(siteId: string): LaunchPointContext | undefined {
  return LAUNCH_POINT_CONTEXTS.find(c => c.launchSiteId === siteId)
}
