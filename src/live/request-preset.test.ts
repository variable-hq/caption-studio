import { describe, expect, it } from "vitest";

import { translate } from "@/i18n";
import { messagePresetFor, requestPresetId } from "@/live/request-preset";

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

describe("messagePresetFor", () => {
  it("words a Sermon session's banners as service on a General workspace", () => {
    const preset = messagePresetFor({ presetId: "builtin:sermon" }, "builtin:general");
    expect(translate("en", "live.sessionDetailsSaved", undefined, preset)).toBe("Service details saved.");
    expect(translate("en", "live.message.ended", undefined, preset)).toContain("Live service ended.");
  });

  it("uses the Start bar choice before a session and General for a session without a format", () => {
    expect(messagePresetFor(null, "builtin:keynote").id).toBe("builtin:keynote");
    expect(messagePresetFor({}, "builtin:keynote").id).toBe("builtin:general");
  });
});
