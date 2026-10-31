"use client";

import { useT } from "@/i18n/provider";
import type { LiveDraftPreview } from "@/live/use-live-drafts";

interface LiveDraftLineProps {
  draft: LiveDraftPreview | null;
  enabled: boolean;
  sessionDisabled: boolean;
}

export function LiveDraftLine({ draft, enabled, sessionDisabled }: LiveDraftLineProps) {
  const t = useT();
  if (!draft && (!enabled || sessionDisabled)) return null;
  if (!draft) {
    return (
      <div className="liveDraftLine liveDraftLineEmpty" aria-live="polite">
        <p className="liveDraftPlaceholder">
          {t("liveDraft.empty")}
        </p>
      </div>
    );
  }
  return (
    <div className="liveDraftLine" aria-live="polite">
      <div className="monitorLabel"><span>{t("liveDraft.label")}</span></div>
      <p className="liveDraftPublic">{draft.publicText || t("liveDraft.hidden")}</p>
      <p className="liveDraftSource">{draft.sourceText}</p>
    </div>
  );
}
