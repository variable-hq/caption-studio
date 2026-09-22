"use client";
import { useEffect, useRef, useState } from "react";
import type { LiveObserverDetails, LiveServiceDetails } from "@/live/contracts";
import { experienceRequest } from "@/experience/client";
import { HISTORY_RETENTION, SUMMARY_MODELS, type JournalState, type ReaderNote, type ReaderParagraph, type SourceRecord, type SummaryJob, type SummaryModel, type SummaryOptions } from "@/experience/contracts";
import { DEFAULT_SUMMARY_OPTIONS } from "@/experience/summary-defaults";
import { LANGUAGE_OPTIONS } from "@/domain/languages";
import { WORKSPACE_NAME } from "@/domain/workspace";

interface Archive { details: Omit<JournalState, "readerHash">; sources: SourceRecord[]; paragraphs: ReaderParagraph[]; notes: ReaderNote[]; summary: SummaryJob | null; more: boolean; moreParagraphs: boolean }
interface ServiceEntry { id: string; startedAt: number }

export function ServiceExperiencePanel({ view, service, observer = null, onReaderLink, summaryDefaults = DEFAULT_SUMMARY_OPTIONS }: { view: "sharing" | "archive"; service: LiveServiceDetails | null; observer?: LiveObserverDetails | null; onReaderLink: (url: string) => void; summaryDefaults?: SummaryOptions }) {
  const [services, setServices] = useState<ServiceEntry[]>([]);
  const [archive, setArchive] = useState<Archive | null>(null);
  const [issuedLink, setIssuedLink] = useState<{ serviceId: string; url: string } | null>(null);
  const [readerLink, setReaderLink] = useState<{ serviceId: string; url: string } | null>(null);
  // Pairing works for every workspace operator, so the running service may be
  // one this browser only watches. A controller can pair whether or not its start
  // response carried the service id.
  const canPair = Boolean(service || observer?.serviceId);
  const pairedServiceId = service?.serviceId ?? observer?.serviceId ?? "";
  const link = issuedLink?.serviceId === pairedServiceId ? issuedLink?.url : "";
  const dialogRef = useRef<HTMLDialogElement>(null);
  const transcriptRef = useRef<HTMLDetailsElement>(null);
  const summaryRequestRef = useRef<{ serviceId: string; id: string } | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [model, setModel] = useState<SummaryModel>(summaryDefaults.model);
  const [language, setLanguage] = useState(summaryDefaults.language);
  const [length, setLength] = useState<string>(summaryDefaults.length);
  const [guidance, setGuidance] = useState(summaryDefaults.guidance);
  const [appliedDefaults, setAppliedDefaults] = useState(summaryDefaults);
  if (appliedDefaults !== summaryDefaults) {
    // Derived state: new browser defaults replace the untouched prefill during render.
    setAppliedDefaults(summaryDefaults);
    setModel(summaryDefaults.model); setLanguage(summaryDefaults.language);
    setLength(summaryDefaults.length); setGuidance(summaryDefaults.guidance);
  }
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [correction, setCorrection] = useState<{ id: number; text: string } | null>(null);
  const [reviewed, setReviewed] = useState(false);
  useEffect(() => {
    if (confirmation) dialogRef.current?.showModal();
    else dialogRef.current?.close();
  }, [confirmation]);
  useEffect(() => {
    const id = archive?.details.id;
    if (!id || !["queued", "running"].includes(archive.summary?.status ?? "")) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const result = await experienceRequest<Archive>(`sermons/${id}/archive`);
        if (!stopped) setArchive((old) => old?.details.id === id ? { ...old, details: result.details, summary: result.summary } : old);
      } catch { if (!stopped) setMessage("Summary status unavailable. Refresh archive to retry."); }
      if (!stopped) timer = setTimeout(() => void poll(), 5000);
    };
    timer = setTimeout(() => void poll(), 5000);
    return () => { stopped = true; clearTimeout(timer); };
  }, [archive?.details.id, archive?.summary?.status]);
  async function perform(work: () => Promise<void>) {
    if (busy) return; setBusy(true); setMessage("");
    try { await work(); } catch (error) { setMessage(error instanceof Error ? error.message : "Request failed. Retry."); }
    finally { setBusy(false); }
  }
  async function load(id: string) {
    const result = await experienceRequest<Archive>(`sermons/${id}/archive`);
    setArchive(result); setReviewed(false); setCorrection(null);
  }
  async function allSources(id: string) {
    const sources: SourceRecord[] = []; let after = 0;
    for (let page = 0; page < 19; page++) {
      const result = await experienceRequest<Archive>(`sermons/${id}/archive?after=${after}`);
      sources.push(...result.sources);
      if (result.sources.length < 50) return sources;
      after = result.sources.at(-1)!.id;
    }
    throw new Error("Transcript exceeded its service bound.");
  }
  function download(name: string, content: unknown) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(content, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <div className="experienceStack">
    {view === "sharing" && <section className="experienceCard"><h3>Reader and remote control</h3>
      <p>The reader appends shared translated paragraphs. The operator phone controls the capture computer.</p>
      {!canPair && <p className="privacyNote">Start captions to share the reader and pair your phone. Keep the capture computer open during the service.</p>}
      {!service && observer && <p className="privacyNote">Another operator runs this service. Your phone can still pause, resume and clear it; the reader link stays with the operator who started it.</p>}
      <div className="buttonGrid">
        <button className="secondaryButton" disabled={!canPair || busy} onClick={() => void perform(async () => {
          const result = await experienceRequest<{ url: string }>("pair", {}, service?.controllerToken); setIssuedLink({ serviceId: pairedServiceId, url: result.url }); setMessage("Remote pairing created. Your earlier pairing is replaced.");
        })}>Pair operator phone</button>
        <button className="secondaryButton" disabled={!service || busy} onClick={() => {
          const current = readerLink && readerLink.serviceId === service?.serviceId ? readerLink.url : service?.readerUrl;
          if (current) { setIssuedLink({ serviceId: service!.serviceId!, url: current }); setMessage("Reader link ready to copy."); }
          else setConfirmation("reader");
        }}>Get reader link</button>
        <button className="secondaryButton" disabled={!service || busy} onClick={() => setConfirmation("reader")}>Replace reader link</button>
      </div>
      {link && <label>Private link for intended recipients<input name="experienceLink" autoComplete="off" spellCheck={false} readOnly value={link} />
        <button className="secondaryButton" onClick={() => void perform(async () => { await navigator.clipboard.writeText(link); setMessage("Link copied."); })}>Copy link</button></label>}
    </section>}
    {view === "archive" && <section className="experienceCard"><h3>Saved sermons</h3><p>Every saved transcript and sermon in {WORKSPACE_NAME} is open to every signed-in operator here, never to the audience. They expire seven days after End. Saving must be enabled before Start.</p>
      <button className="secondaryButton" disabled={busy} onClick={() => void perform(async () => {
        const result = await experienceRequest<{ services: ServiceEntry[] }>("history"); setServices(result.services);
        if (!result.services.length) setMessage("No saved sermons in the retention window.");
      })}>Load saved sermons</button>
      <div className="archiveList">{services.map((entry) => <button className="secondaryButton" key={entry.id} disabled={busy}
        onClick={() => void perform(() => load(entry.id))}>{new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(entry.startedAt)}</button>)}</div>
    </section>}
    {view === "archive" && archive && <section className="experienceCard" aria-labelledby="archive-heading"><h3 id="archive-heading">Sermon archive</h3>
      <p>{archive.details.status} · {archive.details.incomplete ? "History incomplete: review gaps" : "Review transcript coverage before sharing"}</p>
      <p className="helpText">Deletes {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format((archive.details.endedAt ?? archive.details.expiresAt) + HISTORY_RETENTION)}. Bible context: Indonesian TB2, approved names only; exact verse text is not imported.</p>
      <div className="buttonGrid"><button className="secondaryButton" disabled={busy} onClick={() => void perform(() => load(archive.details.id))}>Refresh archive</button>
        <button className="secondaryButton" disabled={busy} onClick={() => void perform(async () => download("sermon-transcript.json", await allSources(archive.details.id)))}>Export transcript</button>
        <button className="dangerButton" disabled={busy || archive.details.status !== "ended"} onClick={() => setConfirmation("delete")}>Delete saved sermon</button></div>
      <details ref={transcriptRef}><summary>Review transcript and corrections</summary><div className="archiveRecords">{archive.sources.map((source) => <article id={`source-${source.id}`} tabIndex={-1} key={source.id}>
        <p><strong>Segment {source.id}</strong> · {new Intl.DateTimeFormat(undefined, { timeStyle: "short" }).format(source.at)}{source.excluded ? " · Excluded" : ""}</p>
        <p lang={source.language}>{source.correction ?? source.text}</p>
        <button className="textButton" onClick={() => setCorrection({ id: source.id, text: source.correction ?? source.text })}>Review correction</button>
      </article>)}</div>{archive.more && <button className="secondaryButton" disabled={busy} onClick={() => void perform(async () => {
        const sources = await allSources(archive.details.id); setArchive({ ...archive, sources, more: false });
      })}>Load full transcript</button>}</details>
      <details><summary>Review reader passages</summary>{archive.paragraphs.filter((paragraph) => !paragraph.removed).map((paragraph) => <article key={paragraph.id} className="readerParagraph">
        <p>{paragraph.text}</p><button className="dangerButton" onClick={() => setConfirmation(`remove:${paragraph.id}`)}>Remove passage</button></article>)}{archive.moreParagraphs && <button className="secondaryButton" disabled={busy} onClick={() => void perform(async () => {
        const result = await experienceRequest<Archive>(`sermons/${archive.details.id}/archive?paragraphAfter=${archive.paragraphs.at(-1)?.id ?? 0}`);
        setArchive({ ...archive, paragraphs: [...archive.paragraphs, ...result.paragraphs], moreParagraphs: result.moreParagraphs });
      })}>Load more reader passages</button>}</details>
      {(archive.notes?.length ?? 0) > 0 && <details><summary>Operator notes ({archive.notes.length})</summary>{archive.notes.map((note) => <article key={note.id} className="readerNote">
        <p>{note.text}</p></article>)}</details>}
      {correction && <div className="experienceCard"><label>Reviewed source correction<textarea name="sourceCorrection" autoComplete="off" value={correction.text} maxLength={4000} rows={4} onChange={(event) => setCorrection({ ...correction, text: event.target.value })} /></label>
        <p>Original source stays private. Saving invalidates derived summaries; committed reader text needs a separate removal.</p>
        <div className="buttonGrid"><button className="secondaryButton" onClick={() => setCorrection(null)}>Cancel correction</button>
          <button className="primaryButton" disabled={busy || !correction.text.trim()} onClick={() => void perform(async () => {
            await experienceRequest(`sermons/${archive.details.id}/correct`, correction); setCorrection(null); await load(archive.details.id);
          })}>Save reviewed correction</button></div></div>}
      <h3>Summary assistant</h3><div className="fieldGrid">
        <label>Summary model<select name="summaryModel" value={model} onChange={(event) => setModel(event.target.value as SummaryModel)}>{SUMMARY_MODELS.map((entry) => <option key={entry} value={entry}>{entry.includes("70b") ? "Llama 3.3 70B · Cloudflare" : "Llama 3.1 8B · Cloudflare"}</option>)}</select></label>
        <label>Summary language<select name="summaryLanguage" value={language} onChange={(event) => setLanguage(event.target.value)}>{LANGUAGE_OPTIONS.map((entry) => <option key={entry.locale} value={entry.locale}>{entry.label}</option>)}</select></label>
        <label>Summary length<select name="summaryLength" value={length} onChange={(event) => setLength(event.target.value)}><option value="short">Short</option><option value="detailed">Detailed</option></select></label></div>
      <label>Summary guidance<textarea name="summaryGuidance" autoComplete="off" rows={4} maxLength={2000} value={guidance} onChange={(event) => setGuidance(event.target.value)} placeholder="Emphasize main points and speaker-stated applications…" /></label>
      <p className="helpText">Prefilled from the AI summary settings; change tone and sections here for this request. Source grounding stays fixed. Generation uses separate AI quota; long sermons can require several calls.</p>
      <button className="primaryButton" disabled={busy || archive.details.status !== "ended" || ["queued", "running"].includes(archive.summary?.status ?? "")}
        onClick={() => void perform(async () => {
          if (summaryRequestRef.current?.serviceId !== archive.details.id) summaryRequestRef.current = { serviceId: archive.details.id, id: crypto.randomUUID() };
          await experienceRequest(`sermons/${archive.details.id}/summary`, { model, language, length, guidance, requestId: summaryRequestRef.current.id });
          summaryRequestRef.current = null;
          await load(archive.details.id);
        })}>Generate summary</button>
      {archive.summary && <div className="summaryDraft"><p role="status">Summary: {archive.summary.status}. {archive.summary.error}</p>
        {archive.summary.result?.map((point, index) => <p key={index}>{point.text} <small>Sources: {point.sourceIds.map((id) => <button key={id} className="textButton" onClick={() => void perform(async () => {
          const sources = archive.sources.some((source) => source.id === id) ? archive.sources : await allSources(archive.details.id);
          setArchive({ ...archive, sources });
          if (transcriptRef.current) transcriptRef.current.open = true;
          requestAnimationFrame(() => { const source = document.getElementById(`source-${id}`); source?.scrollIntoView({ block: "center" }); source?.focus({ preventScroll: true }); });
        })}>#{id}</button>)}</small></p>)}
        {archive.summary.status === "completed" && <><label className="checkLabel"><input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} />I reviewed this summary against the transcript.</label>
          <button className="secondaryButton" disabled={!reviewed} onClick={() => download("sermon-summary.json", { summary: archive.summary, reviewed: true })}>Export reviewed summary</button></>}
      </div>}
    </section>}
    <dialog ref={dialogRef} className="experienceCard confirmation" aria-labelledby="experience-confirm-heading" onCancel={() => setConfirmation(null)}><div>
      <h3 id="experience-confirm-heading">{confirmation === "reader" ? "Replace reader link?" : confirmation === "delete" ? "Delete this saved sermon?" : "Remove this passage?"}</h3>
      <p>{confirmation === "reader" ? "Existing reader links will stop working." : confirmation === "delete" ? "Transcript, paragraphs, summaries and pending jobs will be deleted. Usage totals remain." : "This removes the public paragraph and excludes its sources from summaries. Private originals remain until deletion."}</p>
      <div className="buttonGrid"><button className="secondaryButton" disabled={busy} onClick={() => setConfirmation(null)}>Cancel</button>
        <button className="dangerButton" disabled={busy || (confirmation === "reader" && !service)} onClick={() => void perform(async () => {
          if (confirmation === "reader") { const result = await experienceRequest<{ url: string }>("reader-rotate", {}, service!.controllerToken); setIssuedLink({ serviceId: service!.serviceId!, url: result.url }); setReaderLink({ serviceId: service!.serviceId!, url: result.url }); onReaderLink(result.url); }
          else if (archive) {
            if (confirmation === "delete") { await experienceRequest(`sermons/${archive.details.id}/delete`, { confirm: true }); setServices(services.filter((entry) => entry.id !== archive.details.id)); setArchive(null); }
            else if (confirmation) { await experienceRequest(`sermons/${archive.details.id}/remove`, { id: Number(confirmation.split(":")[1]), confirm: true }); await load(archive.details.id); }
          }
          setConfirmation(null); setMessage("Change confirmed.");
        })}>Confirm change</button></div></div></dialog>
    <p role="status" aria-live="polite">{busy ? "Working…" : message}</p>
  </div>;
}
