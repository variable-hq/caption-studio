import { describe, expect, it } from "vitest";

import {
  parseGlossaryInput,
  parseModerationInput,
  preferredTermMap,
} from "@/live/config";
import { normalizeCaptionStyle } from "@/live/contracts";

describe("live caption configuration", () => {
  it("parses recognition hints and target-language preferred terms", () => {
    const glossary = parseGlossaryInput(
      "Jesus Christ => Yesus Kristus, Nebuchadnezzar",
      "id",
    );

    expect(glossary.map(({ canonical }) => canonical)).toEqual([
      "Jesus Christ",
      "Nebuchadnezzar",
    ]);
    expect(preferredTermMap(glossary, "id")).toEqual({
      "Jesus Christ": "Yesus Kristus",
    });
  });

  it("bounds operator-supplied moderation and display values", () => {
    expect(parseModerationInput("badword, another")).toHaveLength(2);
    expect(
      normalizeCaptionStyle({
        fontSize: 500,
        textColor: "not-a-colour",
        backgroundColor: "#123456",
        backgroundTransparency: 34,
        horizontalAlign: "right",
        verticalAlign: "top",
        fontFamily: "serif",
      }),
    ).toEqual({
      fontSize: 72,
      textColor: "#ffffff",
      backgroundColor: "#123456",
      backgroundTransparency: 34,
      horizontalAlign: "right",
      verticalAlign: "top",
      fontFamily: "serif",
    });

    expect(normalizeCaptionStyle({ fontSize: -20, backgroundTransparency: 120 })).toEqual({
      fontSize: 10,
      textColor: "#ffffff",
      backgroundColor: "#101827",
      backgroundTransparency: 100,
      horizontalAlign: "center",
      verticalAlign: "bottom",
      fontFamily: "sans-serif",
    });
  });
});
