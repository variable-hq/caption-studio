export function escapeRegularExpression(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Matches `term` only at Unicode word boundaries, so it won't match inside an unrelated word. */
export function wordBoundaryExpression(term: string) {
  return new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegularExpression(term)}(?![\\p{L}\\p{N}_])`, "giu");
}
