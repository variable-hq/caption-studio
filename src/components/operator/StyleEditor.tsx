"use client";

import { SaveBar, SettingGroup } from "@/components/operator/SettingsParts";
import { useT } from "@/i18n/provider";
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
  const t = useT();
  const badge = (matches: boolean) => matches ? t("common.churchDefaultBadge") : "";
  return (
    <>
      <SettingGroup title={t("styleEditor.textTitle")}>
        <div className="fieldGrid">
          <label className="rangeControl fullField">
            <span>{t("styleEditor.textSize", { size: style.fontSize })}</span>
            <input
              type="range"
              min="10"
              max="72"
              value={style.fontSize}
              aria-label={t("styleEditor.textSize", { size: style.fontSize })}
              onInput={(event) => setFontSize(Number(event.currentTarget.value))}
            />
          </label>
          <label>
            {t("styleEditor.font")}
            <select
              value={style.fontFamily}
              onChange={(event) =>
                setFontFamily(event.target.value as CaptionStyle["fontFamily"])
              }
            >
              <option value="sans-serif">{t("styleEditor.sansSerif")}{badge(defaultStyle?.fontFamily === "sans-serif")}</option>
              <option value="serif">{t("styleEditor.timesSerif")}{badge(defaultStyle?.fontFamily === "serif")}</option>
              <option value="monospace">{t("styleEditor.monospace")}{badge(defaultStyle?.fontFamily === "monospace")}</option>
            </select>
          </label>
          <label>
            {t("styleEditor.textColour")}
            <span className="colorControl">
              <input
                type="color"
                value={style.textColor}
                aria-label={t("styleEditor.textColourLabel", { color: style.textColor })}
                onInput={(event) => setTextColor(event.currentTarget.value)}
              />
              <code>{style.textColor}</code>
            </span>
          </label>
        </div>
      </SettingGroup>
      <SettingGroup title={t("styleEditor.bandTitle")}>
        <div className="fieldGrid">
          <label>
            {t("styleEditor.bandColour")}
            <span className="colorControl">
              <input
                type="color"
                value={style.backgroundColor}
                aria-label={t("styleEditor.bandColourLabel", { color: style.backgroundColor })}
                onInput={(event) => setBackgroundColor(event.currentTarget.value)}
              />
              <code>{style.backgroundColor}</code>
            </span>
          </label>
          <label className="rangeControl fullField">
            <span>
              {t("styleEditor.bandTransparency", { percent: style.backgroundTransparency })}
            </span>
            <input
              type="range"
              min="0"
              max="100"
              value={style.backgroundTransparency}
              aria-label={t("styleEditor.bandTransparency", { percent: style.backgroundTransparency })}
              onInput={(event) =>
                setBackgroundTransparency(Number(event.currentTarget.value))
              }
            />
          </label>
        </div>
      </SettingGroup>
      <SettingGroup title={t("styleEditor.placementTitle")} hint={t("styleEditor.placementHint")}>
        <div className="fieldGrid">
          <label>
            {t("styleEditor.position")}
            <select
              value={style.verticalAlign}
              onChange={(event) =>
                setVerticalAlign(event.target.value as CaptionStyle["verticalAlign"])
              }
            >
              <option value="top">{t("styleEditor.top")}{badge(defaultStyle?.verticalAlign === "top")}</option>
              <option value="middle">{t("styleEditor.middle")}{badge(defaultStyle?.verticalAlign === "middle")}</option>
              <option value="bottom">{t("styleEditor.bottom")}{badge(defaultStyle?.verticalAlign === "bottom")}</option>
            </select>
          </label>
          <label>
            {t("styleEditor.lineAlignment")}
            <select
              value={style.horizontalAlign}
              onChange={(event) =>
                setHorizontalAlign(
                  event.target.value as CaptionStyle["horizontalAlign"],
                )
              }
            >
              <option value="left">{t("styleEditor.left")}{badge(defaultStyle?.horizontalAlign === "left")}</option>
              <option value="center">{t("styleEditor.centre")}{badge(defaultStyle?.horizontalAlign === "center")}</option>
              <option value="right">{t("styleEditor.right")}{badge(defaultStyle?.horizontalAlign === "right")}</option>
            </select>
          </label>
          <label className="rangeControl fullField">
            <span>
              {t("styleEditor.sideMargin", { percent: style.horizontalMarginPercent })}
            </span>
            <input
              type="range"
              min="0"
              max="20"
              value={style.horizontalMarginPercent}
              aria-label={t("styleEditor.sideMargin", { percent: style.horizontalMarginPercent })}
              onInput={(event) =>
                setHorizontalMarginPercent(Number(event.currentTarget.value))
              }
            />
          </label>
          <label className="rangeControl fullField">
            <span>
              {t("styleEditor.verticalMargin", { percent: style.verticalMarginPercent })}
            </span>
            <input
              type="range"
              min="0"
              max="20"
              value={style.verticalMarginPercent}
              aria-label={t("styleEditor.verticalMargin", { percent: style.verticalMarginPercent })}
              onInput={(event) =>
                setVerticalMarginPercent(Number(event.currentTarget.value))
              }
            />
          </label>
        </div>
      </SettingGroup>
      <SaveBar onSave={onSave} disabled={saving} status={savedMessage} label={saving ? t("common.saving") : t("common.saveForEveryone")} />
    </>
  );
}
