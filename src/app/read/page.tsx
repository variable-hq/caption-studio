"use client";
import { useEffect, useRef, useState } from "react";
import { startSerialPolling } from "@/live/serial-polling";
import type { ReaderNote, ReaderParagraph } from "@/experience/contracts";

export default function ReaderPage() {
  const [paragraphs, setParagraphs] = useState<ReaderParagraph[]>([]);
  const [notes, setNotes] = useState<ReaderNote[]>([]);
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
    if (!credential) {
      const explain = window.setTimeout(() => {
        setStatus("No reader link");
        setNotice("Open this page from the reader link the operator shares under Live outputs.");
      }, 0);
      return () => { cancelled = true; window.clearTimeout(explain); };
    }
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
        const value = await response.json() as { status: string; saved: boolean; paragraphs: ReaderParagraph[]; notes: ReaderNote[]; removed: number[] };
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
        setNotes((old) => {
          const next = new Map(old.map((note) => [note.id, note]));
          for (const note of value.notes ?? []) next.set(note.id, note);
          return [...next.values()];
        });
      } catch { if (!cancelled) setStatus("Connection lost. Reconnecting…"); }
    }, 2000);
    return () => { cancelled = true; stop(); removeEventListener("scroll", onScroll); };
  }, []);
  useEffect(() => { if (following.current) end.current?.scrollIntoView({ block: "end" }); }, [paragraphs, notes]);
  const items: Array<
    | { kind: "paragraph"; at: number; paragraph: ReaderParagraph; showEyebrow: boolean }
    | { kind: "note"; at: number; note: ReaderNote }
  > = [];
  let previousRevision: number | null = null;
  for (const paragraph of paragraphs) {
    items.push({ kind: "paragraph", at: paragraph.at, paragraph, showEyebrow: previousRevision === null || previousRevision !== paragraph.translationRevision });
    previousRevision = paragraph.translationRevision;
  }
  for (const note of notes) items.push({ kind: "note", at: note.at, note });
  items.sort((a, b) => a.at - b.at);
  return <main className="experiencePage readerPage">
    <a className="skipLink" href="#reader-text">Skip to sermon text</a>
    <header className="experienceHeader"><p className="eyebrow">Church Live Caption</p><h1>Sermon reader</h1>
      <p role="status" aria-live="polite">{status}</p>
      <label>Text size<select name="readerTextSize" value={size} onChange={(event) => setSize(event.target.value)}>
        <option value="comfortable">Comfortable</option><option value="large">Large</option><option value="extra">Extra large</option>
      </select></label></header>
    <p className="helpText">{notice}</p>
    <section id="reader-text" tabIndex={-1} className={`readerText ${size}`} aria-label="Sermon paragraphs">
      {!items.length && <p className="emptyState">Waiting for the next readable paragraph…</p>}
      {items.map((item) => item.kind === "note"
        ? <p className="readerNote" key={`note-${item.note.id}`} lang={item.note.language}><strong>Note from the operator:</strong> {item.note.text}</p>
        : <article className="readerParagraph" key={`paragraph-${item.paragraph.id}`} lang={item.paragraph.language}>
          {item.showEyebrow && <p className="eyebrow">{item.paragraph.language} · Section {item.paragraph.translationRevision}</p>}
          <p>{item.paragraph.text}</p>{item.paragraph.fallback && <small>Original translated chunks · phrasing unavailable</small>}
        </article>)}<div ref={end} />
    </section>
    {newText && <button className="primaryButton returnToLive" onClick={() => { following.current = true; setNewText(false); end.current?.scrollIntoView({ block: "end" }); }}>New text · Return to live</button>}
  </main>;
}
