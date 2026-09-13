import type { LanguageLocale } from "@/domain/languages";
import { applyPreferredTerms, type GlossaryEntry } from "@/pipeline/glossary";
import { applyModeration, type ModerationRule } from "@/pipeline/moderation";

interface CaptionForms {
  protectedSourceText: string;
  translatedText: string;
  publicText: string;
  appliedModerationRuleIds: string[];
  hiddenFromPublicDisplay: boolean;
}

export function prepareCaptionForms(input: {
  sourceText: string;
  translatedText: string;
  targetLanguage: LanguageLocale;
  glossary: readonly GlossaryEntry[];
  moderationRules: readonly ModerationRule[];
}): CaptionForms {
  const translatedText = applyPreferredTerms(
    input.translatedText,
    input.targetLanguage,
    input.glossary,
  );
  const moderation = applyModeration(translatedText, input.moderationRules, input.targetLanguage);

  return {
    protectedSourceText: input.sourceText,
    translatedText,
    publicText: moderation.publicText,
    appliedModerationRuleIds: moderation.appliedRuleIds,
    hiddenFromPublicDisplay: moderation.hidden,
  };
}
