import Anthropic from '@anthropic-ai/sdk'
import type { LandedFish, Session, EnvironmentalConditions, AIBriefing, CatchEvent, OwnedLure, RodSetup } from '../types'

function buildClientWithKey(apiKey: string) {
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
}

// ─── Pre-Session Briefing ──────────────────────────────────────────────────────

export async function generatePreSessionBriefing(
  apiKey: string,
  conditions: EnvironmentalConditions,
  launchSite: string,
  catchHistory: LandedFish[],
  ownedLures?: OwnedLure[],
  rodSetups?: RodSetup[],
  onChunk?: (text: string) => void,
  sessionContext?: string,
): Promise<AIBriefing> {
  const client = buildClientWithKey(apiKey)

  const historyCount = catchHistory.length
  const historyNote = historyCount < 20
    ? `NOTE: Only ${historyCount} catches are logged. Weight recommendations toward seasonal Lake Monroe largemouth defaults.`
    : `${historyCount} catches are logged.`

  // Summarize catch history for context
  const topCatches = catchHistory
    .filter(f => f.species === 'Largemouth Bass')
    .sort((a, b) => (b.weightLbs + b.weightOz / 16) - (a.weightLbs + a.weightOz / 16))
    .slice(0, 20)

  const catchSummary = topCatches.map(f =>
    `${(f.weightLbs + f.weightOz / 16).toFixed(1)} lbs on ${f.lureType} (${f.lureColor}), ${f.waterColumn ?? 'N/A'}, ${f.retrieveStyle ?? 'N/A'}, ${f.structure ?? 'N/A'}, ${new Date(f.timestamp).toLocaleDateString()}`
  ).join('\n')

  const prompt = `You are an expert largemouth bass fishing guide for Lake Monroe, Bloomington Indiana.

CURRENT CONDITIONS:
- Date/Time: ${sessionContext ?? new Date().toLocaleString()}
- Sunrise: ${conditions.sunrise ?? 'N/A'} | Sunset: ${conditions.sunset ?? 'N/A'}
- Moon Phase: ${conditions.moonPhase ?? 'N/A'} (${conditions.moonIlluminationPct ?? '?'}% illumination)
- Moonrise: ${conditions.moonrise ?? 'N/A'} | Moonset: ${conditions.moonset ?? 'N/A'}
- Air Temp: ${conditions.airTempF ?? '?'}°F
- Wind: ${conditions.windSpeedMph ?? '?'} mph ${conditions.windDirection ?? ''}
- Sky: ${conditions.skyCondition ?? 'N/A'}
- Barometric Pressure: ${conditions.baroPressureInHg ?? '?'} inHg (${conditions.baroTrend ?? 'unknown'} trend)
- Water Temp: ${conditions.waterTempF ?? '?'}°F
- Water Level: ${conditions.waterLevelFt ?? '?'} ft (${conditions.waterLevelVsNormal ?? 'N/A'})
- Water Clarity: ${conditions.waterClarity ?? 'N/A'}
- Launch Site: ${launchSite}

CATCH HISTORY (${historyNote}):
${catchSummary || 'No catch history yet.'}
${ownedLures && ownedLures.length > 0 ? `
ANGLER'S LURE INVENTORY — PRIORITIZE these in all recommendations:
${ownedLures.map(l => `- ${l.lureType}, ${l.weight}, ${l.color}${l.brand ? ` (${l.brand})` : ''}${l.notes ? ` — ${l.notes}` : ''}`).join('\n')}

IMPORTANT: Rank lures the angler OWNS first. If no owned lure perfectly matches conditions, recommend the closest owned option and note the adjustment needed. Only recommend non-owned lures as a last resort, and flag them clearly.` : ''}
${rodSetups && rodSetups.length > 0 ? `
AVAILABLE ROD/LINE SETUPS:
${rodSetups.map(r => `- "${r.name}": ${[r.rodPower, r.rodAction, r.rodLength].filter(Boolean).join('/')} rod, ${r.lineType ?? '?'}${r.lineWeightLbs ? ` ${r.lineWeightLbs}lb` : ''}${r.notes ? ` — ${r.notes}` : ''}`).join('\n')}

For each recommendation, include a "suggestedRod" field with the name of the best matching setup from the list above.` : ''}

Respond with ONLY valid JSON — no markdown, no code fences, no explanation before or after. Use this exact structure:
{
  "recommendations": [
    {
      "rank": 1,
      "lureType": "string",
      "weight": "string",
      "color": "string",
      "retrieveStyle": "string",
      "depthBand": "string",
      "waterColumn": "string",
      "confidence": "High|Medium|Low",
      "reasoning": "string (2-3 sentences — specific and actionable)",
      "suggestedRod": "string (name of rod setup to use, or omit if no setups provided)",
      "inInventory": true
    }
  ],
  "conditionsSummary": "string (1 sentence: the single most important condition factor today and why)",
  "startingArea": "string (2-3 sentences: exactly where to start from ${launchSite}, which direction, what structure to target first)",
  "primaryPattern": "string (2-3 sentences: the core technique to rely on today and when to use it)",
  "backupPattern": "string (2-3 sentences: what to switch to if primary isn't producing, trigger for the switch)",
  "narrative": "string (1-2 sentences: any notable observations or timing windows the angler should know)"
}

Provide 2-3 ranked recommendations. Be specific and data-driven where history supports it.`

  if (onChunk) {
    // Streaming mode
    let fullText = ''
    const stream = client.messages.stream({
      model: 'claude-opus-4-6',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    })

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        fullText += event.delta.text
        onChunk(event.delta.text)
      }
    }

    return parseAIBriefingResponse(fullText)
  } else {
    const response = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    })
    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    return parseAIBriefingResponse(text)
  }
}

function parseAIBriefingResponse(text: string): AIBriefing {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as AIBriefing
    }
  } catch {
    // fall through
  }
  return {
    recommendations: [],
    narrative: text,
  }
}

// ─── Pattern Chat ──────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export async function* chatWithPatternData(
  apiKey: string,
  messages: ChatMessage[],
  patternSummary: string,
): AsyncGenerator<string> {
  const client = buildClientWithKey(apiKey)

  const systemPrompt = `You are an expert bass fishing data analyst and guide for Lake Monroe, Bloomington Indiana.
Answer questions with specific references to the angler's data where available.
Always note when a pattern is based on limited sample size (fewer than 5 catches).

${patternSummary}`

  const stream = client.messages.stream({
    model: 'claude-opus-4-6',
    max_tokens: 1500,
    system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
    messages: messages.map(m => ({ role: m.role, content: m.content })),
  })

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      yield event.delta.text
    }
  }
}

// ─── In-Session Guide Chat ─────────────────────────────────────────────────────

export async function* chatWithSessionGuide(
  apiKey: string,
  messages: ChatMessage[],
  launchSite: string,
  conditions: EnvironmentalConditions,
  briefing: AIBriefing,
  catchHistory: LandedFish[],
  sessionEvents: CatchEvent[]
): AsyncGenerator<string> {
  const client = buildClientWithKey(apiKey)

  const recSummary = briefing.recommendations.map(r =>
    `#${r.rank} ${r.confidence}: ${r.lureType} (${r.weight}, ${r.color}) — ${r.depthBand}, ${r.waterColumn}, ${r.retrieveStyle}`
  ).join('\n')

  const eventSummary = sessionEvents.length
    ? sessionEvents.map(e => {
        const t = new Date(e.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        if (e.type === 'Landed Fish') return `${t}: Landed ${e.species} ${e.weightLbs}lb ${e.weightOz}oz on ${e.lureType}`
        if (e.type === 'Visual Sighting') return `${t}: Visual Sighting`
        if (e.type === 'Guide Summary' || e.type === 'Guide Image Analysis') return null
        return `${t}: ${e.type} on ${(e as { lureType?: string }).lureType ?? '?'}`
      }).filter(Boolean).join('\n')
    : 'No events logged yet this session.'

  const systemPrompt = `You are an expert largemouth bass fishing guide for Lake Monroe, Bloomington, Indiana. The angler is ON THE WATER RIGHT NOW during an active session. Give specific, concise, actionable advice. The angler has limited attention — keep answers to 3-5 sentences max unless they ask for more detail.

TODAY'S CONDITIONS:
- Launch site: ${launchSite}
- Air temp: ${conditions.airTempF ?? '?'}°F | Water temp: ${conditions.waterTempF ?? '?'}°F
- Wind: ${conditions.windSpeedMph ?? '?'}mph ${conditions.windDirection ?? ''} | Sky: ${conditions.skyCondition ?? 'N/A'}
- Baro: ${conditions.baroPressureInHg ?? '?'} inHg (${conditions.baroTrend ?? 'unknown'} trend)
- Water level: ${conditions.waterLevelVsNormal ?? 'N/A'} | Clarity: ${conditions.waterClarity ?? 'N/A'}

PRE-SESSION RECOMMENDATIONS:
${recSummary}
${briefing.startingArea ? `\nStarting Area: ${briefing.startingArea}` : ''}
${briefing.primaryPattern ? `Primary Pattern: ${briefing.primaryPattern}` : ''}
${briefing.backupPattern ? `Backup Plan: ${briefing.backupPattern}` : ''}

THIS SESSION'S EVENTS:
${eventSummary}

CATCH HISTORY CONTEXT: ${catchHistory.length} total catches logged. Top producers: ${
    catchHistory.slice(0, 5).map(f => `${f.lureType} (${f.lureColor})`).join(', ') || 'No history yet.'
  }`

  const stream = client.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 400,
    system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
    messages: messages.map(m => ({ role: m.role, content: m.content })),
  })

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      yield event.delta.text
    }
  }
}

// ─── Pre-Session Quick Question ────────────────────────────────────────────────

export async function* askPreSessionQuestion(
  apiKey: string,
  question: string,
  conditions: EnvironmentalConditions,
  launchSite: string,
): AsyncGenerator<string> {
  const client = buildClientWithKey(apiKey)

  const condStr = [
    conditions.airTempF    != null  ? `Air ${conditions.airTempF}°F`              : '',
    conditions.waterTempF  != null  ? `Water ${conditions.waterTempF}°F`           : '',
    conditions.windSpeedMph != null ? `Wind ${conditions.windSpeedMph}mph ${conditions.windDirection ?? ''}`.trim() : '',
    conditions.skyCondition         ? `Sky: ${conditions.skyCondition}`            : '',
    conditions.baroTrend            ? `Baro ${conditions.baroTrend}`               : '',
    conditions.waterClarity         ? `Clarity: ${conditions.waterClarity}`        : '',
    conditions.moonPhase            ? `Moon: ${conditions.moonPhase}`              : '',
  ].filter(Boolean).join(' | ')

  const systemPrompt = `You are an expert largemouth bass fishing guide for Lake Monroe, Bloomington Indiana.
An angler is planning their session. Current conditions: ${condStr || 'unknown'}.
Launch site: ${launchSite || 'Lake Monroe'}.
Answer their quick question concisely and practically — 3-5 sentences, ready to act on.`

  const stream = client.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 300,
    system: systemPrompt,
    messages: [{ role: 'user', content: question }],
  })

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      yield event.delta.text
    }
  }
}

// ─── Post-Session Analysis ─────────────────────────────────────────────────────

export async function* generatePostSessionAnalysis(
  apiKey: string,
  session: Session,
  events: CatchEvent[],
): AsyncGenerator<string> {
  const client = buildClientWithKey(apiKey)

  const duration = session.endTime
    ? Math.round((session.endTime - session.startTime) / 60000)
    : Math.round((Date.now() - session.startTime) / 60000)

  const landed  = events.filter(e => e.type === 'Landed Fish') as import('../types').LandedFish[]
  const strikes = events.filter(e => e.type === 'Quality Strike — Missed').length
  const follows = events.filter(e => e.type === 'Follow — Did Not Strike').length

  const catchLog = landed.map(f => {
    const t = new Date(f.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    return `${t}: ${f.species} ${(f.weightLbs + f.weightOz / 16).toFixed(1)} lbs on ${f.lureType}${f.lureColor ? ` (${f.lureColor})` : ''}${f.waterColumn ? `, ${f.waterColumn}` : ''}${f.retrieveStyle ? `, ${f.retrieveStyle}` : ''}`
  }).join('\n')

  const condStr = [
    session.conditions.airTempF    != null  ? `Air ${session.conditions.airTempF}°F`    : '',
    session.conditions.waterTempF  != null  ? `Water ${session.conditions.waterTempF}°F` : '',
    session.conditions.windSpeedMph != null ? `Wind ${session.conditions.windSpeedMph}mph` : '',
    session.conditions.skyCondition         ? session.conditions.skyCondition : '',
    session.conditions.baroTrend            ? `Baro ${session.conditions.baroTrend}` : '',
    session.conditions.waterClarity         ? `Clarity: ${session.conditions.waterClarity}` : '',
  ].filter(Boolean).join(', ')

  const prompt = `You are an expert largemouth bass fishing guide for Lake Monroe, Bloomington Indiana. Analyze this completed fishing session and give the angler useful post-session insights.

SESSION DETAILS:
- Location: ${session.launchSite}
- Duration: ${duration} minutes
- Conditions: ${condStr || 'not recorded'}

RESULTS:
- Fish landed: ${landed.length}
- Quality strikes missed: ${strikes}
- Follows: ${follows}
${catchLog ? `\nCATCH LOG:\n${catchLog}` : 'No catches recorded.'}

Write a 3-4 paragraph narrative post-session analysis. Cover:
1. What worked and why, based on the conditions and catch log
2. Key timing or location patterns if apparent
3. One or two things to try differently next time given what you saw
4. An encouraging closing note

Write conversationally, like a guide debriefing with the angler at the dock. Be specific to their actual results.`

  const stream = client.messages.stream({
    model: 'claude-opus-4-6',
    max_tokens: 600,
    messages: [{ role: 'user', content: prompt }],
  })

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      yield event.delta.text
    }
  }
}



export interface LureIdentification {
  lureType: string
  color: string
  brand?: string
  notes?: string
  confidence: 'High' | 'Medium' | 'Low'
}

const CATALOG_LURE_TYPES = [
  'Spinnerbait','Swim Jig','Chatterbait','Football Jig','Flipping Jig',
  'Wacky Rig','Texas Rig','Buzzbait','Swimbait','Crankbait',
  'Topwater','Drop Shot','Jerkbait','Swimbait (hard)','Other',
]

function extractImage(imageDataUrl: string): { base64Data: string; mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' } {
  const [header, base64Data] = imageDataUrl.split(',')
  const mediaType = (header.match(/:(.*?);/)?.[1] ?? 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
  return { base64Data, mediaType }
}

export async function identifyLureForCatalog(
  apiKey: string,
  imageDataUrl: string
): Promise<LureIdentification> {
  const client = buildClientWithKey(apiKey)
  const { base64Data, mediaType } = extractImage(imageDataUrl)

  const response = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 300,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } },
        { type: 'text', text: `You are identifying a fishing lure for a colorblind angler who needs accurate color descriptions. Respond with ONLY valid JSON — no markdown, no explanation before or after.

Lure type options: ${CATALOG_LURE_TYPES.join(', ')}

{
  "lureType": "pick the best matching type from the list above",
  "color": "describe colors as an angler would, e.g. 'White/Chartreuse', 'Green Pumpkin', 'Black/Blue' — be specific, this angler is colorblind and relies on your description",
  "brand": "brand name if clearly visible on the lure or package, otherwise omit",
  "notes": "one brief note about a distinctive feature if useful, e.g. 'chartreuse tail', 'red hook', otherwise omit",
  "confidence": "High if lure type is clearly identifiable, Medium if uncertain, Low if image is unclear"
}` },
      ],
    }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}'
  try {
    const m = text.match(/\{[\s\S]*\}/)
    if (m) return JSON.parse(m[0]) as LureIdentification
  } catch {}
  return { lureType: 'Other', color: '', confidence: 'Low' }
}

export interface RodIdentification {
  brand?: string
  rodType?: 'Baitcasting' | 'Spinning'
  notes?: string
}

export async function identifyRodFromImage(
  apiKey: string,
  imageDataUrl: string
): Promise<RodIdentification> {
  const client = buildClientWithKey(apiKey)
  const { base64Data, mediaType } = extractImage(imageDataUrl)

  const response = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 200,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } },
        { type: 'text', text: `Analyze this fishing rod or reel photo. Respond ONLY with valid JSON — no markdown, no explanation.

{
  "brand": "rod or reel brand if a label is clearly visible, otherwise omit",
  "rodType": "Baitcasting or Spinning based on the reel style — Baitcasting has a spool sitting on top, Spinning has a fixed spool hanging below. Omit if no reel is visible or unclear",
  "notes": "one brief observation if useful, e.g. 'casting rod with low-profile reel', otherwise omit"
}` },
      ],
    }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}'
  try {
    const m = text.match(/\{[\s\S]*\}/)
    if (m) return JSON.parse(m[0]) as RodIdentification
  } catch {}
  return {}
}
