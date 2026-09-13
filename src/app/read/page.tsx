"use client";
import { useEffect, useRef, useState } from "react";
import { startSerialPolling } from "@/live/serial-polling";
import type { ReaderParagraph } from "@/experience/contracts";

export default function ReaderPage() {
  const [paragraphs, setParagraphs] = useState<ReaderParagraph[]>([]);
  const [status, setStatus] = useState("Connecting…");
  const [notice, setNotice] = useState("");
  const [size, setSize] = useState("comfortable");
  const [newText, setNewText] = useState(false);
  const following = useRef(true);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cancelled = false;
    let stopped = false;
    let after = 0;
    const credential = location.hash.slice(1);
    const onScroll = () => { following.current = document.documentElement.scrollHeight - innerHeight - scrollY < 150; };
    addEventListener("scroll", onScroll, { passive: true });
    const stop = startSerialPolling(async () => {
      if (stopped) return;
      try {
        const response = await fetch(`/api/live/reader?after=${after}`, {
          headers: { "x-caption-reader": credential }, cache: "no-store", signal: AbortSignal.timeout(8000),
        });
        if (cancelled) return;
        if ([403, 410].includes(response.status)) {
          stopped = true; setParagraphs([]); setStatus("Reader link expired or replaced");
          setNotice("Ask the operator for a current reader link."); return;
        }
        if (!response.ok) throw new Error("Connection lost. Reconnecting…");
        const value = await response.json() as { status: string; saved: boolean; paragraphs: ReaderParagraph[]; removed: number[] };
        if (cancelled) return;
        setStatus(value.status === "ended" ? "Service ended" : value.status === "paused" ? "Paused" : "Live · text arrives after about 30 seconds");
        setNotice(value.saved ? "Earlier paragraphs are available during this service and for 30 minutes after it ends."
          : "History saving is off. This page keeps received text only while it stays open; missed paragraphs cannot be recovered.");
        if (value.paragraphs.length) {
          after = Math.max(after, ...value.paragraphs.map((paragraph) => paragraph.id));
          if (!following.current) setNewText(true);
        }
        setParagraphs((old) => {
          const next = new Map(old.map((paragraph) => [paragraph.id, paragraph]));
          for (const paragraph of value.paragraphs) next.set(paragraph.id, paragraph);
          for (const id of value.removed) next.delete(id);
          return [...next.values()].filter((paragraph) => !paragraph.removed).sort((a, b) => a.id - b.id);
        });
      } catch { if (!cancelled) setStatus("Connection lost. Reconnecting…"); }
    }, 2000);
    return () => { cancelled = true; stop(); removeEventListener("scroll", onScroll); };
  }, []);
  useEffect(() => { if (following.current) end.current?.scrollIntoView({ block: "end" }); }, [paragraphs]);
  return <main className="experiencePage readerPage">
    <a className="skipLink" href="#reader-text">Skip to sermon text</a>
    <header className="experienceHeader"><p className="eyebrow">Church Live Caption</p><h1>Sermon reader</h1>
      <p role="status" aria-live="polite">{status}</p>
      <label>Text size<select name="readerTextSize" value={size} onChange={(event) => setSize(event.target.value)}>
        <option value="comfortable">Comfortable</option><option value="large">Large</option><option value="extra">Extra large</option>
      </select></label></header>
    <p className="helpText">{notice}</p>
    <section id="reader-text" tabIndex={-1} className={`readerText ${size}`} aria-label="Sermon paragraphs">
      {!paragraphs.length && <p className="emptyState">Waiting for the next readable paragraph…</p>}
      {paragraphs.map((paragraph, index) => <article className="readerParagraph" key={paragraph.id} lang={paragraph.language}>
        {(index === 0 || paragraphs[index - 1].translationRevision !== paragraph.translationRevision) && <p className="eyebrow">{paragraph.language} · Section {paragraph.translationRevision}</p>}
        <p>{paragraph.text}</p>{paragraph.fallback && <small>Original translated chunks · phrasing unavailable</small>}
      </article>)}<div ref={end} />
    </section>
    {newText && <button className="primaryButton returnToLive" onClick={() => { following.current = true; setNewText(false); end.current?.scrollIntoView({ block: "end" }); }}>New text · Return to live</button>}
  </main>;
}
