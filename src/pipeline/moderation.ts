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

function ruleExpression(rule: ModerationRule) {
  const escaped = escapeRegularExpression(rule.term);
  return rule.matchInsideWords
    ? new RegExp(escaped, "giu")
    : new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, "giu");
}

export function applyModeration(
  translatedText: string,
  rules: readonly ModerationRule[],
): ModerationResult {
  let publicText = translatedText;
  const appliedRuleIds: string[] = [];

  for (const rule of rules) {
    if (rule.enabled === false || !rule.term.trim()) continue;

    const expression = ruleExpression(rule);
    if (!expression.test(publicText)) continue;

    appliedRuleIds.push(rule.id);

    if (rule.mode === "hide-segment") {
      return { publicText: "", appliedRuleIds, hidden: true };
    }

    expression.lastIndex = 0;
    publicText = publicText.replace(expression, (matched) =>
      rule.mode === "replace"
        ? (rule.replacement ?? "")
        : "•".repeat([...matched].length),
    );
  }

  return { publicText, appliedRuleIds, hidden: false };
}
