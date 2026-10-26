"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { CloudProviderClient } from "@/ai/cloud-provider-client";
import { DEFAULT_INFERENCE_LEVEL, type InferenceLevel } from "@/ai/contracts";
import {
  DEFAULT_TRANSLATION_SYSTEM_PROMPT,
  normalizeTranslationSystemPrompt,
} from "@/ai/translation-prompt";
import { AiUsageDashboard } from "@/components/operator/AiUsageDashboard";
import { AudioInputSection } from "@/components/operator/AudioInputSection";
import { CaptionPreview } from "@/components/operator/CaptionPreview";
import { LiveOutputsSection } from "@/components/operator/LiveOutputsSection";
import { ManualOverrideSection } from "@/components/operator/ManualOverrideSection";
import { MasterControlsBar } from "@/components/operator/MasterControlsBar";
import { OperatorTutorial } from "@/components/operator/OperatorTutorial";
import { OverviewSection } from "@/components/operator/OverviewSection";
import { PromptEditor } from "@/components/operator/PromptEditor";
import { StyleEditor, type StyleEditorProps } from "@/components/operator/StyleEditor";
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
import { TranslationSection } from "@/components/operator/TranslationSection";
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
import { WORKSPACE_NAME } from "@/domain/workspace";
import { parseGlossaryInput } from "@/live/config";
import {
  DEFAULT_RECORDING_WINDOW_MS,
  MAX_LIVE_SESSION_MS,
  normalizeCaptionStyle,
  type CaptionStyle,
  type ChannelStatus,
  type CloudState,
  type RecordingWindowMs,
} from "@/live/contracts";
import {
  DEFAULT_OUTPUT_BUFFER_COUNT,
  DEFAULT_OUTPUT_BUFFER_DWELL_MS,
  type OutputBufferCount,
  type OutputBufferDwellMs,
} from "@/live/output-buffer";
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
import { DashboardStatusFooter } from "@/components/operator/DashboardStatusFooter";
import { EndServiceDialog } from "@/components/operator/EndServiceDialog";
import { ServiceControlsPanel } from "@/components/operator/ServiceControlsPanel";
import { ServicePanel } from "@/components/operator/ServicePanel";
import { StatusBanner } from "@/components/operator/StatusBanner";
import "./dashboard.css";
import "./service-panel.css";

interface CloudModels {
  transcription: string;
  translation: string;
}

const CAPTION_PREFERENCE_KEY = "caption-studio:caption-style:v1";
const TRANSLATION_PROMPT_PREFERENCE_KEY =
  "caption-studio:translation-system-prompt:v1";

export type WorkspaceSectionId =
  | "history"
  | "audio"
  | "translation"
  | "usage"
  | "prompt"
  | "summary"
  | "appearance"
  | "outputs"
  | "manualOverride"
  | "overview";

const WORKSPACE_ITEMS: readonly LineSidebarItem[] = [
  { id: "overview", href: "#workspace=overview", label: "Overview", group: "Workspace", icon: <DashboardIcon name="overview" /> },
  { id: "audio", href: "#workspace=audio", label: "Audio input", group: "Setup", icon: <DashboardIcon name="audio" /> },
  { id: "translation", href: "#workspace=translation", label: "Translation", group: "Setup", icon: <DashboardIcon name="translation" /> },
  { id: "appearance", href: "#workspace=appearance", label: "Appearance", group: "Setup", icon: <DashboardIcon name="appearance" /> },
  { id: "outputs", href: "#workspace=outputs", label: "Live outputs", group: "Service", icon: <DashboardIcon name="outputs" /> },
  { id: "manualOverride", href: "#workspace=manualOverride", label: "Manual override", group: "Service", icon: <DashboardIcon name="override" /> },
  { id: "history", href: "#workspace=history", label: "Sermon history", group: "Service", icon: <DashboardIcon name="history" /> },
  { id: "summary", href: "#workspace=summary", label: "AI summary", group: "Service", icon: <DashboardIcon name="summary" /> },
  { id: "prompt", href: "#workspace=prompt", label: "AI Behavior", group: "Settings", icon: <DashboardIcon name="prompt" /> },
  { id: "usage", href: "#workspace=usage", label: "AI usage", group: "Settings", icon: <DashboardIcon name="usage" /> },
];

const WORKSPACE_SECTION_COPY: Record<
  WorkspaceSectionId,
  { title: string; description: string }
> = {
  overview: { title: "Service overview", description: "Your service, from the first sound check to the final caption." },
  history: { title: "Sermon history", description: `Review saved transcripts, correct passages, and prepare a sermon summary. Every operator in ${WORKSPACE_NAME} sees the same saved sermons.` },
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
      "Review the translation provider's quota headroom and usage recorded across past services. This service's own live usage is in Service controls.",
  },
  prompt: {
    title: "AI behavior and instructions",
    description:
      "Review the safe default prompt, tailor how the translator handles context, tone and ambiguity, and choose how boldly it's allowed to act on that guidance.",
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
  manualOverride: {
    title: "Manual override",
    description:
      "Hold, filter, or hand-correct what reaches the audience without touching the live translation call.",
  },
};

const CHANNEL_STATUS_LABELS: Record<ChannelStatus | "loading", string> = {
  loading: "Checking Main channel",
  unconfigured: "Channel not created",
  idle: "Main channel · Idle",
  live: "Main channel · Live",
  paused: "Main channel · Paused",
};

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
  const [saveHistoryDefaultMessage, setSaveHistoryDefaultMessage] = useState("");
  const [autoSummaryMessage, setAutoSummaryMessage] = useState("");
  const [servicePanelOpen, setServicePanelOpen] = useState(false);
  const [theme, setTheme] = useState<ThemePreference>("system");
  const servicePanelTriggerRef = useRef<HTMLButtonElement>(null);
  const [recordingWindowMs, setRecordingWindowMs] = useState<RecordingWindowMs>(
    DEFAULT_RECORDING_WINDOW_MS,
  );
  const [inferenceLevel, setInferenceLevel] = useState<InferenceLevel>(
    DEFAULT_INFERENCE_LEVEL,
  );
  const [outputBufferCount, setOutputBufferCount] = useState<OutputBufferCount>(
    DEFAULT_OUTPUT_BUFFER_COUNT,
  );
  const [outputBufferDwellMs, setOutputBufferDwellMs] = useState<OutputBufferDwellMs>(
    DEFAULT_OUTPUT_BUFFER_DWELL_MS,
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
  const [outputBufferSavedMessage, setOutputBufferSavedMessage] = useState("");
  const [summaryDefaults, setSummaryDefaults] = useState<SummaryOptions>(DEFAULT_SUMMARY_OPTIONS);
  const [savedSummaryDefaults, setSavedSummaryDefaults] = useState<SummaryOptions | null>(null);
  const [summaryStorageMessage, setSummaryStorageMessage] = useState("");
  const [activeWorkspaceSection, setActiveWorkspaceSection] =
    useState<WorkspaceSectionId>("overview");
  const workspaceHeadingRef = useRef<HTMLHeadingElement>(null);
  // Last input modality, so a programmatic focus can tell a click from a keypress.
  const pointerInteractionRef = useRef(false);
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
        recordingWindowMs,
        translationSystemPrompt,
        inferenceLevel,
      }),
    [
      filterText,
      inferenceLevel,
      keywordText,
      sourceLanguage,
      recordingWindowMs,
      targetLanguage,
      translationSystemPrompt,
    ],
  );
  const liveSettings = useMemo(
    () => ({
      ...draftTranslationSettings,
      style,
      saveHistory,
      outputBufferCount,
      outputBufferDwellMs,
    }),
    [draftTranslationSettings, style, saveHistory, outputBufferCount, outputBufferDwellMs],
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
    activeRecordingWindowMs,
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
    outputBufferQueue,
    setOutputBufferEntryPaused,
    clearOutputBufferEntry,
    fastForwardOutputBufferEntry,
    beginOutputBufferEdit,
    updateOutputBufferEditDraft,
    cancelOutputBufferEdit,
    submitOutputBufferEdit,
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
      setRecordingWindowMs(active.recordingWindowMs);
      setTranslationSystemPrompt(active.translationSystemPrompt);
      setInferenceLevel(active.inferenceLevel);
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

  /**
   * Moving focus to the section heading announces the new page to a screen
   * reader. A pointer operator does not need the focus ring that comes with it,
   * so the heading records how the section was opened and the ring is drawn for
   * keyboard navigation only.
   */
  const focusWorkspaceHeading = () => {
    const heading = workspaceHeadingRef.current;
    if (!heading) return;
    heading.dataset.pointerFocus = pointerInteractionRef.current ? "true" : "false";
    heading.focus();
  };

  const openWorkspaceSection = (section: WorkspaceSectionId) => {
    if (window.location.hash !== `#workspace=${section}`) {
      window.history.pushState(window.history.state, "", `#workspace=${section}`);
    }
    setActiveWorkspaceSection(section);
    window.requestAnimationFrame(focusWorkspaceHeading);
  };

  useEffect(() => {
    const syncSection = (focus: boolean) => {
      const hash = window.location.hash;
      const id = hash === "" ? "overview" : hash.startsWith("#workspace=") ? hash.slice(11) : null;
      if (!WORKSPACE_ITEMS.some((item) => item.id === id)) return;
      setActiveWorkspaceSection(id as WorkspaceSectionId);
      if (focus) window.requestAnimationFrame(focusWorkspaceHeading);
    };
    const initial = window.requestAnimationFrame(() => syncSection(false));
    const onHistory = () => syncSection(true);
    const pointerInput = () => { pointerInteractionRef.current = true; };
    const keyboardInput = () => { pointerInteractionRef.current = false; };
    window.addEventListener("popstate", onHistory);
    window.addEventListener("hashchange", onHistory);
    window.addEventListener("pointerdown", pointerInput, true);
    window.addEventListener("keydown", keyboardInput, true);
    return () => {
      window.cancelAnimationFrame(initial);
      window.removeEventListener("popstate", onHistory);
      window.removeEventListener("hashchange", onHistory);
      window.removeEventListener("pointerdown", pointerInput, true);
      window.removeEventListener("keydown", keyboardInput, true);
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
          setRecordingWindowMs(defaults.recordingWindowMs);
          setInferenceLevel(defaults.inferenceLevel);
          setTranslationDefaultsMessage("Loaded your saved default setup.");
        }
        if (loaded.saveHistoryDefault !== null && !hasServiceRef.current) {
          setSaveHistory(loaded.saveHistoryDefault);
        }
        if (loaded.outputBufferCount !== null && !hasServiceRef.current) {
          setOutputBufferCount(loaded.outputBufferCount);
          setOutputBufferSavedMessage("Loaded your saved default.");
        }
        if (loaded.outputBufferDwellMs !== null && !hasServiceRef.current) {
          setOutputBufferDwellMs(loaded.outputBufferDwellMs);
          setOutputBufferSavedMessage("Loaded your saved default.");
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
      translationDefaults: { sourceLanguage, targetLanguage, keywordText, filterText, recordingWindowMs, inferenceLevel },
    }).then((ok) =>
      setTranslationDefaultsMessage(
        ok
          ? "Saved as your default setup. New services start from these languages, recording window, inference level, and terms."
          : "Account sync is unavailable; the default setup was not saved.",
      ),
    );
  };

  const saveOutputBufferDefault = () => {
    setOutputBufferSavedMessage("Saving your default…");
    void syncAccountPreferences({ outputBufferCount, outputBufferDwellMs }).then((ok) =>
      setOutputBufferSavedMessage(
        ok
          ? "Saved as your default. New services start with the output buffer in this state."
          : "Account sync is unavailable; the default was not saved.",
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

  const saveHistoryAsDefault = () => {
    setSaveHistoryDefaultMessage("Saving your default…");
    void syncAccountPreferences({ saveHistoryDefault: saveHistory }).then((ok) =>
      setSaveHistoryDefaultMessage(
        ok
          ? `Saved. New services start with transcript saving ${saveHistory ? "on" : "off"}; you can still change it before Start.`
          : "Account sync is unavailable; the default was not saved.",
      ),
    );
  };

  const changeAutoSummary = (enabled: boolean) => {
    setAutoSummaryMessage("Saving…");
    void syncAccountPreferences({ autoSummary: enabled }).then((ok) =>
      setAutoSummaryMessage(
        ok
          ? enabled
            ? "On. After you end a service with transcript saving, its summary draft appears in Sermon history."
            : "Off. Summaries are only generated when you choose Generate summary."
          : "Account sync is unavailable; the setting was not saved.",
      ),
    );
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
    setRecordingWindowMs(active.recordingWindowMs);
    setTranslationSystemPrompt(active.translationSystemPrompt);
    setInferenceLevel(active.inferenceLevel);
    setConfirmTranslationRefresh(false);
    setPromptStorageMessage(
      "Draft restored to the active session. Browser default unchanged.",
    );
  };

  const confirmAndRefreshTranslation = () => {
    setConfirmTranslationRefresh(false);
    void refreshTranslationSession();
    window.requestAnimationFrame(focusWorkspaceHeading);
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
    defaultStyle: accountPreferences?.captionStyle ?? null,
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
      recordingWindowMs={recordingWindowMs}
      sourceLabel={sourceLabel ?? sourceLanguage}
      keywordCount={keywordCount}
      disabled={translationEditorDisabled}
      defaultSourceLanguage={accountPreferences?.translationDefaults?.sourceLanguage ?? null}
      defaultTargetLanguage={accountPreferences?.translationDefaults?.targetLanguage ?? null}
      defaultRecordingWindowMs={accountPreferences?.translationDefaults?.recordingWindowMs ?? null}
      onSourceLanguageChange={setSourceLanguage}
      onTargetLanguageChange={setTargetLanguage}
      onKeywordTextChange={setKeywordText}
      onRecordingWindowChange={setRecordingWindowMs}
    />
  );

  const promptEditor = (
    <PromptEditor
      value={translationSystemPrompt}
      sourceLanguage={sourceLanguage}
      targetLanguage={targetLanguage}
      inferenceLevel={inferenceLevel}
      defaultInferenceLevel={accountPreferences?.translationDefaults?.inferenceLevel ?? null}
      onChange={updateTranslationSystemPrompt}
      onInferenceLevelChange={setInferenceLevel}
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
      autoSummary={accountPreferences?.autoSummary ?? false}
      autoSummaryAvailable={accountPreferences !== null}
      onAutoSummaryChange={changeAutoSummary}
      autoSummaryMessage={autoSummaryMessage}
    />
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
  const translationSection =
    currentWorkspaceSection === "translation" ||
    currentWorkspaceSection === "prompt" ||
    currentWorkspaceSection === "manualOverride";
  // Rendered outside when collapsed, inside the panel when expanded (never both) — the
  // panel is a blocking <dialog> below 1280px, so an outside-only copy would be inert.
  const masterControlsBar = (
    <MasterControlsBar
      hasService={hasService}
      isPaused={isPaused}
      isRefreshing={isRefreshing}
      isPausing={liveState.status === "pausing"}
      isResuming={liveState.status === "resuming"}
      isStarting={liveState.status === "starting"}
      liveNeedsAttention={liveNeedsAttention}
      anotherOperatorActive={anotherOperatorActive}
      runningOperator={runningOperator}
      isBusy={isBusy}
      controlBusy={controlAction !== null}
      clearing={controlAction === "clear"}
      endRetryRequired={endRetryRequired}
      endActionDisabled={endActionDisabled}
      startDisabled={startDisabled}
      startDescription={startDescription}
      onPause={() => void pauseSession()}
      onResume={() => void resumeSession()}
      onClear={() => void clearCaption()}
      onRetryEnd={() => void stopSession()}
      onEndService={() => endDialogRef.current?.showModal()}
      onStart={() => void startSession()}
      onTakeOver={() => {
        setServicePanelOpen(true);
        setConfirmTakeover(true);
      }}
    />
  );

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
        <div className="dashboardBreadcrumb"><span>{WORKSPACE_NAME}</span><span aria-hidden="true">/</span><h1>Main channel</h1></div>
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

      {!servicePanelOpen ? masterControlsBar : null}
      <div className="dashboardContent">
      <StatusBanner
        status={liveState.status}
        message={liveState.message}
        hasService={hasService}
        liveNeedsAttention={liveNeedsAttention}
        isRefreshing={isRefreshing}
        isPaused={isPaused}
        rotationRecoveryRequired={rotationRecoveryRequired}
        confirmRotate={confirmRotate}
        onConfirmRotateChange={setConfirmRotate}
        channelActionBusy={channelAction !== null}
        onRotateChannel={() => void rotateChannel()}
        onReloadChannel={() => void reloadChannel()}
      />

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
                <OverviewSection
                  hasService={hasService}
                  status={{
                    liveNeedsAttention,
                    isRefreshing,
                    isPaused,
                    anotherOperatorActive,
                  }}
                  translation={{
                    displayedSourceLabel,
                    displayedTargetLabel,
                    activeRecordingWindowMs,
                    recordingWindowMs,
                  }}
                  elapsed={{
                    minutes: elapsedMinutes,
                    seconds: elapsedSeconds,
                  }}
                  lastCaption={{
                    publishedAt: liveState.latestPublicAt,
                    clockNow: usageClock,
                  }}
                  droppedChunks={liveState.droppedChunks}
                  microphoneState={microphoneState}
                  channelConfigured={channelConfigured}
                  onOpenSection={openWorkspaceSection}
                  onOpenServicePanel={() => setServicePanelOpen(true)}
                />
              ) : null}
              {currentWorkspaceSection === "audio" ? (
                <div className="panelStack">
                  <AudioInputSection
                    devices={devices}
                    selectedDeviceId={selectedDeviceId}
                    onDeviceChange={setSelectedDeviceId}
                    disabled={isLive || isBusy}
                    microphoneState={microphoneState}
                    microphoneError={microphoneError}
                    level={level}
                    onStartAudioTest={() => { void startAudioTest().catch(() => undefined); }}
                  />
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
                <TranslationSection
                  translationSettingsEditor={translationSettingsEditor}
                  onSaveDefaults={saveTranslationDefaults}
                  disabled={translationEditorDisabled}
                  savedDefaultMessage={
                    translationDefaultsMessage ||
                    (accountPreferences?.translationDefaults
                      ? "Your account has a saved default setup for new services."
                      : "Saves languages, recording window, inference level, terminology and filters to your account for new services.")
                  }
                  transcriptionModel={cloudModels?.transcription ?? cloudModelStatus}
                  translationModel={cloudModels?.translation ?? cloudModelStatus}
                />
              ) : null}

              {currentWorkspaceSection === "usage" ? (
                <>
                <AiUsageDashboard
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
                <LiveOutputsSection
                  hasService={hasService}
                  isBusy={isBusy}
                  anotherOperatorActive={anotherOperatorActive}
                  runningOperator={runningOperator}
                  observedMessage={observed.message}
                  observedSaveHistory={observed.observer?.saveHistory}
                  outputMonitor={outputMonitor}
                  readerAndPhoneOutputs={readerAndPhoneOutputs}
                  obs={{
                    configured: Boolean(liveState.channel?.configured),
                    channelAction,
                    onCreateChannel: () => void createChannel(),
                    onCopyUrl: () => void copyOverlayUrl(),
                    copied,
                    urlField: overlayUrlField,
                    controlAction,
                    onShowTest: () => void showTestCaption(),
                    onClearCaption: () => void clearCaption(),
                    confirmRotate,
                    onConfirmRotateChange: setConfirmRotate,
                    onRotateChannel: () => void rotateChannel(),
                  }}
                  viewer={{
                    url: viewerUrl,
                    onCopy: () => void copyViewerUrl(),
                    copied: viewerCopied,
                    onOpenPreview: openViewerPreview,
                    confirmReplace: confirmViewerReplace,
                    onConfirmReplaceChange: setConfirmViewerReplace,
                    viewerAction,
                    onReplace: () => void replaceViewerLink(),
                  }}
                />
              ) : null}

              {currentWorkspaceSection === "manualOverride" ? (
                <ManualOverrideSection
                  isBusy={isBusy}
                  hasService={hasService}
                  filterText={filterText}
                  onFilterTextChange={setFilterText}
                  filterDisabled={translationEditorDisabled}
                  outputBuffer={{
                    count: outputBufferCount,
                    onCountChange: setOutputBufferCount,
                    dwellMs: outputBufferDwellMs,
                    onDwellChange: setOutputBufferDwellMs,
                    onSaveDefault: saveOutputBufferDefault,
                    savedMessage:
                      outputBufferSavedMessage ||
                      (accountPreferences && accountPreferences.outputBufferCount !== null
                        ? "Your account has a saved default for this."
                        : "Saves this choice to your account for new services."),
                    defaultCount: accountPreferences?.outputBufferCount ?? null,
                    defaultDwellMs: accountPreferences?.outputBufferDwellMs ?? null,
                  }}
                  manualOverrides={{
                    quickBlockEntries,
                    onAddQuickBlock: addQuickBlock,
                    onRemoveQuickBlock: removeQuickBlock,
                    isPaused,
                    isBusy,
                    controlBusy: controlAction !== null,
                    manualCaptionBusy: controlAction === "manual",
                    onShowManualCaption: (text) => void showManualCaption(text),
                    outputBufferCount,
                    outputBufferQueue,
                    onOutputBufferPause: setOutputBufferEntryPaused,
                    onOutputBufferClear: clearOutputBufferEntry,
                    onOutputBufferFastForward: fastForwardOutputBufferEntry,
                    onOutputBufferBeginEdit: beginOutputBufferEdit,
                    onOutputBufferEditDraftChange: updateOutputBufferEditDraft,
                    onOutputBufferCancelEdit: cancelOutputBufferEdit,
                    onOutputBufferSubmitEdit: submitOutputBufferEdit,
                  }}
                />
              ) : null}
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
        {masterControlsBar}
        {servicePanelOpen && liveState.status === "error" ? <p className="errorText" role="alert">{liveState.message}</p> : null}
        {servicePanelOpen && liveState.historyIncomplete ? <p className="privacyNote" role="alert">History saving failed for part of this service. Review transcript gaps before generating a summary.</p> : null}
      <ServiceControlsPanel
        hasService={hasService}
        startBar={{
          anotherOperatorActive,
          saveHistoryActive: liveState.service?.saveHistory,
          saveHistory,
          onSaveHistoryChange: setSaveHistory,
          saveHistoryDefault: accountPreferences?.saveHistoryDefault ?? null,
          onSaveHistoryDefault: saveHistoryAsDefault,
          saveHistoryDefaultMessage,
          heading: startHeading,
          description: startDescription,
          confirmTakeover,
          takeoverRequired,
          onConfirmTakeoverChange: setConfirmTakeover,
          onCancelTakeover: cancelTakeover,
          cloudState,
          isBusy,
          onStartSession: (takeover) => void startSession(takeover),
        }}
        liveConsole={{
          isPaused,
          isRefreshing,
          liveNeedsAttention,
          status: liveState.status,
          activeRecordingWindowMs,
          droppedChunks: liveState.droppedChunks,
          lastLatencyMs: liveState.lastLatencyMs,
          saveHistory: liveState.service?.saveHistory,
          level,
          // Live outputs already shows this; skip it there so the panel never duplicates it.
          outputMonitor: currentWorkspaceSection === "outputs" ? null : outputMonitor,
          output: {
            onCopyOverlayUrl: () => void copyOverlayUrl(),
            copied,
            viewerUrl,
            onCopyViewerUrl: () => void copyViewerUrl(),
            viewerCopied,
            controlAction,
            onShowTestCaption: () => void showTestCaption(),
            overlayUrlField,
          },
        }}
        snapshot={{
          displayedSourceLabel,
          displayedTargetLabel,
          activeRecordingWindowMs,
          recordingWindowMs,
          hasPendingTranslationChanges,
        }}
        usage={{
          elapsedServiceMs,
          transcriptionRequests: liveState.transcriptionRequests,
          llmUsage: liveState.llmUsage,
        }}
      />
      </ServicePanel>
      <EndServiceDialog
        dialogRef={endDialogRef}
        disabled={endActionDisabled}
        onConfirmEnd={() => void stopSession()}
      />
      </div>
      <DashboardStatusFooter
        cloudState={cloudState}
        channelStatus={channelStatus}
        channelStatusLabel={channelStatusLabel}
        statusBarRef={statusBarRef}
      />
    </main>
    </div>
  );
}
