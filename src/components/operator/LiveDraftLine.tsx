"use client";

import type { LiveDraftPreview } from "@/live/use-live-drafts";

interface LiveDraftLineProps {
  draft: LiveDraftPreview | null;
}

export function LiveDraftLine({ draft }: LiveDraftLineProps) {
  if (!draft) return null;
  return (
    <div className="liveDraftLine" aria-live="polite">
      <div className="monitorLabel"><span>Draft, not yet shown to the audience</span></div>
      <p className="liveDraftPublic">{draft.publicText || "This draft is hidden by the caption filter."}</p>
      <p className="liveDraftSource">{draft.sourceText}</p>
    </div>
  );
}
