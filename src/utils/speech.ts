// Shared speech synthesis utilities used across briefing and on-water screens

export function getBestVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis?.getVoices() ?? []
  if (!voices.length) return null
  const enUS  = voices.filter(v => v.lang === 'en-US' || v.lang === 'en_US')
  const enAny = voices.filter(v => v.lang.startsWith('en'))
  const pick = (pool: SpeechSynthesisVoice[]) =>
    pool.find(v => /natural|neural|enhanced/i.test(v.name)) ??
    pool.find(v => /google/i.test(v.name)) ??
    pool.find(v => /microsoft/i.test(v.name)) ??
    pool[0] ?? null
  return pick(enUS) ?? pick(enAny) ?? null
}

// Strip things that sound bad when read aloud
export function cleanForSpeech(text: string): string {
  return text
    .replace(/[\u{1F300}-\u{1FFFF}]/gu, '')
    .replace(/[*_#`]/g, '')
    .replace(/·/g, ',')
    .replace(/—/g, ',')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

export function speakText(
  text: string,
  { onEnd, rate = 0.9, pitch = 0.97 }: { onEnd?: () => void; rate?: number; pitch?: number } = {},
): void {
  if (!window.speechSynthesis) return
  const utt = new SpeechSynthesisUtterance(cleanForSpeech(text))
  utt.rate   = rate
  utt.pitch  = pitch
  utt.volume = 1.0
  const voice = getBestVoice()
  if (voice) utt.voice = voice
  utt.onend   = () => onEnd?.()
  utt.onerror = () => onEnd?.()
  window.speechSynthesis.speak(utt)
}

export function cancelSpeech(): void {
  window.speechSynthesis?.cancel()
}

export const hasSpeech = typeof window !== 'undefined' && 'speechSynthesis' in window
