"use client";
import { useEffect, useRef, useState } from "react";
import { startSerialPolling } from "@/live/serial-polling";
import type { ReaderNote, ReaderParagraph } from "@/experience/contracts";
import { translate, type MessageKey, type MessageParams, type UiLocale } from "@/i18n";

export default function ReaderPage({ locale }: { locale: UiLocale }) {
  const t = (key: MessageKey, params?: MessageParams) => translate(locale, key, params);
  const [paragraphs, setParagraphs] = useState<ReaderParagraph[]>([]);
  const [notes, setNotes] = useState<ReaderNote[]>([]);
  const [status, setStatus] = useState<MessageKey>("reader.status.connecting");
  const [notice, setNotice] = useState<MessageKey | null>(null);
  const [size, setSize] = useState("comfortable");
  const [newText, setNewText] = useState(false);
  const following = useRef(true);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  useEffect(() => {
    let cancelled = false;
    let stopped = false;
    let after = 0;
    const credential = location.hash.slice(1);
    if (!credential) {
      const explain = window.setTimeout(() => {
        setStatus("reader.status.noLink");
        setNotice("reader.notice.noLink");
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
          stopped = true; setParagraphs([]); setStatus("reader.status.expired");
          setNotice("reader.notice.expired"); return;
        }
        if (!response.ok) throw new Error("reader.status.connectionLost");
        const value = await response.json() as { status: string; saved: boolean; paragraphs: ReaderParagraph[]; notes: ReaderNote[]; removed: number[] };
        if (cancelled) return;
        setStatus(value.status === "ended" ? "reader.status.ended" : value.status === "paused" ? "reader.status.paused" : "reader.status.live");
        setNotice(value.saved ? "reader.notice.saved" : "reader.notice.unsaved");
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
      } catch { if (!cancelled) setStatus("reader.status.connectionLost"); }
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
    <a className="skipLink" href="#reader-text">{t("reader.skipLink")}</a>
    <header className="experienceHeader"><p className="eyebrow">Caption Studio</p><h1>{t("reader.title")}</h1>
      <p role="status" aria-live="polite">{t(status)}</p>
      <label>{t("reader.textSize")}<select name="readerTextSize" value={size} onChange={(event) => setSize(event.target.value)}>
        <option value="comfortable">{t("reader.size.comfortable")}</option><option value="large">{t("reader.size.large")}</option><option value="extra">{t("reader.size.extra")}</option>
      </select></label></header>
    <p className="helpText">{notice ? t(notice) : ""}</p>
    <section id="reader-text" tabIndex={-1} className={`readerText ${size}`} aria-label={t("reader.paragraphsLabel")}>
      {!items.length && <p className="emptyState">{t("reader.empty")}</p>}
      {items.map((item) => item.kind === "note"
        ? <p className="readerNote" key={`note-${item.note.id}`} lang={item.note.language}><strong>{t("reader.noteLabel")}</strong> {item.note.text}</p>
        : <article className="readerParagraph" key={`paragraph-${item.paragraph.id}`} lang={item.paragraph.language}>
          {item.showEyebrow && <p className="eyebrow">{t("reader.section", { language: item.paragraph.language, section: item.paragraph.translationRevision })}</p>}
          <p>{item.paragraph.text}</p>{item.paragraph.fallback && <small>{t("reader.fallback")}</small>}
        </article>)}<div ref={end} />
    </section>
    {newText && <button className="primaryButton returnToLive" onClick={() => { following.current = true; setNewText(false); end.current?.scrollIntoView({ block: "end" }); }}>{t("reader.newText")}</button>}
  </main>;
}
