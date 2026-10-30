import { describe, expect, it } from "vitest";

import { formatClock } from "./format-clock";

describe("formatClock", () => {
  it.each(["en", "id"] as const)("keeps minutes unpadded and pads seconds for %s", (locale) => {
    expect(formatClock(5 * 60_000 + 7_000, locale)).toBe("5:07");
    expect(formatClock(5_000, locale)).toBe("0:05");
  });
});
