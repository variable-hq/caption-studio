"use client";

import type { LiveDraftPreview } from "@/live/use-live-drafts";

interface LiveDraftLineProps {
  draft: LiveDraftPreview | null;
  enabled: boolean;
  sessionDisabled: boolean;
}

export function LiveDraftLine({ draft, enabled, sessionDisabled }: LiveDraftLineProps) {
  if (!draft && (!enabled || sessionDisabled)) return null;
  if (!draft) {
    return (
      <div className="liveDraftLine liveDraftLineEmpty" aria-live="polite">
        <p className="liveDraftPlaceholder">
          Drafts appear while a longer recording window is in progress. 6s windows never draft.
        </p>
      </div>
    );
  }
  return (
    <div className="liveDraftLine" aria-live="polite">
      <div className="monitorLabel"><span>Draft, not yet shown to the audience</span></div>
      <p className="liveDraftPublic">{draft.publicText || "This draft is hidden by the caption filter."}</p>
      <p className="liveDraftSource">{draft.sourceText}</p>
    </div>
  );
}
