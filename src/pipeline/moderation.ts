export interface ModerationRule {
  id: string;
  term: string;
  mode: "mask" | "replace" | "hide-segment";
  replacement?: string;
  matchInsideWords?: boolean;
  enabled?: boolean;
}

interface ModerationResult {
  publicText: string;
  appliedRuleIds: string[];
  hidden: boolean;
}

function escapeRegularExpression(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function ruleExpression(rule: ModerationRule, segmented: boolean) {
  const escaped = escapeRegularExpression(rule.term);
  return rule.matchInsideWords || segmented
    ? new RegExp(escaped, "giu")
    : new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, "giu");
}

export function applyModeration(
  translatedText: string,
  rules: readonly ModerationRule[],
  locale = "en",
): ModerationResult {
  let publicText = translatedText;
  const appliedRuleIds: string[] = [];

  for (const rule of rules) {
    if (rule.enabled === false || !rule.term.trim()) continue;

    const segmented = !rule.matchInsideWords &&
      /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(rule.term);
    if (segmented && typeof Intl.Segmenter !== "function") {
      throw new Error("This browser cannot apply Chinese/Japanese word filters. Update the browser before using these filters.");
    }
    const boundaries = segmented
      ? new Set(
          [...new Intl.Segmenter(locale, { granularity: "word" }).segment(publicText)]
            .flatMap(({ index, segment }) => [index, index + segment.length]),
        )
      : null;
    let matchedRule = false;
    const nextText = publicText.replace(ruleExpression(rule, segmented), (matched, offset: number) => {
      if (boundaries && (!boundaries.has(offset) || !boundaries.has(offset + matched.length))) {
        return matched;
      }
      matchedRule = true;
      return rule.mode === "replace"
        ? (rule.replacement ?? "")
        : rule.mode === "mask"
          ? "•".repeat([...matched].length)
          : matched;
    });
    if (!matchedRule) continue;

    appliedRuleIds.push(rule.id);

    if (rule.mode === "hide-segment") {
      return { publicText: "", appliedRuleIds, hidden: true };
    }

    publicText = nextText;
  }

  return { publicText, appliedRuleIds, hidden: false };
}
