"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

import { CloudProviderClient } from "@/ai/cloud-provider-client";
import {
  DEFAULT_TRANSLATION_SYSTEM_PROMPT,
  normalizeTranslationSystemPrompt,
} from "@/ai/translation-prompt";
import { AiUsageDashboard } from "@/components/operator/AiUsageDashboard";
import { PromptEditor } from "@/components/operator/PromptEditor";
import { TranslationSettingsEditor } from "@/components/operator/TranslationSettingsEditor";
import {
  BorderGlow,
  LineSidebar,
  SpotlightCard,
  type LineSidebarItem,
} from "@/components/reactbits";
import {
  DEFAULT_SOURCE_LANGUAGE,
  DEFAULT_TARGET_LANGUAGE,
  LANGUAGE_OPTIONS,
  type LanguageLocale,
  type SourceLanguage,
} from "@/domain/languages";
import { parseGlossaryInput } from "@/live/config";
import {
  DEFAULT_SPEECH_BUFFER_MS,
  MAX_LIVE_SESSION_MS,
  MAX_TRANSCRIPTION_REQUESTS,
  normalizeCaptionStyle,
  type CaptionStyle,
  type ChannelStatus,
  type SpeechBufferMs,
} from "@/live/contracts";
import { SAMPLE_CAPTIONS } from "@/live/test-captions";
import { startSerialPolling } from "@/live/serial-polling";
import {
  normalizeTranslationSessionSettings,
  translationSettingsChanges,
  translationSettingsFingerprint,
  type TranslationSessionSettings,
} from "@/live/translation-settings";
import { useLiveCaptionSession } from "@/live/use-live-caption-session";

type CloudState = "checking" | "ready" | "not-configured" | "unavailable";

interface CloudModels {
  transcription: string;
  translation: string;
}

const CAPTION_PREFERENCE_KEY = "church-live-caption:caption-style:v1";
const TRANSLATION_PROMPT_PREFERENCE_KEY =
  "church-live-caption:translation-system-prompt:v1";

type WorkspaceSectionId =
  | "audio"
  | "translation"
  | "usage"
  | "prompt"
  | "appearance"
  | "outputs"
  | "viewer";

const SETUP_WORKSPACE_ITEMS: readonly LineSidebarItem[] = [
  { id: "audio", label: "Audio input", description: "Choose and test microphone" },
  {
    id: "translation",
    label: "Translation",
    description: "Languages, timing and terms",
  },
  { id: "usage", label: "AI usage", description: "Consumption and limits" },
  { id: "prompt", label: "AI instructions", description: "Review the system prompt" },
  { id: "appearance", label: "Appearance", description: "Style the OBS captions" },
  { id: "outputs", label: "Live outputs", description: "OBS and mobile delivery" },
];

const LIVE_WORKSPACE_ITEMS: readonly LineSidebarItem[] = [
  { id: "translation", label: "Translation", description: "Change live configuration" },
  { id: "usage", label: "AI usage", description: "Monitor consumption and limits" },
  { id: "prompt", label: "AI instructions", description: "Tune translation behaviour" },
  { id: "viewer", label: "Mobile viewer", description: "Share or replace the link" },
  { id: "appearance", label: "Appearance", description: "Update OBS styling" },
  { id: "audio", label: "Audio input", description: "Pause to change device" },
];

const WORKSPACE_SECTION_COPY: Record<
  WorkspaceSectionId,
  { eyebrow: string; title: string; description: string }
> = {
  audio: {
    eyebrow: "Input",
    title: "Audio input",
    description: "Choose the browser microphone or audio interface and confirm its level.",
  },
  translation: {
    eyebrow: "Translation session",
    title: "Languages, timing and terminology",
    description:
      "Edit the working translation configuration before or during a live service.",
  },
  usage: {
    eyebrow: "AI guardrails",
    title: "Consumption and limits",
    description:
      "Monitor this service and the latest quota headroom reported by the translation provider.",
  },
  prompt: {
    eyebrow: "AI instructions",
    title: "Translation system prompt",
    description:
      "Review the safe default or tailor how the translator handles context, tone and ambiguity.",
  },
  appearance: {
    eyebrow: "OBS design",
    title: "Caption appearance",
    description: "Tune readable captions against the 1920 × 1080 OBS safe area.",
  },
  outputs: {
    eyebrow: "Delivery",
    title: "Live outputs",
    description: "Prepare the reusable OBS source and understand mobile viewer delivery.",
  },
  viewer: {
    eyebrow: "Audience access",
    title: "Mobile translation viewer",
    description: "Share the current moderated translation without exposing the OBS credential.",
  },
};

const CHANNEL_STATUS_LABELS: Record<ChannelStatus | "loading", string> = {
  loading: "Checking OBS channel",
  unconfigured: "OBS not set up",
  idle: "OBS ready",
  live: "OBS live",
  paused: "OBS paused",
};

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
  const headingId = useId();

  return (
    <SpotlightCard className="previewCard" aria-labelledby={headingId}>
      <div className="sectionHeading">
        <div>
          <p className="eyebrow">OBS canvas · 1920 × 1080</p>
          <h2 id={headingId}>Caption preview</h2>
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
    </SpotlightCard>
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
            onInput={(event) => setFontSize(Number(event.currentTarget.value))}
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
              onInput={(event) => setTextColor(event.currentTarget.value)}
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
              onInput={(event) => setBackgroundColor(event.currentTarget.value)}
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
            onInput={(event) =>
              setBackgroundTransparency(Number(event.currentTarget.value))
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
            onInput={(event) =>
              setHorizontalMarginPercent(Number(event.currentTarget.value))
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
            onInput={(event) =>
              setVerticalMarginPercent(Number(event.currentTarget.value))
            }
          />
        </label>
      </div>
      <div className="saveRow">
        <button className="secondaryButton" type="button" onClick={onSave} disabled={saving}>
          {saving ? "Saving…" : "Save as default"}
        </button>
        <p role="status" aria-live="polite" aria-atomic="true">
          {savedMessage}
        </p>
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
  const [cloudModels, setCloudModels] = useState<CloudModels | null>(null);
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
  const [speechBufferMs, setSpeechBufferMs] = useState<SpeechBufferMs>(
    DEFAULT_SPEECH_BUFFER_MS,
  );
  const [translationSystemPrompt, setTranslationSystemPrompt] = useState(
    DEFAULT_TRANSLATION_SYSTEM_PROMPT,
  );
  const [savedPromptFingerprint, setSavedPromptFingerprint] = useState("");
  const [promptStorageMessage, setPromptStorageMessage] = useState("");
  const [activeWorkspaceSection, setActiveWorkspaceSection] =
    useState<WorkspaceSectionId>("translation");
  const [confirmTranslationRefresh, setConfirmTranslationRefresh] =
    useState(false);
  const refreshConfirmationHeadingRef = useRef<HTMLHeadingElement>(null);
  const refreshReviewButtonRef = useRef<HTMLButtonElement>(null);
  const [copied, setCopied] = useState(false);
  const [viewerCopied, setViewerCopied] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [confirmViewerReplace, setConfirmViewerReplace] = useState(false);
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
  const draftTranslationSettings = useMemo(
    () =>
      normalizeTranslationSessionSettings({
        sourceLanguage,
        targetLanguage,
        keywordText,
        filterText,
        speechBufferMs,
        translationSystemPrompt,
      }),
    [
      filterText,
      keywordText,
      sourceLanguage,
      speechBufferMs,
      targetLanguage,
      translationSystemPrompt,
    ],
  );
  const liveSettings = useMemo(
    () => ({
      ...draftTranslationSettings,
      style,
    }),
    [draftTranslationSettings, style],
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
    viewerAction,
    activeSpeechBufferMs,
    activeTranslationSettings,
    translationRefreshRequired,
    endRetryRequired,
    takeoverRequired,
    rotationRecoveryRequired,
    cancelTakeover,
    startAudioTest,
    createChannel,
    rotateChannel,
    saveChannelStyle,
    replaceViewerLink,
    startSession,
    pauseSession,
    resumeSession,
    clearCaption,
    showTestCaption,
    refreshTranslationSession,
    stopSession,
    reloadChannel,
  } = useLiveCaptionSession(liveSettings);
  const activeTranslationSettingsFingerprint = useMemo(
    () =>
      activeTranslationSettings
        ? translationSettingsFingerprint(activeTranslationSettings)
        : "",
    [activeTranslationSettings],
  );

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 1_800);
    new CloudProviderClient()
      .health(controller.signal)
      .then((health) => {
        setCloudState(health.status);
        setCloudModels({
          transcription: health.transcription.model,
          translation: health.translation.model,
        });
      })
      .catch(() => {
        setCloudState("unavailable");
        setCloudModels(null);
      })
      .finally(() => window.clearTimeout(timeout));
    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    if (!activeTranslationSettingsFingerprint) return;
    const active = normalizeTranslationSessionSettings(
      JSON.parse(activeTranslationSettingsFingerprint) as Partial<TranslationSessionSettings>,
    );
    const timeout = window.setTimeout(() => {
      setSourceLanguage(active.sourceLanguage);
      setTargetLanguage(active.targetLanguage);
      setKeywordText(active.keywordText);
      setFilterText(active.filterText);
      setSpeechBufferMs(active.speechBufferMs);
      setTranslationSystemPrompt(active.translationSystemPrompt);
      setConfirmTranslationRefresh(false);
      setPromptStorageMessage("");
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [activeTranslationSettingsFingerprint]);

  useEffect(() => {
    if (!confirmTranslationRefresh) return;
    const frame = window.requestAnimationFrame(() => {
      refreshConfirmationHeadingRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [confirmTranslationRefresh]);

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

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(
        TRANSLATION_PROMPT_PREFERENCE_KEY,
      );
      if (!stored) return;
      const loaded = normalizeTranslationSystemPrompt(stored);
      const timeout = window.setTimeout(() => {
        setTranslationSystemPrompt(loaded);
        setSavedPromptFingerprint(loaded);
        setPromptStorageMessage("Loaded the saved browser default.");
      }, 0);
      return () => window.clearTimeout(timeout);
    } catch {
      const timeout = window.setTimeout(
        () =>
          setPromptStorageMessage(
            "The saved browser prompt is invalid. The safe default is in use.",
          ),
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
  const isRefreshing = liveState.status === "refreshing";
  const liveNeedsAttention = hasService && liveState.status === "error";
  const isBusy = [
    "loading-channel",
    "starting",
    "pausing",
    "resuming",
    "refreshing",
    "ending",
  ].includes(liveState.status) || controlAction === "refresh-translation";
  const endActionDisabled =
    isBusy ||
    controlAction !== null ||
    channelAction !== null ||
    viewerAction !== null;
  const anotherOperatorActive =
    !hasService &&
    (liveState.channel?.status === "live" || liveState.channel?.status === "paused");
  const usageServiceStartedAt = liveState.service?.startedAt ??
    (anotherOperatorActive ? liveState.channel?.startedAt : null);
  const serviceStartedMs = usageServiceStartedAt
    ? new Date(usageServiceStartedAt).getTime()
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
  const cloudModelStatus =
    cloudState === "checking"
      ? "Checking configured model…"
      : "Unavailable from health route";
  const channelStatus = liveState.channel?.status ?? "loading";
  const channelStatusLabel = CHANNEL_STATUS_LABELS[channelStatus];
  const channelConfigured = Boolean(liveState.channel?.configured);
  const checkingChannel = liveState.status === "loading-channel" || channelStatus === "loading";
  const startDisabled =
    cloudState !== "ready" ||
    !channelConfigured ||
    isBusy ||
    channelAction !== null;
  const startHeading = anotherOperatorActive
    ? "Main channel already live"
    : liveState.status === "error"
      ? "Setup needs attention"
      : cloudState === "checking"
        ? "Checking cloud AI"
        : cloudState !== "ready"
          ? "Cloud AI setup required"
          : checkingChannel
            ? "Checking OBS channel"
            : !channelConfigured
              ? "Create the OBS channel to continue"
              : "Ready to start captions?";
  const startDescription = anotherOperatorActive
    ? "Takeover stops the other operator and clears OBS before this microphone starts."
    : liveState.status === "error"
      ? "Resolve the setup issue above before starting the service."
      : cloudState !== "ready"
        ? "Cloud AI must be ready before microphone capture can begin."
        : checkingChannel
          ? "Wait while the existing OBS channel is checked."
          : !channelConfigured
            ? "Create the reusable OBS Browser Source in the Live outputs section before going live."
            : "Starting opens a 90-minute service window and begins microphone capture.";
  const viewerUrl = liveState.service?.viewerUrl ?? null;
  const workspaceItems = hasService
    ? LIVE_WORKSPACE_ITEMS
    : SETUP_WORKSPACE_ITEMS;
  const currentWorkspaceSection = workspaceItems.some(
    ({ id }) => id === activeWorkspaceSection,
  )
    ? activeWorkspaceSection
    : hasService
      ? "translation"
      : "audio";
  const currentSectionCopy = WORKSPACE_SECTION_COPY[currentWorkspaceSection];
  const translationChanges = activeTranslationSettings
    ? translationSettingsChanges(
        activeTranslationSettings,
        draftTranslationSettings,
      )
    : [];
  const hasPendingTranslationChanges =
    hasService &&
    (translationRefreshRequired || translationChanges.length > 0);
  const translationActionBusy = controlAction === "refresh-translation";
  const translationEditorDisabled = hasService
    ? translationActionBusy || liveState.status === "ending"
    : isBusy;

  useEffect(() => {
    if (!hasService && !anotherOperatorActive) return;
    const interval = window.setInterval(() => setUsageClock(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, [anotherOperatorActive, hasService]);

  useEffect(() => {
    if (!anotherOperatorActive || isBusy) return;
    return startSerialPolling(() => reloadChannel(true), 5_000);
  }, [anotherOperatorActive, isBusy, reloadChannel]);

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

  const copyViewerUrl = async () => {
    if (!viewerUrl) return;
    try {
      await navigator.clipboard.writeText(viewerUrl);
      setViewerCopied(true);
      window.setTimeout(() => setViewerCopied(false), 1_500);
    } catch {
      setPreferenceError("The mobile viewer link could not be copied. Try again.");
    }
  };

  const openViewerPreview = () => {
    if (!viewerUrl) return;
    window.open(viewerUrl, "_blank", "noopener,noreferrer");
  };

  const savePromptBrowserDefault = () => {
    try {
      const normalized = normalizeTranslationSystemPrompt(
        translationSystemPrompt,
      );
      window.localStorage.setItem(
        TRANSLATION_PROMPT_PREFERENCE_KEY,
        normalized,
      );
      setTranslationSystemPrompt(normalized);
      setSavedPromptFingerprint(normalized);
      setPromptStorageMessage("Saved as this browser's default prompt.");
    } catch {
      setPromptStorageMessage("The prompt could not be saved in this browser.");
    }
  };

  const resetPromptToSafeDefault = () => {
    try {
      window.localStorage.removeItem(TRANSLATION_PROMPT_PREFERENCE_KEY);
      setTranslationSystemPrompt(DEFAULT_TRANSLATION_SYSTEM_PROMPT);
      setSavedPromptFingerprint("");
      setPromptStorageMessage(
        "Reset to the safe default. No custom prompt is saved in this browser.",
      );
    } catch {
      setTranslationSystemPrompt(DEFAULT_TRANSLATION_SYSTEM_PROMPT);
      setPromptStorageMessage(
        "Safe default restored, but browser storage could not be cleared.",
      );
    }
  };

  const updateTranslationSystemPrompt = (value: string) => {
    setTranslationSystemPrompt(value);
    setPromptStorageMessage("");
  };

  const restoreActiveTranslationDraft = () => {
    if (!activeTranslationSettings || !hasPendingTranslationChanges) return;
    const active = normalizeTranslationSessionSettings(
      activeTranslationSettings,
    );
    setSourceLanguage(active.sourceLanguage);
    setTargetLanguage(active.targetLanguage);
    setKeywordText(active.keywordText);
    setFilterText(active.filterText);
    setSpeechBufferMs(active.speechBufferMs);
    setTranslationSystemPrompt(active.translationSystemPrompt);
    setConfirmTranslationRefresh(false);
    setPromptStorageMessage(
      "Draft restored to the active session. Browser default unchanged.",
    );
  };

  const confirmAndRefreshTranslation = () => {
    setConfirmTranslationRefresh(false);
    void refreshTranslationSession();
  };

  const cancelTranslationRefreshConfirmation = () => {
    setConfirmTranslationRefresh(false);
    window.requestAnimationFrame(() => refreshReviewButtonRef.current?.focus());
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

  const promptSavedMessage =
    promptStorageMessage ||
    (savedPromptFingerprint
      ? savedPromptFingerprint === translationSystemPrompt
        ? "Saved as this browser's default prompt."
        : "Prompt changed. Save explicitly to update the browser default."
      : translationSystemPrompt === DEFAULT_TRANSLATION_SYSTEM_PROMPT
        ? "Using the safe default. Custom changes are not saved automatically."
        : "Custom prompt is not saved. Save explicitly if this browser should reuse it.");

  const translationSettingsEditor = (
    <TranslationSettingsEditor
      sourceLanguage={sourceLanguage}
      targetLanguage={targetLanguage}
      keywordText={keywordText}
      filterText={filterText}
      speechBufferMs={speechBufferMs}
      sourceLabel={sourceLabel ?? sourceLanguage}
      keywordCount={keywordCount}
      disabled={translationEditorDisabled}
      onSourceLanguageChange={setSourceLanguage}
      onTargetLanguageChange={setTargetLanguage}
      onKeywordTextChange={setKeywordText}
      onFilterTextChange={setFilterText}
      onSpeechBufferChange={setSpeechBufferMs}
    />
  );

  const promptEditor = (
    <PromptEditor
      value={translationSystemPrompt}
      onChange={updateTranslationSystemPrompt}
      onSaveBrowserDefault={savePromptBrowserDefault}
      onReset={resetPromptToSafeDefault}
      savedMessage={promptSavedMessage}
      disabled={translationEditorDisabled}
    />
  );

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
        <div
          className="meter"
          role="meter"
          aria-label="Microphone input level"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(level * 100)}
          aria-valuetext={`${Math.round(level * 100)} percent`}
        >
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
      {microphoneError ? (
        <p className="errorText" role="alert">
          {microphoneError}
        </p>
      ) : null}
    </>
  );

  return (
    <main>
      <header className="topbar">
        <div className="brand">
          <span className="brandMark" aria-hidden="true">CC</span>
          <div>
            <p className="eyebrow">Live translation console</p>
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
          <span className={`statusPill channel-${channelStatus}`}>
            {channelStatusLabel}
          </span>
        </div>
      </header>

      <section
        className={`statusBanner ${liveState.status}`}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <div>
          <strong>
            {hasService
              ? liveNeedsAttention
                ? "Live service needs attention"
                : isRefreshing
                  ? "Refreshing translation session"
                : isPaused
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
        <section
          className={`liveConsole ${isPaused ? "paused" : ""} ${liveNeedsAttention ? "attention" : ""}`}
          aria-label="Live controls"
        >
          <div className="liveIdentity">
            <span
              className={`liveIndicator ${
                isPaused || isRefreshing || liveNeedsAttention ? "paused" : ""
              }`}
              aria-hidden="true"
            />
            <div>
              <strong>
                {liveNeedsAttention
                  ? "Capture stopped"
                  : isRefreshing
                    ? "Refreshing translation"
                  : isPaused
                    ? "Paused"
                    : "Captions live"}
              </strong>
              <p>
                Overlay sequence {liveState.sequence} · {liveState.droppedChunks}{" "}
                skipped · {liveState.lastLatencyMs === null
                  ? "waiting for processing time"
                  : `${liveState.lastLatencyMs} ms processing`}
              </p>
            </div>
          </div>
          <div className="compactUsage">
            <div>
              <span>
                {elapsedMinutes}m {elapsedSeconds.toString().padStart(2, "0")}s / 90m
              </span>
              <span>
                {liveState.transcriptionRequests} / {MAX_TRANSCRIPTION_REQUESTS}{" "}
                attempts · {liveState.llmUsage.translationRequests} translations
              </span>
              <button
                className="usageDetailsButton"
                type="button"
                onClick={() => setActiveWorkspaceSection("usage")}
              >
                View usage
              </button>
            </div>
            <div
              className="usageProgress"
              role="progressbar"
              aria-label="Live service usage"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={usagePercent}
              aria-valuetext={`${elapsedMinutes} minutes ${elapsedSeconds} seconds elapsed; ${liveState.transcriptionRequests} of ${MAX_TRANSCRIPTION_REQUESTS} transcription attempts used; ${liveState.llmUsage.translationRequests} translation calls and ${liveState.llmUsage.totalTokens} translation tokens`}
            >
              <span style={{ width: `${usagePercent}%` }} />
            </div>
          </div>
          <div className="primaryControls">
            {endRetryRequired ? (
              <button
                className="dangerButton"
                disabled={endActionDisabled}
                onClick={() => void stopSession()}
              >
                Retry End
              </button>
            ) : isPaused || liveState.status === "resuming" ? (
              <button
                className="primaryButton"
                disabled={isBusy || controlAction !== null}
                onClick={() => void resumeSession()}
              >
                {liveState.status === "resuming" ? "Resuming…" : "Resume"}
              </button>
            ) : (
              <button
                className="primaryButton"
                disabled={isBusy || controlAction !== null}
                onClick={() => void pauseSession()}
              >
                {liveState.status === "pausing"
                  ? "Pausing…"
                  : "Pause"}
              </button>
            )}
            <button
              className="secondaryButton compactButton"
              disabled={isBusy || controlAction !== null}
              onClick={() => void clearCaption()}
            >
              {controlAction === "clear" ? "Clearing…" : "Clear OBS"}
            </button>
            <details className="moreMenu">
              <summary>More</summary>
              <div>
                <button onClick={() => void copyOverlayUrl()}>
                  {copied ? "Copied" : "Copy OBS URL"}
                </button>
                {viewerUrl ? (
                  <button onClick={() => void copyViewerUrl()}>
                    {viewerCopied
                      ? "Mobile link copied"
                      : "Copy mobile viewer link"}
                  </button>
                ) : null}
                <button
                  disabled={!isPaused || controlAction !== null}
                  onClick={() => void showTestCaption()}
                >
                  {controlAction === "show-test"
                    ? "Showing test…"
                    : "Show test caption"}
                </button>
                {confirmEnd ? (
                  <span className="confirmationRow">
                    <button onClick={() => setConfirmEnd(false)}>Cancel</button>
                    <button
                      className="dangerText"
                      disabled={endActionDisabled}
                      onClick={() => {
                        setConfirmEnd(false);
                        void stopSession();
                      }}
                    >
                      Confirm End
                    </button>
                  </span>
                ) : (
                  <button
                    className="dangerText"
                    disabled={endActionDisabled}
                    onClick={() => setConfirmEnd(true)}
                  >
                    {endRetryRequired ? "Retry End" : "End service"}
                  </button>
                )}
              </div>
            </details>
          </div>
        </section>
      ) : (
        <section className="setupHero" aria-labelledby="setup-heading">
          <div>
            <p className="eyebrow">Service setup</p>
            <h2 id="setup-heading">Prepare the room, then go live</h2>
            <p>
              Work through each section once. The same controls stay available
              during the service, without closing the session.
            </p>
          </div>
          <div className="setupHeroMeta" aria-label="Service limits">
            <span>90-minute window</span>
            <span>1920 × 1080 OBS</span>
            <span>Private operator source</span>
          </div>
        </section>
      )}

      <div className={`operatorWorkspace ${hasService ? "isLive" : "isSetup"}`}>
        <aside className="workspaceNavigation" aria-label="Operator workspace navigation">
          <div className="workspaceNavigationHeading">
            <p className="eyebrow">{hasService ? "Live workspace" : "Setup workspace"}</p>
            <h2>{hasService ? "Manage captions" : "Ready the service"}</h2>
            <p>
              {hasService
                ? "Configuration stays editable. Apply translation changes with a controlled refresh."
                : "Select a section to configure the service."}
            </p>
          </div>
          <LineSidebar
            items={workspaceItems}
            activeId={currentWorkspaceSection}
            ariaLabel={hasService ? "Live caption sections" : "Service setup sections"}
            onActiveChange={(id) =>
              setActiveWorkspaceSection(id as WorkspaceSectionId)
            }
          />
          <div className="serviceSnapshot">
            <p className="eyebrow">Service engine</p>
            <dl>
              <div>
                <dt>Transcription</dt>
                <dd>{cloudModels?.transcription ?? cloudModelStatus}</dd>
              </div>
              <div>
                <dt>Translation</dt>
                <dd>{cloudModels?.translation ?? cloudModelStatus}</dd>
              </div>
              <div>
                <dt>{hasService ? "Active buffer" : "Draft buffer"}</dt>
                <dd>{(hasService ? activeSpeechBufferMs : speechBufferMs) / 1_000}s</dd>
              </div>
            </dl>
          </div>
        </aside>

        <BorderGlow
          className="workspacePanelGlow"
          pending={hasPendingTranslationChanges || translationActionBusy}
          aria-busy={translationActionBusy}
        >
          <SpotlightCard
            className="workspacePanel"
            aria-labelledby="workspace-panel-heading"
            spotlightColor="rgba(17, 17, 17, 0.055)"
            spotlightSize={440}
          >
            <header className="workspacePanelHeader">
              <div>
                <p className="eyebrow">{currentSectionCopy.eyebrow}</p>
                <h2 id="workspace-panel-heading">{currentSectionCopy.title}</h2>
                <p>{currentSectionCopy.description}</p>
              </div>
              <span
                className={`statusChip ${
                  hasPendingTranslationChanges ? "pending" : "ready"
                }`}
              >
                {hasService
                  ? hasPendingTranslationChanges
                    ? translationChanges.length
                      ? `${translationChanges.length} change${
                          translationChanges.length === 1 ? "" : "s"
                        } pending`
                      : "Refresh required"
                    : "Live settings active"
                  : "Setup draft"}
              </span>
            </header>

            {hasPendingTranslationChanges ? (
              <section
                className="translationRefreshNotice"
                aria-labelledby="translation-refresh-heading"
              >
                <div
                  className="refreshNoticeCopy"
                  role="status"
                  aria-live="polite"
                  aria-atomic="true"
                >
                  <p className="eyebrow">Refresh required</p>
                  <h3 id="translation-refresh-heading">
                    Translation changes are ready to apply
                  </h3>
                  <p>
                    {translationChanges.length
                      ? translationChanges.join(" · ")
                      : "Translation configuration"}
                  </p>
                </div>
                {confirmTranslationRefresh ? (
                  <div
                    className="refreshConfirmation"
                    role="group"
                    aria-labelledby="refresh-confirmation-heading"
                  >
                    <h3
                      id="refresh-confirmation-heading"
                      ref={refreshConfirmationHeadingRef}
                      tabIndex={-1}
                    >
                      Confirm translation refresh
                    </h3>
                    <p id="refresh-impact-description">
                      Refresh translation without closing the live service? The
                      session, mobile viewer link, 90-minute timer, OBS connection,
                      and connected viewers remain active. Unfinished audio and recent
                      translation context reset; an already reserved transcription
                      attempt may still count toward usage.
                    </p>
                    <div className="confirmationRow">
                      <button
                        className="secondaryButton"
                        type="button"
                        onClick={cancelTranslationRefreshConfirmation}
                      >
                        Keep editing
                      </button>
                      <button
                        className="primaryButton"
                        type="button"
                        aria-describedby="refresh-impact-description"
                        disabled={translationActionBusy}
                        onClick={confirmAndRefreshTranslation}
                      >
                        {translationActionBusy ? "Refreshing…" : "Confirm refresh"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="refreshActions">
                    <button
                      className="textButton"
                      type="button"
                      disabled={
                        !activeTranslationSettings ||
                        translationChanges.length === 0 ||
                        translationActionBusy
                      }
                      onClick={restoreActiveTranslationDraft}
                    >
                      Undo draft changes
                    </button>
                    <button
                      ref={refreshReviewButtonRef}
                      className="primaryButton"
                      type="button"
                      disabled={translationActionBusy}
                      onClick={() => setConfirmTranslationRefresh(true)}
                    >
                      Review refresh
                    </button>
                  </div>
                )}
              </section>
            ) : hasService &&
              (currentWorkspaceSection === "translation" ||
                currentWorkspaceSection === "prompt") ? (
              <p className="translationCurrentNote" role="status" aria-live="polite">
                {translationActionBusy
                  ? "Refreshing translation context…"
                  : "Draft matches the active translation session."}
              </p>
            ) : null}

            <div className="workspacePanelBody">
              {currentWorkspaceSection === "audio" ? (
                <div className="panelStack">
                  {audioFields}
                  {hasService && isLive ? (
                    <p className="privacyNote">
                      Language, terminology, timing, filtering, and the AI prompt can
                      change while captions run. Pause only when changing the browser
                      audio device.
                    </p>
                  ) : null}
                </div>
              ) : null}

              {currentWorkspaceSection === "translation" ? (
                <div className="panelStack">
                  {translationSettingsEditor}
                  <div className="modelSummary serviceDetailStrip">
                    <p>
                      <strong>Transcription:</strong>{" "}
                      <code>{cloudModels?.transcription ?? cloudModelStatus}</code>
                    </p>
                    <p>
                      <strong>Translation:</strong>{" "}
                      <code>{cloudModels?.translation ?? cloudModelStatus}</code>
                    </p>
                    <p>
                      <strong>Delivery:</strong> Cloudflare Durable Object · hibernating
                      WebSocket
                    </p>
                  </div>
                </div>
              ) : null}

              {currentWorkspaceSection === "usage" ? (
                <AiUsageDashboard
                  active={hasService || anotherOperatorActive}
                  statusLabel={
                    hasService
                      ? "Service active"
                      : anotherOperatorActive
                        ? "Another operator active"
                        : "Starts at zero"
                  }
                  elapsedServiceMs={elapsedServiceMs}
                  transcriptionRequests={liveState.transcriptionRequests}
                  llmUsage={liveState.llmUsage}
                  translationModel={
                    cloudModels?.translation ?? "Configured translation model"
                  }
                />
              ) : null}

              {currentWorkspaceSection === "prompt" ? promptEditor : null}

              {currentWorkspaceSection === "appearance" ? (
                <StyleEditor {...styleEditorProps} />
              ) : null}

              {currentWorkspaceSection === "outputs" ? (
                <div className="obsSetupCard workspaceOutputCard">
                  <div className="sectionHeading">
                    <div>
                      <p className="eyebrow">Reusable output</p>
                      <h3>OBS Main channel</h3>
                    </div>
                    <span
                      className={`statusChip ${
                        liveState.channel?.configured ? "ready" : ""
                      }`}
                    >
                      {liveState.channel?.configured ? "Reusable" : "Not created"}
                    </span>
                  </div>
                  {!liveState.channel?.configured ? (
                    <>
                      <p>
                        Create one encrypted Main channel URL. Paste it into OBS once
                        and reuse it for future services.
                      </p>
                      <button
                        className="primaryButton fullButton"
                        disabled={channelAction !== null || isBusy}
                        onClick={() => void createChannel()}
                      >
                        {channelAction === "create"
                          ? "Creating securely…"
                          : "Create OBS channel"}
                      </button>
                    </>
                  ) : (
                    <>
                      <p>
                        Use a 1920 × 1080 Browser Source. The canvas stays transparent
                        between services.
                      </p>
                      <label>
                        Reusable Main channel URL
                        <input
                          value={liveState.channel.overlayUrl ?? ""}
                          readOnly
                          aria-label="Reusable OBS browser-source URL"
                        />
                      </label>
                      <button
                        className="primaryButton fullButton"
                        onClick={() => void copyOverlayUrl()}
                      >
                        {copied ? "URL copied" : "Copy OBS URL"}
                      </button>
                      <div className="buttonGrid">
                        <button
                          className="secondaryButton"
                          disabled={controlAction !== null}
                          onClick={() => void showTestCaption()}
                        >
                          {controlAction === "show-test" ? "Showing…" : "Show test"}
                        </button>
                        <button
                          className="secondaryButton"
                          disabled={controlAction !== null}
                          onClick={() => void clearCaption()}
                        >
                          {controlAction === "clear" ? "Clearing…" : "Clear OBS"}
                        </button>
                      </div>
                      <details className="advancedActions">
                        <summary>Advanced link security</summary>
                        <p>
                          Rotate only if the URL was exposed. The old OBS source stops
                          working immediately.
                        </p>
                        {confirmRotate ? (
                          <div className="confirmationRow">
                            <button
                              className="secondaryButton"
                              onClick={() => setConfirmRotate(false)}
                            >
                              Cancel
                            </button>
                            <button
                              className="dangerButton"
                              disabled={
                                channelAction !== null || anotherOperatorActive
                              }
                              onClick={() => {
                                setConfirmRotate(false);
                                void rotateChannel();
                              }}
                            >
                              {channelAction === "rotate"
                                ? "Rotating…"
                                : "Confirm rotation"}
                            </button>
                          </div>
                        ) : (
                          <button
                            className="dangerOutlineButton"
                            disabled={anotherOperatorActive}
                            onClick={() => setConfirmRotate(true)}
                          >
                            Rotate OBS link
                          </button>
                        )}
                      </details>
                    </>
                  )}
                  <div className="viewerSetupNote">
                    <strong>Mobile translation viewer</strong>
                    <p>
                      A separate read-only link is created when captions start. It
                      never exposes the reusable OBS credential and expires when the
                      service ends or another operator takes over.
                    </p>
                  </div>
                </div>
              ) : null}

              {currentWorkspaceSection === "viewer" ? (
                <div className="viewerLinkPanel">
                  <p>
                    Share this read-only link with intended viewers. It shows only the
                    current moderated translation and expires when this service ends or
                    another operator takes over.
                  </p>
                  {viewerUrl ? (
                    <>
                      <div className="buttonGrid">
                        <button
                          className="primaryButton"
                          type="button"
                          onClick={() => void copyViewerUrl()}
                        >
                          {viewerCopied ? "Link copied" : "Copy mobile link"}
                        </button>
                        <button
                          className="secondaryButton"
                          type="button"
                          onClick={openViewerPreview}
                        >
                          Open preview
                        </button>
                      </div>
                      <details className="advancedActions">
                        <summary>Viewer link security</summary>
                        <p>
                          Replace the link if it was shared with the wrong person.
                          Existing viewers disconnect immediately; OBS is unaffected.
                        </p>
                        {confirmViewerReplace ? (
                          <div className="confirmationRow">
                            <button
                              className="secondaryButton"
                              type="button"
                              onClick={() => setConfirmViewerReplace(false)}
                            >
                              Cancel
                            </button>
                            <button
                              className="dangerButton"
                              type="button"
                              disabled={viewerAction !== null || isBusy}
                              onClick={() => {
                                setConfirmViewerReplace(false);
                                void replaceViewerLink();
                              }}
                            >
                              {viewerAction === "replace"
                                ? "Replacing…"
                                : "Confirm replacement"}
                            </button>
                          </div>
                        ) : (
                          <button
                            className="dangerOutlineButton"
                            type="button"
                            disabled={viewerAction !== null || isBusy}
                            onClick={() => setConfirmViewerReplace(true)}
                          >
                            Replace mobile link
                          </button>
                        )}
                      </details>
                    </>
                  ) : (
                    <button
                      className="primaryButton"
                      type="button"
                      disabled={viewerAction !== null || isBusy}
                      onClick={() => void replaceViewerLink()}
                    >
                      {viewerAction === "replace"
                        ? "Creating link…"
                        : "Create mobile viewer link"}
                    </button>
                  )}
                </div>
              ) : null}
            </div>
          </SpotlightCard>
        </BorderGlow>

        <aside className="workspacePreview" aria-label="Caption output preview">
          <CaptionPreview
            caption={
              hasService
                ? liveState.latestPublicText
                : SAMPLE_CAPTIONS[targetLanguage]
            }
            sourceText={hasService ? liveState.latestSourceText : undefined}
            style={style}
            badge={
              hasService
                ? liveNeedsAttention
                  ? "Output needs attention"
                  : isRefreshing
                  ? "Refreshing settings"
                  : isPaused
                    ? "Paused output"
                    : "Live output"
                : "Design preview"
            }
            live={hasService && isLive}
          />
          <SpotlightCard
            className="outputContextCard"
            aria-labelledby="output-context-heading"
            spotlightColor="rgba(17, 17, 17, 0.045)"
          >
            <p className="eyebrow">Output context</p>
            <h3 id="output-context-heading">
              {hasService ? "Audience delivery stays connected" : "One setup, two outputs"}
            </h3>
            <p>
              {hasService
                ? "Refreshing translation settings keeps OBS, the mobile link, the service timer, and connected viewers active."
                : "OBS receives the transparent caption canvas. A separate mobile link is created only when the service begins."}
            </p>
          </SpotlightCard>
        </aside>
      </div>

      {!hasService ? (
        <section
          className={`startBar ${anotherOperatorActive ? "takeover" : ""}`}
          aria-labelledby="start-service-heading"
        >
          <div>
            <strong id="start-service-heading">{startHeading}</strong>
            <p id="start-service-description">{startDescription}</p>
          </div>
          {confirmTakeover || takeoverRequired ? (
            <div className="takeoverConfirmation">
              <button
                className="secondaryButton"
                onClick={() => {
                  setConfirmTakeover(false);
                  cancelTakeover();
                }}
              >
                Cancel
              </button>
              <button
                className="dangerButton"
                aria-describedby="start-service-description"
                disabled={cloudState !== "ready" || isBusy}
                onClick={() => {
                  setConfirmTakeover(false);
                  void startSession(true);
                }}
              >
                Confirm takeover
              </button>
            </div>
          ) : (
            <button
              className={
                anotherOperatorActive ? "dangerButton" : "primaryButton"
              }
              aria-describedby="start-service-description"
              disabled={startDisabled}
              onClick={() =>
                anotherOperatorActive
                  ? setConfirmTakeover(true)
                  : void startSession()
              }
            >
              {liveState.status === "starting"
                ? "Starting securely…"
                : anotherOperatorActive
                  ? "Take over channel"
                  : "Start captions"}
            </button>
          )}
        </section>
      ) : null}
    </main>
  );
}
