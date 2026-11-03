import { describe, expect, it } from "vitest";

import { routeFromHash } from "@/app/operator-route";

describe("operator hash routes", () => {
  it("opens Live when there is no hash or an unknown screen", () => {
    expect(routeFromHash("")).toEqual({ screen: "live", section: "computer" });
    expect(routeFromHash("#unknown")).toEqual({ screen: "live", section: "computer" });
  });

  it("opens Help and Transcripts with a valid or default settings section", () => {
    expect(routeFromHash("#help")).toEqual({ screen: "help", section: "computer" });
    expect(routeFromHash("#transcripts")).toEqual({ screen: "transcripts", section: "computer" });
    expect(routeFromHash("#sermons")).toEqual({ screen: "transcripts", section: "computer" });
    expect(routeFromHash("#help=usage")).toEqual({ screen: "help", section: "usage" });
  });

  it("opens Settings at the named section and falls back to Computer for an unknown one", () => {
    expect(routeFromHash("#settings=languages")).toEqual({ screen: "settings", section: "languages" });
    expect(routeFromHash("#settings=nope")).toEqual({ screen: "settings", section: "computer" });
  });

  it("maps the legacy workspace bookmarks to their current screens", () => {
    expect(routeFromHash("#workspace=overview")).toEqual({ screen: "live", section: "computer" });
    expect(routeFromHash("#workspace=history")).toEqual({ screen: "transcripts", section: "computer" });
    expect(routeFromHash("#workspace=translation")).toEqual({ screen: "settings", section: "languages" });
    expect(routeFromHash("#workspace=usage")).toEqual({ screen: "settings", section: "usage" });
  });

  it("opens the Presets section from its own address", () => {
    expect(routeFromHash("#settings=presets")).toEqual({ screen: "settings", section: "presets" });
    expect(routeFromHash("#settings=presets").section).not.toBe("computer");
  });
});
