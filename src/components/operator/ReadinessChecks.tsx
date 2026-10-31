"use client";

import { useT } from "@/i18n/provider";

export interface ReadinessCheck {
  label: string;
  ok: boolean;
  value: string;
  /** Settings section the action opens. */
  href: string;
  /** The button shown when the check fails, e.g. "Fix" or "Set up"; a passing check shows a chevron. */
  fixLabel: string;
}

interface ReadinessChecksProps {
  title: string;
  checks: readonly ReadinessCheck[];
}

/** The Live screen's setup list: one row per thing that must be right before Start, each
 * linking straight to the Settings section that fixes it. */
export function ReadinessChecks({ title, checks }: ReadinessChecksProps) {
  const t = useT();
  return (
    <section className="operatorCard" aria-labelledby="readiness-heading">
      <h2 id="readiness-heading">{title}</h2>
      <ul className="checkList">
        {checks.map((check) => (
          <li key={check.label}>
            {check.ok ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--ok-ink)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label={t("readiness.ready")}>
                <circle cx="12" cy="12" r="9.5" />
                <path d="M8 12.5l2.5 2.5L16 9.5" />
              </svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label={t("readiness.needsAttention")}>
                <circle cx="12" cy="12" r="9.5" />
                <path d="M12 7.5v5.5" />
                <path d="M12 16.5h.01" />
              </svg>
            )}
            <span className="checkText" data-ok={check.ok}>
              <span>{check.label}</span>
              <span>{check.value}</span>
            </span>
            {check.ok ? (
              <a className="rowLink" href={check.href} aria-label={t("readiness.change", { label: check.label })}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </a>
            ) : (
              <a className="primaryButton" href={check.href}>{check.fixLabel}</a>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
