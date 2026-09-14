import type { LanguageLocale } from "@/domain/languages";
import type { GlossaryEntry } from "@/pipeline/glossary";
import type { ModerationRule } from "@/pipeline/moderation";

function entries(value: string) {
  return value
    .split(/[\n,]+/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseGlossaryInput(
  value: string,
  targetLanguage: LanguageLocale,
): GlossaryEntry[] {
  return entries(value)
    .slice(0, 40)
    .map((item, index) => {
      const [canonicalValue, ...translationParts] = item.split("=>");
      const [spelling, ...aliases] = canonicalValue.split("|");
      const canonical = spelling.trim().slice(0, 100);
      const variants = aliases.map((value) => value.trim().slice(0, 100)).filter(Boolean).slice(0, 5);
      const translation = translationParts.join("=>").trim().slice(0, 100);

      return {
        id: `operator-term-${index}`,
        canonical,
        ...(variants.length ? { variants } : {}),
        priority: 40 - index,
        preferredTranslations: translation
          ? ({ [targetLanguage]: translation } as Partial<
              Record<LanguageLocale, string>
            >)
          : undefined,
      };
    })
    .filter(({ canonical }) => Boolean(canonical));
}

export function parseModerationInput(value: string): ModerationRule[] {
  return entries(value)
    .slice(0, 40)
    .map((item, index) => {
      const [termPart, ...actionParts] = item.split("=>");
      const term = termPart.trim().slice(0, 100);
      const action = actionParts.join("=>").trim();
      const id = `operator-filter-${index}`;
      if (action.toLowerCase() === "!hide") return { id, term, mode: "hide-segment" as const };
      if (action) return { id, term, mode: "replace" as const, replacement: action.slice(0, 100) };
      return { id, term, mode: "mask" as const };
    })
    .filter(({ term }) => Boolean(term));
}

/** Combines rule lists (e.g. one per batched caption, each with its own filter-list snapshot), deduped by term+mode+replacement so an unchanged filter across the batch doesn't produce redundant rules. */
export function mergeModerationRules(ruleLists: readonly ModerationRule[][]): ModerationRule[] {
  return [...new Map(
    ruleLists.flat().map((rule) => [JSON.stringify([rule.term, rule.mode, rule.replacement ?? ""]), rule]),
  ).values()];
}

export function preferredTermMap(
  glossary: readonly GlossaryEntry[],
  targetLanguage: LanguageLocale,
) {
  return Object.fromEntries(
    glossary.flatMap((entry) => {
      const translation = entry.preferredTranslations?.[targetLanguage];
      return translation ? [[entry.canonical, translation]] : [];
    }),
  );
}
