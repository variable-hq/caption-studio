import qrcode from "qrcode-generator";

const MAX_VIEWER_URL_BYTES = 300;

export function validateViewerQrUrl(url: string): string | null {
  if (new TextEncoder().encode(url).length > MAX_VIEWER_URL_BYTES) return null;

  try {
    const parsed = new URL(url);
    if ((parsed.protocol !== "https:" && parsed.protocol !== "http:") || parsed.pathname !== "/view") return null;
    return url;
  } catch {
    return null;
  }
}

export function viewerQrMatrix(url: string): boolean[][] | null {
  if (!validateViewerQrUrl(url)) return null;

  try {
    const code = qrcode(0, "M");
    code.addData(url, "Byte");
    code.make();
    const size = code.getModuleCount();
    return Array.from({ length: size }, (_, row) =>
      Array.from({ length: size }, (_, column) => code.isDark(row, column)),
    );
  } catch {
    return null;
  }
}
