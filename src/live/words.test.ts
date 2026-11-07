import { describe, expect, it } from "vitest";

import { parseGlossaryInput, parseModerationInput } from "@/live/config";
import { cleanWordValue, countWordEntries, wordsFromSettings, wordsToSettings, type WordRow } from "@/live/words";

describe("Words list", () => {
  it("counts comma and newline entries after trimming blanks and whitespace", () => {
    const compiled = "Jesus, Saul, Betlehem";
    for (const text of [compiled, compiled.replaceAll(", ", ",\n"), " Jesus ,\n Saul ,, Betlehem "]) {
      expect(countWordEntries(text)).toBe(3);
    }
    expect(countWordEntries("\n, ,  \n")).toBe(0);
  });

  it("matches pipeline entry counts for well-formed lists and errs on the safe side for malformed ones", () => {
    const glossary = "Jesus Christ, Saul|swauf|sol => Saulus, Betlehem => Bethlehem";
    const filters = "darn, heck=>gosh, slur=>!hide";
    expect(countWordEntries(glossary)).toBe(parseGlossaryInput(glossary, "en").length);
    expect(countWordEntries(filters)).toBe(parseModerationInput(filters).length);
    expect(countWordEntries("=>translation")).toBeGreaterThanOrEqual(parseGlossaryInput("=>translation", "en").length);
  });

  it("reads every existing syntax into one row per word", () => {
    expect(
      wordsFromSettings(
        "Jesus Christ, Saul|swauf|sol => Saulus, Betlehem => Bethlehem",
        "darn, heck=>gosh, slur=>!hide",
      ),
    ).toEqual([
      { word: "Jesus Christ", action: "recognise", with: "" },
      { word: "swauf", action: "fix", with: "Saul" },
      { word: "sol", action: "fix", with: "Saul" },
      { word: "Saul", action: "translate", with: "Saulus" },
      { word: "Betlehem", action: "translate", with: "Bethlehem" },
      { word: "darn", action: "mask", with: "" },
      { word: "heck", action: "replace", with: "gosh" },
      { word: "slur", action: "hide", with: "" },
    ]);
  });

  it("writes rows back in the formats the pipeline parses", () => {
    const rows: WordRow[] = [
      { word: "Pastor Ken", action: "translate", with: "Pastor Kenneth" },
      { word: "swauf", action: "fix", with: "Saul" },
      { word: "Saul", action: "translate", with: "Saulus" },
      { word: "Mazmur", action: "recognise", with: "" },
      { word: "darn", action: "mask", with: "" },
      { word: "heck", action: "replace", with: "gosh" },
      { word: "slur", action: "hide", with: "" },
    ];
    const settings = wordsToSettings(rows);
    expect(settings).toEqual({
      keywordText: "Pastor Ken => Pastor Kenneth, Saul|swauf => Saulus, Mazmur",
      filterText: "darn, heck=>gosh, slur=>!hide",
    });
    expect(parseGlossaryInput(settings.keywordText, "en").map(({ canonical, variants, preferredTranslations }) =>
      ({ canonical, variants, preferredTranslations }))).toEqual([
      { canonical: "Pastor Ken", variants: undefined, preferredTranslations: { en: "Pastor Kenneth" } },
      { canonical: "Saul", variants: ["swauf"], preferredTranslations: { en: "Saulus" } },
      { canonical: "Mazmur", variants: undefined, preferredTranslations: undefined },
    ]);
    expect(parseModerationInput(settings.filterText).map(({ term, mode }) => [term, mode])).toEqual([
      ["darn", "mask"],
      ["heck", "replace"],
      ["slur", "hide-segment"],
    ]);
  });

  it("round-trips existing settings without changing their meaning", () => {
    const keywordText = "Saul|swauf => Saulus, Jesus Christ, Betlehem => Bethlehem";
    const filterText = "darn, heck=>gosh, slur=>!hide";
    const settings = wordsToSettings(wordsFromSettings(keywordText, filterText));
    expect(parseGlossaryInput(settings.keywordText, "en")).toEqual(parseGlossaryInput(keywordText, "en"));
    expect(parseModerationInput(settings.filterText)).toEqual(parseModerationInput(filterText));
  });

  it("drops rows whose action needs a value they lack, and strips syntax characters", () => {
    expect(wordsToSettings([
      { word: "Ken", action: "translate", with: "" },
      { word: "a, b|c=>d", action: "recognise", with: "" },
    ])).toEqual({ keywordText: "a b c d", filterText: "" });
    expect(cleanWordValue("  Pastor,\nKen  ")).toBe("Pastor Ken");
  });
});
