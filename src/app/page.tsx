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
  "sans-serif": 'Arial, Helvetica, sans-serif',
  serif: '"Times New Roman", Times, serif',
  monospace: '"Courier New", Courier, monospace',
};

function transparentBackground(hex: string, transparency: number) {
  const channels = hex.match(/[0-9a-f]{2}/gi)?.map((value) => parseInt(value, 16));
  if (!channels || channels.length !== 3) return "transparent";
  return `rgba(${channels.join(", ")}, ${(100 - transparency) / 100})`;
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
  const [usageClock, setUsageClock] = useState(() => Date.now());

  const style = useMemo(
    () => ({
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
  const styleFingerprint = useMemo(
    () => JSON.stringify(normalizeCaptionStyle(style)),
    [style],
  );
  const {
    devices,
    selectedDeviceId,
    setSelectedDeviceId,
    microphoneState,
    microphoneError,
    level,
    liveState,
    controlAction,
    endRetryRequired,
    startAudioTest,
    startSession,
    pauseSession,
    resumeSession,
    clearCaption,
    showTestCaption,
    stopSession,
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
    let saved: CaptionStyle | null = null;
    let loadError = "";
    try {
      const stored = window.localStorage.getItem(CAPTION_PREFERENCE_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored) as unknown;
      if (!parsed || typeof parsed !== "object") {
        throw new Error("Saved caption preferences are invalid.");
      }
      saved = normalizeCaptionStyle(parsed as Partial<CaptionStyle>);
    } catch {
      loadError = "Saved preferences could not be loaded.";
    }
    const loaded = saved;
    const timeout = window.setTimeout(() => {
      if (!loaded) {
        setPreferenceError(loadError);
        return;
      }
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
  }, []);

  const keywordCount = useMemo(
    () => parseGlossaryInput(keywordText, targetLanguage).length,
    [keywordText, targetLanguage],
  );
  const sourceLabel =
    sourceLanguage === "auto"
      ? "Automatic detection"
      : LANGUAGE_OPTIONS.find(({ locale }) => locale === sourceLanguage)?.label;
  const hasActiveSession = Boolean(liveState.session);
  const isLive = liveState.status === "live";
  const isPaused = liveState.status === "paused";
  const isBusy = ["starting", "pausing", "resuming", "ending"].includes(
    liveState.status,
  );
  const previewCaption = hasActiveSession
    ? liveState.latestPublicText
    : SAMPLE_CAPTIONS[targetLanguage];
  const sessionStartedMs = liveState.sessionStartedAt
    ? new Date(liveState.sessionStartedAt).getTime()
    : null;
  const elapsedSessionMs = sessionStartedMs
    ? Math.min(MAX_LIVE_SESSION_MS, Math.max(0, usageClock - sessionStartedMs))
    : 0;
  const elapsedSessionMinutes = Math.floor(elapsedSessionMs / 60_000);
  const elapsedSessionSeconds = Math.floor((elapsedSessionMs % 60_000) / 1_000);
  const usagePercent = Math.min(
    100,
    Math.ceil(
      Math.max(
        elapsedSessionMs / MAX_LIVE_SESSION_MS,
        liveState.transcriptionRequests / MAX_TRANSCRIPTION_REQUESTS,
      ) * 100,
    ),
  );

  useEffect(() => {
    if (!hasActiveSession) return;
    const interval = window.setInterval(() => setUsageClock(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, [hasActiveSession]);

  const copyOverlayUrl = async () => {
    const url = liveState.session?.overlayUrl;
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  };

  const saveCaptionPreferences = () => {
    try {
      const normalized = normalizeCaptionStyle(style);
      const serialized = JSON.stringify(normalized);
      window.localStorage.setItem(CAPTION_PREFERENCE_KEY, serialized);
      setSavedStyleFingerprint(serialized);
      setPreferenceError("");
    } catch {
      setPreferenceError("Caption preferences could not be saved in this browser.");
    }
  };

  return (
    <main>
      <header className="topbar">
        <div className="brand">
          <span className="brandMark" aria-hidden="true">CC</span>
          <div>
            <p className="eyebrow">Free cloud prototype</p>
            <h1>Church Live Caption</h1>
          </div>
        </div>
        <div className={`statusPill ${cloudState}`}>
          <span className="statusDot" aria-hidden="true" />
          {cloudState === "checking"
            ? "Checking cloud AI"
            : cloudState === "ready"
              ? "Cloud AI configured"
              : cloudState === "not-configured"
                ? "Cloud setup needed"
                : "Cloud AI unavailable"}
        </div>
      </header>

      <section className="hero">
        <div>
          <p className="sectionLabel">Service setup</p>
          <h2>Make every spoken word easier to follow.</h2>
          <p>
            Configure church audio, languages, biblical vocabulary, and the public
            caption style. Live sessions run for at most 90 minutes to preserve
            free-tier headroom.
          </p>
        </div>
      </section>

      <section className={`sessionBanner ${liveState.status}`} aria-live="polite">
        <div>
          <strong>
            {isLive
              ? "Live caption session"
              : isPaused
                ? "Paused caption session"
                : hasActiveSession
                  ? "Caption session needs attention"
                  : "Session status"}
          </strong>
          <p>{liveState.message}</p>
        </div>
        <div className="sessionMetrics">
          <span>{liveState.sequence} captions</span>
          <span>
            {liveState.lastLatencyMs === null
              ? "— processing"
              : `${liveState.lastLatencyMs} ms processing`}
          </span>
          <span>{liveState.droppedChunks} skipped</span>
        </div>
      </section>

      <section className="liveControls" aria-labelledby="live-controls-title">
        <div>
          <strong id="live-controls-title">Live controls</strong>
          <p>
            Pause keeps this session and OBS URL. End permanently revokes the URL.
          </p>
        </div>
        <div className="liveControlActions">
          {!hasActiveSession ? (
            <button
              className="primaryButton"
              disabled={cloudState !== "ready" || isBusy}
              onClick={() => {
                setConfirmEnd(false);
                void startSession();
              }}
            >
              {liveState.status === "starting" ? "Starting securely…" : "Start session"}
            </button>
          ) : (
            <>
              {isPaused || liveState.status === "resuming" ? (
                <button
                  className="primaryButton compactButton"
                  disabled={isBusy || controlAction !== null}
                  onClick={() => void resumeSession()}
                >
                  {liveState.status === "resuming" ? "Resuming…" : "Resume capture"}
                </button>
              ) : (
                <button
                  className="secondaryButton compactButton"
                  disabled={isBusy || controlAction !== null}
                  onClick={() => void pauseSession()}
                >
                  {liveState.status === "pausing"
                    ? "Pausing…"
                    : liveState.status === "error"
                      ? "Retry pause"
                      : "Pause capture"}
                </button>
              )}
              <button
                className="secondaryButton compactButton"
                disabled={isBusy || controlAction !== null}
                onClick={() => void clearCaption()}
              >
                {controlAction === "clear" ? "Clearing…" : "Clear caption"}
              </button>
              <button
                className="secondaryButton compactButton"
                disabled={!isPaused || isBusy || controlAction !== null}
                onClick={() => void showTestCaption()}
              >
                {controlAction === "show-test" ? "Showing…" : "Show test caption"}
              </button>
              {confirmEnd ? (
                <span className="endConfirmation">
                  <button
                    className="secondaryButton compactButton"
                    disabled={isBusy}
                    onClick={() => setConfirmEnd(false)}
                  >
                    Cancel
                  </button>
                  <button
                    className="dangerButton compactButton"
                    disabled={isBusy || controlAction !== null}
                    onClick={() => {
                      setConfirmEnd(false);
                      void stopSession();
                    }}
                  >
                    {liveState.status === "ending" ? "Ending…" : "Confirm end"}
                  </button>
                </span>
              ) : (
                <button
                  className="dangerButton compactButton"
                  disabled={isBusy || controlAction !== null}
                  onClick={() => setConfirmEnd(true)}
                >
                  {liveState.status === "ending"
                    ? "Ending…"
                    : endRetryRequired
                      ? "Retry end"
                      : "End session"}
                </button>
              )}
            </>
          )}
        </div>
      </section>

      <section className="usageTracker" aria-labelledby="session-usage-title">
        <div className="usageHeading">
          <div>
            <strong id="session-usage-title">Session usage</strong>
            <p>Tracks the app-enforced 90-minute session budget.</p>
          </div>
          <span>{usagePercent}%</span>
        </div>
        <div
          className={`usageProgress ${usagePercent >= 80 ? "warning" : ""}`}
          role="progressbar"
          aria-label="Live caption session usage"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={usagePercent}
        >
          <span style={{ width: `${usagePercent}%` }} />
        </div>
        <div className="usageDetails">
          <span>
            {elapsedSessionMinutes}m {elapsedSessionSeconds.toString().padStart(2, "0")}s of
            90m
          </span>
          <span>
            {liveState.transcriptionRequests.toLocaleString()} of{" "}
            {MAX_TRANSCRIPTION_REQUESTS.toLocaleString()} transcription requests
          </span>
        </div>
        <p className="usageNote">
          This does not include Groq usage from other browsers, apps, or sessions.
        </p>
      </section>

      <div className="dashboardGrid">
        <section className="panel setupPanel">
          <div className="panelHeading">
            <div>
              <p className="stepNumber">01</p>
              <h3>Audio input</h3>
            </div>
            <span className={`smallStatus ${microphoneState}`}>{microphoneState}</span>
          </div>

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

          <div className="divider" />

          <div className="panelHeading compact">
            <div>
              <p className="stepNumber">02</p>
              <h3>Languages</h3>
            </div>
          </div>
          <div className="fieldGrid">
            <label>
              Spoken language
              <select
                data-testid="source-language"
                value={sourceLanguage}
                disabled={hasActiveSession || isBusy}
                onChange={(event) => setSourceLanguage(event.target.value as SourceLanguage)}
              >
                <option value="auto">Auto detect</option>
                {LANGUAGE_OPTIONS.map((language) => (
                  <option value={language.locale} key={language.locale}>
                    {language.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Translate captions to
              <select
                data-testid="target-language"
                value={targetLanguage}
                disabled={hasActiveSession || isBusy}
                onChange={(event) => setTargetLanguage(event.target.value as LanguageLocale)}
              >
                {LANGUAGE_OPTIONS.map((language) => (
                  <option value={language.locale} key={language.locale}>
                    {language.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="helpText">
            Selected source: {sourceLabel}. Explicit selection is recommended live.
          </p>
        </section>

        <section className="panel previewPanel">
          <div className="panelHeading">
            <div>
              <p className="stepNumber">Live canvas</p>
              <h3>OBS caption preview</h3>
            </div>
            <span
              className={`previewBadge ${isLive ? "live" : isPaused ? "paused" : ""}`}
            >
              {isLive ? "Live output" : isPaused ? "Paused output" : "Synthetic sample"}
            </span>
          </div>
          <div className="videoFrame">
            <div
              className="previewSafeArea"
              style={{
                inset: `${verticalMarginPercent}% ${horizontalMarginPercent}%`,
                alignItems:
                  verticalAlign === "top"
                    ? "flex-start"
                    : verticalAlign === "middle"
                      ? "center"
                      : "flex-end",
              }}
            >
              <div
                className="captionPreview"
                data-testid="caption-preview"
                style={{
                  color: textColor,
                  fontFamily: CAPTION_FONT_STACKS[fontFamily],
                  fontSize: `${fontSize}px`,
                  textAlign: horizontalAlign,
                }}
              >
                <span
                  className="captionPreviewText"
                  style={{
                    backgroundColor: previewCaption
                      ? transparentBackground(
                          backgroundColor,
                          backgroundTransparency,
                        )
                      : "transparent",
                  }}
                >
                  {previewCaption}
                </span>
              </div>
            </div>
          </div>
          {liveState.latestSourceText ? (
            <div className="sourceTranscript">
              <strong>Protected source</strong>
              <p>{liveState.latestSourceText}</p>
            </div>
          ) : null}
          <div className="styleGrid">
            <label className="styleRangeControl">
              Text size <strong>{fontSize}px</strong>
              <input
                type="range"
                min="10"
                max="72"
                value={fontSize}
                onChange={(event) => setFontSize(Number(event.target.value))}
              />
            </label>
            <label>
              Font type
              <select
                value={fontFamily}
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
                value={horizontalAlign}
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
                value={verticalAlign}
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
                  value={textColor}
                  onChange={(event) => setTextColor(event.target.value)}
                />
                {textColor}
              </span>
            </label>
            <label>
              Caption background
              <span className="colorControl">
                <input
                  type="color"
                  value={backgroundColor}
                  onChange={(event) => setBackgroundColor(event.target.value)}
                />
                {backgroundColor}
              </span>
            </label>
            <label className="styleRangeControl">
              Background transparency <strong>{backgroundTransparency}%</strong>
              <input
                type="range"
                min="0"
                max="100"
                value={backgroundTransparency}
                onChange={(event) =>
                  setBackgroundTransparency(Number(event.target.value))
                }
              />
            </label>
            <label className="styleRangeControl">
              Horizontal safe margin <strong>{horizontalMarginPercent}%</strong>
              <input
                type="range"
                min="0"
                max="20"
                value={horizontalMarginPercent}
                onChange={(event) =>
                  setHorizontalMarginPercent(Number(event.target.value))
                }
              />
            </label>
            <label className="styleRangeControl">
              Vertical safe margin <strong>{verticalMarginPercent}%</strong>
              <input
                type="range"
                min="0"
                max="20"
                value={verticalMarginPercent}
                onChange={(event) =>
                  setVerticalMarginPercent(Number(event.target.value))
                }
              />
            </label>
          </div>
          <div className="captionPreferenceActions">
            <button
              className="secondaryButton"
              type="button"
              onClick={saveCaptionPreferences}
            >
              Save caption preferences
            </button>
            <p aria-live="polite" className={preferenceError ? "errorText" : "helpText"}>
              {preferenceError ||
                (savedStyleFingerprint === styleFingerprint
                  ? "Saved on this browser."
                  : savedStyleFingerprint
                    ? "Caption preferences have unsaved changes."
                    : "Caption preferences are not saved yet.")}
            </p>
          </div>

          {liveState.session ? (
            <div className="obsLinkPanel">
              <div>
                <strong>OBS browser-source URL</strong>
                <p>Read-only, revocable, and valid only for this session.</p>
              </div>
              <input value={liveState.session.overlayUrl} readOnly aria-label="OBS browser-source URL" />
              <button className="secondaryButton" onClick={() => void copyOverlayUrl()}>
                {copied ? "Copied" : "Copy OBS URL"}
              </button>
            </div>
          ) : null}
        </section>

        <section className="panel contextPanel">
          <div className="panelHeading">
            <div>
              <p className="stepNumber">03</p>
              <h3>Church language</h3>
            </div>
            <span className="countBadge">{keywordCount} terms</span>
          </div>
          <label>
            Biblical names and keyword hints
            <textarea
              rows={3}
              value={keywordText}
              disabled={hasActiveSession}
              onChange={(event) => setKeywordText(event.target.value)}
              placeholder="Jesus Christ => Yesus Kristus, Bethlehem"
            />
          </label>
          <p className="helpText">
            Use <code>source =&gt; approved translation</code> for deterministic terms.
            Other entries still boost transcription recognition.
          </p>
          <label>
            Public caption filter
            <input
              value={filterText}
              disabled={hasActiveSession}
              onChange={(event) => setFilterText(event.target.value)}
              placeholder="Comma-separated words to mask"
            />
          </label>
          <p className="privacyNote">
            Filtering changes only the public caption. Source text stays in this
            operator tab and is not stored in the live room.
          </p>
        </section>

        <section className="panel modelPanel">
          <div className="panelHeading">
            <div>
              <p className="stepNumber">04</p>
              <h3>Cloud AI services</h3>
            </div>
          </div>
          <div className="modelRow">
            <span>Transcription</span>
            <strong>Whisper Large V3 Turbo</strong>
            <small>4-second chunks</small>
          </div>
          <div className="modelRow">
            <span>Translation</span>
            <strong>Llama 3.1 8B Instant</strong>
            <small>Biblical context</small>
          </div>
          <div className="modelRow">
            <span>Live delivery</span>
            <strong>Cloudflare Durable Object</strong>
            <small>Hibernating WebSocket</small>
          </div>
          <div className="workerMessage">
            <span className={`statusDot ${cloudState}`} aria-hidden="true" />
            <div>
              <strong>
                {cloudState === "ready" ? "Cloud configuration found" : "Cloud setup pending"}
              </strong>
              <p>
                Starting a session performs an authenticated Groq model check. The
                browser never receives the provider key, and no paid fallback exists.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
