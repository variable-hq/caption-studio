"use client";

import { WORKSPACE_NAME } from "@/domain/workspace";

export type OperatorScreenId = "live" | "sermons" | "settings" | "help";

export type StatusTone = "ok" | "live" | "warn" | "bad" | "muted";

const TABS: readonly { id: Exclude<OperatorScreenId, "help">; label: string; href: string }[] = [
  { id: "live", label: "Live", href: "#live" },
  { id: "sermons", label: "Sermons", href: "#sermons" },
  { id: "settings", label: "Settings", href: "#settings" },
];

interface OperatorTopBarProps {
  screen: OperatorScreenId;
  /** `detail` (the running clock) is shown but not announced, so screen readers hear
   * each state change once instead of every second. */
  status: { label: string; tone: StatusTone; detail?: string };
}

/** Brand, the one status pill, and the Live / Sermons / Settings tabs. Tabs are links so
 * every screen has its own address and survives a refresh. */
export function OperatorTopBar({ screen, status }: OperatorTopBarProps) {
  return (
    <header className="operatorTopBar">
      <div className="operatorBrand">
        <span className="brandMark" aria-hidden="true">CS</span>
        <span className="operatorBrandName">
          <strong translate="no">Caption Studio</strong>
          <span>{WORKSPACE_NAME} · Main channel</span>
        </span>
        <span className="topStatus" data-tone={status.tone}>
          <span role="status" aria-live="polite">{status.label}</span>
          {status.detail ? <span aria-hidden="true">· {status.detail}</span> : null}
        </span>
      </div>
      <nav className="operatorTabs" aria-label="Main">
        <div className="operatorTabList">
          {TABS.map((tab) => (
            <a
              key={tab.id}
              className="operatorTab"
              href={tab.href}
              aria-current={screen === tab.id ? "page" : undefined}
            >
              {tab.label}
            </a>
          ))}
        </div>
        <a
          className="secondaryButton"
          href="#help"
          aria-label="Help"
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
