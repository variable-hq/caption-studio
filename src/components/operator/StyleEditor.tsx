"use client";

import type { CaptionStyle } from "@/live/contracts";

export interface StyleEditorProps {
  style: CaptionStyle;
  setFontSize: (value: number) => void;
  setTextColor: (value: string) => void;
  setBackgroundColor: (value: string) => void;
  setBackgroundTransparency: (value: number) => void;
  setHorizontalMarginPercent: (value: number) => void;
  setVerticalMarginPercent: (value: number) => void;
  setHorizontalAlign: (value: CaptionStyle["horizontalAlign"]) => void;
  setVerticalAlign: (value: CaptionStyle["verticalAlign"]) => void;
  setFontFamily: (value: CaptionStyle["fontFamily"]) => void;
  onSave: () => void;
  saving: boolean;
  savedMessage: string;
  /** The operator's saved account default style, if any — badges matching options. */
  defaultStyle?: CaptionStyle | null;
}

export function StyleEditor({
  style,
  setFontSize,
  setTextColor,
  setBackgroundColor,
  setBackgroundTransparency,
  setHorizontalMarginPercent,
  setVerticalMarginPercent,
  setHorizontalAlign,
  setVerticalAlign,
  setFontFamily,
  onSave,
  saving,
  savedMessage,
  defaultStyle = null,
}: StyleEditorProps) {
  return (
    <div className="styleEditor">
      <div className="fieldGrid">
        <label className="rangeControl fullField">
          <span>Text size <strong>{style.fontSize}px</strong></span>
          <input
            type="range"
            min="10"
            max="72"
            value={style.fontSize}
            aria-label={`Text size ${style.fontSize}px`}
            onInput={(event) => setFontSize(Number(event.currentTarget.value))}
          />
        </label>
        <label>
          Font
          <select
            value={style.fontFamily}
            onChange={(event) =>
              setFontFamily(event.target.value as CaptionStyle["fontFamily"])
            }
          >
            <option value="sans-serif">Sans serif{defaultStyle?.fontFamily === "sans-serif" ? " · Church default" : ""}</option>
            <option value="serif">Times serif{defaultStyle?.fontFamily === "serif" ? " · Church default" : ""}</option>
            <option value="monospace">Monospace{defaultStyle?.fontFamily === "monospace" ? " · Church default" : ""}</option>
          </select>
        </label>
        <label>
          Line alignment
          <select
            value={style.horizontalAlign}
            onChange={(event) =>
              setHorizontalAlign(
                event.target.value as CaptionStyle["horizontalAlign"],
              )
            }
          >
            <option value="left">Left{defaultStyle?.horizontalAlign === "left" ? " · Church default" : ""}</option>
            <option value="center">Centre{defaultStyle?.horizontalAlign === "center" ? " · Church default" : ""}</option>
            <option value="right">Right{defaultStyle?.horizontalAlign === "right" ? " · Church default" : ""}</option>
          </select>
        </label>
        <label>
          Position
          <select
            value={style.verticalAlign}
            onChange={(event) =>
              setVerticalAlign(event.target.value as CaptionStyle["verticalAlign"])
            }
          >
            <option value="top">Top{defaultStyle?.verticalAlign === "top" ? " · Church default" : ""}</option>
            <option value="middle">Middle{defaultStyle?.verticalAlign === "middle" ? " · Church default" : ""}</option>
            <option value="bottom">Bottom{defaultStyle?.verticalAlign === "bottom" ? " · Church default" : ""}</option>
          </select>
        </label>
        <label>
          Text colour
          <span className="colorControl">
            <input
              type="color"
              value={style.textColor}
              aria-label={`Text colour ${style.textColor}`}
              onInput={(event) => setTextColor(event.currentTarget.value)}
            />
            <code>{style.textColor}</code>
          </span>
        </label>
        <label>
          Band colour
          <span className="colorControl">
            <input
              type="color"
              value={style.backgroundColor}
              aria-label={`Caption background ${style.backgroundColor}`}
              onInput={(event) => setBackgroundColor(event.currentTarget.value)}
            />
            <code>{style.backgroundColor}</code>
          </span>
        </label>
        <label className="rangeControl fullField">
          <span>
            Band transparency <strong>{style.backgroundTransparency}%</strong>
          </span>
          <input
            type="range"
            min="0"
            max="100"
            value={style.backgroundTransparency}
            aria-label={`Band transparency ${style.backgroundTransparency}%`}
            onInput={(event) =>
              setBackgroundTransparency(Number(event.currentTarget.value))
            }
          />
        </label>
        <label className="rangeControl fullField">
          <span>
            Side margin <strong>{style.horizontalMarginPercent}%</strong>
          </span>
          <input
            type="range"
            min="0"
            max="20"
            value={style.horizontalMarginPercent}
            aria-label={`Side margin ${style.horizontalMarginPercent}%`}
            onInput={(event) =>
              setHorizontalMarginPercent(Number(event.currentTarget.value))
            }
          />
        </label>
        <label className="rangeControl fullField">
          <span>
            Top and bottom margin <strong>{style.verticalMarginPercent}%</strong>
          </span>
          <input
            type="range"
            min="0"
            max="20"
            value={style.verticalMarginPercent}
            aria-label={`Top and bottom margin ${style.verticalMarginPercent}%`}
            onInput={(event) =>
              setVerticalMarginPercent(Number(event.currentTarget.value))
            }
          />
        </label>
      </div>
      <div className="saveRow">
        <button className="secondaryButton" type="button" onClick={onSave} disabled={saving}>
          {saving ? "Saving…" : "Save for next week"}
        </button>
        <p role="status" aria-live="polite" aria-atomic="true">
          {savedMessage}
        </p>
      </div>
    </div>
  );
}
