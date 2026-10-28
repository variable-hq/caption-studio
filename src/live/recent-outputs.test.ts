import { describe, expect, it } from "vitest";
import { addRecentOutput, RECENT_OUTPUTS_LIMIT, type RecentOutput } from "./recent-outputs";

const entry = (id: string, hidden = false): RecentOutput => ({ id, at: 1, sourceText: `source ${id}`, publicText: `public ${id}`, hidden, buffered: false });
describe("recent outputs", () => {
  it("puts the newest first, keeps three and preserves hidden state", () => {
    const entries = [entry("a"), entry("b"), entry("c")];
    const next = addRecentOutput(entries, entry("d", true));
    expect(next.map((item) => item.id)).toEqual(["d", "a", "b"]);
    expect(next).toHaveLength(RECENT_OUTPUTS_LIMIT);
    expect(next[0]?.hidden).toBe(true);
  });
});
