import { describe, expect, it } from "vitest";

import {
  MAX_QUICK_BLOCK_ENTRIES,
  MAX_QUICK_BLOCK_TERM_CHARS,
  addQuickBlockEntry,
  combineFilterText,
  quickBlockFilterText,
  removeQuickBlockEntry,
} from "@/live/quick-block";
import { mergeModerationRules, parseModerationInput } from "@/live/config";
import { applyModeration } from "@/pipeline/moderation";

describe("quick block list", () => {
  it("adds, bounds, and replaces a case-insensitive duplicate", () => {
    let entries = addQuickBlockEntry([], "badword");
    expect(entries).toHaveLength(1);
    entries = addQuickBlockEntry(entries, "BadWord");
    expect(entries).toHaveLength(1);
    entries = addQuickBlockEntry(entries, "x".repeat(200));
    expect(entries.at(-1)?.term).toHaveLength(MAX_QUICK_BLOCK_TERM_CHARS);
    entries = addQuickBlockEntry(entries, "   ");
    expect(entries).toHaveLength(2);
  });

  it("treats different Unicode compositions of the same term as a duplicate", () => {
    const precomposed = "café"; // "café" using the single precomposed U+00E9
    const combining = "café"; // "café" using "e" (U+0065) + U+0301 combining acute accent
    expect(precomposed).not.toBe(combining); // guards against the literals themselves being equal
    let entries = addQuickBlockEntry([], precomposed);
    entries = addQuickBlockEntry(entries, combining);
    expect(entries).toHaveLength(1);
    expect(entries[0].term).toBe(precomposed);
  });

  it("caps the list at the maximum size, dropping the oldest", () => {
    let entries: ReturnType<typeof addQuickBlockEntry> = [];
    for (let i = 0; i < MAX_QUICK_BLOCK_ENTRIES + 5; i++) entries = addQuickBlockEntry(entries, `term-${i}`);
    expect(entries).toHaveLength(MAX_QUICK_BLOCK_ENTRIES);
    expect(entries[0].term).toBe("term-5");
  });

  it("removes by id", () => {
    const entries = addQuickBlockEntry([], "badword");
    expect(removeQuickBlockEntry(entries, entries[0].id)).toEqual([]);
  });

  it("serializes to the hide-segment syntax parseModerationInput understands", () => {
    const entries = addQuickBlockEntry(addQuickBlockEntry([], "one"), "two");
    expect(parseModerationInput(quickBlockFilterText(entries))).toEqual([
      { id: "operator-filter-0", term: "one", mode: "hide-segment" },
      { id: "operator-filter-1", term: "two", mode: "hide-segment" },
    ]);
  });

  it("takes priority over an existing weaker saved rule for the same term when merged first", () => {
    const savedFilter = parseModerationInput("badword");
    const quickBlock = parseModerationInput(quickBlockFilterText(addQuickBlockEntry([], "badword")));
    const rules = mergeModerationRules([quickBlock, savedFilter]);
    expect(applyModeration("say badword now", rules)).toMatchObject({ publicText: "", hidden: true });
  });

  it("is silently bypassed if merged after the saved rule instead of before", () => {
    const savedFilter = parseModerationInput("badword");
    const quickBlock = parseModerationInput(quickBlockFilterText(addQuickBlockEntry([], "badword")));
    const rules = mergeModerationRules([savedFilter, quickBlock]);
    expect(applyModeration("say badword now", rules).hidden).toBe(false);
  });
});

describe("combineFilterText", () => {
  it("joins quick-block terms before the saved filter", () => {
    const entries = addQuickBlockEntry([], "urgent");
    expect(combineFilterText(entries, "saved", 4_000)).toBe("urgent=>!hide, saved");
  });

  it("omits the separator when either side is empty", () => {
    expect(combineFilterText([], "saved", 4_000)).toBe("saved");
    expect(combineFilterText(addQuickBlockEntry([], "urgent"), "", 4_000)).toBe("urgent=>!hide");
    expect(combineFilterText([], "", 4_000)).toBe("");
  });

  it("truncates the combined string, keeping quick-block terms over the saved filter", () => {
    const entries = addQuickBlockEntry([], "urgent");
    const savedFilter = "x".repeat(4_000);
    const combined = combineFilterText(entries, savedFilter, 4_000);
    expect(combined).toHaveLength(4_000);
    expect(combined.startsWith("urgent=>!hide")).toBe(true);
    // The quick-block rule still parses and fires correctly out of the truncated string.
    const rules = parseModerationInput(combined);
    expect(rules[0]).toMatchObject({ term: "urgent", mode: "hide-segment" });
    expect(applyModeration("say urgent now", rules)).toMatchObject({ hidden: true });
  });

  it("overrides a weaker saved rule for the same term through the real production path", () => {
    // Unlike the merge-based tests above, this goes through combineFilterText and a single
    // parseModerationInput call — the exact path use-live-caption-session.ts actually runs.
    const entries = addQuickBlockEntry([], "badword");
    const combined = combineFilterText(entries, "badword", 4_000);
    const rules = parseModerationInput(combined);
    expect(applyModeration("say badword now", rules)).toMatchObject({ publicText: "", hidden: true });
  });
});
