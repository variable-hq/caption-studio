export const RECENT_OUTPUTS_LIMIT = 3;

export interface RecentOutput {
  id: string;
  at: number;
  sourceText: string;
  publicText: string;
  hidden: boolean;
  buffered: boolean;
}

export function addRecentOutput(list: readonly RecentOutput[], entry: RecentOutput): RecentOutput[] {
  return [entry, ...list].slice(0, RECENT_OUTPUTS_LIMIT);
}
