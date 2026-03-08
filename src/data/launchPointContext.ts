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
    launchSiteId: 'Cartop Launch',
    name: 'Cartop Launch',
    maxRecommendedRange: 1,
    structures: 'Rocky shoreline to the north and east, submerged brush and laydowns along the cove edges, dock structures, shallow flats near the inlet.',
    depths: 'Launch area 2–4 ft; progresses to 8–14 ft within 0.5 nmi; deeper creek channel cuts to 18+ ft to the east.',
    seasonalNotes: 'Pre-spawn staging occurs on the adjacent flats in spring. Summer morning topwater bite on the rocky points. Fall shad migration draws bass to the shallower cove mouths.',
    detailedSummary: 'TODO: REPLACE WITH NAVIONICS SUMMARY — Cartop Launch area structure, depth contours, and seasonal holding spots.',
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
