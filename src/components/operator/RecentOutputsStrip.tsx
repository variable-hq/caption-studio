"use client";
import type { RecentOutput } from "@/live/recent-outputs";

export function RecentOutputsStrip({ outputs }: { outputs: readonly RecentOutput[] }) {
  return <section className="recentOutputs" aria-label="Recent outputs">
    <h3>Recent outputs</h3>
    {!outputs.length ? <p className="settingHint">Published captions will appear here.</p> : <ol>
      {outputs.map((entry) => <li key={entry.id}>
        <time dateTime={new Date(entry.at).toISOString()}>{new Intl.DateTimeFormat(undefined, { timeStyle: "short" }).format(entry.at)}</time>
        {entry.hidden ? <p>Hidden by filter</p> : <p>{entry.publicText}</p>}
        <p className="settingHint">{entry.sourceText}</p>
      </li>)}
    </ol>}
  </section>;
}
