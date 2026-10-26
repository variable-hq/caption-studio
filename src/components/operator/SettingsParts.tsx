"use client";

import type { ReactNode } from "react";

/**
 * The building blocks every Settings section uses, so all sections share one rhythm:
 * a titled group per decision, separated by a hairline, then one save bar.
 */
export function SettingGroup({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <section className="settingGroup">
      <h3>{title}</h3>
      {hint ? <p className="settingHint">{hint}</p> : null}
      {children}
    </section>
  );
}

export function SaveBar({ onSave, disabled = false, status, label = "Save for everyone" }: {
  onSave: () => void;
  disabled?: boolean;
  status: string;
  label?: string;
}) {
  return (
    <div className="saveBar">
      <button type="button" className="primaryButton" disabled={disabled} onClick={onSave}>
        {label}
      </button>
      <p className="settingHint" role="status" aria-live="polite">{status}</p>
    </div>
  );
}
