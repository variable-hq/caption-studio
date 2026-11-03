import { ENVELOPE_LEAK_MARKERS } from "./prompt-envelope";

// Require distinctive AI-assistant phrasing (not just "I cannot"/"I'm sorry" alone,
// which are common, unrelated confession/repentance language in spoken content).
const REFUSAL_PATTERNS = [
  /\bas an ai\b/i,
  /\bas a language model\b/i,
  /\bi('m| am) an ai (language model|assistant)\b/i,
  /\bi cannot (fulfill|comply with|assist with) (this|that) request\b/i,
  /\bi('m| am) not able to (provide|assist|help) with (this|that)\b/i,
  /\b(against|violates) my (guidelines|programming|policy|policies)\b/i,
  /\bi cannot generate (this|that) content\b/i,
  /\bsystem prompt\b/i,
];

/** True if output reads like a refusal or meta-commentary instead of the requested content. */
export function looksLikeRefusalOrMeta(text: string): boolean {
  return REFUSAL_PATTERNS.some((pattern) => pattern.test(text));
}

/** True if output echoes the server's own envelope framing back — a sign of leakage or confusion. */
export function leaksPromptMarkers(text: string): boolean {
  const lower = text.toLowerCase();
  return ENVELOPE_LEAK_MARKERS.some((marker) => lower.includes(marker.toLowerCase()));
}

/** Cheap, local checks only — no extra provider call. True if the output should be rejected. */
export function outputLooksUnsafe(text: string): boolean {
  return looksLikeRefusalOrMeta(text) || leaksPromptMarkers(text);
}
