import { describe, expect, it } from "vitest";

import { formatObservedAt } from "./format-observed-at";

describe("formatObservedAt", () => {
  it.each(["en", "id"] as const)("includes the date and time for %s", (locale) => {
    const date = new Date("2026-10-30T22:05:00.000Z");
    const output = formatObservedAt(date, locale);
    const time = new Intl.DateTimeFormat(locale, { timeStyle: "short" }).format(date);
    const dateOnly = new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date);

    expect(output).toContain(time);
    expect(output).not.toBe(dateOnly);
  });
});
