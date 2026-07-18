import type { LanguageLocale } from "@/domain/languages";

export interface GlossaryEntry {
  id: string;
  canonical: string;
  variants?: readonly string[];
  priority?: number;
  matchInsideWords?: boolean;
  preferredTranslations?: Partial<Record<LanguageLocale, string>>;
}

function escapeRegularExpression(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function termExpression(term: string, matchInsideWords: boolean) {
  const escaped = escapeRegularExpression(term);
  return matchInsideWords
    ? new RegExp(escaped, "giu")
    : new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, "giu");
}

export function keywordHints(entries: readonly GlossaryEntry[]) {
  const ordered = [...entries].sort(
    (left, right) => (right.priority ?? 0) - (left.priority ?? 0),
  );

  return [...new Set(ordered.flatMap((entry) => [entry.canonical, ...(entry.variants ?? [])]))];
}

export function applyPreferredTerms(
  text: string,
  targetLanguage: LanguageLocale,
  entries: readonly GlossaryEntry[],
) {
  const replacements = entries
    .flatMap((entry) => {
      const replacement = entry.preferredTranslations?.[targetLanguage];
      if (!replacement) return [];

      return [entry.canonical, ...(entry.variants ?? [])].map((term) => ({
        term,
        replacement,
        matchInsideWords: entry.matchInsideWords ?? false,
      }));
    })
    .sort((left, right) => right.term.length - left.term.length);

  return replacements.reduce(
    (result, item) =>
      result.replace(termExpression(item.term, item.matchInsideWords), item.replacement),
    text,
  );
}
