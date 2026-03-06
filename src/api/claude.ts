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
  onChunk?: (text: string) => void
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
    `${f.weightLbs}lb ${f.weightOz}oz on ${f.lureType} (${f.lureColor}), ${f.waterDepth}, ${f.waterColumn}, ${f.retrieveStyle ?? 'N/A'}, ${f.structure ?? 'N/A'}, ${new Date(f.timestamp).toLocaleDateString()}`
  ).join('\n')

  const prompt = `You are an expert largemouth bass fishing guide for Lake Monroe, Bloomington Indiana.

CURRENT CONDITIONS:
- Date/Time: ${new Date().toLocaleString()}
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
  catchHistory: LandedFish[],
  sessions: Session[]
): AsyncGenerator<string> {
  const client = buildClientWithKey(apiKey)

  const historyCount = catchHistory.length
  const systemPrompt = `You are an expert bass fishing data analyst and guide for Lake Monroe, Bloomington Indiana.
You have access to the angler's full catch log below. Answer questions with specific references to their data where available.
Always note when a pattern is based on limited sample size (fewer than 5 catches).
${historyCount} total catches logged.

FULL CATCH LOG:
${JSON.stringify(catchHistory.slice(0, 100), null, 2)}

SESSION HISTORY (last 20):
${JSON.stringify(sessions.slice(0, 20), null, 2)}`

  const stream = client.messages.stream({
    model: 'claude-opus-4-6',
    max_tokens: 1500,
    system: systemPrompt,
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
        return `${t}: ${e.type} on ${e.lureType}`
      }).join('\n')
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
    system: systemPrompt,
    messages: messages.map(m => ({ role: m.role, content: m.content })),
  })

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      yield event.delta.text
    }
  }
}

// ─── Lure Identification ───────────────────────────────────────────────────────

export async function identifyLureFromImage(
  apiKey: string,
  imageDataUrl: string
): Promise<string> {
  const client = buildClientWithKey(apiKey)

  // Extract base64 data
  const [header, base64Data] = imageDataUrl.split(',')
  const mediaType = (header.match(/:(.*?);/)?.[1] ?? 'image/jpeg') as
    | 'image/jpeg'
    | 'image/png'
    | 'image/gif'
    | 'image/webp'

  const response = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 300,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: base64Data },
          },
          {
            type: 'text',
            text: 'Identify this fishing lure. Describe: primary color, secondary color, pattern name if recognizable, and any notable features (e.g. chartreuse tail, white skirt, red hook, glitter flake). Format as a short description like "chartreuse and white, green pumpkin flake, red hook" — one line, suitable for a field note.',
          },
        ],
      },
    ],
  })

  return response.content[0].type === 'text' ? response.content[0].text.trim() : ''
}
