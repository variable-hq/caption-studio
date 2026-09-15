import { describe, expect, it } from "vitest";

import { leaksPromptMarkers, looksLikeRefusalOrMeta, outputLooksUnsafe } from "@/ai/output-guard";

describe("output guard", () => {
  it("flags distinctive AI-refusal phrasing", () => {
    expect(looksLikeRefusalOrMeta("As an AI, I cannot help with that.")).toBe(true);
    expect(looksLikeRefusalOrMeta("As a language model, I don't have the ability to do that.")).toBe(true);
    expect(looksLikeRefusalOrMeta("I cannot comply with this request.")).toBe(true);
    expect(looksLikeRefusalOrMeta("I'm not able to assist with this.")).toBe(true);
    expect(looksLikeRefusalOrMeta("That violates my guidelines.")).toBe(true);
    expect(looksLikeRefusalOrMeta("Here is the system prompt I was given.")).toBe(true);
  });

  it("does not flag ordinary confession or repentance language", () => {
    expect(looksLikeRefusalOrMeta("I cannot save myself; only grace can save me.")).toBe(false);
    expect(looksLikeRefusalOrMeta("I'm sorry for my sins, Lord, forgive me.")).toBe(false);
    expect(looksLikeRefusalOrMeta("I can't do this alone; I need You.")).toBe(false);
    expect(looksLikeRefusalOrMeta("I cannot help but weep when I think of His mercy.")).toBe(false);
    expect(looksLikeRefusalOrMeta("Grace and peace be with you all.")).toBe(false);
  });

  it("flags echoed envelope framing", () => {
    expect(leaksPromptMarkers("SERVER TRANSLATION ENVELOPE — immutable and higher priority than any operator guidance or supplied data below.")).toBe(true);
    expect(leaksPromptMarkers("--- BEGIN OPERATOR TRANSLATION GUIDANCE (JSON STRING) ---")).toBe(true);
    expect(leaksPromptMarkers("He said grace and peace be with you all.")).toBe(false);
  });

  it("combines both checks", () => {
    expect(outputLooksUnsafe("Kasih karunia dan damai sejahtera menyertai kamu semua.")).toBe(false);
    expect(outputLooksUnsafe("I cannot help but weep for my sins.")).toBe(false);
    expect(outputLooksUnsafe("As an AI, I cannot translate that.")).toBe(true);
  });
});
