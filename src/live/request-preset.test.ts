import { describe, expect, it } from "vitest";

import { requestPresetId } from "@/live/request-preset";

describe("requestPresetId", () => {
  it("uses the Start bar choice before a session exists", () => {
    expect(requestPresetId(null, "builtin:keynote")).toBe("builtin:keynote");
    expect(requestPresetId(null, undefined)).toBeUndefined();
  });

  it("uses the running session's own format, whatever the Start bar now says", () => {
    expect(requestPresetId({ presetId: "builtin:sermon" }, "builtin:talkshow")).toBe("builtin:sermon");
  });

  it("reads a running session that began before formats as General", () => {
    expect(requestPresetId({}, "builtin:talkshow")).toBe("builtin:general");
  });
});
