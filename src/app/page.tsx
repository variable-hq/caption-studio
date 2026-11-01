"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { CloudProviderClient } from "@/ai/cloud-provider-client";
import {
  DEFAULT_INFERENCE_LEVEL,
  DEFAULT_SANITIZE_LEVEL,
  type InferenceLevel,
  type SanitizeLevel,
} from "@/ai/contracts";
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
import { LiveNoteControl } from "@/components/operator/LiveNoteControl";
import { RecentOutputsStrip } from "@/components/operator/RecentOutputsStrip";
import { LiveDraftLine } from "@/components/operator/LiveDraftLine";
import { SessionMetadataFields } from "@/components/operator/SessionMetadataFields";
import { ManualOverridesGroup } from "@/components/operator/ManualOverridesGroup";
import { OperatorTopBar, type OperatorScreenId, type OperatorStatusLabel, type StatusTone } from "@/components/operator/OperatorTopBar";
import { OutputBufferPanel } from "@/components/operator/OutputBufferPanel";
import { ReadinessChecks, type ReadinessCheck } from "@/components/operator/ReadinessChecks";
import { PromptEditor } from "@/components/operator/PromptEditor";
import { StyleEditor, type StyleEditorProps } from "@/components/operator/StyleEditor";
import { SummarySettingsEditor } from "@/components/operator/SummarySettingsEditor";
import type { SummaryOptions } from "@/experience/contracts";
import {
  loadOperatorPreferences,
  loadSharedSetup,
  saveOperatorPreferences,
  saveSharedSetup,
} from "@/experience/preferences-client";
import { SHARED_SETUP_FIELDS, effectiveSetup, type OperatorPreferences } from "@/experience/preferences";
import {
  DEFAULT_SUMMARY_OPTIONS,
  SUMMARY_DEFAULTS_PREFERENCE_KEY,
  normalizeSummaryOptions,
  summaryOptionsEqual,
} from "@/experience/summary-defaults";
import { CaptionWaitTimeEditor, TranslationSettingsEditor } from "@/components/operator/TranslationSettingsEditor";
import { WordsEditor } from "@/components/operator/WordsEditor";
import {
  DEFAULT_SOURCE_LANGUAGE,
  DEFAULT_TARGET_LANGUAGE,
  LANGUAGE_OPTIONS,
  type LanguageLocale,
  type SourceLanguage,
} from "@/domain/languages";
import { WORKSPACE_NAME } from "@/domain/workspace";
import { wordsFromSettings, wordsToSettings, type WordRow } from "@/live/words";
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
  DEFAULT_KEYWORD_TEXT,
  normalizeTranslationSessionSettings,
  translationSettingsChanges,
  translationSettingsFingerprint,
  type TranslationSessionSettings,
} from "@/live/translation-settings";
import { LIVE_NOTE_STORAGE_KEY, useLiveCaptionSession } from "@/live/use-live-caption-session";
import { useObservedSession } from "@/live/use-observed-session";
import { normalizeLiveNote } from "@/live/live-note";
import { EMPTY_SESSION_METADATA, normalizeSessionMetadata, type SessionMetadata } from "@/experience/contracts";
import { experienceRequest } from "@/experience/client";
import { ServiceExperiencePanel } from "@/components/operator/ServiceExperiencePanel";
import { UsageHistory } from "@/components/operator/UsageHistory";
import { formatCount, formatDecimal } from "@/components/operator/format-count";
import { formatClock } from "@/components/operator/format-clock";
import { SaveBar, SettingGroup } from "@/components/operator/SettingsParts";
import { StatusBanner } from "@/components/operator/StatusBanner";
import { I18nProvider, useI18n } from "@/i18n/provider";
import { translatePlural, type MessageKey, type UiLocalePreference } from "@/i18n";
import "./operator-shell.css";

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

const SETTINGS_SECTIONS: readonly { id: SettingsSectionId; titleKey: MessageKey; descriptionKey?: MessageKey }[] = [
  { id: "computer", titleKey: "settings.section.computer.title" },
  { id: "languages", titleKey: "settings.section.languages.title" },
  { id: "words", titleKey: "settings.section.words.title", descriptionKey: "settings.section.words.description" },
  { id: "look", titleKey: "settings.section.look.title", descriptionKey: "settings.section.look.description" },
  { id: "obs", titleKey: "settings.section.obs.title", descriptionKey: "settings.section.obs.description" },
  { id: "translator", titleKey: "settings.section.translator.title", descriptionKey: "settings.section.translator.description" },
  { id: "summary", titleKey: "settings.section.summary.title", descriptionKey: "settings.section.summary.description" },
  { id: "usage", titleKey: "settings.section.usage.title", descriptionKey: "settings.section.usage.description" },
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

export default function OperatorDashboard() {
  return (
    <I18nProvider>
      <OperatorDashboardContent />
    </I18nProvider>
  );
}

function OperatorDashboardContent() {
  const {
    locale,
    uiLocalePreference,
    setUiLocalePreference,
    setAccountUiLocale,
    setBrowserFallbackPreference,
    t,
  } = useI18n();
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);
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
  const [keywordText, setKeywordText] = useState(DEFAULT_KEYWORD_TEXT);
  const [filterText, setFilterText] = useState("");
  const [saveHistory, setSaveHistory] = useState(false);
  const [sessionMetadata, setSessionMetadata] = useState<SessionMetadata>({ ...EMPTY_SESSION_METADATA });
  const [sessionDateEdited, setSessionDateEdited] = useState(false);
  const [sessionMetadataMessage, setSessionMetadataMessage] = useState("");
  const [liveNote, setLiveNote] = useState("");
  const liveNoteRestoredFor = useRef<string | null>(null);
  const priorServiceStartedAt = useRef<string | null>(null);
  const metadataPostedFor = useRef<string | null>(null);
  const metadataWrite = useRef<Promise<void> | null>(null);
  const shouldAutoSaveMetadata = useRef(false);
  const [saveHistoryDefaultMessage, setSaveHistoryDefaultMessage] = useState("");
  const [autoSummaryMessage, setAutoSummaryMessage] = useState("");
  const [theme, setTheme] = useState<ThemePreference>("system");
  const [recordingWindowMs, setRecordingWindowMs] = useState<RecordingWindowMs>(
    DEFAULT_RECORDING_WINDOW_MS,
  );
  const [inferenceLevel, setInferenceLevel] = useState<InferenceLevel>(
    DEFAULT_INFERENCE_LEVEL,
  );
  const [sanitizeLevel, setSanitizeLevel] = useState<SanitizeLevel>(
    DEFAULT_SANITIZE_LEVEL,
  );
  const [filterInappropriateLanguage, setFilterInappropriateLanguage] = useState(true);
  const [outputBufferCount, setOutputBufferCount] = useState<OutputBufferCount>(
    DEFAULT_OUTPUT_BUFFER_COUNT,
  );
  const [outputBufferDwellMs, setOutputBufferDwellMs] = useState<OutputBufferDwellMs>(
    DEFAULT_OUTPUT_BUFFER_DWELL_MS,
  );
  const [liveDraftsEnabled, setLiveDraftsEnabled] = useState(false);
  const [liveDraftsSavedMessage, setLiveDraftsSavedMessage] = useState("");
  const [translationSystemPrompt, setTranslationSystemPrompt] = useState(
    DEFAULT_TRANSLATION_SYSTEM_PROMPT,
  );
  const [savedPromptFingerprint, setSavedPromptFingerprint] = useState("");
  const [promptStorageMessage, setPromptStorageMessage] = useState("");
  // The operator's own record (theme) and the church setup everyone shares (ADR 0022).
  const [personalPreferences, setPersonalPreferences] = useState<OperatorPreferences | null>(null);
  const [sharedSetup, setSharedSetup] = useState<OperatorPreferences | null>(null);
  const accountPreferences = useMemo(
    () => (personalPreferences && sharedSetup ? effectiveSetup(sharedSetup, personalPreferences) : null),
    [personalPreferences, sharedSetup],
  );
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
        sanitizeLevel,
        filterInappropriateLanguage,
      }),
    [
      filterText,
      inferenceLevel,
      sanitizeLevel,
      filterInappropriateLanguage,
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
      liveNote,
      outputBufferCount,
      outputBufferDwellMs,
      liveDraftsEnabled,
    }),
    [draftTranslationSettings, style, saveHistory, liveNote, outputBufferCount, outputBufferDwellMs, liveDraftsEnabled],
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
    liveDraftSessionDisabled,
    translationRefreshRequired,
    endRetryRequired,
    takeoverRequired,
    rotationRecoveryRequired,
    cancelTakeover,
    micTest,
    createChannel,
    rotateChannel,
    saveChannelStyle,
    replaceViewerLink,
    startSession,
    pauseSession,
    resumeSession,
    clearCaption,
    liveWordEntries,
    addLiveWordEntry,
    removeLiveWordEntry,
    rememberReaderLink,
    showTestCaption,
    showManualCaption,
    refreshTranslationSession,
    stopSession,
    reloadChannel,
    outputBufferQueue,
    recentOutputs,
    liveDraft,
    resetLiveDrafts,
    setOutputBufferEntryPaused,
    clearOutputBufferEntry,
    fastForwardOutputBufferEntry,
    beginOutputBufferEdit,
    updateOutputBufferEditDraft,
    cancelOutputBufferEdit,
    submitOutputBufferEdit,
  } = useLiveCaptionSession(liveSettings);
  useEffect(() => {
    const startedAt = liveState.service?.startedAt ?? null;
    if (!startedAt) {
      if (priorServiceStartedAt.current) {
        liveNoteRestoredFor.current = null;
        window.sessionStorage.removeItem(LIVE_NOTE_STORAGE_KEY);
        priorServiceStartedAt.current = null;
        const frame = window.requestAnimationFrame(() => {
          setLiveNote("");
          setSessionMetadata({ ...EMPTY_SESSION_METADATA, sessionAt: Date.now() });
          setSessionDateEdited(false);
          setSessionMetadataMessage("");
        });
        return () => window.cancelAnimationFrame(frame);
      }
      return;
    }
    let restored = "";
    try {
      const stored = JSON.parse(window.sessionStorage.getItem(LIVE_NOTE_STORAGE_KEY) ?? "null") as { startedAt?: string; value?: unknown } | null;
      restored = stored?.startedAt === startedAt ? normalizeLiveNote(stored.value) : "";
    } catch { restored = ""; }
    const frame = window.requestAnimationFrame(() => {
      liveNoteRestoredFor.current = startedAt;
      priorServiceStartedAt.current = startedAt;
      setLiveNote(restored);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [liveState.service?.startedAt]);
  useEffect(() => {
    const startedAt = liveState.service?.startedAt;
    if (!startedAt || liveNoteRestoredFor.current !== startedAt) return;
    window.sessionStorage.setItem(LIVE_NOTE_STORAGE_KEY, JSON.stringify({ startedAt, value: normalizeLiveNote(liveNote) }));
  }, [liveNote, liveState.service?.startedAt]);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setSessionMetadata((value) => value.sessionAt === null ? { ...value, sessionAt: Date.now() } : value));
    return () => window.cancelAnimationFrame(frame);
  }, []);
  useEffect(() => {
    const startedAt = liveState.service?.startedAt;
    if (!startedAt || sessionDateEdited) return;
    const frame = window.requestAnimationFrame(() => setSessionMetadata((value) => ({ ...value, sessionAt: Date.parse(startedAt) })));
    return () => window.cancelAnimationFrame(frame);
  }, [liveState.service?.startedAt, sessionDateEdited]);
  useEffect(() => {
    const service = liveState.service;
    if (!service) {
      if (["error", "idle", "taken-over"].includes(liveState.status)) shouldAutoSaveMetadata.current = false;
      return;
    }
    if (!service.saveHistory) { shouldAutoSaveMetadata.current = false; return; }
    if (!shouldAutoSaveMetadata.current || !service?.saveHistory || !service.serviceId || metadataPostedFor.current === service.serviceId) return;
    metadataPostedFor.current = service.serviceId;
    const metadata = normalizeSessionMetadata({ ...sessionMetadata, sessionAt: sessionDateEdited ? sessionMetadata.sessionAt : Date.parse(service.startedAt) });
    metadataWrite.current = experienceRequest<{ metadata: SessionMetadata }>(`sermons/${service.serviceId}/metadata`, metadata)
      .then((result) => { setSessionMetadata(result.metadata); setSessionMetadataMessage(t("live.sessionDetailsSaved")); shouldAutoSaveMetadata.current = false; })
      .catch(() => { setSessionMetadataMessage(t("live.sessionDetailsAutoSaveFailed")); shouldAutoSaveMetadata.current = false; });
  }, [liveState.service, liveState.status, sessionMetadata, sessionDateEdited, t]);
  async function saveLiveSessionMetadata() {
    const serviceId = liveState.service?.serviceId;
    if (!serviceId || !liveState.service?.saveHistory) return;
    setSessionMetadataMessage(t("common.saving"));
    try {
      await metadataWrite.current;
      const result = await experienceRequest<{ metadata: SessionMetadata }>(`sermons/${serviceId}/metadata`, normalizeSessionMetadata(sessionMetadata));
      setSessionMetadata(result.metadata);
      setSessionMetadataMessage(t("live.sessionDetailsSaved"));
    } catch { setSessionMetadataMessage(t("live.sessionDetailsSaveFailed")); }
  }
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
      setSanitizeLevel(active.sanitizeLevel);
      setFilterInappropriateLanguage(active.filterInappropriateLanguage);
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
        () => setPreferenceError(tRef.current("settings.error.loadedSettings")),
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
        setPromptStorageMessage(tRef.current("settings.message.loadedSaved"));
      }, 0);
      return () => window.clearTimeout(timeout);
    } catch {
      const timeout = window.setTimeout(
        () =>
          setPromptStorageMessage(
            tRef.current("settings.error.promptRead"),
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

  const wordCount = useMemo(
    () => wordsFromSettings(keywordText, filterText).length,
    [keywordText, filterText],
  );
  const keepLiveWordInWords = (row: WordRow) => {
    const next = wordsToSettings([...wordsFromSettings(keywordText, filterText), row]);
    setKeywordText(next.keywordText);
    setFilterText(next.filterText);
  };
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
    ? t("live.startHelp.otherOperator", { operator: runningOperator ?? t("live.otherOperatorDefault") })
    : liveState.status === "error"
      ? t("live.startHelp.error")
      : cloudState === "checking"
        ? t("live.startHelp.checkingService")
        : cloudState !== "ready"
          ? t("live.startHelp.notConfigured")
          : checkingChannel
            ? t("live.startHelp.checkingChannel")
            : !channelConfigured
              ? t("live.startHelp.setUpObs")
              : t("live.startHelp.ready");
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
    ? t("live.autoDetection")
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
    // Start found another system running captions; ask before taking over.
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
      setClipboardMessage(t("page.clipboard.obsCopied"));
      window.setTimeout(() => setCopied(false), 1_500);
    } catch {
      setClipboardMessage(t("page.clipboard.obsCopyFailed"));
    }
  };

  const copyViewerUrl = async () => {
    if (!viewerUrl) return;
    try {
      await navigator.clipboard.writeText(viewerUrl);
      setViewerCopied(true);
      setClipboardMessage(t("page.clipboard.viewerCopied"));
      window.setTimeout(() => setViewerCopied(false), 1_500);
    } catch {
      setClipboardMessage(t("page.clipboard.viewerCopyFailed"));
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
    const personalPreferencesRequest = loadOperatorPreferences();
    void personalPreferencesRequest
      .then((personal) => {
        if (!cancelled) setAccountUiLocale(personal.uiLocale);
      })
      .catch(() => {
        if (!cancelled) setBrowserFallbackPreference();
      });
    Promise.all([personalPreferencesRequest, loadSharedSetup()])
      .then(([personal, shared]) => {
        if (cancelled) return;
        setPersonalPreferences(personal);
        setSharedSetup(shared);
        const loaded = effectiveSetup(shared, personal);
        if (loaded.translationSystemPrompt !== null) {
          setTranslationSystemPrompt(loaded.translationSystemPrompt);
          setSavedPromptFingerprint(loaded.translationSystemPrompt);
          setPromptStorageMessage(tRef.current("settings.message.loadedChurchSetup"));
        }
        if (loaded.summaryDefaults) {
          setSummaryDefaults(loaded.summaryDefaults);
          setSavedSummaryDefaults(loaded.summaryDefaults);
          setSummaryStorageMessage(tRef.current("settings.message.loadedChurchSetup"));
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
        setTheme(personal.theme);
        try {
          if (personal.theme === "system") window.localStorage.removeItem(THEME_PREFERENCE_KEY);
          else window.localStorage.setItem(THEME_PREFERENCE_KEY, personal.theme);
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
          setSanitizeLevel(defaults.sanitizeLevel);
          setFilterInappropriateLanguage(defaults.filterInappropriateLanguage);
          setTranslationDefaultsMessage(tRef.current("settings.message.loadedChurchSetup"));
        }
        if (loaded.saveHistoryDefault !== null && !hasServiceRef.current) {
          setSaveHistory(loaded.saveHistoryDefault);
        }
        if (loaded.outputBufferCount !== null && !hasServiceRef.current) {
          setOutputBufferCount(loaded.outputBufferCount);
          setOutputBufferSavedMessage(tRef.current("settings.message.loadedChurchSetup"));
        }
        if (loaded.outputBufferDwellMs !== null && !hasServiceRef.current) {
          setOutputBufferDwellMs(loaded.outputBufferDwellMs);
          setOutputBufferSavedMessage(tRef.current("settings.message.loadedChurchSetup"));
        }
        if (loaded.liveDraftsEnabled !== null && !hasServiceRef.current) {
          setLiveDraftsEnabled(loaded.liveDraftsEnabled);
          setLiveDraftsSavedMessage(tRef.current("settings.message.loadedChurchSetup"));
        }
      })
      .catch(() => {
        if (cancelled) return;
        setPersonalPreferences(null);
        setSharedSetup(null);
      });
    return () => {
      cancelled = true;
    };
    // Runs once; the setters are stable and the live-service guard uses a ref.
  }, [setAccountUiLocale, setBrowserFallbackPreference]);

  /**
   * Best-effort sync; callers report the browser-only fallback themselves. Theme and
   * interface language are saved to the operator's own record; other settings use the
   * church setup. The first church-setup save carries this operator's earlier saved setup,
   * so values saved before the setup was shared are not lost.
   */
  const syncAccountPreferences = async (patch: Partial<OperatorPreferences>) => {
    try {
      if (Object.keys(patch).every((key) => key === "theme" || key === "uiLocale")) {
        setPersonalPreferences(await saveOperatorPreferences(patch));
        return true;
      }
      const seed = sharedSetup?.updatedAt === null && personalPreferences
        ? Object.fromEntries(SHARED_SETUP_FIELDS.map((field) => [field, personalPreferences[field]]))
        : {};
      setSharedSetup(await saveSharedSetup({ ...seed, ...patch }));
      return true;
    } catch {
      return false;
    }
  };

  function chooseUiLocale(value: string) {
    const preference: UiLocalePreference = value === "en" || value === "id" ? value : null;
    setUiLocalePreference(preference);
    void syncAccountPreferences({ uiLocale: preference });
  }

  const saveTranslationDefaults = () => {
    setTranslationDefaultsMessage(t("common.savingForEveryone"));
    void syncAccountPreferences({
      translationDefaults: { sourceLanguage, targetLanguage, keywordText, filterText, recordingWindowMs, inferenceLevel, sanitizeLevel, filterInappropriateLanguage },
    }).then((ok) =>
      setTranslationDefaultsMessage(
        ok
          ? t("settings.message.savedTranslationDefaults")
          : t("settings.error.churchSetup"),
      ),
    );
  };

  const saveOutputBufferDefault = () => {
    setOutputBufferSavedMessage(t("common.savingForEveryone"));
    void syncAccountPreferences({ outputBufferCount, outputBufferDwellMs }).then((ok) =>
      setOutputBufferSavedMessage(
        ok
          ? t("settings.message.savedDefaultChoice")
          : t("settings.error.churchSetup"),
      ),
    );
  };

  const saveLiveDraftsDefault = () => {
    setLiveDraftsSavedMessage(t("common.savingForEveryone"));
    void syncAccountPreferences({ liveDraftsEnabled }).then((ok) =>
      setLiveDraftsSavedMessage(
        ok ? t("settings.message.savedDefaultChoice") : t("settings.error.churchSetup"),
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
        setSummaryStorageMessage(tRef.current("settings.message.loadedSaved"));
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
      setSummaryStorageMessage(t("settings.message.savedBrowserSaving"));
      void syncAccountPreferences({ summaryDefaults: normalized }).then((ok) =>
        setSummaryStorageMessage(ok ? t("settings.message.savedForEveryone") : t("settings.error.savedBrowserOnly")),
      );
    } catch {
      setSummaryStorageMessage(t("settings.error.save"));
    }
  };

  const saveHistoryAsDefault = () => {
    setSaveHistoryDefaultMessage(t("common.savingForEveryone"));
    void syncAccountPreferences({ saveHistoryDefault: saveHistory }).then((ok) =>
      setSaveHistoryDefaultMessage(
        ok
          ? t("settings.message.savedTranscriptDefault", { state: saveHistory ? t("common.on") : t("common.off") })
          : t("settings.error.churchSetup"),
      ),
    );
  };

  const changeAutoSummary = (enabled: boolean) => {
    setAutoSummaryMessage(t("common.saving"));
    void syncAccountPreferences({ autoSummary: enabled }).then((ok) =>
      setAutoSummaryMessage(
        ok
          ? enabled
            ? t("settings.message.autoSummaryOn")
            : t("settings.message.autoSummaryOff")
          : t("settings.error.churchSetup"),
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
    setSummaryStorageMessage(t("settings.message.restoredBuiltIn"));
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
        ? t("settings.message.savedForEveryone")
        : t("settings.message.unsaved")
      : t("settings.message.usingBuiltIn"));

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
      setPromptStorageMessage(t("settings.message.savedBrowserSaving"));
      void syncAccountPreferences({ translationSystemPrompt: normalized }).then((ok) =>
        setPromptStorageMessage(ok ? t("settings.message.savedForEveryone") : t("settings.error.savedBrowserOnly")),
      );
    } catch {
      setPromptStorageMessage(t("settings.error.save"));
    }
  };

  const resetPromptToSafeDefault = () => {
    try {
      window.localStorage.removeItem(TRANSLATION_PROMPT_PREFERENCE_KEY);
      void syncAccountPreferences({ translationSystemPrompt: null });
      setTranslationSystemPrompt(DEFAULT_TRANSLATION_SYSTEM_PROMPT);
      setSavedPromptFingerprint("");
      setPromptStorageMessage(
        t("settings.message.restoredDefaults"),
      );
    } catch {
      setTranslationSystemPrompt(DEFAULT_TRANSLATION_SYSTEM_PROMPT);
      setPromptStorageMessage(
        t("settings.message.restoredDefaultsLocal"),
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
    setSanitizeLevel(active.sanitizeLevel);
    setFilterInappropriateLanguage(active.filterInappropriateLanguage);
    setPromptStorageMessage("");
  };

  const saveCaptionPreferences = () => {
    try {
      const serialized = JSON.stringify(style);
      window.localStorage.setItem(CAPTION_PREFERENCE_KEY, serialized);
      setSavedStyleFingerprint(serialized);
      setPreferenceError("");
      void syncAccountPreferences({ captionStyle: style }).then((ok) => {
        if (!ok) setPreferenceError(t("settings.error.savedBrowserOnly"));
      });
      if (liveState.channel?.configured) void saveChannelStyle();
    } catch {
      setPreferenceError(t("settings.error.save"));
    }
  };

  const styleSavedMessage =
    preferenceError ||
    (savedStyleFingerprint === styleFingerprint
      ? liveState.channel?.configured
        ? channelAction === "save-style"
          ? t("common.saving")
          : sharedStyleFingerprint === styleFingerprint
            ? t("settings.message.savedObsConfirmed")
            : t("settings.message.savedObsPending")
        : t("settings.message.savedForEveryone")
      : savedStyleFingerprint
        ? t("settings.message.unsaved")
        : t("settings.message.notSavedYet"));

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
        ? t("settings.message.savedForEveryone")
        : t("settings.message.unsaved")
      : translationSystemPrompt === DEFAULT_TRANSLATION_SYSTEM_PROMPT
        ? t("settings.message.usingDefaultInstructions")
        : t("settings.message.unsaved"));

  const translationEditorProps = {
    sourceLanguage,
    targetLanguage,
    disabled: translationEditorDisabled,
    defaultSourceLanguage: accountPreferences?.translationDefaults?.sourceLanguage ?? null,
    defaultTargetLanguage: accountPreferences?.translationDefaults?.targetLanguage ?? null,
    onSourceLanguageChange: setSourceLanguage,
    onTargetLanguageChange: setTargetLanguage,
  };

  const overlayUrlField = (
    <label>
      {t("liveOutputs.obsLink")}
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
      ? t("live.badge.needsAttention")
      : isRefreshing
        ? t("live.badge.applyingChanges")
        : isPaused
          ? t("live.badge.paused")
          : t("live.badge.onScreen")
    : anotherOperatorActive
      ? t("live.badge.fromAnotherComputer")
      : liveState.latestPublicText
        ? t("live.badge.testCaption")
        : t("live.badge.clear");
  const displayedTargetName = displayedTargetLabel ?? targetLanguage;

  const selectedMicrophone =
    devices.find((device) => device.deviceId === selectedDeviceId)?.label || t("live.defaultMicrophone");
  const recordingWindowShort = (value: RecordingWindowMs) => value === "dynamic"
    ? t("recordingWindow.dynamicShort")
    : t("recordingWindow.secondsShort", { seconds: value / 1_000 });
  const readinessChecks: ReadinessCheck[] = [
    {
      label: t("readiness.service"),
      ok: cloudState === "ready" || cloudState === "checking",
      value: cloudState === "ready" ? t("readiness.connected") : cloudState === "checking" ? t("common.checking") : t("readiness.notSetUp"),
      href: "#help",
      fixLabel: t("readiness.help"),
    },
    {
      label: t("readiness.microphone"),
      ok: microphoneState !== "error",
      value: microphoneState === "error" ? microphoneError || t("readiness.unavailable") : selectedMicrophone,
      href: "#settings=computer",
      fixLabel: t("readiness.fix"),
    },
    {
      label: t("readiness.languages"),
      ok: true,
      value: t("readiness.languagesValue", {
        source: displayedSourceLabel ?? sourceLanguage,
        target: displayedTargetName,
        speed: recordingWindowShort(hasService ? activeRecordingWindowMs : recordingWindowMs),
      }),
      href: "#settings=languages",
      fixLabel: t("readiness.fix"),
    },
    {
      label: t("readiness.words"),
      ok: true,
      value: translatePlural(locale, "readiness.wordCount", wordCount),
      href: "#settings=words",
      fixLabel: t("readiness.fix"),
    },
    {
      label: t("readiness.obs"),
      ok: channelConfigured || checkingChannel,
      value: checkingChannel ? t("common.checking") : channelConfigured ? t("readiness.setUp") : t("readiness.notSetUpYet"),
      href: "#settings=obs",
      fixLabel: t("readiness.setUp"),
    },
  ];
  const setupBlocked = readinessChecks.some((check) => !check.ok);

  const status: { label: OperatorStatusLabel; tone: StatusTone; detail?: string } = hasService
    ? liveState.status === "ending"
      ? { label: "ending", tone: "muted" }
      : liveNeedsAttention
        ? { label: "needsAttention", tone: "bad" }
        : isRefreshing
          ? { label: "applyingChanges", tone: "warn" }
          : isPaused
            ? { label: "paused", tone: "warn", detail: formatClock(elapsedServiceMs, locale) }
            : { label: "live", tone: "live", detail: formatClock(elapsedServiceMs, locale) }
    : anotherOperatorActive
      ? { label: "liveAnotherComputer", tone: "warn" }
      : setupBlocked || liveState.status === "error"
        ? { label: "notReady", tone: "bad" }
        : checkingChannel || cloudState === "checking"
          ? { label: "checking", tone: "muted" }
          : { label: "ready", tone: "ok" };

  const minutesLeft = Math.max(0, Math.ceil((MAX_LIVE_SESSION_MS - elapsedServiceMs) / 60_000));
  const translationChangeLabels = translationChanges.map((change) => {
    switch (change) {
      case "Spoken language": return t("translationChange.spokenLanguage");
      case "Translation language": return t("translationChange.translationLanguage");
      case "Recording window": return t("translationChange.recordingWindow");
      case "Terminology": return t("translationChange.terminology");
      case "Public filter": return t("translationChange.publicFilter");
      case "System prompt": return t("translationChange.systemPrompt");
      case "Inference level": return t("translationChange.inferenceLevel");
      case "Sanitization": return t("translationChange.sanitization");
      case "Inappropriate language filter": return t("translationChange.inappropriateLanguageFilter");
    }
  });
  const pendingBanner = hasPendingTranslationChanges ? (
    <div className="operatorBanner" role="status">
      <strong>{t("live.pendingTitle")}</strong>
      <span>
        {translationChangeLabels.length
          ? t("live.pendingBodyWithChanges", { changes: translationChangeLabels.join(t("common.listSeparator")) })
          : t("live.pendingBody")}
      </span>
      <button
        type="button"
        className="secondaryButton"
        disabled={translationChanges.length === 0 || translationActionBusy}
        onClick={restoreActiveTranslationDraft}
      >
        {t("live.undoChanges")}
      </button>
      <button
        type="button"
        className="primaryButton"
        disabled={translationActionBusy}
        onClick={() => void refreshTranslationSession()}
      >
        {translationActionBusy ? t("live.applying") : t("live.applyNow")}
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
          ? t("live.outputBufferSavedChoice")
          : t("live.outputBufferSavesForEveryone"))
      }
      disabled={isBusy}
      defaultCount={accountPreferences?.outputBufferCount ?? null}
      defaultDwellMs={accountPreferences?.outputBufferDwellMs ?? null}
    />
  );

  const liveScreen = (
    <main className="operatorScreen" id="main" aria-labelledby="screen-heading">
      <h1 id="screen-heading" ref={screenHeadingRef} tabIndex={-1} className="visuallyHidden">{t("live.title")}</h1>
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
          <strong>{t("live.otherOperatorTitle", { operator: runningOperator ?? t("live.otherOperatorDefault") })}</strong>
          <span>{observed.message || t("live.otherOperatorMessage")}</span>
          <button type="button" className="secondaryButton" disabled={isBusy || cloudState !== "ready"} onClick={() => takeoverDialogRef.current?.showModal()}>
            {t("live.takeOver")}
          </button>
        </div>
      ) : null}
      {pendingBanner}
      {liveState.historyIncomplete ? (
        <p className="operatorBanner" data-tone="warn" role="alert">
          {t("live.historyIncomplete")}
        </p>
      ) : null}

      <div className="liveGrid">
        <section className="operatorCard liveCaptions" aria-label={t("live.captionsCard")}>
          <div className="monitorGrid">
            <div className="monitorPane">
              <div className="monitorLabel"><span>{t("live.heard")}</span><span>{t("live.onlyYou")}</span></div>
              <p className="heardText" data-empty={!monitorSourceText} lang={displayedTranslationSettings?.sourceLanguage === "auto" ? undefined : displayedTranslationSettings?.sourceLanguage}>
                {monitorSourceText || (hasService ? (isPaused ? t("live.notListening") : t("live.listening")) : t("live.nothingYet"))}
              </p>
            </div>
            <div className="monitorPane">
              <div className="monitorLabel"><span>{t("live.audienceSees")}</span><span>{t("live.audienceMeta", { language: displayedTargetName })}</span></div>
              <CaptionPreview
                caption={monitorCaption}
                targetLanguage={monitorLanguage}
                style={liveState.channel?.style ?? style}
                badge={outputBadge}
                live={monitorLive}
              />
            </div>
          </div>
          {!observed.observer ? (
            <>
              <LiveDraftLine
                draft={liveDraft}
                enabled={liveDraftsEnabled}
                sessionDisabled={liveDraftSessionDisabled}
              />
              <div className="liveDraftSettings">
                <label className="switchControl">
                  <input
                    type="checkbox"
                    role="switch"
                    name="liveDraftsEnabled"
                    checked={liveDraftsEnabled}
                    aria-checked={liveDraftsEnabled}
                    aria-describedby={`live-drafts-help${liveDraftSessionDisabled ? " live-drafts-session-status" : ""}`}
                    disabled={isBusy}
                    onChange={(event) => {
                      if (!event.target.checked) resetLiveDrafts();
                      setLiveDraftsEnabled(event.target.checked);
                    }}
                  />
                  <span>
                    <strong>{t("live.draftsTitle")}</strong>
                  </span>
                </label>
                <p id="live-drafts-help" className="operatorHint">
                  {t("live.draftsHint")}
                </p>
                {liveDraftSessionDisabled ? (
                  <p id="live-drafts-session-status" className="operatorHint" data-tone="warn" role="status" aria-live="polite">
                    {t("live.draftsStopped")}
                  </p>
                ) : null}
                <button type="button" className="textButton" disabled={isBusy} onClick={saveLiveDraftsDefault}>{t("common.saveForEveryone")}</button>
                <p className="operatorHint" role="status" aria-live="polite">{liveDraftsSavedMessage || (accountPreferences?.liveDraftsEnabled !== null && accountPreferences?.liveDraftsEnabled !== undefined ? t("live.draftsSavedChoice") : t("live.draftsSavesForEveryone"))}</p>
              </div>
            </>
          ) : null}
          <div className="levelRow">
            <span>{t("live.microphone")}</span>
            <AudioLevelMeter level={level} />
          </div>
          {!observed.observer ? (
            <details className="advancedActions">
              <summary>{t("live.recentCaptions")}</summary>
              <RecentOutputsStrip outputs={recentOutputs} />
            </details>
          ) : null}
        </section>

        <ReadinessChecks title={hasService ? t("readiness.titleSetup") : setupBlocked ? t("readiness.titleBeforeStart") : t("readiness.titleReady")} checks={readinessChecks} />

        {!hasService ? (
          <section className="operatorCard liveActions" aria-label={t("live.startCard")}>
            <div className="startActions">
              <button
                type="button"
                className="primaryButton"
                disabled={startBlocked}
                aria-describedby="start-help"
                onClick={() => { shouldAutoSaveMetadata.current = true; setLiveNote(""); void startSession(); }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l13-7.5z" /></svg>
                {liveState.status === "starting" ? t("live.starting") : t("live.start")}
              </button>
              <button
                type="button"
                className="secondaryButton"
                disabled={!channelConfigured || isBusy || controlAction !== null || anotherOperatorActive}
                onClick={() => void showTestCaption()}
              >
                {controlAction === "show-test" ? t("common.showing") : t("liveOutputs.showTest")}
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
                <strong>{t("live.saveTranscript")}</strong>
                <br />
                <span className="operatorHint">{t("live.saveTranscriptHint", { workspace: WORKSPACE_NAME })}</span>
              </span>
            </label>
            <div className="buttonRow">
              {accountPreferences?.saveHistoryDefault !== saveHistory ? (
                <button className="textButton" type="button" disabled={isBusy} onClick={saveHistoryAsDefault}>
                  {t("live.makeDefault")}
                </button>
              ) : null}
              <p className="operatorHint" role="status" aria-live="polite">{saveHistoryDefaultMessage}</p>
            </div>
            <details className="advancedActions">
              <summary>{t("live.sessionDetails")}</summary>
              {!saveHistory ? <p className="settingHint">{t("live.sessionDetailsNeedsSaving")}</p> : null}
              <SessionMetadataFields value={sessionMetadata} disabled={!saveHistory || isBusy} onChange={(value) => {
                setSessionMetadata(value);
                if (value.sessionAt !== sessionMetadata.sessionAt) setSessionDateEdited(true);
              }} />
            </details>
            <details className="advancedActions">
              <summary>{t("live.checkBeforeShow")}</summary>
              {outputBufferPanel}
            </details>
          </section>
        ) : (
          <section className="operatorCard liveActions" aria-labelledby="quick-fixes-heading">
            <h2 id="quick-fixes-heading">{t("live.quickFixes")}</h2>
            <ManualOverridesGroup
              liveWordEntries={liveWordEntries}
              onAddLiveWord={addLiveWordEntry}
              onRemoveLiveWord={removeLiveWordEntry}
              onKeepLiveWordInWords={keepLiveWordInWords}
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
            <LiveNoteControl value={liveNote} disabled={!liveState.service || observed.observer !== null} onChange={setLiveNote} />
            {isPaused ? (
              <button type="button" className="secondaryButton" disabled={isBusy || controlAction !== null} onClick={() => void showTestCaption()}>
                {controlAction === "show-test" ? t("common.showing") : t("liveOutputs.showTest")}
              </button>
            ) : null}
            <details className="advancedActions">
              <summary>{t("live.sessionDetails")}</summary>
              {!liveState.service?.saveHistory ? <p className="settingHint">{t("live.sessionDetailsBeforeStart")}</p> : null}
              <SessionMetadataFields value={sessionMetadata} disabled={!liveState.service?.saveHistory || isBusy} onChange={setSessionMetadata} />
              <div className="buttonRow"><button type="button" className="secondaryButton" disabled={!liveState.service?.saveHistory || !liveState.service.serviceId || isBusy} onClick={() => void saveLiveSessionMetadata()}>{t("live.saveSessionDetails")}</button></div>
              <p className="settingHint" role="status" aria-live="polite">{sessionMetadataMessage}</p>
            </details>
            <details className="advancedActions">
              <summary>{t("live.checkBeforeShow")}</summary>
              {outputBufferPanel}
            </details>
            <details className="advancedActions">
              <summary>{t("live.serviceDetails")}</summary>
              <div className="statRow"><span>{t("live.delay")}</span><span>{liveState.lastLatencyMs === null ? "—" : t("live.seconds", { value: formatDecimal(liveState.lastLatencyMs / 1000, locale) })}</span></div>
              {activeTranslationSettings?.sanitizeLevel && activeTranslationSettings.sanitizeLevel !== "off" ? (
                <div className="statRow"><span>{t("live.filteredSegments")}</span><span>{formatCount(liveState.filteredSegments, locale)}</span></div>
              ) : null}
              <div className="statRow"><span>{t("live.droppedChunks")}</span><span>{formatCount(liveState.droppedChunks, locale)}</span></div>
              <div className="statRow"><span>{t("live.transcriptions")}</span><span>{formatCount(liveState.transcriptionRequests, locale)}</span></div>
              <div className="statRow"><span>{t("live.translationCalls")}</span><span>{formatCount(liveState.llmUsage.translationRequests, locale)}</span></div>
              <div className="statRow"><span>{t("live.translationTokens")}</span><span>{formatCount(liveState.llmUsage.totalTokens, locale)}</span></div>
              <div className="statRow"><span>{t("live.speechModel")}</span><span translate="no">{cloudModels?.transcription ?? "—"}</span></div>
              <div className="statRow"><span>{t("live.translationModel")}</span><span translate="no">{cloudModels?.translation ?? "—"}</span></div>
            </details>
          </section>
        )}

        <section className="operatorCard liveShare" aria-labelledby="share-heading">
          <h2 id="share-heading">{t("live.share")}</h2>
          <div className="shareRow">
            <span>
              <strong>{t("live.phoneViewer")}</strong>
              <br />
              <span className="operatorHint">{viewerUrl ? t("live.viewerReady") : t("common.afterStart")}</span>
            </span>
            <button type="button" className="secondaryButton" disabled={!viewerUrl} onClick={() => void copyViewerUrl()}>
              {viewerCopied ? t("common.copied") : t("common.copyLink")}
            </button>
          </div>
          <ServiceExperiencePanel view="sharing" service={liveState.service} observer={observed.observer} onReaderLink={rememberReaderLink} />
          <p className="operatorHint" role="status" aria-live="polite">{clipboardMessage}</p>
        </section>
      </div>
    </main>
  );

  const sermonsScreen = (
    <main className="operatorScreen" id="main" aria-labelledby="screen-heading">
      <header className="settingsHeader">
        <h1 id="screen-heading" ref={screenHeadingRef} tabIndex={-1}>{t("sermons.title")}</h1>
        <p className="settingHint">{t("sermons.hint", { workspace: WORKSPACE_NAME })}</p>
      </header>
      <ServiceExperiencePanel view="archive" service={liveState.service} onReaderLink={rememberReaderLink} summaryDefaults={summaryDefaults} />
    </main>
  );

  const currentSection = SETTINGS_SECTIONS.find(({ id }) => id === settingsSection) ?? SETTINGS_SECTIONS[0];
  const translationDefaultsStatus =
    translationDefaultsMessage ||
    (accountPreferences?.translationDefaults
      ? t("settings.translationDefaultsSaved")
      : t("settings.translationDefaultsUnsaved"));
  const settingsScreen = (
    <main className="operatorScreen" id="main" aria-labelledby="screen-heading">
      <h1 id="screen-heading" ref={screenHeadingRef} tabIndex={-1} className="visuallyHidden">{t("settings.title")}</h1>
      <div className="operatorColumns">
        <nav className="settingsNav" aria-label={t("settings.sectionsLabel")}>
          {SETTINGS_SECTIONS.map((section) => (
            <a
              key={section.id}
              href={`#settings=${section.id}`}
              aria-current={settingsSection === section.id ? "page" : undefined}
            >
              {t(section.titleKey)}
            </a>
          ))}
          <p className="operatorHint">{t("settings.scopeHint", { workspace: WORKSPACE_NAME })}</p>
        </nav>
        <section className="operatorCard settingsPanel" aria-labelledby="settings-section-heading">
          {currentSection.descriptionKey ? (
            <header className="settingsHeader">
              <h2 id="settings-section-heading">{t(currentSection.titleKey)}</h2>
              <p className="settingHint">{t(currentSection.descriptionKey)}</p>
            </header>
          ) : (
            <h2 id="settings-section-heading" className="visuallyHidden">{t(currentSection.titleKey)}</h2>
          )}
          {["languages", "words", "translator"].includes(settingsSection) ? pendingBanner : null}

          {settingsSection === "computer" ? (
            <>
              <AudioInputSection
                devices={devices}
                selectedDeviceId={selectedDeviceId}
                onDeviceChange={setSelectedDeviceId}
                disabled={isLive || isBusy}
                microphoneError={microphoneError}
                level={level}
                micTest={micTest}
              />
              {hasService && isLive ? (
                <p className="settingHint">{t("settings.pauseBeforeMicrophone")}</p>
              ) : null}
              <SettingGroup title={t("settings.appearance.title")} hint={t("settings.appearance.hint")}>
                <label>
                  <span className="visuallyHidden">{t("settings.appearance.title")}</span>
                  <select name="theme" autoComplete="off" value={theme} onChange={(event) => chooseTheme(event.target.value)}>
                    <option value="system">{t("settings.appearance.matchComputer")}</option>
                    <option value="light">{t("settings.appearance.light")}</option>
                    <option value="dark">{t("settings.appearance.dark")}</option>
                  </select>
                </label>
              </SettingGroup>
            </>
          ) : null}

          {settingsSection === "languages" ? (
            <>
              <SettingGroup title={t("settings.interfaceLanguage.title")} hint={t("settings.interfaceLanguage.hint")}>
                <label>
                  <span className="visuallyHidden">{t("settings.interfaceLanguage.title")}</span>
                  <select
                    name="uiLocale"
                    autoComplete="off"
                    value={uiLocalePreference ?? ""}
                    onChange={(event) => chooseUiLocale(event.target.value)}
                  >
                    <option value="">{t("settings.interfaceLanguage.matchBrowser")}</option>
                    <option value="en">{t("settings.interfaceLanguage.english")}</option>
                    <option value="id">{t("settings.interfaceLanguage.indonesian")}</option>
                  </select>
                </label>
              </SettingGroup>
              <TranslationSettingsEditor {...translationEditorProps} />
              <SaveBar onSave={saveTranslationDefaults} disabled={translationEditorDisabled} status={translationDefaultsStatus} />
            </>
          ) : null}

          {settingsSection === "words" ? (
            <>
              <WordsEditor
                keywordText={keywordText}
                filterText={filterText}
                disabled={translationEditorDisabled}
                onChange={(next) => {
                  setKeywordText(next.keywordText);
                  setFilterText(next.filterText);
                }}
              />
              <SaveBar onSave={saveTranslationDefaults} disabled={translationEditorDisabled} status={translationDefaultsStatus} />
            </>
          ) : null}

          {settingsSection === "look" ? (
            <>
              <SettingGroup
                title={t("settings.previewTitle")}
                hint={hasService
                  ? t("settings.previewLiveHint")
                  : t("settings.previewIdleHint")}
              >
                <CaptionPreview
                  caption={monitorCaption || SAMPLE_CAPTIONS[targetLanguage]}
                  targetLanguage={monitorCaption ? monitorLanguage : targetLanguage}
                  style={style}
                  badge={monitorCaption ? outputBadge : t("live.badge.sample")}
                  live={monitorLive}
                />
              </SettingGroup>
              <StyleEditor {...styleEditorProps} />
            </>
          ) : null}

          {settingsSection === "obs" ? (
            <LiveOutputsSection
              hasService={hasService}
              isBusy={isBusy}
              anotherOperatorActive={anotherOperatorActive}
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
            <>
              <CaptionWaitTimeEditor
                recordingWindowMs={recordingWindowMs}
                disabled={translationEditorDisabled}
                defaultRecordingWindowMs={accountPreferences?.translationDefaults?.recordingWindowMs ?? null}
                onRecordingWindowChange={setRecordingWindowMs}
              />
              <SaveBar onSave={saveTranslationDefaults} disabled={translationEditorDisabled} status={translationDefaultsStatus} />
              <PromptEditor
                value={translationSystemPrompt}
                sourceLanguage={sourceLanguage}
                targetLanguage={targetLanguage}
                inferenceLevel={inferenceLevel}
                defaultInferenceLevel={accountPreferences?.translationDefaults?.inferenceLevel ?? null}
                sanitizeLevel={sanitizeLevel}
                defaultSanitizeLevel={accountPreferences?.translationDefaults?.sanitizeLevel ?? null}
                filterInappropriateLanguage={filterInappropriateLanguage}
                onChange={updateTranslationSystemPrompt}
                onInferenceLevelChange={setInferenceLevel}
                onSanitizeLevelChange={setSanitizeLevel}
                onFilterInappropriateLanguageChange={setFilterInappropriateLanguage}
                onSaveBrowserDefault={savePromptBrowserDefault}
                onReset={resetPromptToSafeDefault}
                savedMessage={promptSavedMessage}
                disabled={translationEditorDisabled}
              />
            </>
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
              <AiUsageDashboard llmUsage={liveState.llmUsage} />
              <UsageHistory />
            </>
          ) : null}
        </section>
      </div>
    </main>
  );

  const helpScreen = (
    <main className="operatorScreen" id="main" aria-labelledby="screen-heading">
      <section className="operatorCard settingsPanel helpPanel">
      <header className="settingsHeader">
        <h1 id="screen-heading" ref={screenHeadingRef} tabIndex={-1}>{t("help.title")}</h1>
        <p className="settingHint">{t("help.intro")}</p>
      </header>
      <ol className="helpSteps">
        <li>{t("help.step1")}</li>
        <li>{t("help.step2.before")}{" "}<strong>{t("help.step2.label")}</strong>{" "}{t("help.step2.after")}</li>
        <li>{t("help.step3.before")}{" "}<strong>{t("live.start")}</strong>{" "}{t("help.step3.after")}</li>
        <li>{t("help.step4.before")}{" "}<strong>{t("live.phoneViewer")}</strong>{" "}{t("help.step4.after")}</li>
        <li>{t("help.step5.before")}{" "}<strong>{t("shell.controls.pause")}</strong>{" "}{t("help.step5.middle")}{" "}<strong>{t("shell.controls.clearScreen")}</strong>{" "}{t("help.step5.after")}</li>
        <li>{t("help.step6.before")}{" "}<strong>{t("dialog.endAction")}</strong>{" "}{t("help.step6.middle")}{" "}<strong>{t("sermons.title")}</strong>{t("help.step6.after")}</li>
      </ol>
      <p className="settingHint">
        {t("help.firstTime.before")}{" "}<a href="#settings=obs">{t("help.settingsObsLinks")}</a>{" "}{t("help.firstTime.after")}
      </p>
      <div className="buttonRow"><a className="primaryButton" href="#live">{t("help.backToLive")}</a></div>
      </section>
    </main>
  );

  return (
    <div className="operatorShell">
      <a className="skipLink" href="#main">{t("page.skipLink")}</a>
      <OperatorTopBar screen={screen} status={status} />
      {screen === "live" ? liveScreen : screen === "sermons" ? sermonsScreen : screen === "settings" ? settingsScreen : helpScreen}
      {hasService && screen === "live" ? (
        <LiveControlBar
          isPaused={isPaused}
          isPausing={liveState.status === "pausing"}
          isResuming={liveState.status === "resuming"}
          clearing={controlAction === "clear"}
          minutesLeft={minutesLeft}
          transcriptSaved={liveState.service?.saveHistory ?? false}
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
        title={t("dialog.endTitle")}
        body={t("dialog.endBody")}
        cancelLabel={t("dialog.keepGoing")}
        actionLabel={t("dialog.endAction")}
        disabled={endActionDisabled}
        onConfirm={() => void stopSession()}
      />
      <ConfirmDialog
        dialogRef={takeoverDialogRef}
        title={t("dialog.takeoverTitle")}
        body={t("dialog.takeoverBody", { operator: runningOperator ?? t("live.otherOperatorDefault") })}
        cancelLabel={t("dialog.keepWatching")}
        actionLabel={t("dialog.takeoverAction")}
        disabled={isBusy || cloudState !== "ready"}
        onConfirm={() => void startSession(true)}
        onCancel={cancelTakeover}
      />
    </div>
  );
}
