import { describe, expect, it } from "vitest";

import { parseGlossaryInput, parseModerationInput } from "@/live/config";
import {
  addLiveWord,
  combineFilterText,
  combineKeywordText,
  LIVE_WORD_ACTIONS,
  liveWordsToSettings,
  MAX_LIVE_WORD_ENTRIES,
  mergeGlossaries,
  removeLiveWord,
} from "@/live/live-words";
import {
  MAX_FILTER_INPUT_CHARS,
  MAX_TERMINOLOGY_INPUT_CHARS,
  normalizeTranslationSessionSettings,
  translationSettingsFingerprint,
} from "@/live/translation-settings";
import { applyModeration } from "@/pipeline/moderation";
import { keywordHints } from "@/pipeline/glossary";

describe("live words", () => {
  it("cleans values, replaces case-insensitive action and word duplicates, and normalizes Unicode", () => {
    let entries = addLiveWord([], { word: "badword", action: "hide", with: "ignored" });
    entries = addLiveWord(entries, { word: "BadWord", action: "hide", with: "" });
    expect(entries).toHaveLength(1);
    expect(entries[0].row).toEqual({ word: "BadWord", action: "hide", with: "" });

    const precomposed = addLiveWord([], { word: "café", action: "recognise", with: "" });
    const combining = addLiveWord(precomposed, { word: "café", action: "recognise", with: "" });
    expect(combining).toHaveLength(1);
    expect(combining[0].row.word).toBe("café");
  });

  it("accepts only the four live actions and requires With for fixes and translations", () => {
    expect(LIVE_WORD_ACTIONS).toEqual(["hide", "fix", "translate", "recognise"]);
    expect(addLiveWord([], { word: "name", action: "mask", with: "" })).toEqual([]);
    expect(addLiveWord([], { word: "misheard", action: "fix", with: "" })).toEqual([]);
    expect(addLiveWord([], { word: "name", action: "translate", with: " " })).toEqual([]);
    expect(addLiveWord([], { word: "name", action: "fix", with: "Pastor Ken" })[0].row).toEqual({
      word: "name", action: "fix", with: "Pastor Ken",
    });
  });

  it("allows different actions for one word, preserves entries at the cap, and removes by id", () => {
    let entries = addLiveWord([], { word: "name", action: "recognise", with: "" });
    entries = addLiveWord(entries, { word: "name", action: "hide", with: "" });
    expect(entries).toHaveLength(2);
    for (let index = 0; index < MAX_LIVE_WORD_ENTRIES + 5; index += 1) {
      entries = addLiveWord(entries, { word: `word-${index}`, action: "recognise", with: "" });
    }
    expect(entries).toHaveLength(MAX_LIVE_WORD_ENTRIES);
    expect(entries[0].row).toEqual({ word: "name", action: "recognise", with: "" });
    expect(entries[1].row).toEqual({ word: "name", action: "hide", with: "" });
    const fullList = entries;
    entries = addLiveWord(entries, { word: "twenty-first", action: "hide", with: "" });
    expect(entries).toEqual(fullList);
    entries = removeLiveWord(entries, entries[0].id);
    expect(entries).toHaveLength(MAX_LIVE_WORD_ENTRIES - 1);
    expect(addLiveWord(entries, { word: "twenty-first", action: "hide", with: "" })).toHaveLength(MAX_LIVE_WORD_ENTRIES);
  });

  it("combines live text first and truncates the saved tail", () => {
    expect(combineKeywordText("live term", "saved term", 14)).toBe("live term, sav");
    expect(combineFilterText("live=>!hide", "saved", 18)).toBe("live=>!hide, saved");
    expect(combineFilterText("live", "", 100)).toBe("live");
    expect(combineKeywordText("live", "x".repeat(MAX_TERMINOLOGY_INPUT_CHARS + 1))).toHaveLength(MAX_TERMINOLOGY_INPUT_CHARS);
    expect(combineFilterText("live", "x".repeat(MAX_FILTER_INPUT_CHARS + 1))).toHaveLength(MAX_FILTER_INPUT_CHARS);
  });

  it("merges glossary aliases and lets a live translation win with live IDs and priority", () => {
    const saved = parseGlossaryInput("Grace|Gracie => Saved translation, Bethlehem", "id");
    const live = parseGlossaryInput("grace|G => Live translation, Pastor Ken", "id");
    const merged = mergeGlossaries(saved, live);

    expect(merged[0]).toMatchObject({
      id: "live-word-0",
      canonical: "grace",
      variants: ["G", "Gracie"],
      priority: 80,
      preferredTranslations: { id: "Live translation" },
    });
    expect(merged[1]).toMatchObject({ id: "live-word-1", canonical: "Pastor Ken" });
    expect(merged[2]).toMatchObject({ canonical: "Bethlehem", priority: 39 });
    expect(keywordHints(merged).slice(0, 5)).toEqual(["grace", "G", "Gracie", "Pastor Ken", "Bethlehem"]);
  });

  it("puts a live hide row ahead of the saved filter in the production syntax", () => {
    const live = addLiveWord([], { word: "urgent", action: "hide", with: "" });
    const liveSettings = liveWordsToSettings(live);
    const rules = parseModerationInput(combineFilterText(liveSettings.filterText, "urgent", 4_000));
    expect(liveSettings.filterText).toBe("urgent=>!hide");
    expect(applyModeration("Say urgent now", rules)).toMatchObject({ publicText: "", hidden: true });
  });

  it("does not add live entries to the translation settings fingerprint", () => {
    const settings = normalizeTranslationSessionSettings({ keywordText: "Saved term", filterText: "saved filter" });
    const before = translationSettingsFingerprint(settings);
    const live = addLiveWord([], { word: "Live term", action: "recognise", with: "" });
    expect(liveWordsToSettings(live).keywordText).toBe("Live term");
    expect(translationSettingsFingerprint(settings)).toBe(before);
  });
});
