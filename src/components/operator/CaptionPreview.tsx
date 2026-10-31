"use client";

import { useEffect, useRef, useState } from "react";

import type { LanguageLocale, SourceLanguage } from "@/domain/languages";
import { useT } from "@/i18n/provider";
import type { CaptionStyle } from "@/live/contracts";

const CAPTION_FONT_STACKS: Record<CaptionStyle["fontFamily"], string> = {
  "sans-serif": "Arial, Helvetica, sans-serif",
  serif: '"Times New Roman", Times, serif',
  monospace: '"Courier New", Courier, monospace',
};

function transparentBackground(hex: string, transparency: number) {
  const channels = hex.match(/[0-9a-f]{2}/gi)?.map((value) => parseInt(value, 16));
  if (!channels || channels.length !== 3) return "transparent";
  return `rgba(${channels.join(", ")}, ${(100 - transparency) / 100})`;
}

interface PreviewProps {
  caption: string;
  style: CaptionStyle;
  badge: string;
  live?: boolean;
  sourceText?: string;
  targetLanguage?: LanguageLocale;
  sourceLanguage?: SourceLanguage;
}

const OBS_CANVAS_WIDTH = 1920;
const OBS_CANVAS_HEIGHT = 1080;

/**
 * Renders the caption on a real 1920 × 1080 stage and scales the stage to the card, so
 * line breaks, sizes and margins match the OBS Browser Source (src/live/overlay-document.ts)
 * instead of approximating them with responsive typography.
 */
export function CaptionPreview({
  caption,
  style,
  badge,
  live,
  sourceText,
  targetLanguage,
  sourceLanguage,
}: PreviewProps) {
  const t = useT();
  const frameRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.25);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry?.contentRect.width ?? frame.clientWidth;
      if (width > 0) setScale(width / OBS_CANVAS_WIDTH);
    });
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  // The overlay pads its stage in vh/vw of a 1080 × 1920 canvas; the same distances in px.
  const marginY = `${Math.round((style.verticalMarginPercent / 100) * OBS_CANVAS_HEIGHT)}px`;
  const marginX = `${Math.round((style.horizontalMarginPercent / 100) * OBS_CANVAS_WIDTH)}px`;

  return (
    <section className="previewCard" aria-label={t("captionPreview.label", { badge })}>
      <div className="videoFrame" ref={frameRef}>
        <div
          className="previewStage"
          style={{
            transform: `scale(${scale})`,
            padding: `${marginY} ${marginX}`,
            alignItems:
              style.verticalAlign === "top"
                ? "flex-start"
                : style.verticalAlign === "middle"
                  ? "center"
                  : "flex-end",
          }}
        >
          <div className="previewSafeArea" aria-hidden="true" style={{ inset: `${marginY} ${marginX}` }} />
          <div
            className="captionPreview"
            data-testid="caption-preview"
            lang={targetLanguage}
            style={{
              color: style.textColor,
              fontFamily: CAPTION_FONT_STACKS[style.fontFamily],
              fontSize: `${style.fontSize}px`,
              textAlign: style.horizontalAlign,
            }}
          >
            <span
              className="captionPreviewText"
              style={{
                backgroundColor: caption
                  ? transparentBackground(
                      style.backgroundColor,
                      style.backgroundTransparency,
                    )
                  : "transparent",
              }}
            >
              {caption}
            </span>
          </div>
        </div>
        {!caption ? (
          <p className="previewEmpty">
            {t("captionPreview.emptyTitle")}
            <span>{live ? t("captionPreview.emptyListening") : t("captionPreview.emptyClear")}</span>
          </p>
        ) : null}
      </div>
      <p className="previewHelp">{t("captionPreview.help")}</p>
      {sourceText ? (
        <div className="sourceTranscript">
          <strong>{t("captionPreview.heardLabel")}</strong>
          <p lang={sourceLanguage === "auto" ? undefined : sourceLanguage}>{sourceText}</p>
        </div>
      ) : null}
    </section>
  );
}
