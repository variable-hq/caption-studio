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
      const canonical = canonicalValue.trim().slice(0, 100);
      const translation = translationParts.join("=>").trim().slice(0, 100);

      return {
        id: `operator-term-${index}`,
        canonical,
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
    .map((term, index) => ({
      id: `operator-filter-${index}`,
      term: term.slice(0, 100),
      mode: "mask" as const,
    }));
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
