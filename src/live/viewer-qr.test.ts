import { describe, expect, it } from "vitest";
import { validateViewerQrUrl, viewerQrMatrix } from "@/live/viewer-qr";

const viewerUrl = `https://caption.example.test/view#main.${"v".repeat(43)}`;

describe("viewerQrMatrix", () => {
  it("encodes a valid viewer link as a square matrix with three finder patterns", () => {
    const matrix = viewerQrMatrix(viewerUrl);
    expect(matrix).not.toBeNull();
    expect(matrix!.every((row) => row.length === matrix!.length)).toBe(true);
    for (const [top, left] of [[0, 0], [0, matrix!.length - 7], [matrix!.length - 7, 0]]) {
      expect(matrix![top + 3][left + 3]).toBe(true);
      expect(matrix![top][left]).toBe(true);
      expect(matrix![top + 1][left + 1]).toBe(false);
    }
  });

  it("is deterministic for the same link and changes when its token changes", () => {
    expect(viewerQrMatrix(viewerUrl)).toEqual(viewerQrMatrix(viewerUrl));
    expect(viewerQrMatrix(viewerUrl)).not.toEqual(viewerQrMatrix(viewerUrl.replace(/v{43}$/u, "w".repeat(43))));
  });

  it.each([
    ["OBS overlay", "https://caption.example.test/overlay#main.token"],
    ["non URL", "not a URL"],
    ["empty", ""],
    ["non HTTP scheme", "javascript:alert(1)"],
    ["oversized URL", `https://caption.example.test/view#${"x".repeat(300)}`],
  ])("returns null for %s", (_name, url) => {
    expect(viewerQrMatrix(url)).toBeNull();
  });

  it("keeps the current synthetic viewer link within the UI size bound", () => {
    expect(new TextEncoder().encode(viewerUrl).length).toBeLessThanOrEqual(300);
    const matrix = viewerQrMatrix(viewerUrl);
    expect(matrix).not.toBeNull();
    expect(matrix!.length).toBeLessThanOrEqual(37);
  });
});

describe("validateViewerQrUrl", () => {
  it("returns the original link for a bounded /view URL", () => {
    expect(validateViewerQrUrl(viewerUrl)).toBe(viewerUrl);
  });
});
