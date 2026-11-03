import type { GlossaryEntry } from "./glossary";
import { wordBoundaryExpression } from "./text-matching";

export function correctApprovedRecognitionVariants(text: string, entries: readonly GlossaryEntry[]) {
  let result = text;
  for (const entry of entries) {
    for (const variant of entry.variants ?? []) {
      result = result.replace(wordBoundaryExpression(variant), entry.canonical);
    }
  }
  return result;
}
