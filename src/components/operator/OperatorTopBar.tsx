"use client";

import { WORKSPACE_NAME } from "@/domain/workspace";
import { useI18n } from "@/i18n/provider";

export type OperatorScreenId = "live" | "transcripts" | "settings" | "help";

export type StatusTone = "ok" | "live" | "warn" | "bad" | "muted";
export type OperatorStatusLabel =
  | "ending"
  | "needsAttention"
  | "applyingChanges"
  | "paused"
  | "live"
  | "liveAnotherComputer"
  | "notReady"
  | "checking"
  | "ready";

const TABS: readonly { id: Exclude<OperatorScreenId, "help">; href: string }[] = [
  { id: "live", href: "#live" },
  { id: "transcripts", href: "#transcripts" },
  { id: "settings", href: "#settings" },
];

const TAB_MESSAGE_KEYS = {
  live: "shell.navigation.live",
  transcripts: "shell.navigation.transcripts",
  settings: "shell.navigation.settings",
} as const;

interface OperatorTopBarProps {
  screen: OperatorScreenId;
  /** `detail` (the running clock) is shown but not announced, so screen readers hear
   * each state change once instead of every second. */
  status: { label: OperatorStatusLabel; tone: StatusTone; detail?: string };
}

/** Brand, the one status pill, and the Live / Transcripts / Settings tabs. Tabs are links so
 * every screen has its own address and survives a refresh. */
export function OperatorTopBar({ screen, status }: OperatorTopBarProps) {
  const { t } = useI18n();
  const statusLabels: Record<OperatorStatusLabel, Parameters<typeof t>[0]> = {
    ending: "shell.status.ending",
    needsAttention: "shell.status.needsAttention",
    applyingChanges: "shell.status.applyingChanges",
    paused: "shell.status.paused",
    live: "shell.status.live",
    liveAnotherComputer: "shell.status.liveAnotherComputer",
    notReady: "shell.status.notReady",
    checking: "shell.status.checking",
    ready: "shell.status.ready",
  };
  return (
    <header className="operatorTopBar">
      <div className="operatorBrand">
        <span className="brandMark" aria-hidden="true" translate="no">{"CS"}</span>
        <span className="operatorBrandName">
          <strong translate="no">Caption Studio</strong>
          <span><span translate="no">{WORKSPACE_NAME}</span> · {t("shell.brand.mainChannel")}</span>
        </span>
        <span className="topStatus" data-tone={status.tone}>
          <span role="status" aria-live="polite">{t(statusLabels[status.label])}</span>
          {status.detail ? <span aria-hidden="true">· {status.detail}</span> : null}
        </span>
      </div>
      <nav className="operatorTabs" aria-label={t("shell.navigation.main")}>
        <div className="operatorTabList">
          {TABS.map((tab) => (
            <a
              key={tab.id}
              className="operatorTab"
              href={tab.href}
              aria-current={screen === tab.id ? "page" : undefined}
            >
              {t(TAB_MESSAGE_KEYS[tab.id])}
            </a>
          ))}
        </div>
        <a
          className="secondaryButton"
          href="#help"
          aria-label={t("shell.navigation.help")}
          aria-current={screen === "help" ? "page" : undefined}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9.5" />
            <path d="M9.5 9.5a2.5 2.5 0 0 1 4.9.7c0 1.7-2.4 2.2-2.4 3.8" />
            <path d="M12 17h.01" />
          </svg>
        </a>
      </nav>
    </header>
  );
}
