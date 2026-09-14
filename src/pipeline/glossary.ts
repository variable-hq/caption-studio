import type { LanguageLocale } from "@/domain/languages";
import { wordBoundaryExpression } from "./text-matching";

export interface GlossaryEntry {
  id: string;
  canonical: string;
  variants?: readonly string[];
  priority?: number;
  preferredTranslations?: Partial<Record<LanguageLocale, string>>;
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

      return [entry.canonical, ...(entry.variants ?? [])].map((term) => ({ term, replacement }));
    })
    .sort((left, right) => right.term.length - left.term.length);

  return replacements.reduce(
    (result, item) => result.replace(wordBoundaryExpression(item.term), item.replacement),
    text,
  );
}
