"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

import { CloudProviderClient } from "@/ai/cloud-provider-client";
import {
  DEFAULT_TRANSLATION_SYSTEM_PROMPT,
  normalizeTranslationSystemPrompt,
} from "@/ai/translation-prompt";
import { AiUsageDashboard } from "@/components/operator/AiUsageDashboard";
import { ManualCaptionControl } from "@/components/operator/ManualCaptionControl";
import { OperatorTutorial } from "@/components/operator/OperatorTutorial";
import { PromptEditor } from "@/components/operator/PromptEditor";
import { QuickBlockControl } from "@/components/operator/QuickBlockControl";
import { SummarySettingsEditor } from "@/components/operator/SummarySettingsEditor";
import type { SummaryOptions } from "@/experience/contracts";
import {
  loadOperatorPreferences,
  saveOperatorPreferences,
} from "@/experience/preferences-client";
import type { OperatorPreferences } from "@/experience/preferences";
import {
  DEFAULT_SUMMARY_OPTIONS,
  SUMMARY_DEFAULTS_PREFERENCE_KEY,
  normalizeSummaryOptions,
  summaryOptionsEqual,
} from "@/experience/summary-defaults";
import { TranslationSettingsEditor } from "@/components/operator/TranslationSettingsEditor";
import {
  BorderGlow,
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
import { THEME_PREFERENCE_KEY, applyTheme, normalizeTheme, readStoredTheme, type ThemePreference } from "@/live/theme";
import {
  normalizeTranslationSessionSettings,
  translationSettingsChanges,
  translationSettingsFingerprint,
  type TranslationSessionSettings,
} from "@/live/translation-settings";
import { useLiveCaptionSession } from "@/live/use-live-caption-session";
import { useObservedSession } from "@/live/use-observed-session";
import { ServiceExperiencePanel } from "@/components/operator/ServiceExperiencePanel";
import { UsageHistory } from "@/components/operator/UsageHistory";
import { DashboardIcon, DashboardNavigation } from "@/components/operator/DashboardNavigation";
import { ServicePanel } from "@/components/operator/ServicePanel";
import "./dashboard.css";
import "./service-panel.css";

type CloudState = "checking" | "ready" | "not-configured" | "unavailable";

interface CloudModels {
  transcription: string;
  translation: string;
}

const CAPTION_PREFERENCE_KEY = "church-live-caption:caption-style:v1";
const TRANSLATION_PROMPT_PREFERENCE_KEY =
  "church-live-caption:translation-system-prompt:v1";

type WorkspaceSectionId =
  | "history"
  | "audio"
  | "translation"
  | "usage"
  | "prompt"
  | "summary"
  | "appearance"
  | "outputs"
  | "overview";

const WORKSPACE_ITEMS: readonly LineSidebarItem[] = [
  { id: "overview", href: "#workspace=overview", label: "Overview", group: "Workspace", icon: <DashboardIcon name="overview" /> },
  { id: "audio", href: "#workspace=audio", label: "Audio input", group: "Setup", icon: <DashboardIcon name="audio" /> },
  { id: "translation", href: "#workspace=translation", label: "Translation", group: "Setup", icon: <DashboardIcon name="translation" /> },
  { id: "appearance", href: "#workspace=appearance", label: "Appearance", group: "Setup", icon: <DashboardIcon name="appearance" /> },
  { id: "outputs", href: "#workspace=outputs", label: "Live outputs", group: "Service", icon: <DashboardIcon name="outputs" /> },
  { id: "history", href: "#workspace=history", label: "Sermon history", group: "Service", icon: <DashboardIcon name="history" /> },
  { id: "usage", href: "#workspace=usage", label: "AI usage", group: "Service", icon: <DashboardIcon name="usage" /> },
  { id: "prompt", href: "#workspace=prompt", label: "AI instructions", group: "Settings", icon: <DashboardIcon name="prompt" /> },
  { id: "summary", href: "#workspace=summary", label: "AI summary", group: "Settings", icon: <DashboardIcon name="summary" /> },
];

const WORKSPACE_SECTION_COPY: Record<
  WorkspaceSectionId,
  { title: string; description: string }
> = {
  overview: { title: "Service overview", description: "Your service, from the first sound check to the final caption." },
  history: { title: "Sermon history", description: "Review saved transcripts, correct passages, and prepare a sermon summary." },
  audio: {
    title: "Audio input",
    description: "Choose the browser microphone or audio interface and confirm its level.",
  },
  translation: {
    title: "Languages, timing and terminology",
    description:
      "Edit the working translation configuration before or during a live service.",
  },
  usage: {
    title: "Consumption and limits",
    description:
      "Monitor this service and the latest quota headroom reported by the translation provider.",
  },
  prompt: {
    title: "Translation system prompt",
    description:
      "Review the safe default or tailor how the translator handles context, tone and ambiguity.",
  },
  summary: {
    title: "Summary configuration",
    description:
      "Set the default model, language, length and guidance that prefill each sermon summary request.",
  },
  appearance: {
    title: "Caption appearance",
    description: "Tune readable captions against the 1920 × 1080 OBS safe area.",
  },
  outputs: {
    title: "Live outputs",
    description: "Connect OBS, share audience captions, and pair your operator phone.",
  },
};

const CHANNEL_STATUS_LABELS: Record<ChannelStatus | "loading", string> = {
  loading: "Checking Main channel",
  unconfigured: "Channel not created",
  idle: "Main channel · Idle",
  live: "Main channel · Live",
  paused: "Main channel · Paused",
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
function CaptionPreview({
  caption,
  style,
  badge,
  live,
  sourceText,
  targetLanguage,
  sourceLanguage,
}: PreviewProps) {
  const headingId = useId();
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
    <SpotlightCard className="previewCard" aria-labelledby={headingId}>
      <div className="sectionHeading">
        <div>
          <h2 id={headingId}>Output monitor</h2>
        </div>
        <span className={`statusChip ${live ? "live" : ""}`}>{badge}</span>
      </div>
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
            No public caption
            <span>{live ? "Listening for the next caption" : "The caption canvas is clear"}</span>
          </p>
        ) : null}
      </div>
      <p className="previewHelp">Scaled copy of the 1920 × 1080 OBS canvas. Verify the actual Browser Source in OBS.</p>
      {sourceText ? (
        <div className="sourceTranscript">
          <strong>Source · Operator only</strong>
          <p lang={sourceLanguage === "auto" ? undefined : sourceLanguage}>{sourceText}</p>
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
  const [saveHistory, setSaveHistory] = useState(false);
  const [servicePanelOpen, setServicePanelOpen] = useState(false);
  const [theme, setTheme] = useState<ThemePreference>("system");
  const servicePanelTriggerRef = useRef<HTMLButtonElement>(null);
  const [speechBufferMs, setSpeechBufferMs] = useState<SpeechBufferMs>(
    DEFAULT_SPEECH_BUFFER_MS,
  );
  const [translationSystemPrompt, setTranslationSystemPrompt] = useState(
    DEFAULT_TRANSLATION_SYSTEM_PROMPT,
  );
  const [savedPromptFingerprint, setSavedPromptFingerprint] = useState("");
  const [promptStorageMessage, setPromptStorageMessage] = useState("");
  const [accountPreferences, setAccountPreferences] = useState<OperatorPreferences | null>(null);
  const [accountSidebarWidth, setAccountSidebarWidth] = useState<number | null>(null);
  const [tutorialOpenRequest, setTutorialOpenRequest] = useState(0);
  const sidebarSyncRef = useRef<{ timeout: number; width: number } | null>(null);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [translationDefaultsMessage, setTranslationDefaultsMessage] = useState("");
  const [summaryDefaults, setSummaryDefaults] = useState<SummaryOptions>(DEFAULT_SUMMARY_OPTIONS);
  const [savedSummaryDefaults, setSavedSummaryDefaults] = useState<SummaryOptions | null>(null);
  const [summaryStorageMessage, setSummaryStorageMessage] = useState("");
  const [activeWorkspaceSection, setActiveWorkspaceSection] =
    useState<WorkspaceSectionId>("overview");
  const workspaceHeadingRef = useRef<HTMLHeadingElement>(null);
  const [confirmTranslationRefresh, setConfirmTranslationRefresh] =
    useState(false);
  const refreshConfirmationHeadingRef = useRef<HTMLHeadingElement>(null);
  const refreshReviewButtonRef = useRef<HTMLButtonElement>(null);
  const [copied, setCopied] = useState(false);
  const [viewerCopied, setViewerCopied] = useState(false);
  const [clipboardMessage, setClipboardMessage] = useState("");
  const endDialogRef = useRef<HTMLDialogElement>(null);
  const statusBarRef = useRef<HTMLElement>(null);
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
      saveHistory,
    }),
    [draftTranslationSettings, style, saveHistory],
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
    quickBlockEntries,
    addQuickBlock,
    removeQuickBlock,
    rememberReaderLink,
    showTestCaption,
    showManualCaption,
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
    // The docked bar is fixed and can wrap onto two rows on narrow phones. Publish its
    // measured height so the content reserve and scroll margins never leave a control
    // hidden beneath it.
    const bar = statusBarRef.current;
    if (!bar || typeof ResizeObserver === "undefined") return;
    const root = document.documentElement;
    const apply = () => root.style.setProperty("--dashboard-status-bar-height", `${Math.ceil(bar.getBoundingClientRect().height)}px`);
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(bar);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--dashboard-status-bar-height");
    };
  }, []);

  useEffect(() => {
    const stored = readStoredTheme();
    if (stored === "system") return;
    const timeout = window.setTimeout(() => setTheme(stored), 0);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  function chooseTheme(next: string) {
    const normalized = normalizeTheme(next);
    setTheme(normalized);
    void syncAccountPreferences({ theme: normalized });
    try {
      if (normalized === "system") window.localStorage.removeItem(THEME_PREFERENCE_KEY);
      else window.localStorage.setItem(THEME_PREFERENCE_KEY, normalized);
    } catch {
      // Storage may be blocked; the choice still applies for this visit.
    }
  }

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
  // Read-only mirror of the service a different workspace operator controls.
  const observed = useObservedSession(anotherOperatorActive);
  const watchingOther = anotherOperatorActive && observed.status === "watching";
  // Who holds the microphone right now, for the other operators of this workspace.
  const runningOperator = anotherOperatorActive
    ? observed.observer?.controllerLabel ?? liveState.channel?.controllerLabel ?? null
    : null;
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
    ? runningOperator
      ? `${runningOperator} is running this service`
      : "Main channel already live"
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
              : "Start the caption service";
  const startDescription = anotherOperatorActive
    ? `${observed.message || "Connecting to the running service…"} Takeover stops the other operator and clears OBS before this microphone starts.`
    : liveState.status === "error"
      ? "Resolve the setup issue above before starting the service."
      : cloudState !== "ready"
        ? "Cloud AI must be configured before microphone capture can begin."
        : checkingChannel
          ? "Wait while the existing OBS channel is checked."
          : !channelConfigured
            ? "Create the reusable OBS Browser Source in the Live outputs section before going live."
            : "Start verifies the AI models, opens a 90-minute service window, and captures microphone audio.";
  const viewerUrl = liveState.service?.viewerUrl ?? null;
  const currentWorkspaceSection = activeWorkspaceSection;
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
  const displayedTranslationSettings = hasService
    ? activeTranslationSettings
    : draftTranslationSettings;
  const displayedSourceLabel = displayedTranslationSettings?.sourceLanguage === "auto"
    ? "Automatic detection"
    : LANGUAGE_OPTIONS.find(({ locale }) => locale === displayedTranslationSettings?.sourceLanguage)?.label;
  const displayedTargetLabel = LANGUAGE_OPTIONS.find(({ locale }) => locale === displayedTranslationSettings?.targetLanguage)?.label;

  const openWorkspaceSection = (section: WorkspaceSectionId) => {
    if (window.location.hash !== `#workspace=${section}`) {
      window.history.pushState(window.history.state, "", `#workspace=${section}`);
    }
    setActiveWorkspaceSection(section);
    window.requestAnimationFrame(() => workspaceHeadingRef.current?.focus());
  };

  useEffect(() => {
    const syncSection = (focus: boolean) => {
      const hash = window.location.hash;
      const id = hash === "" ? "overview" : hash.startsWith("#workspace=") ? hash.slice(11) : null;
      if (!WORKSPACE_ITEMS.some((item) => item.id === id)) return;
      setActiveWorkspaceSection(id as WorkspaceSectionId);
      if (focus) window.requestAnimationFrame(() => workspaceHeadingRef.current?.focus());
    };
    const initial = window.requestAnimationFrame(() => syncSection(false));
    const onHistory = () => syncSection(true);
    window.addEventListener("popstate", onHistory);
    window.addEventListener("hashchange", onHistory);
    return () => {
      window.cancelAnimationFrame(initial);
      window.removeEventListener("popstate", onHistory);
      window.removeEventListener("hashchange", onHistory);
    };
  }, []);

  useEffect(() => {
    if (!hasService && !anotherOperatorActive) return;
    const interval = window.setInterval(() => setUsageClock(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, [anotherOperatorActive, hasService]);

  useEffect(() => {
    if (!hasService) endDialogRef.current?.close();
  }, [hasService]);

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
      setClipboardMessage("OBS URL copied. Keep this reusable credential private.");
      window.setTimeout(() => setCopied(false), 1_500);
    } catch {
      setClipboardMessage(
        hasService
          ? "The OBS URL could not be copied. Open More and reveal the URL for manual copy."
          : "The OBS URL could not be copied. Open Live outputs and reveal the URL for manual copy.",
      );
    }
  };

  const copyViewerUrl = async () => {
    if (!viewerUrl) return;
    try {
      await navigator.clipboard.writeText(viewerUrl);
      setViewerCopied(true);
      setClipboardMessage("Mobile viewer link copied. Share only with intended viewers.");
      window.setTimeout(() => setViewerCopied(false), 1_500);
    } catch {
      setClipboardMessage("The mobile viewer link could not be copied. Open Mobile viewer and reveal the link for manual copy.");
    }
  };

  const openViewerPreview = () => {
    if (!viewerUrl) return;
    window.open(viewerUrl, "_blank", "noopener,noreferrer");
  };

  const hasServiceRef = useRef(false);
  useEffect(() => {
    hasServiceRef.current = Boolean(liveState.service);
  }, [liveState.service]);

  useEffect(() => {
    let cancelled = false;
    loadOperatorPreferences()
      .then((loaded) => {
        if (cancelled) return;
        setAccountPreferences(loaded);
        if (loaded.translationSystemPrompt !== null) {
          setTranslationSystemPrompt(loaded.translationSystemPrompt);
          setSavedPromptFingerprint(loaded.translationSystemPrompt);
          setPromptStorageMessage("Loaded from your account.");
        }
        if (loaded.summaryDefaults) {
          setSummaryDefaults(loaded.summaryDefaults);
          setSavedSummaryDefaults(loaded.summaryDefaults);
          setSummaryStorageMessage("Loaded from your account.");
        }
        if (loaded.captionStyle) {
          const saved = loaded.captionStyle;
          setFontSize(saved.fontSize);
          setTextColor(saved.textColor);
          setBackgroundColor(saved.backgroundColor);
          setBackgroundTransparency(saved.backgroundTransparency);
          setHorizontalMarginPercent(saved.horizontalMarginPercent);
          setVerticalMarginPercent(saved.verticalMarginPercent);
          setHorizontalAlign(saved.horizontalAlign);
          setVerticalAlign(saved.verticalAlign);
          setFontFamily(saved.fontFamily);
          setSavedStyleFingerprint(JSON.stringify(saved));
        }
        setTheme(loaded.theme);
        try {
          if (loaded.theme === "system") window.localStorage.removeItem(THEME_PREFERENCE_KEY);
          else window.localStorage.setItem(THEME_PREFERENCE_KEY, loaded.theme);
        } catch {
          // Storage may be blocked; the account value still applies for this visit.
        }
        if (loaded.sidebarWidth !== null) setAccountSidebarWidth(loaded.sidebarWidth);
        if (loaded.translationDefaults && !hasServiceRef.current) {
          const defaults = loaded.translationDefaults;
          setSourceLanguage(defaults.sourceLanguage);
          setTargetLanguage(defaults.targetLanguage);
          setKeywordText(defaults.keywordText);
          setFilterText(defaults.filterText);
          setSpeechBufferMs(defaults.speechBufferMs);
          setTranslationDefaultsMessage("Loaded your saved default setup.");
        }
      })
      .catch(() => {
        if (!cancelled) setAccountPreferences(null);
      })
      .finally(() => {
        if (!cancelled) setPreferencesLoaded(true);
      });
    return () => {
      cancelled = true;
    };
    // Runs once; the setters are stable and the live-service guard uses a ref.
  }, []);

  /** Best-effort account sync; callers report the browser-only fallback themselves. */
  const syncAccountPreferences = async (patch: Partial<OperatorPreferences>) => {
    try {
      const stored = await saveOperatorPreferences(patch);
      setAccountPreferences(stored);
      return true;
    } catch {
      return false;
    }
  };

  const rememberSidebarWidth = (width: number) => {
    if (!preferencesLoaded || accountPreferences?.sidebarWidth === width) return;
    if (sidebarSyncRef.current) window.clearTimeout(sidebarSyncRef.current.timeout);
    sidebarSyncRef.current = {
      width,
      timeout: window.setTimeout(() => {
        sidebarSyncRef.current = null;
        void syncAccountPreferences({ sidebarWidth: width });
      }, 800),
    };
  };

  const saveTranslationDefaults = () => {
    setTranslationDefaultsMessage("Saving your default setup…");
    void syncAccountPreferences({
      translationDefaults: { sourceLanguage, targetLanguage, keywordText, filterText, speechBufferMs },
    }).then((ok) =>
      setTranslationDefaultsMessage(
        ok
          ? "Saved as your default setup. New services start from these languages, buffer and terms."
          : "Account sync is unavailable; the default setup was not saved.",
      ),
    );
  };

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(SUMMARY_DEFAULTS_PREFERENCE_KEY);
      if (!stored) return;
      const loaded = normalizeSummaryOptions(stored);
      const timeout = window.setTimeout(() => {
        setSummaryDefaults(loaded);
        setSavedSummaryDefaults(loaded);
        setSummaryStorageMessage("Loaded the saved browser default.");
      }, 0);
      return () => window.clearTimeout(timeout);
    } catch {
      return;
    }
  }, []);

  const saveSummaryBrowserDefault = () => {
    try {
      const normalized = normalizeSummaryOptions(summaryDefaults);
      window.localStorage.setItem(SUMMARY_DEFAULTS_PREFERENCE_KEY, JSON.stringify(normalized));
      setSummaryDefaults(normalized);
      setSavedSummaryDefaults(normalized);
      setSummaryStorageMessage("Saved in this browser. Syncing to your account…");
      void syncAccountPreferences({ summaryDefaults: normalized }).then((ok) =>
        setSummaryStorageMessage(ok ? "Saved to your account and this browser." : "Saved in this browser only; account sync is unavailable."),
      );
    } catch {
      setSummaryStorageMessage("The summary configuration could not be saved in this browser.");
    }
  };

  const resetSummaryDefaults = () => {
    try {
      window.localStorage.removeItem(SUMMARY_DEFAULTS_PREFERENCE_KEY);
    } catch {
      // Storage may be unavailable; the in-page reset still applies.
    }
    setSummaryDefaults(DEFAULT_SUMMARY_OPTIONS);
    setSavedSummaryDefaults(null);
    setSummaryStorageMessage("Reset to the built-in defaults.");
    void syncAccountPreferences({ summaryDefaults: null });
  };

  const updateSummaryDefaults = (value: SummaryOptions) => {
    setSummaryDefaults(value);
    setSummaryStorageMessage("");
  };

  const summarySavedMessage =
    summaryStorageMessage ||
    (savedSummaryDefaults
      ? summaryOptionsEqual(savedSummaryDefaults, summaryDefaults)
        ? "Matches the saved browser default."
        : "Unsaved changes. Save to keep them in this browser."
      : "Built-in defaults. Save to keep a browser default.");

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
      setPromptStorageMessage("Saved in this browser. Syncing to your account…");
      void syncAccountPreferences({ translationSystemPrompt: normalized }).then((ok) =>
        setPromptStorageMessage(ok ? "Saved to your account and this browser." : "Saved in this browser only; account sync is unavailable."),
      );
    } catch {
      setPromptStorageMessage("The prompt could not be saved in this browser.");
    }
  };

  const resetPromptToSafeDefault = () => {
    try {
      window.localStorage.removeItem(TRANSLATION_PROMPT_PREFERENCE_KEY);
      void syncAccountPreferences({ translationSystemPrompt: null });
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
    window.requestAnimationFrame(() => workspaceHeadingRef.current?.focus());
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
      void syncAccountPreferences({ captionStyle: style }).then((ok) => {
        if (!ok) setPreferenceError("Saved in this browser only; account sync is unavailable.");
      });
      if (liveState.channel?.configured) void saveChannelStyle();
    } catch {
      setPreferenceError("Caption preferences could not be saved in this browser.");
    }
  };

  const styleSavedMessage =
    preferenceError ||
    (savedStyleFingerprint === styleFingerprint
      ? liveState.channel?.configured
        ? channelAction === "save-style"
          ? "Saved in this browser. Saving to the Main channel…"
          : sharedStyleFingerprint === styleFingerprint
            ? "Saved to this browser and the Main channel."
            : "Saved in this browser. The Main channel save is not confirmed."
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
      sourceLanguage={sourceLanguage}
      targetLanguage={targetLanguage}
      onChange={updateTranslationSystemPrompt}
      onSaveBrowserDefault={savePromptBrowserDefault}
      onReset={resetPromptToSafeDefault}
      savedMessage={promptSavedMessage}
      disabled={translationEditorDisabled}
    />
  );

  const summarySettingsEditor = (
    <SummarySettingsEditor
      value={summaryDefaults}
      onChange={updateSummaryDefaults}
      onSaveBrowserDefault={saveSummaryBrowserDefault}
      onReset={resetSummaryDefaults}
      savedMessage={summarySavedMessage}
    />
  );

  const audioMeter = (
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
        <span style={{ width: `${level * 100}%` }} />
      </div>
      <span>{Math.round(level * 100)}%</span>
    </div>
  );

  const overlayUrlField = (
    <label>
      Reusable Main channel URL
      <input
        value={liveState.channel?.overlayUrl ?? ""}
        readOnly
        autoComplete="off"
        spellCheck={false}
        aria-label="Reusable OBS browser-source URL"
      />
    </label>
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
      {audioMeter}
      <button
        className="secondaryButton"
        onClick={() => { void startAudioTest().catch(() => undefined); }}
        disabled={microphoneState === "active" || microphoneState === "requesting" || isLive || isBusy}
      >
        {microphoneState === "active" ? "Microphone connected" : "Enable audio test"}
      </button>
      <p className="helpText">Speak into the selected input and check that the meter moves. This test stays in the browser and makes no AI calls.</p>
      {microphoneError ? (
        <p className="errorText" role="alert">
          {microphoneError}
        </p>
      ) : null}
    </>
  );

  const historyConsent = (
    <section className="historyConsent" aria-label="Transcript saving">
      <label className="checkLabel">
        <input
          type="checkbox"
          name="saveTranscript"
          checked={hasService ? liveState.service?.saveHistory === true : saveHistory}
          disabled={hasService || isBusy}
          onChange={(event) => setSaveHistory(event.target.checked)}
        />
        Save transcript history for this service
      </label>
      <p className="helpText">
        {hasService
          ? liveState.service?.saveHistory
            ? "Saving privately during this service. Tell participants that transcript history is enabled."
            : "History saving is off for this service."
          : "Choose before Start and tell participants when saving is enabled. History deletes 7 days after End; numeric AI usage is retained separately for 30 days."}
      </p>
    </section>
  );

  const captureControls = (
    <>
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
          {liveState.status === "pausing" ? "Pausing…" : "Pause"}
        </button>
      )}
      <button
        className="secondaryButton compactButton"
        disabled={isBusy || controlAction !== null}
        title="Clear current captions from OBS and the mobile viewer without changing capture."
        onClick={() => void clearCaption()}
      >
        {controlAction === "clear" ? "Clearing…" : "Clear live caption"}
      </button>
      <QuickBlockControl
        entries={quickBlockEntries}
        onAdd={addQuickBlock}
        onRemove={removeQuickBlock}
        disabled={isBusy}
      />
      {isPaused && (
        <ManualCaptionControl
          disabled={isBusy || controlAction !== null}
          busy={controlAction === "manual"}
          onShow={(text) => void showManualCaption(text)}
        />
      )}
    </>
  );
  // Watchers mirror the same public output, so the monitor shows one source of truth.
  const monitorCaption = anotherOperatorActive
    ? observed.latestPublicText
    : liveState.latestPublicText;
  const monitorSourceText = hasService
    ? liveState.latestSourceText
    : anotherOperatorActive
      ? observed.latestSourceText
      : undefined;
  const monitorLanguage =
    (anotherOperatorActive ? observed.latestPublicLanguage : liveState.latestPublicLanguage) ??
    targetLanguage;
  const monitorLive =
    (hasService && isLive) || (watchingOther && liveState.channel?.status === "live");
  const outputBadge = hasService
    ? liveNeedsAttention
      ? "Output needs attention"
      : isRefreshing
        ? "Refreshing settings"
        : isPaused
          ? "Paused output"
          : "Public caption"
    : anotherOperatorActive
      ? watchingOther
        ? liveState.channel?.status === "paused"
          ? "Paused by another operator"
          : "Live from another operator"
        : observed.status === "unavailable"
          ? "Live output unavailable"
          : "Connecting to live output"
      : liveState.latestPublicText
        ? "Test caption shown"
        : "Canvas clear";
  // What OBS and the latest viewer show right now: the public caption, a shown test, or nothing.
  // Uses the channel's saved style, not unsaved Appearance edits, for the same reason.
  const outputMonitor = (
    <CaptionPreview
      caption={monitorCaption}
      sourceText={monitorSourceText}
      targetLanguage={monitorLanguage}
      sourceLanguage={displayedTranslationSettings?.sourceLanguage}
      style={liveState.channel?.style ?? style}
      badge={outputBadge}
      live={monitorLive}
    />
  );
  // OBS is set up once; audience links are shared every service, so they lead during one.
  const readerAndPhoneOutputs = (
    <details className="outputDestination">
      <summary>Reader and operator phone <span>Shared paragraphs and remote controls</span></summary>
      <ServiceExperiencePanel view="sharing" service={liveState.service} observer={observed.observer} onReaderLink={rememberReaderLink} />
    </details>
  );
  // The Appearance editor needs text to style even while the canvas is clear.
  const stylePreview = (
    <CaptionPreview
      caption={monitorCaption || SAMPLE_CAPTIONS[targetLanguage]}
      targetLanguage={monitorCaption ? monitorLanguage : targetLanguage}
      style={style}
      badge={monitorCaption ? outputBadge : "Local sample"}
      live={monitorLive}
    />
  );
  const translationSection = currentWorkspaceSection === "translation" || currentWorkspaceSection === "prompt";

  return (
    <div className={`dashboardShell ${servicePanelOpen ? "servicePanelOpen" : ""}`}>
      <a className="skipLink" href="#workspace-panel-heading">Skip to workspace controls</a>
      <DashboardNavigation
        items={WORKSPACE_ITEMS}
        activeId={currentWorkspaceSection}
        onSelect={(id) => openWorkspaceSection(id as WorkspaceSectionId)}
        channelStatus={channelStatusLabel.replace(/^Main channel · /u, "")}
        width={accountSidebarWidth}
        onWidthChange={rememberSidebarWidth}
        tools={
          <>
            <button
              type="button"
              className="secondaryButton tutorialLauncher"
              onClick={() => setTutorialOpenRequest((count) => count + 1)}
            >
              How to use
            </button>
            <label className="themeField">
              Theme
              <select
                className="themeSelect"
                value={theme}
                onChange={(event) => chooseTheme(event.target.value)}
              >
                <option value="system">System</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </label>
          </>
        }
      />
      <main className="dashboardMain">
      <header className="topbar">
        <div className="dashboardBreadcrumb"><span>Workspace</span><span aria-hidden="true">/</span><h1>Main channel</h1></div>
        <OperatorTutorial
          autoOpenAllowed={preferencesLoaded && !isBusy && !hasService && !anotherOperatorActive}
          serviceActive={hasService || anotherOperatorActive}
          onOpenSection={openWorkspaceSection}
          dismissedForAccount={accountPreferences?.tutorialDismissed ?? false}
          onDismiss={() => void syncAccountPreferences({ tutorialDismissed: true })}
          showLauncher={false}
          openRequest={tutorialOpenRequest}
          onClosed={() => {
            const launcher = document.querySelector<HTMLElement>(".dashboardSidebar .tutorialLauncher");
            const target = launcher?.offsetParent ? launcher : document.querySelector<HTMLElement>(".dashboardMenuButton");
            (target ?? workspaceHeadingRef.current)?.focus();
          }}
        />
          <button
            ref={servicePanelTriggerRef}
            type="button"
            className="secondaryButton servicePanelToggle"
            aria-expanded={servicePanelOpen}
            aria-controls="service-panel"
            onClick={() => setServicePanelOpen((open) => !open)}
          >
            <DashboardIcon name="panel" />
            Service controls
            <span aria-hidden="true">{servicePanelOpen ? "−" : "+"}</span>
          </button>
      </header>

      {hasService && !servicePanelOpen ? (
        <section className="serviceQuickControls" aria-label="Quick live controls">
          <span className="quickServiceState">{liveNeedsAttention ? "Capture needs attention" : isRefreshing ? "Refreshing" : isPaused ? "Paused" : "Capturing audio"}</span>
          {captureControls}
        </section>
      ) : null}
      <div className="dashboardContent">
      <section
        className={`statusBanner ${liveState.status} ${liveState.status !== "error" ? "visuallyHidden" : ""}`}
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

      {hasPendingTranslationChanges && !translationSection ? (
        <div className="pendingSettingsBar">
          <span>Translation changes are not active yet.</span>
          <button type="button" className="textButton" onClick={() => openWorkspaceSection("translation")}>Review changes</button>
        </div>
      ) : null}
      <p className={`actionFeedback ${clipboardMessage ? "" : "visuallyHidden"}`} role="status" aria-live="polite">{clipboardMessage}</p>
      {liveState.historyIncomplete && <p className="privacyNote" role="alert">History saving failed for part of this service. Review transcript gaps before generating a summary.</p>}


      <div className={`operatorWorkspace ${currentWorkspaceSection === "appearance" ? "withPreview" : ""}`}>

        <BorderGlow
          className="workspacePanelGlow"
          pending={translationSection && (hasPendingTranslationChanges || translationActionBusy)}
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
                <h2 id="workspace-panel-heading" ref={workspaceHeadingRef} tabIndex={-1}>{currentSectionCopy.title}</h2>
                <p>{currentSectionCopy.description}</p>
              </div>
              {translationSection ? <span
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
                  : "Draft settings"}
              </span> : null}
            </header>

            {hasPendingTranslationChanges && translationSection ? (
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
            ) : hasService && translationSection ? (
              <p className="translationCurrentNote" role="status" aria-live="polite">
                {translationActionBusy
                  ? "Refreshing translation context…"
                  : "Draft matches the active translation session."}
              </p>
            ) : null}

            <div className="workspacePanelBody">
              {currentWorkspaceSection === "overview" ? (
                <div className="dashboardOverview">
                  <div className="overviewWelcome">
                    <span className="overviewSymbol"><DashboardIcon name={hasService ? "audio" : "overview"} /></span>
                    <div><h3>{hasService ? liveNeedsAttention ? "Service needs attention" : isRefreshing ? "Updating translation" : isPaused ? "Service paused" : "Your service is in progress" : anotherOperatorActive ? "Another operator is live" : "Prepare your next service"}</h3>
                    <p>{hasService ? "Pause and Clear stay within reach. Open Service controls for the output monitor, service details, and End." : anotherOperatorActive ? "Main channel is already in use. Taking over stops the current capture computer." : "Check your audio, confirm the languages, and connect your audience."}</p></div>
                  </div>
                  <dl className="overviewMetrics">
                    <div><dt>Spoken language</dt><dd>{displayedSourceLabel ?? "Refresh required"}</dd></div>
                    <div><dt>Audience language</dt><dd>{displayedTargetLabel ?? "Refresh required"}</dd></div>
                    <div><dt>{hasService ? "Elapsed / 90 min" : "Service window"}</dt><dd>{hasService ? `${elapsedMinutes}m ${elapsedSeconds.toString().padStart(2, "0")}s` : "90 minutes"}</dd></div>
                    {hasService ? (
                      <>
                        <div><dt>Last caption</dt><dd>{liveState.latestPublicAt ? `${Math.max(0, Math.floor((usageClock - liveState.latestPublicAt) / 1_000))}s ago` : "None yet"}</dd></div>
                        <div><dt>Skipped chunks</dt><dd>{liveState.droppedChunks}</dd></div>
                      </>
                    ) : null}
                  </dl>
                  <section className="overviewChecklist" aria-labelledby="overview-checklist-heading">
                    <div className="overviewSectionHeading"><h3 id="overview-checklist-heading">{hasService ? "Manage your service" : "Before you go live"}</h3><span>{hasService ? "Live workspace" : "3 checks"}</span></div>
                    <button type="button" className="overviewTask" onClick={() => openWorkspaceSection("audio")}>
                      <span className="overviewTaskIcon"><DashboardIcon name="audio" /></span>
                      <span><strong>Check your audio input</strong><small>{microphoneState === "active" ? "Microphone connected · Check the input meter" : microphoneState === "error" ? "Microphone needs attention" : "Choose a microphone and test the level"}</small></span><DashboardIcon name="chevronRight" />
                    </button>
                    <button type="button" className="overviewTask" onClick={() => openWorkspaceSection("translation")}>
                      <span className="overviewTaskIcon"><DashboardIcon name="translation" /></span>
                      <span><strong>Confirm translation settings</strong><small>{displayedSourceLabel ?? "Unknown"} → {displayedTargetLabel ?? "Unknown"} · {(hasService ? activeSpeechBufferMs : speechBufferMs) / 1_000}s buffer</small></span><DashboardIcon name="chevronRight" />
                    </button>
                    <button type="button" className="overviewTask" onClick={() => openWorkspaceSection("outputs")}>
                      <span className="overviewTaskIcon"><DashboardIcon name="outputs" /></span>
                      <span><strong>{hasService ? "Connect your audience" : "Test the OBS source"}</strong><small>{hasService ? "OBS, mobile captions, reader, and remote control" : channelConfigured ? "Channel created · Verify the test in OBS" : "Create your reusable OBS channel"}</small></span><DashboardIcon name="chevronRight" />
                    </button>
                    {!hasService && <p className="helpText">Cloud status confirms configuration. Start checks model access; verify sound and the OBS source yourself.</p>}
                  </section>
                  {!hasService ? <div className="overviewNote"><DashboardIcon name="history" /><div><strong>Keep the message after the service</strong><p>Enable transcript saving before Start to review the sermon and generate a summary later. Private history expires 7 days after End.</p><button type="button" className="textButton" onClick={() => setServicePanelOpen(true)}>Review service setup <DashboardIcon name="chevronRight" /></button></div></div> : <button type="button" className="secondaryButton" onClick={() => setServicePanelOpen(true)}>Open service controls</button>}
                </div>
              ) : null}
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
                  <div className="saveRow">
                    <button
                      className="secondaryButton"
                      type="button"
                      onClick={saveTranslationDefaults}
                      disabled={translationEditorDisabled}
                    >
                      Save as my default setup
                    </button>
                    <p role="status" aria-live="polite" aria-atomic="true">
                      {translationDefaultsMessage ||
                        (accountPreferences?.translationDefaults
                          ? "Your account has a saved default setup for new services."
                          : "Saves languages, buffer, terminology and filters to your account for new services.")}
                    </p>
                  </div>
                  <details className="modelSummary serviceDetailStrip advancedActions">
                    <summary>Service details</summary>
                    <p>
                      <strong>Transcription:</strong>{" "}
                      <code>{cloudModels?.transcription ?? cloudModelStatus}</code>
                    </p>
                    <p>
                      <strong>Translation:</strong>{" "}
                      <code>{cloudModels?.translation ?? cloudModelStatus}</code>
                    </p>
                    <p>
                      <strong>Caption timing:</strong> The selected speech buffer plus queue wait, cloud processing, and audience delivery delay.
                    </p>
                  </details>
                </div>
              ) : null}

              {currentWorkspaceSection === "usage" ? (
                <>
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
                <UsageHistory />
                </>
              ) : null}

              {currentWorkspaceSection === "history" ? <ServiceExperiencePanel view="archive" service={liveState.service} onReaderLink={rememberReaderLink} summaryDefaults={summaryDefaults} /> : null}

              {currentWorkspaceSection === "prompt" ? promptEditor : null}
              {currentWorkspaceSection === "summary" ? summarySettingsEditor : null}

              {currentWorkspaceSection === "appearance" ? (
                <div className="panelStack">
                  <p className="privacyNote">{hasService ? "Appearance changes update OBS during this service. Save as default also keeps this style for future services." : "Changes update this local preview. Save as default or Show test to send the style to the Main channel."}</p>
                  <StyleEditor {...styleEditorProps} />
                </div>
              ) : null}

              {currentWorkspaceSection === "outputs" ? (
                <>
                <section className="outputMonitorSection" aria-label="Output monitor">
                  {outputMonitor}
                  <p className="helpText">OBS and the latest viewer mirror this caption without extra AI calls. The reader appends shared paragraphs about 30 seconds later.</p>
                  {anotherOperatorActive ? (
                    <p className="privacyNote" role="status">
                      {runningOperator ? `${runningOperator} is running this service. ` : ""}
                      {observed.message || "Connecting to the running service…"}
                      {observed.observer && !observed.observer.saveHistory
                        ? " This service does not save history, so the recognized source stays on the capture computer."
                        : ""}
                    </p>
                  ) : null}
                </section>
                {hasService ? readerAndPhoneOutputs : null}
                <details className="outputDestination" open>
                  <summary>OBS overlay <span>Reusable browser source</span></summary>
                <div className="obsSetupCard workspaceOutputCard">
                  <div className="sectionHeading">
                    <div>
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
                      <button
                        className="primaryButton fullButton"
                        onClick={() => void copyOverlayUrl()}
                      >
                        {copied ? "URL copied" : "Copy OBS URL"}
                      </button>
                      <p className="privacyNote">Keep this reusable URL private. Anyone holding it can read public captions.</p>
                      <details className="credentialDisclosure">
                        <summary>Reveal URL for manual copy</summary>
                        {overlayUrlField}
                      </details>
                      {!hasService && <div className="buttonGrid">
                        <button
                          className="secondaryButton"
                          disabled={controlAction !== null || anotherOperatorActive || isBusy}
                          onClick={() => void showTestCaption()}
                        >
                          {controlAction === "show-test" ? "Showing…" : "Show test"}
                        </button>
                        <button
                          className="secondaryButton"
                          disabled={controlAction !== null || anotherOperatorActive || isBusy}
                          onClick={() => void clearCaption()}
                        >
                          {controlAction === "clear" ? "Clearing…" : "Clear live caption"}
                        </button>
                      </div>}
                      <p className="helpText">{hasService ? "Use the live controls to clear captions. Pause first to show a test caption from More." : anotherOperatorActive ? "Another operator controls this channel. Test and clear are available when the channel is idle." : "Show test sends synthetic text without microphone capture or AI calls. Confirm it appears in OBS, then clear it."}</p>
                      <details className="advancedActions">
                        <summary>Advanced link security</summary>
                        <p>
                          Rotate only if the URL was exposed. The old OBS source stops
                          working immediately. End the service before rotating.
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
                                channelAction !== null || anotherOperatorActive || hasService
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
                            disabled={anotherOperatorActive || hasService}
                            onClick={() => setConfirmRotate(true)}
                          >
                            Rotate OBS link
                          </button>
                        )}
                      </details>
                    </>
                  )}
                </div>
                </details>
                </>
              ) : null}

              {currentWorkspaceSection === "outputs" ? (
                <details className="outputDestination">
                  <summary>Mobile translation viewer <span>Latest caption · No extra AI</span></summary>
                <div className="viewerLinkPanel">

                  <p>
                    Share this read-only link with intended viewers. It shows only the
                    current moderated translation and expires when this service ends or
                    another operator takes over.
                  </p>
                  {!hasService ? <p className="privacyNote">Start captions to create a mobile viewer link. This mirror uses no additional AI calls.</p> : viewerUrl ? (
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
                      <details className="credentialDisclosure">
                        <summary>Reveal mobile link for manual copy</summary>
                        <label>
                          Current mobile viewer link
                          <input
                            value={viewerUrl}
                            readOnly
                            autoComplete="off"
                            spellCheck={false}
                            aria-label="Mobile viewer URL"
                          />
                        </label>
                      </details>
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
                </details>
              ) : null}
              {currentWorkspaceSection === "outputs" && !hasService ? readerAndPhoneOutputs : null}
            </div>
          </SpotlightCard>
        </BorderGlow>

        {currentWorkspaceSection === "appearance" ? (
          <aside className="workspacePreview" aria-label="Caption output preview">
            {stylePreview}
          </aside>
        ) : null}
      </div>

      <ServicePanel open={servicePanelOpen} onOpenChange={setServicePanelOpen} triggerRef={servicePanelTriggerRef}>
        {servicePanelOpen && liveState.status === "error" ? <p className="errorText" role="alert">{liveState.message}</p> : null}
        {servicePanelOpen && liveState.historyIncomplete ? <p className="privacyNote" role="alert">History saving failed for part of this service. Review transcript gaps before generating a summary.</p> : null}
        {!hasService ? (
        <section
          className={`startBar ${anotherOperatorActive ? "takeover" : ""}`}
          aria-labelledby="start-service-heading"
        >
          {historyConsent}
          <div className="startBarActions"><div>
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
          )}</div>
        </section>
      ) : null}
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
                    : liveState.status === "pausing"
                      ? "Stopping capture"
                      : liveState.status === "resuming"
                        ? "Reopening microphone"
                        : liveState.status === "ending"
                          ? "Ending service"
                          : "Capturing audio"}
              </strong>
              <p>
                {activeSpeechBufferMs / 1_000}s buffer · {liveState.droppedChunks}{" "}
                skipped · {liveState.lastLatencyMs === null
                  ? "waiting for processing time"
                  : `${liveState.lastLatencyMs} ms processing`}
              </p>
              <p>History saving {liveState.service?.saveHistory ? "on" : "off"}</p>
              <div className="liveInputMeter">{audioMeter}</div>
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
                onClick={() => { setServicePanelOpen(false); openWorkspaceSection("usage"); }}
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
            {captureControls}
            <details
              className="moreMenu"
              onKeyDown={(event) => {
                if (event.key !== "Escape") return;
                event.preventDefault();
                event.currentTarget.open = false;
                event.currentTarget.querySelector("summary")?.focus();
              }}
            >
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
                <details className="credentialDisclosure">
                  <summary>Reveal OBS URL for manual copy</summary>
                  <p className="helpText">Keep this reusable credential private.</p>
                  {overlayUrlField}
                </details>
              </div>
            </details>
            <button
              className="textButton endServiceButton"
              disabled={endActionDisabled}
              onClick={() => endDialogRef.current?.showModal()}
            >
              End service
            </button>
          </div>
          <p className="liveControlHelp">Pause stops capture and clears the current caption. Clear live caption drops pending reader text; committed reader paragraphs remain. The 90-minute timer continues while paused.</p>
        </section>
      ) : null}
        <details className="serviceSnapshot" open={hasService}>
            <summary>{hasService ? "Active translation" : "Starting configuration"}</summary>
            <dl>
              <div>
                <dt>Spoken language</dt>
                <dd>{displayedSourceLabel ?? "Refresh required"}</dd>
              </div>
              <div>
                <dt>Audience language</dt>
                <dd>{displayedTargetLabel ?? "Refresh required"}</dd>
              </div>
              <div>
                <dt>{hasService ? "Active buffer" : "Draft buffer"}</dt>
                <dd>{(hasService ? activeSpeechBufferMs : speechBufferMs) / 1_000}s</dd>
              </div>
            </dl>
            {hasPendingTranslationChanges ? <p className="helpText">Draft changes are not active until you confirm a refresh.</p> : null}
          </details>
      </ServicePanel>
      <dialog
        ref={endDialogRef}
        className="confirmationDialog"
        aria-labelledby="end-dialog-heading"
        aria-describedby="end-dialog-description"
      >
        <h2 id="end-dialog-heading">End captions for everyone?</h2>
        <p id="end-dialog-description">This stops microphone capture, clears OBS and the mobile viewer, and expires the mobile link. The reusable OBS URL stays available for the next service.</p>
        <div className="confirmationRow">
          <button className="secondaryButton" type="button" autoFocus onClick={() => endDialogRef.current?.close()}>Keep service open</button>
          <button
            className="dangerButton"
            type="button"
            disabled={endActionDisabled}
            onClick={() => { endDialogRef.current?.close(); void stopSession(); }}
          >Confirm End</button>
        </div>
      </dialog>
      </div>
      <footer className="dashboardStatusBar" aria-label="Service status" ref={statusBarRef}>
        <span className={`statusPill ${cloudState}`}>
          <span className="statusDot" aria-hidden="true" />
          {cloudState === "checking"
            ? "Checking cloud AI"
            : cloudState === "ready"
              ? "Cloud AI configured"
              : cloudState === "not-configured"
                ? "Cloud setup needed"
                : "Cloud AI unavailable"}
        </span>
        <span className={`statusPill channel-${channelStatus}`}>
          {channelStatusLabel}
        </span>
      </footer>
    </main>
    </div>
  );
}
