import Anthropic from '@anthropic-ai/sdk'
import type { Session, CatchEvent, LandedFish, Rod, SoftPlastic } from '../types'
import { getLaunchPointContext, fmtStructures, fmtDepths, fmtSeasonalNotes } from '../data/launchPointContext'

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface GuideMessage {
  role: 'user' | 'assistant'
  content: string
  id: string
  hasImage?: boolean   // user sent an image with this message
}

// ─── Keyword detection for historical pattern questions ───────────────────────

const HISTORY_KEYWORDS = [
  'history', 'usually', 'before', 'last year', 'typically', 'pattern',
  'tend', 'always', 'ever', 'past', 'previously', 'used to',
]

export function mentionsHistory(text: string): boolean {
  const lower = text.toLowerCase()
  return HISTORY_KEYWORDS.some(kw => lower.includes(kw))
}

// ─── System prompt ─────────────────────────────────────────────────────────────

const GUIDE_PERSONA = `You are an experienced bass fishing guide with deep knowledge of Lake Monroe in Bloomington, Indiana. You know the lake's structure, seasonal patterns, water clarity tendencies, forage, and how local weather affects fish behavior and positioning.

You give direct, practical recommendations — not generic fishing advice. When the angler shares conditions, observations, or images, you interpret them specifically and tell them what to do next.

You ask at most one clarifying question per response and only when it materially changes your recommendation. You do not pad responses with disclaimers or generic encouragement. Keep responses concise and scannable — short paragraphs, no walls of text. If a response includes a recommendation list, format it as a simple numbered sequence.

The angler is fishing from a kayak, primarily targeting largemouth bass larger than average, during early morning sessions. The kayak limits range to roughly 0.5–1 nautical mile from the launch point. When recommending locations, reference specific structure within that range using the launch point context provided in the system prompt. Do not suggest areas that require a long paddle across open water unless the angler explicitly asks about a distant spot.`

export function buildGuideSystemPrompt(
  session: Session | null,
  sessionEvents: CatchEvent[],
  patternSummary?: string,
  recentAnalysisSummaries?: string[],
  selectedRods?: Rod[],
  rodInventory?: Rod[],
  softPlastics?: SoftPlastic[],
): string {
  const parts: string[] = [GUIDE_PERSONA]

  if (session) {
    const c = session.conditions
    const condParts = [
      c.airTempF         != null ? `Air ${c.airTempF}°F`                                           : '',
      c.waterTempF       != null ? `Water ${c.waterTempF}°F`                                       : '',
      c.windSpeedMph     != null ? `Wind ${c.windSpeedMph}mph ${c.windDirection ?? ''}`.trim()     : '',
      c.skyCondition                ? `Sky: ${c.skyCondition}`                                     : '',
      c.baroPressureInHg != null
        ? `Baro: ${c.baroPressureInHg}"${c.baroTrend ? ` (${c.baroTrend}${c.baroTrendMb ? ` ${c.baroTrendMb} mb` : ''})` : ''}`
        : '',
      c.waterClarity        ? `Clarity: ${c.waterClarity}`                                         : '',
      c.waterLevelVsNormal  ? `Level: ${c.waterLevelVsNormal}`                                     : '',
      c.dewpointF        != null ? `Dewpoint ${c.dewpointF}°F`                                     : '',
      c.skyCoverPct      != null ? `Sky cover ${c.skyCoverPct}%`                                   : '',
      c.precipProbPct    != null ? `Rain chance ${c.precipProbPct}%`                               : '',
      c.sunrise                  ? `Sunrise ${c.sunrise}`                                          : '',
      c.sunset                   ? `Sunset ${c.sunset}`                                            : '',
    ].filter(Boolean).join(' | ')

    parts.push(`\nSESSION CONDITIONS:\n${condParts || 'Not available'}`)
    parts.push(`Launch site: ${session.launchSite}`)

    // Launch point context (Layer 1 stable context)
    const launchCtx = getLaunchPointContext(String(session.launchSite))
    if (launchCtx) {
      const detail = launchCtx.detailedSummary.startsWith('TODO') ? '' : `\nDetailed: ${launchCtx.detailedSummary}`
      parts.push(`\nLAUNCH POINT CONTEXT — ${launchCtx.name}:\nReachable range (kayak): ~${launchCtx.maxRecommendedRange} nmi. All location recs must be within this range.\nStructures: ${fmtStructures(launchCtx)}\nDepths: ${fmtDepths(launchCtx)}\nSeasonal: ${fmtSeasonalNotes(launchCtx)}${detail}`)
    }

    // Full rod inventory (stable context)
    if (rodInventory && rodInventory.length > 0) {
      const rodLines = rodInventory.map(r => {
        const specs = [
          r.rodType,
          r.power,
          r.action,
          r.lengthFt != null ? `${r.lengthFt}'${r.lengthIn ? `${r.lengthIn}"` : ''}` : null,
          r.lineType,
          r.lineWeightLbs != null ? `${r.lineWeightLbs}lb` : null,
          r.lureWeightMinOz != null && r.lureWeightMaxOz != null ? `lure ${r.lureWeightMinOz}–${r.lureWeightMaxOz}oz` : null,
          r.reelName ? `reel: ${r.reelName}` : null,
        ].filter(Boolean).join(', ')
        return `- "${r.nickname}": ${specs || 'no specs'}`
      }).join('\n')
      parts.push(`\nROD INVENTORY:\n${rodLines}`)
    }

    // Soft plastic inventory (exclude Out condition from AI context)
    if (softPlastics && softPlastics.length > 0) {
      const available = softPlastics.filter(s => s.condition !== 'Out')
      if (available.length > 0) {
        const spLines = available.map(s => {
          const parts2 = [
            s.productName ? `"${s.productName}"` : null,
            s.brand ?? null,
            s.bodyStyle ?? null,
            s.sizeInches != null ? `${s.sizeInches}"` : null,
            s.colorName ?? null,
            s.colorFamily ?? null,
            s.riggingStyles && s.riggingStyles.length > 0 ? `rigs: ${s.riggingStyles.join('/')}` : null,
            s.condition === 'Low Stock' ? '(low stock)' : null,
          ].filter(Boolean).join(', ')
          return `- ${parts2}`
        }).join('\n')
        parts.push(`\nSOFT PLASTIC INVENTORY:\n${spLines}`)
      }
    }

    // Selected rods for this session
    if (selectedRods && selectedRods.length > 0) {
      const selLines = selectedRods.map(r => `- "${r.nickname}"`).join('\n')
      parts.push(`\nRODS ON THE WATER TODAY (app-selected for conditions):\n${selLines}\nWhen recommending a lure or technique, specify the exact rod nickname the angler should use.`)
    }

    // Session working memory — compact event block
    const landed = sessionEvents.filter((e): e is LandedFish => e.type === 'Landed Fish')
    const strikes = sessionEvents.filter(e => e.type === 'Quality Strike — Missed').length
    const follows = sessionEvents.filter(e => e.type === 'Follow — Did Not Strike').length

    parts.push('\nSESSION WORKING MEMORY:')
    if (landed.length > 0) {
      const lines = landed.map(f => {
        const t = new Date(f.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        return `${t}: ${f.species} ${(f.weightLbs + f.weightOz / 16).toFixed(1)} lbs on ${f.lureType} (${f.lureColor})`
      })
      parts.push(`${landed.length} fish landed:\n${lines.join('\n')}`)
    } else {
      parts.push('No fish landed yet this session.')
    }
    if (strikes > 0) parts.push(`${strikes} quality strike(s) missed.`)
    if (follows > 0) parts.push(`${follows} follow(s) without strike.`)
  } else {
    parts.push('\nThe angler is consulting outside of an active session. Use historical context when relevant.')
  }

  if (patternSummary) {
    parts.push(`\nHISTORICAL PATTERN DATA:\n${patternSummary}`)
  }

  if (recentAnalysisSummaries && recentAnalysisSummaries.length > 0) {
    parts.push(`\nRECENT SESSION ANALYSES (most recent first):\n${recentAnalysisSummaries.join('\n\n---\n\n')}`)
  }

  return parts.filter(Boolean).join('\n')
}

// ─── Streaming Guide response ─────────────────────────────────────────────────

export async function* streamGuideResponse(
  apiKey: string,
  systemPrompt: string,
  messages: GuideMessage[],
  newUserContent: Anthropic.Messages.MessageParam['content'],
): AsyncGenerator<string> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })

  // Prior messages in history are always text-only (images discarded after send)
  const priorMessages: Anthropic.Messages.MessageParam[] = messages.map(m => ({
    role: m.role,
    content: m.content,
  }))

  const stream = client.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 600,
    system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
    messages: [...priorMessages, { role: 'user', content: newUserContent }],
  })

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      yield event.delta.text
    }
  }
}

// ─── Post-session opening analysis ────────────────────────────────────────────

export async function generatePostSessionOpening(
  apiKey: string,
  systemPrompt: string,
): Promise<AsyncGenerator<string>> {
  return streamGuideResponse(apiKey, systemPrompt, [], [{
    type: 'text',
    text: 'Please give me a concise post-session analysis. Cover what worked, what the data suggests about current patterns, and 1–2 actionable takeaways for next time.',
  }])
}

// ─── Analysis summary for session record (4–8 sentences) ──────────────────────

export async function generateAnalysisSummary(
  apiKey: string,
  messages: GuideMessage[],
): Promise<string> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })

  const transcript = messages
    .map(m => `${m.role === 'user' ? 'Angler' : 'Guide'}: ${m.content}`)
    .join('\n\n')

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 400,
    messages: [{
      role: 'user',
      content: `Write a 4–8 sentence post-session analysis summary based on this Guide conversation. Include what was caught, what techniques worked, key conditions, and the most actionable takeaway for next time. Be specific and data-driven — this will be stored as the session's permanent analysis.\n\nCONVERSATION:\n${transcript}`,
    }],
  })

  return response.content[0].type === 'text' ? response.content[0].text.trim() : ''
}

// ─── Checkpoint summary (background, non-blocking) ────────────────────────────

export async function generateCheckpointSummary(
  apiKey: string,
  messages: GuideMessage[],
): Promise<string> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })

  const transcript = messages
    .map(m => `${m.role === 'user' ? 'Angler' : 'Guide'}: ${m.content}`)
    .join('\n\n')

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    messages: [{
      role: 'user',
      content: `Summarize the key intelligence from this fishing guide conversation in 3–6 sentences. Capture what was observed or reported, what was recommended, and what the angler indicated they would try. Be specific and data-like — this summary will be used as context for future AI sessions.\n\nCONVERSATION:\n${transcript}`,
    }],
  })

  return response.content[0].type === 'text' ? response.content[0].text.trim() : ''
}
