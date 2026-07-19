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
import { useLiveCaptionSession } from "@/live/use-live-caption-session";

type CloudState = "checking" | "ready" | "not-configured" | "unavailable";

const SAMPLE_CAPTIONS: Record<LanguageLocale, string> = {
  en: "Grace and peace be with you.",
  id: "Kasih karunia dan damai sejahtera menyertai kamu.",
  ja: "恵みと平安があなたがたにありますように。",
  "ko-KR": "은혜와 평강이 여러분과 함께하기를 바랍니다.",
  "tl-PH": "Sumainyo ang biyaya at kapayapaan.",
  "zh-Hans": "愿恩典与平安与你们同在。",
  "zh-Hant": "願恩典與平安與你們同在。",
  vi: "Nguyện ân điển và bình an ở cùng anh chị em.",
};

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
  const [keywordText, setKeywordText] = useState(
    "Jesus Christ, Holy Spirit, Bethlehem",
  );
  const [filterText, setFilterText] = useState("");
  const [copied, setCopied] = useState(false);

  const style = useMemo(
    () => ({ fontSize, textColor, backgroundColor }),
    [backgroundColor, fontSize, textColor],
  );
  const liveSettings = useMemo(
    () => ({ sourceLanguage, targetLanguage, keywordText, filterText, style }),
    [filterText, keywordText, sourceLanguage, style, targetLanguage],
  );
  const {
    devices,
    selectedDeviceId,
    setSelectedDeviceId,
    microphoneState,
    microphoneError,
    level,
    liveState,
    startAudioTest,
    startSession,
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

  const keywordCount = useMemo(
    () => parseGlossaryInput(keywordText, targetLanguage).length,
    [keywordText, targetLanguage],
  );
  const sourceLabel =
    sourceLanguage === "auto"
      ? "Automatic detection"
      : LANGUAGE_OPTIONS.find(({ locale }) => locale === sourceLanguage)?.label;
  const isLive = liveState.status === "live";
  const isBusy = liveState.status === "starting" || liveState.status === "stopping";
  const previewCaption = liveState.latestPublicText || SAMPLE_CAPTIONS[targetLanguage];

  const copyOverlayUrl = async () => {
    const url = liveState.session?.overlayUrl;
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
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
        {isLive ? (
          <button className="dangerButton" onClick={() => void stopSession()}>
            End caption session
          </button>
        ) : (
          <button
            className="primaryButton"
            disabled={cloudState !== "ready" || isBusy}
            onClick={() => void startSession()}
          >
            {isBusy ? "Starting securely…" : "Start caption session"}
          </button>
        )}
      </section>

      <section className={`sessionBanner ${liveState.status}`} aria-live="polite">
        <div>
          <strong>{isLive ? "Live caption session" : "Session status"}</strong>
          <p>{liveState.message}</p>
        </div>
        <div className="sessionMetrics">
          <span>{liveState.sequence} captions</span>
          <span>{liveState.lastLatencyMs === null ? "—" : `${liveState.lastLatencyMs} ms`}</span>
          <span>{liveState.droppedChunks} skipped</span>
        </div>
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
                disabled={isLive || isBusy}
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
                disabled={isLive || isBusy}
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
            <span className={`previewBadge ${isLive ? "live" : ""}`}>
              {isLive ? "Live output" : "Synthetic sample"}
            </span>
          </div>
          <div className="videoFrame">
            <div
              className="captionPreview"
              data-testid="caption-preview"
              style={{ color: textColor, backgroundColor, fontSize: `${fontSize}px` }}
            >
              {previewCaption}
            </div>
          </div>
          {liveState.latestSourceText ? (
            <div className="sourceTranscript">
              <strong>Protected source</strong>
              <p>{liveState.latestSourceText}</p>
            </div>
          ) : null}
          <div className="styleGrid">
            <label>
              Text size <strong>{fontSize}px</strong>
              <input
                type="range"
                min="28"
                max="72"
                value={fontSize}
                onChange={(event) => setFontSize(Number(event.target.value))}
              />
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
