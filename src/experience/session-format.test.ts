import { describe, expect, it } from "vitest";

import { runningSessionFormat, screenFollowsSessionFormat } from "@/experience/session-format";

describe("runningSessionFormat", () => {
  it("is null when no session is running", () => {
    expect(runningSessionFormat(false, "builtin:sermon", undefined)).toBeNull();
  });

  it("is the session's own format, from the controlling tab first and then a watching tab", () => {
    expect(runningSessionFormat(true, "builtin:sermon", undefined)).toBe("builtin:sermon");
    expect(runningSessionFormat(true, undefined, "builtin:keynote")).toBe("builtin:keynote");
    expect(runningSessionFormat(true, "builtin:talkshow", "builtin:keynote")).toBe("builtin:talkshow");
  });

  it("reads a session that began before formats, or with an unknown id, as General", () => {
    expect(runningSessionFormat(true, undefined, undefined)).toBe("builtin:general");
    expect(runningSessionFormat(true, "builtin:market", undefined)).toBe("builtin:general");
    expect(runningSessionFormat(true, "custom:3f2a9c1e-6b7d-4e8f-9a0b-1c2d3e4f5a6b", undefined)).toBe("builtin:general");
  });
});

describe("screenFollowsSessionFormat", () => {
  it("follows a running session on Live and Transcripts only", () => {
    expect(screenFollowsSessionFormat("live", "builtin:sermon")).toBe(true);
    expect(screenFollowsSessionFormat("transcripts", "builtin:sermon")).toBe(true);
    expect(screenFollowsSessionFormat("settings", "builtin:sermon")).toBe(false);
    expect(screenFollowsSessionFormat("help", "builtin:sermon")).toBe(false);
  });

  it("follows nothing when no session is running", () => {
    for (const screen of ["live", "transcripts", "settings", "help"] as const) {
      expect(screenFollowsSessionFormat(screen, null)).toBe(false);
    }
  });
});
