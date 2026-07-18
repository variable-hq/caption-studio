"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { LocalCompanionClient } from "@/ai/local-companion-client";
import {
  DEFAULT_SOURCE_LANGUAGE,
  DEFAULT_TARGET_LANGUAGE,
  LANGUAGE_OPTIONS,
  type LanguageLocale,
  type SourceLanguage,
} from "@/domain/languages";

type WorkerState = "checking" | "ready" | "not-running";

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

const workerUrl =
  process.env.NEXT_PUBLIC_LOCAL_AI_URL ?? "http://127.0.0.1:4317";

export default function OperatorDashboard() {
  const [sourceLanguage, setSourceLanguage] = useState<SourceLanguage>(
    DEFAULT_SOURCE_LANGUAGE,
  );
  const [targetLanguage, setTargetLanguage] = useState<LanguageLocale>(
    DEFAULT_TARGET_LANGUAGE,
  );
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [microphoneState, setMicrophoneState] = useState<
    "idle" | "requesting" | "active" | "error"
  >("idle");
  const [microphoneError, setMicrophoneError] = useState("");
  const [level, setLevel] = useState(0);
  const [workerState, setWorkerState] = useState<WorkerState>("checking");
  const [fontSize, setFontSize] = useState(48);
  const [textColor, setTextColor] = useState("#ffffff");
  const [backgroundColor, setBackgroundColor] = useState("#101827");
  const [keywordText, setKeywordText] = useState(
    "Jesus Christ, Holy Spirit, Bethlehem",
  );
  const [filterText, setFilterText] = useState("");

  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const animationRef = useRef<number | null>(null);

  const stopMicrophone = useCallback(() => {
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void contextRef.current?.close();
    contextRef.current = null;
    setLevel(0);
  }, []);

  const refreshDevices = useCallback(async () => {
    const availableDevices = await navigator.mediaDevices.enumerateDevices();
    const microphones = availableDevices.filter(({ kind }) => kind === "audioinput");
    setDevices(microphones);
    setSelectedDeviceId((current) => current || microphones[0]?.deviceId || "");
  }, []);

  const startMicrophone = useCallback(
    async (deviceId?: string) => {
      setMicrophoneState("requesting");
      setMicrophoneError("");
      stopMicrophone();

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: deviceId ? { deviceId: { exact: deviceId } } : true,
        });
        const audioContext = new AudioContext();
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);

        const samples = new Uint8Array(analyser.fftSize);
        const updateLevel = () => {
          analyser.getByteTimeDomainData(samples);
          const sumSquares = samples.reduce((sum, sample) => {
            const centered = (sample - 128) / 128;
            return sum + centered * centered;
          }, 0);
          setLevel(Math.min(1, Math.sqrt(sumSquares / samples.length) * 3));
          animationRef.current = requestAnimationFrame(updateLevel);
        };

        streamRef.current = stream;
        contextRef.current = audioContext;
        updateLevel();
        setMicrophoneState("active");
        await refreshDevices();
      } catch (error) {
        setMicrophoneState("error");
        setMicrophoneError(
          error instanceof Error ? error.message : "Microphone access failed.",
        );
      }
    },
    [refreshDevices, stopMicrophone],
  );

  useEffect(() => {
    if (!navigator.mediaDevices) return;
    navigator.mediaDevices.addEventListener("devicechange", refreshDevices);

    return () => {
      navigator.mediaDevices.removeEventListener("devicechange", refreshDevices);
      stopMicrophone();
    };
  }, [refreshDevices, stopMicrophone]);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 1800);
    const client = new LocalCompanionClient(workerUrl);

    client
      .health(controller.signal)
      .then((health) => setWorkerState(health.status === "ready" ? "ready" : "not-running"))
      .catch(() => setWorkerState("not-running"))
      .finally(() => window.clearTimeout(timeout));

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, []);

  const keywordCount = useMemo(
    () => keywordText.split(",").filter((keyword) => keyword.trim()).length,
    [keywordText],
  );
  const sourceLabel =
    sourceLanguage === "auto"
      ? "Automatic detection"
      : LANGUAGE_OPTIONS.find(({ locale }) => locale === sourceLanguage)?.label;

  return (
    <main>
      <header className="topbar">
        <div className="brand">
          <span className="brandMark" aria-hidden="true">CC</span>
          <div>
            <p className="eyebrow">Free/local-first prototype</p>
            <h1>Church Live Caption</h1>
          </div>
        </div>
        <div className={`statusPill ${workerState}`}>
          <span className="statusDot" aria-hidden="true" />
          {workerState === "checking"
            ? "Checking local AI"
            : workerState === "ready"
              ? "Local AI ready"
              : "Local AI not running"}
        </div>
      </header>

      <section className="hero">
        <div>
          <p className="sectionLabel">Service setup</p>
          <h2>Make every spoken word easier to follow.</h2>
          <p>
            Configure the church audio, spoken language, biblical vocabulary, and
            public caption style before connecting the stream to OBS.
          </p>
        </div>
        <button className="primaryButton" disabled={workerState !== "ready"}>
          Start caption session
        </button>
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
              onChange={(event) => {
                const deviceId = event.target.value;
                setSelectedDeviceId(deviceId);
                if (microphoneState === "active") void startMicrophone(deviceId);
              }}
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
            onClick={() => void startMicrophone(selectedDeviceId || undefined)}
            disabled={microphoneState === "requesting"}
          >
            {microphoneState === "active" ? "Restart audio test" : "Enable audio test"}
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
            Selected source: {sourceLabel}. Explicit selection is recommended during a service.
          </p>
        </section>

        <section className="panel previewPanel">
          <div className="panelHeading">
            <div>
              <p className="stepNumber">Live canvas</p>
              <h3>OBS caption preview</h3>
            </div>
            <span className="previewBadge">Synthetic sample</span>
          </div>
          <div className="videoFrame">
            <div
              className="captionPreview"
              data-testid="caption-preview"
              style={{
                color: textColor,
                backgroundColor,
                fontSize: `${fontSize}px`,
              }}
            >
              {SAMPLE_CAPTIONS[targetLanguage]}
            </div>
          </div>
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
              placeholder="Jesus Christ, Bethlehem, church ministry name"
            />
          </label>
          <p className="helpText">
            These hints improve recognition. Approved translations will be stored separately per language.
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
            Filtering changes only the public caption. Protected source text remains separate.
          </p>
        </section>

        <section className="panel modelPanel">
          <div className="panelHeading">
            <div>
              <p className="stepNumber">04</p>
              <h3>Local AI models</h3>
            </div>
          </div>
          <div className="modelRow">
            <span>Transcription</span>
            <strong>Whisper small multilingual</strong>
            <small>whisper.cpp · local</small>
          </div>
          <div className="modelRow">
            <span>Translation</span>
            <strong>MADLAD-400 3B</strong>
            <small>one target · local</small>
          </div>
          <div className="workerMessage">
            <span className={`statusDot ${workerState}`} aria-hidden="true" />
            <div>
              <strong>
                {workerState === "ready" ? "Companion connected" : "Companion setup pending"}
              </strong>
              <p>
                Models run on this computer. No transcription or translation API charges apply in Phase 1A.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
