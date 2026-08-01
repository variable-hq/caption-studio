"use client";

import { useEffect, useMemo, useState } from "react";

import { CloudProviderClient } from "@/ai/cloud-provider-client";
import {
  DEFAULT_SOURCE_LANGUAGE,
  DEFAULT_TARGET_LANGUAGE,
  LANGUAGE_OPTIONS,
  type LanguageLocale,
  type SourceLanguage,
} from "@/domain/languages";
import { parseGlossaryInput } from "@/live/config";
import {
  MAX_LIVE_SESSION_MS,
  MAX_TRANSCRIPTION_REQUESTS,
  normalizeCaptionStyle,
  type CaptionStyle,
} from "@/live/contracts";
import { SAMPLE_CAPTIONS } from "@/live/test-captions";
import { useLiveCaptionSession } from "@/live/use-live-caption-session";

type CloudState = "checking" | "ready" | "not-configured" | "unavailable";

const CAPTION_PREFERENCE_KEY = "church-live-caption:caption-style:v1";

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
}

function CaptionPreview({ caption, style, badge, live, sourceText }: PreviewProps) {
  return (
    <section className="previewCard" aria-labelledby="caption-preview-title">
      <div className="sectionHeading">
        <div>
          <p className="eyebrow">OBS canvas · 1920 × 1080</p>
          <h2 id="caption-preview-title">Caption preview</h2>
        </div>
        <span className={`statusChip ${live ? "live" : ""}`}>{badge}</span>
      </div>
      <div className="videoFrame">
        <div
          className="previewSafeArea"
          style={{
            inset: `${style.verticalMarginPercent}% ${style.horizontalMarginPercent}%`,
            alignItems:
              style.verticalAlign === "top"
                ? "flex-start"
                : style.verticalAlign === "middle"
                  ? "center"
                  : "flex-end",
          }}
        >
          <div
            className="captionPreview"
            data-testid="caption-preview"
            style={{
              color: style.textColor,
              fontFamily: CAPTION_FONT_STACKS[style.fontFamily],
              // Scale the 1920px OBS typography into this responsive dashboard preview.
              fontSize: `clamp(12px, ${style.fontSize / 19.2}cqw, ${style.fontSize}px)`,
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
      </div>
      {sourceText ? (
        <div className="sourceTranscript">
          <strong>Protected source</strong>
          <p>{sourceText}</p>
        </div>
      ) : null}
    </section>
  );
}

interface StyleEditorProps {
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
}

function StyleEditor({
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
            onChange={(event) => setFontSize(Number(event.target.value))}
          />
        </label>
        <label>
          Font type
          <select
            value={style.fontFamily}
            onChange={(event) =>
              setFontFamily(event.target.value as CaptionStyle["fontFamily"])
            }
          >
            <option value="sans-serif">Sans serif</option>
            <option value="serif">Times serif</option>
            <option value="monospace">Monospace</option>
          </select>
        </label>
        <label>
          Horizontal alignment
          <select
            value={style.horizontalAlign}
            onChange={(event) =>
              setHorizontalAlign(
                event.target.value as CaptionStyle["horizontalAlign"],
              )
            }
          >
            <option value="left">Left</option>
            <option value="center">Centre</option>
            <option value="right">Right</option>
          </select>
        </label>
        <label>
          Vertical position
          <select
            value={style.verticalAlign}
            onChange={(event) =>
              setVerticalAlign(event.target.value as CaptionStyle["verticalAlign"])
            }
          >
            <option value="top">Top</option>
            <option value="middle">Middle</option>
            <option value="bottom">Bottom</option>
          </select>
        </label>
        <label>
          Text colour
          <span className="colorControl">
            <input
              type="color"
              value={style.textColor}
              aria-label={`Text colour ${style.textColor}`}
              onChange={(event) => setTextColor(event.target.value)}
            />
            <code>{style.textColor}</code>
          </span>
        </label>
        <label>
          Caption highlight
          <span className="colorControl">
            <input
              type="color"
              value={style.backgroundColor}
              aria-label={`Caption background ${style.backgroundColor}`}
              onChange={(event) => setBackgroundColor(event.target.value)}
            />
            <code>{style.backgroundColor}</code>
          </span>
        </label>
        <label className="rangeControl fullField">
          <span>
            Background transparency <strong>{style.backgroundTransparency}%</strong>
          </span>
          <input
            type="range"
            min="0"
            max="100"
            value={style.backgroundTransparency}
            aria-label={`Background transparency ${style.backgroundTransparency}%`}
            onChange={(event) =>
              setBackgroundTransparency(Number(event.target.value))
            }
          />
        </label>
        <label className="rangeControl fullField">
          <span>
            Horizontal safe margin <strong>{style.horizontalMarginPercent}%</strong>
          </span>
          <input
            type="range"
            min="0"
            max="20"
            value={style.horizontalMarginPercent}
            aria-label={`Horizontal safe margin ${style.horizontalMarginPercent}%`}
            onChange={(event) =>
              setHorizontalMarginPercent(Number(event.target.value))
            }
          />
        </label>
        <label className="rangeControl fullField">
          <span>
            Vertical safe margin <strong>{style.verticalMarginPercent}%</strong>
          </span>
          <input
            type="range"
            min="0"
            max="20"
            value={style.verticalMarginPercent}
            aria-label={`Vertical safe margin ${style.verticalMarginPercent}%`}
            onChange={(event) =>
              setVerticalMarginPercent(Number(event.target.value))
            }
          />
        </label>
      </div>
      <div className="saveRow">
        <button className="secondaryButton" type="button" onClick={onSave} disabled={saving}>
          {saving ? "Saving…" : "Save caption appearance"}
        </button>
        <p>{savedMessage}</p>
      </div>
    </div>
  );
}

export default function OperatorDashboard() {
  const [sourceLanguage, setSourceLanguage] = useState<SourceLanguage>(
    DEFAULT_SOURCE_LANGUAGE,
  );
  const [targetLanguage, setTargetLanguage] = useState<LanguageLocale>(
    DEFAULT_TARGET_LANGUAGE,
  );
  const [cloudState, setCloudState] = useState<CloudState>("checking");
  const [fontSize, setFontSize] = useState(48);
  const [textColor, setTextColor] = useState("#ffffff");
  const [backgroundColor, setBackgroundColor] = useState("#101827");
  const [backgroundTransparency, setBackgroundTransparency] = useState(0);
  const [horizontalMarginPercent, setHorizontalMarginPercent] = useState(4);
  const [verticalMarginPercent, setVerticalMarginPercent] = useState(6);
  const [horizontalAlign, setHorizontalAlign] =
    useState<CaptionStyle["horizontalAlign"]>("center");
  const [verticalAlign, setVerticalAlign] =
    useState<CaptionStyle["verticalAlign"]>("bottom");
  const [fontFamily, setFontFamily] =
    useState<CaptionStyle["fontFamily"]>("sans-serif");
  const [savedStyleFingerprint, setSavedStyleFingerprint] = useState("");
  const [preferenceError, setPreferenceError] = useState("");
  const [keywordText, setKeywordText] = useState(
    "Jesus Christ, Holy Spirit, Bethlehem",
  );
  const [filterText, setFilterText] = useState("");
  const [copied, setCopied] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [confirmTakeover, setConfirmTakeover] = useState(false);
  const [usageClock, setUsageClock] = useState(() => Date.now());

  const style = useMemo(
    () =>
      normalizeCaptionStyle({
        fontSize,
        textColor,
        backgroundColor,
        backgroundTransparency,
        horizontalMarginPercent,
        verticalMarginPercent,
        horizontalAlign,
        verticalAlign,
        fontFamily,
      }),
    [
      backgroundColor,
      backgroundTransparency,
      fontFamily,
      fontSize,
      horizontalAlign,
      horizontalMarginPercent,
      textColor,
      verticalAlign,
      verticalMarginPercent,
    ],
  );
  const liveSettings = useMemo(
    () => ({ sourceLanguage, targetLanguage, keywordText, filterText, style }),
    [filterText, keywordText, sourceLanguage, style, targetLanguage],
  );
  const styleFingerprint = useMemo(() => JSON.stringify(style), [style]);
  const {
    devices,
    selectedDeviceId,
    setSelectedDeviceId,
    microphoneState,
    microphoneError,
    level,
    liveState,
    controlAction,
    channelAction,
    endRetryRequired,
    takeoverRequired,
    rotationRecoveryRequired,
    cancelTakeover,
    startAudioTest,
    createChannel,
    rotateChannel,
    saveChannelStyle,
    startSession,
    pauseSession,
    resumeSession,
    clearCaption,
    showTestCaption,
    stopSession,
    reloadChannel,
  } = useLiveCaptionSession(liveSettings);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 1_800);
    new CloudProviderClient()
      .health(controller.signal)
      .then((health) => setCloudState(health.status))
      .catch(() => setCloudState("unavailable"))
      .finally(() => window.clearTimeout(timeout));
    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(CAPTION_PREFERENCE_KEY);
      if (!stored) return;
      const loaded = normalizeCaptionStyle(JSON.parse(stored) as Partial<CaptionStyle>);
      const timeout = window.setTimeout(() => {
        setFontSize(loaded.fontSize);
        setTextColor(loaded.textColor);
        setBackgroundColor(loaded.backgroundColor);
        setBackgroundTransparency(loaded.backgroundTransparency);
        setHorizontalMarginPercent(loaded.horizontalMarginPercent);
        setVerticalMarginPercent(loaded.verticalMarginPercent);
        setHorizontalAlign(loaded.horizontalAlign);
        setVerticalAlign(loaded.verticalAlign);
        setFontFamily(loaded.fontFamily);
        setSavedStyleFingerprint(JSON.stringify(loaded));
      }, 0);
      return () => window.clearTimeout(timeout);
    } catch {
      const timeout = window.setTimeout(
        () => setPreferenceError("Saved browser preferences could not be loaded."),
        0,
      );
      return () => window.clearTimeout(timeout);
    }
  }, []);

  const sharedStyleFingerprint = liveState.channel?.style
    ? JSON.stringify(liveState.channel.style)
    : "";
  useEffect(() => {
    if (!sharedStyleFingerprint) return;
    const shared = JSON.parse(sharedStyleFingerprint) as CaptionStyle;
    const timeout = window.setTimeout(() => {
      setFontSize(shared.fontSize);
      setTextColor(shared.textColor);
      setBackgroundColor(shared.backgroundColor);
      setBackgroundTransparency(shared.backgroundTransparency);
      setHorizontalMarginPercent(shared.horizontalMarginPercent);
      setVerticalMarginPercent(shared.verticalMarginPercent);
      setHorizontalAlign(shared.horizontalAlign);
      setVerticalAlign(shared.verticalAlign);
      setFontFamily(shared.fontFamily);
      setSavedStyleFingerprint(sharedStyleFingerprint);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [sharedStyleFingerprint]);

  const keywordCount = useMemo(
    () => parseGlossaryInput(keywordText, targetLanguage).length,
    [keywordText, targetLanguage],
  );
  const sourceLabel =
    sourceLanguage === "auto"
      ? "Automatic detection"
      : LANGUAGE_OPTIONS.find(({ locale }) => locale === sourceLanguage)?.label;
  const hasService = Boolean(liveState.service);
  const isLive = liveState.status === "live";
  const isPaused = liveState.status === "paused";
  const isBusy = [
    "loading-channel",
    "starting",
    "pausing",
    "resuming",
    "ending",
  ].includes(liveState.status);
  const anotherOperatorActive =
    !hasService &&
    (liveState.channel?.status === "live" || liveState.channel?.status === "paused");
  const serviceStartedMs = liveState.service
    ? new Date(liveState.service.startedAt).getTime()
    : null;
  const elapsedServiceMs = serviceStartedMs
    ? Math.min(MAX_LIVE_SESSION_MS, Math.max(0, usageClock - serviceStartedMs))
    : 0;
  const elapsedMinutes = Math.floor(elapsedServiceMs / 60_000);
  const elapsedSeconds = Math.floor((elapsedServiceMs % 60_000) / 1_000);
  const usagePercent = Math.min(
    100,
    Math.ceil(
      Math.max(
        elapsedServiceMs / MAX_LIVE_SESSION_MS,
        liveState.transcriptionRequests / MAX_TRANSCRIPTION_REQUESTS,
      ) * 100,
    ),
  );

  useEffect(() => {
    if (!hasService) return;
    const interval = window.setInterval(() => setUsageClock(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, [hasService]);

  const copyOverlayUrl = async () => {
    const url = liveState.channel?.overlayUrl;
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_500);
    } catch {
      setPreferenceError("The OBS URL could not be copied. Select and copy it manually.");
    }
  };

  const saveCaptionPreferences = () => {
    try {
      const serialized = JSON.stringify(style);
      window.localStorage.setItem(CAPTION_PREFERENCE_KEY, serialized);
      setSavedStyleFingerprint(serialized);
      setPreferenceError("");
      if (liveState.channel?.configured) void saveChannelStyle();
    } catch {
      setPreferenceError("Caption preferences could not be saved in this browser.");
    }
  };

  const styleSavedMessage =
    preferenceError ||
    (savedStyleFingerprint === styleFingerprint
      ? liveState.channel?.configured
        ? "Saved to this browser and the Main channel."
        : "Saved in this browser."
      : savedStyleFingerprint
        ? "Caption appearance has unsaved changes."
        : "Caption appearance is not saved yet.");

  const styleEditorProps: StyleEditorProps = {
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
    onSave: saveCaptionPreferences,
    saving: channelAction === "save-style",
    savedMessage: styleSavedMessage,
  };

  const audioFields = (
    <>
      <label>
        Microphone or audio interface
        <select
          value={selectedDeviceId}
          disabled={isLive || isBusy}
          onChange={(event) => setSelectedDeviceId(event.target.value)}
        >
          {devices.length === 0 ? (
            <option value="">Permission required to list devices</option>
          ) : (
            devices.map((device, index) => (
              <option value={device.deviceId} key={device.deviceId}>
                {device.label || `Audio input ${index + 1}`}
              </option>
            ))
          )}
        </select>
      </label>
      <div className="meterRow">
        <div className="meter" aria-label={`Input level ${Math.round(level * 100)}%`}>
          <span style={{ width: `${Math.max(2, level * 100)}%` }} />
        </div>
        <span>{Math.round(level * 100)}%</span>
      </div>
      <button
        className="secondaryButton"
        onClick={() => void startAudioTest()}
        disabled={microphoneState === "requesting" || isLive || isBusy}
      >
        {microphoneState === "active" ? "Audio input ready" : "Enable audio test"}
      </button>
      {microphoneError ? <p className="errorText">{microphoneError}</p> : null}
    </>
  );

  return (
    <main>
      <header className="topbar">
        <div className="brand">
          <span className="brandMark" aria-hidden="true">CC</span>
          <div>
            <p className="eyebrow">Church operator console</p>
            <h1>Church Live Caption</h1>
          </div>
        </div>
        <div className="headerStatuses">
          <span className={`statusPill ${cloudState}`}>
            <span className="statusDot" aria-hidden="true" />
            {cloudState === "checking"
              ? "Checking cloud AI"
              : cloudState === "ready"
                ? "Cloud AI ready"
                : cloudState === "not-configured"
                  ? "Cloud setup needed"
                  : "Cloud AI unavailable"}
          </span>
          <span className={`statusPill channel-${liveState.channel?.status ?? "loading"}`}>
            Main channel · {liveState.channel?.status ?? "loading"}
          </span>
        </div>
      </header>

      <section className={`statusBanner ${liveState.status}`} aria-live="polite">
        <div>
          <strong>
            {hasService
              ? isPaused
                ? "Live service paused"
                : "Live operator console"
              : "Service setup"}
          </strong>
          <p>{liveState.message}</p>
        </div>
        {liveState.status === "error" && !hasService && rotationRecoveryRequired ? (
          confirmRotate ? (
            <span className="confirmationRow recoveryActions">
              <button className="secondaryButton" onClick={() => setConfirmRotate(false)}>
                Cancel
              </button>
              <button className="dangerButton" disabled={channelAction !== null} onClick={() => { setConfirmRotate(false); void rotateChannel(); }}>
                Replace OBS URL
              </button>
            </span>
          ) : (
            <button className="dangerOutlineButton recoveryButton" onClick={() => setConfirmRotate(true)}>
              Rotate and recover
            </button>
          )
        ) : liveState.status === "error" && !hasService ? (
          <button className="textButton" onClick={() => void reloadChannel()}>
            Retry channel
          </button>
        ) : null}
      </section>

      {hasService ? (
        <>
          <section className={`liveConsole ${isPaused ? "paused" : ""}`} aria-label="Live controls">
            <div className="liveIdentity">
              <span className={`liveIndicator ${isPaused ? "paused" : ""}`} />
              <div>
                <strong>{isPaused ? "Paused" : "Captions live"}</strong>
                <p>{liveState.sequence} captions · {liveState.droppedChunks} skipped</p>
              </div>
            </div>
            <div className="compactUsage">
              <div>
                <span>{elapsedMinutes}m {elapsedSeconds.toString().padStart(2, "0")}s / 90m</span>
                <span>{liveState.transcriptionRequests} / {MAX_TRANSCRIPTION_REQUESTS} requests</span>
              </div>
              <div className="usageProgress" role="progressbar" aria-label="Live service usage" aria-valuemin={0} aria-valuemax={100} aria-valuenow={usagePercent}>
                <span style={{ width: `${usagePercent}%` }} />
              </div>
            </div>
            <div className="primaryControls">
              {isPaused || liveState.status === "resuming" ? (
                <button className="primaryButton" disabled={isBusy || controlAction !== null} onClick={() => void resumeSession()}>
                  {liveState.status === "resuming" ? "Resuming…" : "Resume"}
                </button>
              ) : (
                <button className="primaryButton" disabled={isBusy || controlAction !== null} onClick={() => void pauseSession()}>
                  {liveState.status === "pausing" ? "Pausing…" : "Pause"}
                </button>
              )}
              <button className="secondaryButton compactButton" disabled={isBusy || controlAction !== null} onClick={() => void clearCaption()}>
                {controlAction === "clear" ? "Clearing…" : "Clear"}
              </button>
              <details className="moreMenu">
                <summary>More</summary>
                <div>
                  <button onClick={() => void copyOverlayUrl()}>{copied ? "Copied" : "Copy OBS URL"}</button>
                  <button disabled={!isPaused || controlAction !== null} onClick={() => void showTestCaption()}>
                    {controlAction === "show-test" ? "Showing test…" : "Show test caption"}
                  </button>
                  {confirmEnd ? (
                    <span className="confirmationRow">
                      <button onClick={() => setConfirmEnd(false)}>Cancel</button>
                      <button className="dangerText" onClick={() => { setConfirmEnd(false); void stopSession(); }}>
                        Confirm End
                      </button>
                    </span>
                  ) : (
                    <button className="dangerText" onClick={() => setConfirmEnd(true)}>
                      {endRetryRequired ? "Retry End" : "End service"}
                    </button>
                  )}
                </div>
              </details>
            </div>
          </section>

          <div className="liveWorkspace">
            <CaptionPreview
              caption={liveState.latestPublicText}
              sourceText={liveState.latestSourceText}
              style={style}
              badge={isPaused ? "Paused output" : "Live output"}
              live={!isPaused}
            />
            <aside className="liveDrawers">
              <details className="controlDrawer">
                <summary>Caption appearance</summary>
                <StyleEditor {...styleEditorProps} />
              </details>
              <details className="controlDrawer">
                <summary>Audio input {isLive ? "· pause to change" : ""}</summary>
                <div className="drawerBody">{audioFields}</div>
              </details>
              <details className="controlDrawer">
                <summary>Locked service configuration</summary>
                <div className="configurationSummary">
                  <p><strong>Spoken:</strong> {sourceLabel}</p>
                  <p><strong>Caption language:</strong> {LANGUAGE_OPTIONS.find(({ locale }) => locale === targetLanguage)?.label}</p>
                  <p><strong>Church terms:</strong> {keywordCount}</p>
                  <p>End the service to change language, terminology, or filtering.</p>
                </div>
              </details>
            </aside>
          </div>
        </>
      ) : (
        <>
          <div className="setupIntro">
            <div>
              <p className="eyebrow">Guided setup</p>
              <h2>Prepare audio, captions, and OBS before going live.</h2>
            </div>
            <ol className="setupSteps" aria-label="Setup progress">
              <li>Audio</li>
              <li>Language</li>
              <li>Appearance</li>
              <li>OBS</li>
            </ol>
          </div>

          <div className="setupWorkspace">
            <div className="setupSections">
              <details className="setupSection" open>
                <summary><span>01</span> Audio and languages</summary>
                <div className="sectionBody">
                  {audioFields}
                  <div className="divider" />
                  <div className="fieldGrid">
                    <label>
                      Spoken language
                      <select data-testid="source-language" value={sourceLanguage} disabled={isBusy} onChange={(event) => setSourceLanguage(event.target.value as SourceLanguage)}>
                        <option value="auto">Auto detect</option>
                        {LANGUAGE_OPTIONS.map((language) => <option value={language.locale} key={language.locale}>{language.label}</option>)}
                      </select>
                    </label>
                    <label>
                      Translate captions to
                      <select data-testid="target-language" value={targetLanguage} disabled={isBusy} onChange={(event) => setTargetLanguage(event.target.value as LanguageLocale)}>
                        {LANGUAGE_OPTIONS.map((language) => <option value={language.locale} key={language.locale}>{language.label}</option>)}
                      </select>
                    </label>
                  </div>
                  <p className="helpText">Selected source: {sourceLabel}. Explicit selection is recommended live.</p>
                </div>
              </details>

              <details className="setupSection">
                <summary><span>02</span> Church terminology and filtering</summary>
                <div className="sectionBody">
                  <div className="fieldHeading"><strong>Biblical language</strong><span>{keywordCount} terms</span></div>
                  <label>
                    Biblical names and keyword hints
                    <textarea rows={3} value={keywordText} disabled={isBusy} onChange={(event) => setKeywordText(event.target.value)} placeholder="Jesus Christ => Yesus Kristus, Bethlehem" />
                  </label>
                  <p className="helpText">Use <code>source =&gt; approved translation</code> for deterministic terms. Other entries boost transcription recognition.</p>
                  <label>
                    Public caption filter
                    <input value={filterText} disabled={isBusy} onChange={(event) => setFilterText(event.target.value)} placeholder="Comma-separated words to mask" />
                  </label>
                  <p className="privacyNote">Filtering changes only the public caption. Source text stays in this operator tab.</p>
                </div>
              </details>

              <details className="setupSection">
                <summary><span>03</span> Caption appearance</summary>
                <div className="sectionBody"><StyleEditor {...styleEditorProps} /></div>
              </details>

              <details className="setupSection serviceDetails">
                <summary><span>AI</span> Service details</summary>
                <div className="sectionBody modelSummary">
                  <p><strong>Transcription:</strong> Whisper Large V3 Turbo · four-second chunks</p>
                  <p><strong>Translation:</strong> Llama 3.1 8B Instant · biblical context</p>
                  <p><strong>Delivery:</strong> Cloudflare Durable Object · hibernating WebSocket</p>
                </div>
              </details>
            </div>

            <aside className="setupPreviewColumn">
              <CaptionPreview caption={SAMPLE_CAPTIONS[targetLanguage]} style={style} badge="Design preview" />
              <section className="obsSetupCard" aria-labelledby="obs-setup-title">
                <div className="sectionHeading">
                  <div>
                    <p className="eyebrow">Step 04</p>
                    <h2 id="obs-setup-title">OBS Browser Source</h2>
                  </div>
                  <span className={`statusChip ${liveState.channel?.configured ? "ready" : ""}`}>
                    {liveState.channel?.configured ? "Reusable" : "Not created"}
                  </span>
                </div>
                {!liveState.channel?.configured ? (
                  <>
                    <p>Create one encrypted Main channel URL. You will paste it into OBS once and reuse it for future services.</p>
                    <button className="primaryButton fullButton" disabled={channelAction !== null || isBusy} onClick={() => void createChannel()}>
                      {channelAction === "create" ? "Creating securely…" : "Create OBS channel"}
                    </button>
                  </>
                ) : (
                  <>
                    <p>Use a 1920 × 1080 Browser Source. The canvas stays transparent between services.</p>
                    <label>
                      Reusable Main channel URL
                      <input value={liveState.channel.overlayUrl ?? ""} readOnly aria-label="Reusable OBS browser-source URL" />
                    </label>
                    <button className="primaryButton fullButton" onClick={() => void copyOverlayUrl()}>{copied ? "URL copied" : "Copy OBS URL"}</button>
                    <div className="buttonGrid">
                      <button className="secondaryButton" disabled={controlAction !== null} onClick={() => void showTestCaption()}>{controlAction === "show-test" ? "Showing…" : "Show test"}</button>
                      <button className="secondaryButton" disabled={controlAction !== null} onClick={() => void clearCaption()}>{controlAction === "clear" ? "Clearing…" : "Clear OBS"}</button>
                    </div>
                    <details className="advancedActions">
                      <summary>Advanced link security</summary>
                      <p>Rotate only if the URL was exposed. The old OBS source stops working immediately.</p>
                      {confirmRotate ? (
                        <div className="confirmationRow">
                          <button className="secondaryButton" onClick={() => setConfirmRotate(false)}>Cancel</button>
                          <button className="dangerButton" disabled={channelAction !== null || anotherOperatorActive} onClick={() => { setConfirmRotate(false); void rotateChannel(); }}>
                            {channelAction === "rotate" ? "Rotating…" : "Confirm rotation"}
                          </button>
                        </div>
                      ) : (
                        <button className="dangerOutlineButton" disabled={anotherOperatorActive} onClick={() => setConfirmRotate(true)}>Rotate OBS link</button>
                      )}
                    </details>
                  </>
                )}
              </section>
            </aside>
          </div>

          <section className="startBar">
            <div>
              <strong>{anotherOperatorActive ? "Main channel already live" : "Ready to start captions?"}</strong>
              <p>{anotherOperatorActive ? "A takeover replaces the current operator and clears OBS." : "Starting opens a 90-minute service window and begins microphone capture."}</p>
            </div>
            {confirmTakeover || takeoverRequired ? (
              <div className="takeoverConfirmation">
                <button className="secondaryButton" onClick={() => { setConfirmTakeover(false); cancelTakeover(); }}>Cancel</button>
                <button className="dangerButton" disabled={cloudState !== "ready" || isBusy} onClick={() => { setConfirmTakeover(false); void startSession(true); }}>Confirm takeover</button>
              </div>
            ) : (
              <button
                className={anotherOperatorActive ? "dangerButton" : "primaryButton"}
                disabled={cloudState !== "ready" || !liveState.channel?.configured || isBusy || channelAction !== null}
                onClick={() => anotherOperatorActive ? setConfirmTakeover(true) : void startSession()}
              >
                {liveState.status === "starting" ? "Starting securely…" : anotherOperatorActive ? "Take over channel" : "Start captions"}
              </button>
            )}
          </section>
        </>
      )}
    </main>
  );
}
