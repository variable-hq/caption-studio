"use client";

import { useMemo, useState } from "react";
import { validateViewerQrUrl, viewerQrMatrix } from "@/live/viewer-qr";

const QR_QUIET_ZONE = 4;

type ViewerQrCodeProps = {
  url: string;
  showLabel: string;
  hideLabel: string;
  imageLabel: string;
  hint: string;
};

export function ViewerQrCode({ url, showLabel, hideLabel, imageLabel, hint }: ViewerQrCodeProps) {
  const [visible, setVisible] = useState(false);
  const qrUrl = useMemo(() => validateViewerQrUrl(url), [url]);
  const matrix = useMemo(() => visible && qrUrl ? viewerQrMatrix(qrUrl) : null, [qrUrl, visible]);
  const path = useMemo(() => matrix
    ? matrix.flatMap((row, y) => row.flatMap((dark, x) =>
      dark ? [`M${x + QR_QUIET_ZONE} ${y + QR_QUIET_ZONE}h1v1h-1z`] : [],
    )).join("")
    : "", [matrix]);

  if (!qrUrl) return null;
  const size = matrix ? matrix.length + QR_QUIET_ZONE * 2 : 0;

  return (
    <div className="viewerQrPanel">
      <button
        type="button"
        className="secondaryButton"
        aria-expanded={visible}
        aria-controls="phone-viewer-qr"
        aria-describedby={visible ? "phone-viewer-qr-hint" : undefined}
        onClick={() => setVisible((current) => !current)}
      >
        {visible ? hideLabel : showLabel}
      </button>
      <div id="phone-viewer-qr" hidden={!visible}>
        {matrix && (
          <>
            <svg
              className="viewerQrCode"
              xmlns="http://www.w3.org/2000/svg"
              viewBox={`0 0 ${size} ${size}`}
              role="img"
              aria-label={imageLabel}
              shapeRendering="crispEdges"
            >
              <rect width={size} height={size} fill="#fff" />
              <path d={path} fill="#000" />
            </svg>
            <p className="operatorHint" id="phone-viewer-qr-hint">{hint}</p>
          </>
        )}
      </div>
    </div>
  );
}
