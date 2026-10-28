import { describe, expect, it } from "vitest";

import { buildEnvelopeSystemMessage } from "./prompt-envelope";

describe("buildEnvelopeSystemMessage", () => {
  it("fences multiple guidance blocks independently under the immutable rules", () => {
    const message = buildEnvelopeSystemMessage("TRANSLATION", ["Keep the output contract."], [
      { label: "OPERATOR TRANSLATION GUIDANCE", text: "Use a warm tone." },
      { label: "OPERATOR LIVE NOTE", text: "Blue bell is a name." },
    ]);

    expect(message.content).toContain("Keep the output contract.");
    expect(message.content).toContain("--- BEGIN OPERATOR TRANSLATION GUIDANCE (JSON STRING) ---");
    expect(message.content).toContain(JSON.stringify("Use a warm tone."));
    expect(message.content).toContain("--- BEGIN OPERATOR LIVE NOTE (JSON STRING) ---");
    expect(message.content).toContain(JSON.stringify("Blue bell is a name."));
    expect(message.content.match(/immutable translation and output contract remain in force/gu)).toHaveLength(2);
  });
});
