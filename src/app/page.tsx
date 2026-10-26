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
import { AudioLevelMeter } from "@/components/operator/AudioLevelMeter";
import { CaptionPreview } from "@/components/operator/CaptionPreview";
import { ConfirmDialog } from "@/components/operator/ConfirmDialog";
import { LiveControlBar } from "@/components/operator/LiveControlBar";
import { LiveOutputsSection } from "@/components/operator/LiveOutputsSection";
import { ManualOverridesGroup } from "@/components/operator/ManualOverridesGroup";
import { OperatorTopBar, type OperatorScreenId, type StatusTone } from "@/components/operator/OperatorTopBar";
import { OutputBufferPanel } from "@/components/operator/OutputBufferPanel";
import { ReadinessChecks, type ReadinessCheck } from "@/components/operator/ReadinessChecks";
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
import { TranslationSettingsEditor } from "@/components/operator/TranslationSettingsEditor";
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
import { formatCount } from "@/components/operator/UsageMetric";
import { StatusBanner } from "@/components/operator/StatusBanner";
import { MAX_FILTER_INPUT_CHARS } from "@/live/translation-settings";
import "./dashboard.css";
import "./operator-shell.css";
import "./service-panel.css";

interface CloudModels {
  transcription: string;
  translation: string;
}

const CAPTION_PREFERENCE_KEY = "caption-studio:caption-style:v1";
const TRANSLATION_PROMPT_PREFERENCE_KEY =
  "caption-studio:translation-system-prompt:v1";

type SettingsSectionId =
  | "computer"
  | "languages"
  | "words"
  | "look"
  | "obs"
  | "translator"
  | "summary"
  | "usage";

const SETTINGS_SECTIONS: readonly { id: SettingsSectionId; label: string }[] = [
  { id: "computer", label: "This computer" },
  { id: "languages", label: "Languages & timing" },
  { id: "words", label: "Words" },
  { id: "look", label: "Caption look" },
  { id: "obs", label: "OBS & links" },
  { id: "translator", label: "AI translator" },
  { id: "summary", label: "AI summary" },
  { id: "usage", label: "Usage" },
];

// Bookmarks from the old sidebar layout still land on the matching screen.
const LEGACY_WORKSPACE_ROUTES: Record<string, string> = {
  overview: "live",
  manualOverride: "settings=words",
  history: "sermons",
  audio: "settings=computer",
  translation: "settings=languages",
  appearance: "settings=look",
  outputs: "settings=obs",
  prompt: "settings=translator",
  summary: "settings=summary",
  usage: "settings=usage",
};

function routeFromHash(hash: string): { screen: OperatorScreenId; section: SettingsSectionId } {
  let route = hash.replace(/^#/u, "");
  if (route.startsWith("workspace=")) route = LEGACY_WORKSPACE_ROUTES[route.slice(10)] ?? "live";
  const [screen, section] = route.split("=");
  const settingsSection = SETTINGS_SECTIONS.some(({ id }) => id === section)
    ? (section as SettingsSectionId)
    : "computer";
  if (screen === "sermons" || screen === "help") return { screen, section: settingsSection };
  if (screen === "settings") return { screen, section: settingsSection };
  return { screen: "live", section: settingsSection };
}

function formatClock(ms: number) {
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1_000);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
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
  const [saveHistoryDefaultMessage, setSaveHistoryDefaultMessage] = useState("");
  const [autoSummaryMessage, setAutoSummaryMessage] = useState("");
  const [theme, setTheme] = useState<ThemePreference>("system");
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
  const [translationDefaultsMessage, setTranslationDefaultsMessage] = useState("");
  const [outputBufferSavedMessage, setOutputBufferSavedMessage] = useState("");
  const [summaryDefaults, setSummaryDefaults] = useState<SummaryOptions>(DEFAULT_SUMMARY_OPTIONS);
  const [savedSummaryDefaults, setSavedSummaryDefaults] = useState<SummaryOptions | null>(null);
  const [summaryStorageMessage, setSummaryStorageMessage] = useState("");
  const [screen, setScreen] = useState<OperatorScreenId>("live");
  const [settingsSection, setSettingsSection] = useState<SettingsSectionId>("computer");
  const screenHeadingRef = useRef<HTMLHeadingElement>(null);
  const [copied, setCopied] = useState(false);
  const [viewerCopied, setViewerCopied] = useState(false);
  const [clipboardMessage, setClipboardMessage] = useState("");
  const endDialogRef = useRef<HTMLDialogElement>(null);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [confirmViewerReplace, setConfirmViewerReplace] = useState(false);
  const takeoverDialogRef = useRef<HTMLDialogElement>(null);
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
      setPromptStorageMessage("");
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [activeTranslationSettingsFingerprint]);

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
  const channelStatus = liveState.channel?.status ?? "loading";
  const channelConfigured = Boolean(liveState.channel?.configured);
  const checkingChannel = liveState.status === "loading-channel" || channelStatus === "loading";
  const startDisabled =
    cloudState !== "ready" ||
    !channelConfigured ||
    isBusy ||
    channelAction !== null;
  const startHelp = anotherOperatorActive
    ? `${runningOperator ?? "Another operator"} is running captions on another computer. Take over to control them here.`
    : liveState.status === "error"
      ? "Fix the problem shown above, then press Start."
      : cloudState === "checking"
        ? "Checking the caption service…"
        : cloudState !== "ready"
          ? "The caption service isn’t set up for this deployment. Ask the person who looks after Caption Studio."
          : checkingChannel
            ? "Checking the OBS link…"
            : !channelConfigured
              ? "Set up OBS first: press Set up next to OBS."
              : "Press Start when the sermon begins. The phone viewer link appears once you start.";
  const startBlocked = startDisabled || anotherOperatorActive;
  const viewerUrl = liveState.service?.viewerUrl ?? null;
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

  useEffect(() => {
    // Tabs and settings links are plain #links; the hash is the single source of the
    // current screen. A keyboard user's focus moves to the new screen's heading.
    let keyboard = false;
    const sync = (moveFocus: boolean) => {
      const route = routeFromHash(window.location.hash);
      setScreen(route.screen);
      setSettingsSection(route.section);
      if (moveFocus && keyboard) {
        window.requestAnimationFrame(() => screenHeadingRef.current?.focus({ preventScroll: false }));
      }
    };
    const initial = window.requestAnimationFrame(() => sync(false));
    const onHash = () => sync(true);
    const pointerInput = () => { keyboard = false; };
    const keyboardInput = () => { keyboard = true; };
    window.addEventListener("hashchange", onHash);
    window.addEventListener("pointerdown", pointerInput, true);
    window.addEventListener("keydown", keyboardInput, true);
    return () => {
      window.cancelAnimationFrame(initial);
      window.removeEventListener("hashchange", onHash);
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
    // Start found another computer running captions; ask before taking over.
    if (takeoverRequired && !takeoverDialogRef.current?.open) takeoverDialogRef.current?.showModal();
  }, [takeoverRequired]);

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
      setClipboardMessage("OBS link copied. Keep it private: anyone with it can show captions.");
      window.setTimeout(() => setCopied(false), 1_500);
    } catch {
      setClipboardMessage("The OBS link couldn’t be copied. Open Settings › OBS & links and copy it from the field.");
    }
  };

  const copyViewerUrl = async () => {
    if (!viewerUrl) return;
    try {
      await navigator.clipboard.writeText(viewerUrl);
      setViewerCopied(true);
      setClipboardMessage("Phone viewer link copied.");
      window.setTimeout(() => setViewerCopied(false), 1_500);
    } catch {
      setClipboardMessage("The phone viewer link couldn’t be copied. Open Settings › OBS & links and copy it from the field.");
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
    setPromptStorageMessage("");
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

  const translationEditorProps = {
    sourceLanguage,
    targetLanguage,
    keywordText,
    recordingWindowMs,
    sourceLabel: sourceLabel ?? sourceLanguage,
    keywordCount,
    disabled: translationEditorDisabled,
    defaultSourceLanguage: accountPreferences?.translationDefaults?.sourceLanguage ?? null,
    defaultTargetLanguage: accountPreferences?.translationDefaults?.targetLanguage ?? null,
    defaultRecordingWindowMs: accountPreferences?.translationDefaults?.recordingWindowMs ?? null,
    onSourceLanguageChange: setSourceLanguage,
    onTargetLanguageChange: setTargetLanguage,
    onKeywordTextChange: setKeywordText,
    onRecordingWindowChange: setRecordingWindowMs,
  };

  const overlayUrlField = (
    <label>
      OBS link
      <input
        value={liveState.channel?.overlayUrl ?? ""}
        readOnly
        autoComplete="off"
        spellCheck={false}
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
      : "";
  const monitorLanguage =
    (anotherOperatorActive ? observed.latestPublicLanguage : liveState.latestPublicLanguage) ??
    targetLanguage;
  const monitorLive =
    (hasService && isLive) || (watchingOther && liveState.channel?.status === "live");
  const outputBadge = hasService
    ? liveNeedsAttention
      ? "Needs attention"
      : isRefreshing
        ? "Applying changes"
        : isPaused
          ? "Paused"
          : "On screen"
    : anotherOperatorActive
      ? "From another computer"
      : liveState.latestPublicText
        ? "Test caption"
        : "Clear";
  const displayedTargetName = displayedTargetLabel ?? targetLanguage;

  const selectedMicrophone =
    devices.find((device) => device.deviceId === selectedDeviceId)?.label || "Default microphone";
  const readinessChecks: ReadinessCheck[] = [
    {
      label: "Caption service",
      ok: cloudState === "ready" || cloudState === "checking",
      value: cloudState === "ready" ? "Connected" : cloudState === "checking" ? "Checking…" : "Not set up",
      href: "#help",
      fixLabel: "Help",
    },
    {
      label: "Microphone",
      ok: microphoneState !== "error",
      value: microphoneState === "error" ? microphoneError || "Not available" : selectedMicrophone,
      href: "#settings=computer",
      fixLabel: "Fix",
    },
    {
      label: "Languages",
      ok: true,
      value: `${displayedSourceLabel ?? sourceLanguage} → ${displayedTargetName} · ${(hasService ? activeRecordingWindowMs : recordingWindowMs) / 1000} s`,
      href: "#settings=languages",
      fixLabel: "Fix",
    },
    {
      label: "Words",
      ok: true,
      value: `${keywordCount} ${keywordCount === 1 ? "term" : "terms"}`,
      href: "#settings=words",
      fixLabel: "Fix",
    },
    {
      label: "OBS",
      ok: channelConfigured || checkingChannel,
      value: checkingChannel ? "Checking…" : channelConfigured ? "Set up" : "Not set up yet",
      href: "#settings=obs",
      fixLabel: "Set up",
    },
  ];
  const setupBlocked = readinessChecks.some((check) => !check.ok);

  const status: { label: string; tone: StatusTone; detail?: string } = hasService
    ? liveState.status === "ending"
      ? { label: "Ending…", tone: "muted" }
      : liveNeedsAttention
        ? { label: "Needs attention", tone: "bad" }
        : isRefreshing
          ? { label: "Applying changes…", tone: "warn" }
          : isPaused
            ? { label: "Paused", tone: "warn", detail: formatClock(elapsedServiceMs) }
            : { label: "Live", tone: "live", detail: formatClock(elapsedServiceMs) }
    : anotherOperatorActive
      ? { label: "Live on another computer", tone: "warn" }
      : setupBlocked || liveState.status === "error"
        ? { label: "Not ready", tone: "bad" }
        : checkingChannel || cloudState === "checking"
          ? { label: "Checking…", tone: "muted" }
          : { label: "Ready", tone: "ok" };

  const minutesLeft = Math.max(0, Math.ceil((MAX_LIVE_SESSION_MS - elapsedServiceMs) / 60_000));
  const pendingBanner = hasPendingTranslationChanges ? (
    <div className="operatorBanner" role="status">
      <strong>Your changes aren’t in use yet.</strong>
      <span>
        {translationChanges.length ? `${translationChanges.join(" · ")}. ` : ""}
        Applying clears the current caption and the queue. The service keeps running.
      </span>
      <button
        type="button"
        className="secondaryButton compact"
        disabled={translationChanges.length === 0 || translationActionBusy}
        onClick={restoreActiveTranslationDraft}
      >
        Undo changes
      </button>
      <button
        type="button"
        className="primaryButton compact"
        disabled={translationActionBusy}
        onClick={() => void refreshTranslationSession()}
      >
        {translationActionBusy ? "Applying…" : "Apply now"}
      </button>
    </div>
  ) : null;

  const outputBufferPanel = (
    <OutputBufferPanel
      count={outputBufferCount}
      onCountChange={setOutputBufferCount}
      dwellMs={outputBufferDwellMs}
      onDwellChange={setOutputBufferDwellMs}
      onSaveDefault={saveOutputBufferDefault}
      savedMessage={
        outputBufferSavedMessage ||
        (accountPreferences && accountPreferences.outputBufferCount !== null
          ? "Your account has a saved default for this."
          : "Saves this choice to your account for new services.")
      }
      disabled={isBusy}
      defaultCount={accountPreferences?.outputBufferCount ?? null}
      defaultDwellMs={accountPreferences?.outputBufferDwellMs ?? null}
    />
  );

  const liveScreen = (
    <main className="operatorScreen" id="main" aria-labelledby="screen-heading">
      <h1 id="screen-heading" ref={screenHeadingRef} tabIndex={-1} className="visuallyHidden">Live</h1>
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
      {anotherOperatorActive ? (
        <div className="operatorBanner" data-tone="warn">
          <strong>{runningOperator ?? "Another operator"} is running captions on another computer.</strong>
          <span>{observed.message || "You can watch here. Taking over clears the screen and moves control to this computer."}</span>
          <button type="button" className="secondaryButton compact" disabled={isBusy || cloudState !== "ready"} onClick={() => takeoverDialogRef.current?.showModal()}>
            Take over
          </button>
        </div>
      ) : null}
      {pendingBanner}
      {liveState.historyIncomplete ? (
        <p className="operatorBanner" data-tone="warn" role="alert">
          Part of this service wasn’t saved to the transcript. Check the gaps in Sermons before making a summary.
        </p>
      ) : null}

      <div className="operatorColumns">
        <div className="operatorMainColumn">
          <section className="operatorCard" aria-label="Captions">
            <div className="monitorGrid">
              <div className="monitorPane">
                <div className="monitorLabel"><span>Heard</span><span>Only you see this</span></div>
                <p className="heardText" data-empty={!monitorSourceText} lang={displayedTranslationSettings?.sourceLanguage === "auto" ? undefined : displayedTranslationSettings?.sourceLanguage}>
                  {monitorSourceText || (hasService ? (isPaused ? "Not listening while paused." : "Listening…") : "Nothing yet.")}
                </p>
              </div>
              <div className="monitorPane">
                <div className="monitorLabel"><span>Audience sees</span><span>{displayedTargetName} · OBS &amp; phones</span></div>
                <CaptionPreview
                  caption={monitorCaption}
                  targetLanguage={monitorLanguage}
                  style={liveState.channel?.style ?? style}
                  badge={outputBadge}
                  live={monitorLive}
                />
              </div>
            </div>
            <div className="levelRow">
              <span>Microphone</span>
              <AudioLevelMeter level={level} />
            </div>
          </section>

          {!hasService ? (
            <section className="operatorCard" aria-label="Start">
              <div className="startActions">
                <button
                  type="button"
                  className="primaryButton largeButton"
                  disabled={startBlocked}
                  aria-describedby="start-help"
                  onClick={() => void startSession()}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l13-7.5z" /></svg>
                  {liveState.status === "starting" ? "Starting…" : "Start captions"}
                </button>
                <button
                  type="button"
                  className="secondaryButton"
                  disabled={!channelConfigured || isBusy || controlAction !== null || anotherOperatorActive}
                  onClick={() => void showTestCaption()}
                >
                  {controlAction === "show-test" ? "Showing…" : "Show a test caption"}
                </button>
              </div>
              <p id="start-help" className="operatorHint" data-tone={(setupBlocked || anotherOperatorActive || liveState.status === "error") && !checkingChannel && cloudState !== "checking" ? "bad" : undefined}>
                {startHelp}
              </p>
              <label className="checkLabel">
                <input
                  type="checkbox"
                  name="saveTranscript"
                  checked={saveHistory}
                  disabled={isBusy}
                  onChange={(event) => setSaveHistory(event.target.checked)}
                />
                <span>
                  <strong>Save the transcript for 7 days</strong>
                  <br />
                  <span className="operatorHint">Needed for Sermons and AI summary. Everyone at {WORKSPACE_NAME} can open it. Tell the congregation when it’s on.</span>
                </span>
              </label>
              {accountPreferences?.saveHistoryDefault !== saveHistory ? (
                <button className="textButton" type="button" disabled={isBusy} onClick={saveHistoryAsDefault}>
                  Make this my default
                </button>
              ) : null}
              <p className="operatorHint" role="status" aria-live="polite">{saveHistoryDefaultMessage}</p>
              <details className="advancedActions">
                <summary>Check captions before they show</summary>
                {outputBufferPanel}
              </details>
            </section>
          ) : (
            <section className="operatorCard" aria-labelledby="quick-fixes-heading">
              <h2 id="quick-fixes-heading">Quick fixes</h2>
              <ManualOverridesGroup
                quickBlockEntries={quickBlockEntries}
                onAddQuickBlock={addQuickBlock}
                onRemoveQuickBlock={removeQuickBlock}
                isPaused={isPaused}
                isBusy={isBusy}
                controlBusy={controlAction !== null}
                manualCaptionBusy={controlAction === "manual"}
                onShowManualCaption={(text) => void showManualCaption(text)}
                outputBuffer={{
                  show: outputBufferCount > 0,
                  queue: outputBufferQueue,
                  onPause: setOutputBufferEntryPaused,
                  onClear: clearOutputBufferEntry,
                  onFastForward: fastForwardOutputBufferEntry,
                  onBeginEdit: beginOutputBufferEdit,
                  onEditDraftChange: updateOutputBufferEditDraft,
                  onCancelEdit: cancelOutputBufferEdit,
                  onSubmitEdit: submitOutputBufferEdit,
                }}
              />
              {isPaused ? (
                <button type="button" className="secondaryButton" disabled={isBusy || controlAction !== null} onClick={() => void showTestCaption()}>
                  {controlAction === "show-test" ? "Showing…" : "Show a test caption"}
                </button>
              ) : null}
              <details className="advancedActions">
                <summary>Check captions before they show</summary>
                {outputBufferPanel}
              </details>
            </section>
          )}
        </div>

        <aside className="operatorSideColumn" aria-label="Setup and sharing">
          <ReadinessChecks title={hasService ? "Setup" : setupBlocked ? "Before you start" : "Ready to go"} checks={readinessChecks} />

          <section className="operatorCard" aria-labelledby="share-heading">
            <h2 id="share-heading">Share</h2>
            <div className="shareRow">
              <span>
                <strong>Phone viewer</strong>
                <br />
                <span className="operatorHint">{viewerUrl ? "Live captions on phones" : "Available once you start"}</span>
              </span>
              <button type="button" className="secondaryButton compact" disabled={!viewerUrl} onClick={() => void copyViewerUrl()}>
                {viewerCopied ? "Copied" : "Copy link"}
              </button>
            </div>
            <ServiceExperiencePanel view="sharing" service={liveState.service} observer={observed.observer} onReaderLink={rememberReaderLink} />
            <p className="operatorHint" role="status" aria-live="polite">{clipboardMessage}</p>
          </section>

          {hasService ? (
            <section className="operatorCard" aria-labelledby="this-service-heading">
              <h2 id="this-service-heading">This service</h2>
              <div className="statRow"><span>Time left</span><span>{minutesLeft} min of {MAX_LIVE_SESSION_MS / 60_000}</span></div>
              <div className="statRow"><span>Transcript saving</span><span>{liveState.service?.saveHistory ? "On" : "Off"}</span></div>
              <details className="advancedActions">
                <summary>Details</summary>
                <div className="statRow"><span>Delay after speech</span><span>{liveState.lastLatencyMs === null ? "—" : `${(liveState.lastLatencyMs / 1000).toFixed(1)} s`}</span></div>
                <div className="statRow"><span>Audio chunks dropped</span><span>{formatCount(liveState.droppedChunks)}</span></div>
                <div className="statRow"><span>Transcriptions</span><span>{formatCount(liveState.transcriptionRequests)}</span></div>
                <div className="statRow"><span>Translation calls</span><span>{formatCount(liveState.llmUsage.translationRequests)}</span></div>
                <div className="statRow"><span>Translation tokens</span><span>{formatCount(liveState.llmUsage.totalTokens)}</span></div>
                <div className="statRow"><span>Speech model</span><span translate="no">{cloudModels?.transcription ?? "—"}</span></div>
                <div className="statRow"><span>Translation model</span><span translate="no">{cloudModels?.translation ?? "—"}</span></div>
              </details>
            </section>
          ) : null}
        </aside>
      </div>
    </main>
  );

  const sermonsScreen = (
    <main className="operatorScreen" id="main" aria-labelledby="screen-heading">
      <h1 id="screen-heading" ref={screenHeadingRef} tabIndex={-1}>Sermons</h1>
      <p className="operatorHint">
        Saved transcripts are kept for 7 days and shared with everyone at {WORKSPACE_NAME}.
      </p>
      <ServiceExperiencePanel view="archive" service={liveState.service} onReaderLink={rememberReaderLink} summaryDefaults={summaryDefaults} />
    </main>
  );

  const settingsTitle = SETTINGS_SECTIONS.find(({ id }) => id === settingsSection)?.label ?? "Settings";
  const settingsScreen = (
    <main className="operatorScreen" id="main" aria-labelledby="screen-heading">
      <h1 id="screen-heading" ref={screenHeadingRef} tabIndex={-1} className="visuallyHidden">Settings</h1>
      <div className="operatorColumns">
        <nav className="settingsNav" aria-label="Settings sections">
          {SETTINGS_SECTIONS.map((section) => (
            <a
              key={section.id}
              href={`#settings=${section.id}`}
              aria-current={settingsSection === section.id ? "page" : undefined}
            >
              {section.label}
            </a>
          ))}
          <p className="operatorHint">“This computer” applies here only. The rest is saved with your account.</p>
        </nav>
        <section className="operatorCard settingsPanel" aria-labelledby="settings-section-heading">
          <h2 id="settings-section-heading">{settingsTitle}</h2>
          {["languages", "words", "translator"].includes(settingsSection) ? pendingBanner : null}

          {settingsSection === "computer" ? (
            <>
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
                <p className="operatorHint">Pause before changing the microphone.</p>
              ) : null}
              <label className="themeField">
                Appearance
                <select name="theme" autoComplete="off" value={theme} onChange={(event) => chooseTheme(event.target.value)}>
                  <option value="system">Match this computer</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </label>
            </>
          ) : null}

          {settingsSection === "languages" ? (
            <>
              <TranslationSettingsEditor {...translationEditorProps} part="languages" />
              <div className="startActions">
                <button type="button" className="secondaryButton" disabled={translationEditorDisabled} onClick={saveTranslationDefaults}>
                  Save as my default
                </button>
              </div>
              <p className="operatorHint" role="status" aria-live="polite">
                {translationDefaultsMessage ||
                  (accountPreferences?.translationDefaults
                    ? "New services start from your saved languages, speed and words."
                    : "Saves languages, caption speed and words for new services.")}
              </p>
            </>
          ) : null}

          {settingsSection === "words" ? (
            <>
              <TranslationSettingsEditor {...translationEditorProps} part="words" />
              <label>
                Never show these words
                <input
                  name="publicFilter"
                  autoComplete="off"
                  spellCheck={false}
                  value={filterText}
                  maxLength={MAX_FILTER_INPUT_CHARS}
                  disabled={translationEditorDisabled}
                  onChange={(event) => setFilterText(event.target.value)}
                  placeholder="e.g. word, word=>replacement, word=>!hide…"
                />
              </label>
              <p className="operatorHint">
                A plain word shows as ***. <code>word=&gt;replacement</code> swaps it, and{" "}
                <code>word=&gt;!hide</code> hides the whole caption. You still see the original under “Heard”.
              </p>
              <div className="startActions">
                <button type="button" className="secondaryButton" disabled={translationEditorDisabled} onClick={saveTranslationDefaults}>
                  Save as my default
                </button>
              </div>
            </>
          ) : null}

          {settingsSection === "look" ? (
            <>
              <CaptionPreview
                caption={monitorCaption || SAMPLE_CAPTIONS[targetLanguage]}
                targetLanguage={monitorCaption ? monitorLanguage : targetLanguage}
                style={style}
                badge={monitorCaption ? outputBadge : "Sample"}
                live={monitorLive}
              />
              <p className="operatorHint">
                {hasService
                  ? "Changes show on OBS straight away. Save keeps them for next week."
                  : "Changes show in this preview. Save sends them to OBS and keeps them for next week."}
              </p>
              <StyleEditor {...styleEditorProps} />
            </>
          ) : null}

          {settingsSection === "obs" ? (
            <LiveOutputsSection
              hasService={hasService}
              isBusy={isBusy}
              anotherOperatorActive={anotherOperatorActive}
              runningOperator={runningOperator}
              observedMessage={observed.message}
              observedSaveHistory={observed.observer?.saveHistory}
              outputMonitor={null}
              readerAndPhoneOutputs={null}
              obs={{
                configured: channelConfigured,
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

          {settingsSection === "translator" ? (
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
          ) : null}

          {settingsSection === "summary" ? (
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
          ) : null}

          {settingsSection === "usage" ? (
            <>
              <AiUsageDashboard
                llmUsage={liveState.llmUsage}
                translationModel={cloudModels?.translation ?? "Configured translation model"}
              />
              <UsageHistory />
            </>
          ) : null}
        </section>
      </div>
    </main>
  );

  const helpScreen = (
    <main className="operatorScreen" id="main" aria-labelledby="screen-heading" style={{ maxWidth: 760 }}>
      <h1 id="screen-heading" ref={screenHeadingRef} tabIndex={-1}>How it works</h1>
      <ol className="helpSteps">
        <li>Check the list on the Live screen. If an item is red, press the button next to it.</li>
        <li>Tick <strong>Save the transcript</strong> if you want the sermon text and a summary afterwards.</li>
        <li>Press <strong>Start captions</strong> when the sermon begins.</li>
        <li>Copy the <strong>Phone viewer</strong> link and share it with the congregation.</li>
        <li>Press <strong>Pause</strong> during songs and announcements, and <strong>Clear screen</strong> to remove a wrong caption. Both stay at the bottom of the screen.</li>
        <li>Press <strong>End service</strong> when it’s over. The transcript and summary are in <strong>Sermons</strong>.</li>
      </ol>
      <p className="operatorHint">
        First time? Open <a href="#settings=obs">Settings › OBS &amp; links</a> and create the OBS link, then add it to OBS as a 1920 × 1080 Browser Source.
      </p>
      <div><a className="primaryButton" href="#live">Back to Live</a></div>
    </main>
  );

  return (
    <div className="operatorShell">
      <a className="skipLink" href="#main">Skip to main content</a>
      <OperatorTopBar screen={screen} status={status} />
      {screen === "live" ? liveScreen : screen === "sermons" ? sermonsScreen : screen === "settings" ? settingsScreen : helpScreen}
      {hasService && screen === "live" ? (
        <LiveControlBar
          isPaused={isPaused}
          isPausing={liveState.status === "pausing"}
          isResuming={liveState.status === "resuming"}
          clearing={controlAction === "clear"}
          controlsDisabled={isBusy || controlAction !== null}
          endRetryRequired={endRetryRequired}
          endDisabled={endActionDisabled}
          onPause={() => void pauseSession()}
          onResume={() => void resumeSession()}
          onClear={() => void clearCaption()}
          onEnd={() => endDialogRef.current?.showModal()}
          onRetryEnd={() => void stopSession()}
        />
      ) : null}
      <ConfirmDialog
        dialogRef={endDialogRef}
        title="End this service?"
        body="Captions stop, the screen clears and the phone viewer link closes. OBS keeps its link for next time."
        cancelLabel="Keep going"
        actionLabel="End service"
        disabled={endActionDisabled}
        onConfirm={() => void stopSession()}
      />
      <ConfirmDialog
        dialogRef={takeoverDialogRef}
        title="Take over captions?"
        body={`${runningOperator ?? "The other operator"} stops captioning, the screen clears, and this computer’s microphone starts.`}
        cancelLabel="Keep watching"
        actionLabel="Take over"
        disabled={isBusy || cloudState !== "ready"}
        onConfirm={() => void startSession(true)}
        onCancel={cancelTakeover}
      />
    </div>
  );
}
