import type { GlossaryEntry } from "./glossary";
import { wordBoundaryExpression } from "./text-matching";

// Reviewed spelling hints, not Bible verse text or an identity-resolution database.
export const TB2_SERVICE_VOCABULARY = "Yesus Kristus => Jesus Christ, Roh Kudus => Holy Spirit, Betlehem => Bethlehem, Saul => Saul, Daud => David, Musa => Moses, Petrus => Peter, Paulus => Paul, Yohanes => John";

export function correctApprovedRecognitionVariants(text: string, entries: readonly GlossaryEntry[]) {
  let result = text;
  for (const entry of entries) {
    for (const variant of entry.variants ?? []) {
      result = result.replace(wordBoundaryExpression(variant), entry.canonical);
    }
  }
  return result;
}
