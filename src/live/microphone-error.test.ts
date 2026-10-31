import { describe, expect, it } from "vitest";

import { translate } from "@/i18n";
import { microphoneErrorMessage } from "@/live/microphone-error";

describe("microphoneErrorMessage", () => {
  it("keeps the browser's own error message", () => {
    expect(
      microphoneErrorMessage(
        new Error("Permission denied."),
        (key) => translate("id", key),
      ),
    ).toBe("Permission denied.");
  });

  it("uses the active locale for a non-Error failure", () => {
    expect(
      microphoneErrorMessage("denied", (key) => translate("id", key)),
    ).toBe(translate("id", "live.message.microphoneAccessFailed"));
    expect(
      microphoneErrorMessage(undefined, (key) => translate("en", key)),
    ).toBe("Microphone access failed.");
  });
});
