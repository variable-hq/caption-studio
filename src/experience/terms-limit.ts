import { countWordEntries } from "@/live/words";
import type { TranslationDefaults } from "./preferences";

/** A list may stay over a lowered cap or shrink, but it cannot grow while over the cap. */
export function termsLimitExceeded(
  before: TranslationDefaults | null,
  after: TranslationDefaults | null,
  max: number,
) {
  if (after === null) return false;
  const previous = [before?.keywordText ?? "", before?.filterText ?? ""];
  const next = [after.keywordText, after.filterText];
  return next.some((text, index) => countWordEntries(text) > Math.max(max, countWordEntries(previous[index] ?? "")));
}
