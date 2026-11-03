import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

interface WranglerConfig {
  durable_objects: { bindings: { name: string; class_name: string }[] };
  migrations: Record<string, unknown>[];
}

const wrangler = JSON.parse(
  readFileSync(new URL("../../wrangler.jsonc", import.meta.url), "utf8"),
) as WranglerConfig;
const workerEntry = readFileSync(new URL("../../custom-worker.ts", import.meta.url), "utf8");

describe("Durable Object migrations and bindings", () => {
  it("keeps migrations v1 to v3 unchanged", () => {
    expect(wrangler.migrations.slice(0, 3)).toEqual([
      { tag: "v1", new_sqlite_classes: ["CaptionRoom"] },
      { tag: "v2", new_sqlite_classes: ["SermonJournal", "AiUsageLedger"] },
      { tag: "v3", new_sqlite_classes: ["OperatorPreferences"] },
    ]);
  });

  it("renames SermonJournal to TranscriptJournal in migration v4", () => {
    expect(wrangler.migrations.slice(3)).toEqual([
      { tag: "v4", renamed_classes: [{ from: "SermonJournal", to: "TranscriptJournal" }] },
    ]);
  });

  it("binds the renamed journal under TRANSCRIPT_JOURNALS and the other classes unchanged", () => {
    expect(wrangler.durable_objects.bindings).toEqual([
      { name: "CAPTION_ROOMS", class_name: "CaptionRoom" },
      { name: "TRANSCRIPT_JOURNALS", class_name: "TranscriptJournal" },
      { name: "AI_USAGE", class_name: "AiUsageLedger" },
      { name: "OPERATOR_PREFERENCES", class_name: "OperatorPreferences" },
    ]);
  });

  it("exports every bound class from custom-worker.ts and no longer exports the old name", () => {
    for (const binding of wrangler.durable_objects.bindings) {
      expect(workerEntry, binding.class_name).toMatch(new RegExp(`export \\{ ${binding.class_name} \\} from `));
    }
    expect(workerEntry).not.toContain("SermonJournal");
  });
});
