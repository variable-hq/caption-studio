"use client";
import { useEffect, useRef, useState } from "react";
import type { LiveObserverDetails, LiveServiceDetails } from "@/live/contracts";
import { experienceRequest, ExperienceRequestError } from "@/experience/client";
import { HISTORY_RETENTION, EMPTY_SESSION_METADATA, normalizeSessionMetadata, type SessionMetadata, type JournalState, type ReaderNote, type ReaderParagraph, type SourceRecord, type SummaryJob, type SummaryModel, type SummaryOptions } from "@/experience/contracts";
import { DEFAULT_SUMMARY_OPTIONS } from "@/experience/summary-defaults";
import { LANGUAGE_OPTIONS } from "@/domain/languages";
import { SettingGroup } from "@/components/operator/SettingsParts";
import { SessionMetadataFields } from "@/components/operator/SessionMetadataFields";

interface Archive { details: Omit<JournalState, "readerHash">; metadata: SessionMetadata; sources: SourceRecord[]; paragraphs: ReaderParagraph[]; notes: ReaderNote[]; summary: SummaryJob | null; more: boolean; moreParagraphs: boolean }
interface ServiceEntry { id: string; startedAt: number; metadata?: SessionMetadata }

export function ServiceExperiencePanel({ view, service, observer = null, onReaderLink, summaryDefaults = DEFAULT_SUMMARY_OPTIONS }: { view: "sharing" | "archive"; service: LiveServiceDetails | null; observer?: LiveObserverDetails | null; onReaderLink: (url: string) => void; summaryDefaults?: SummaryOptions }) {
  const [services, setServices] = useState<ServiceEntry[]>([]);
  const [archive, setArchive] = useState<Archive | null>(null);
  const [metadataDraft, setMetadataDraft] = useState<SessionMetadata>({ ...EMPTY_SESSION_METADATA });
  const [editingMetadata, setEditingMetadata] = useState(false);
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
  const [now, setNow] = useState(0);
  const archiveRetained = Boolean(archive && (archive.details.endedAt ?? archive.details.expiresAt) + HISTORY_RETENTION > now);
  useEffect(() => {
    const initial = setTimeout(() => setNow(Date.now()), 0);
    const interval = setInterval(() => setNow(Date.now()), 60_000);
    return () => { clearTimeout(initial); clearInterval(interval); };
  }, []);
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
    try { await work(); } catch (error) {
      if (error instanceof ExperienceRequestError && error.status === 410) { setArchive(null); setEditingMetadata(false); }
      // A network failure or a non-JSON reply (an HTML error page, a proxy) is a connection
      // problem, not a message to show verbatim.
      setMessage(error instanceof Error && !(error instanceof SyntaxError) && !(error instanceof TypeError) ? error.message : "Couldn’t reach the sermon store. Check the connection, then try again.");
    }
    finally { setBusy(false); }
  }
  const [loadedList, setLoadedList] = useState(false);
  async function loadList() {
    await perform(async () => {
      const result = await experienceRequest<{ services: ServiceEntry[] }>("history");
      setServices(result.services);
      setLoadedList(true);
    });
  }
  useEffect(() => {
    if (view !== "archive") return;
    const timeout = setTimeout(() => void loadList(), 0);
    return () => clearTimeout(timeout);
    // Loads once when Sermons opens; Refresh list reloads on demand.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);
  async function load(id: string) {
    const result = await experienceRequest<Archive>(`sermons/${id}/archive`);
    setArchive(result); setMetadataDraft(normalizeSessionMetadata(result.metadata)); setEditingMetadata(false); setReviewed(false); setCorrection(null);
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
    {view === "sharing" && <>
      <div className="shareRow">
        <span><strong>Sermon reader</strong><br /><span className="operatorHint">{service ? "Text to scroll and read on a phone" : "Available once you start"}</span></span>
        <button className="secondaryButton" disabled={!service || busy} onClick={() => {
          const current = readerLink && readerLink.serviceId === service?.serviceId ? readerLink.url : service?.readerUrl;
          if (current) { setIssuedLink({ serviceId: service!.serviceId!, url: current }); setMessage("Reader link ready to copy."); }
          else setConfirmation("reader");
        }}>Get link</button>
      </div>
      <div className="shareRow">
        <span><strong>Your phone as a remote</strong><br /><span className="operatorHint">{canPair ? "Pause, resume and clear from the stage" : "Available once you start"}</span></span>
        <button className="secondaryButton" disabled={!canPair || busy} onClick={() => void perform(async () => {
          const result = await experienceRequest<{ url: string }>("pair", {}, service?.controllerToken); setIssuedLink({ serviceId: pairedServiceId, url: result.url }); setMessage("Phone paired. Open the link on your phone; any phone paired before is unpaired.");
        })}>Pair phone</button>
      </div>
      {!service && observer && <p className="operatorHint">Another operator started this service. Your phone can still pause, resume and clear it; the reader link stays with them.</p>}
      {link && <label>Link to open on the phone<input name="experienceLink" autoComplete="off" spellCheck={false} readOnly value={link} />
        <button className="secondaryButton" onClick={() => void perform(async () => { await navigator.clipboard.writeText(link); setMessage("Link copied."); })}>Copy link</button></label>}
      {service && <details className="advancedActions"><summary>Reader link shared by mistake?</summary>
        <p className="operatorHint">Replacing it stops the old link straight away.</p>
        <button className="dangerOutlineButton" disabled={busy} onClick={() => setConfirmation("reader")}>Replace reader link</button></details>}
    </>}
    {view === "archive" && <div className="operatorColumns">
      <nav className="settingsNav sermonList" aria-label="Saved sermons">
        <div className="buttonRow"><button className="secondaryButton" disabled={busy} onClick={() => void loadList()}>Refresh list</button></div>
        {loadedList && !services.length && <p className="settingHint">No saved sermons yet.</p>}
        <div className="archiveList">{services.map((entry) => <button type="button" className="sermonListItem" key={entry.id} disabled={busy}
          aria-current={archive?.details.id === entry.id ? "page" : undefined}
          onClick={() => void perform(() => load(entry.id))}>{entry.metadata?.topic ? `${entry.metadata.topic} · ` : ""}{new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(entry.metadata?.sessionAt ?? entry.startedAt)}</button>)}</div>
      </nav>
      <section className="operatorCard settingsPanel" aria-labelledby="archive-heading">
        {!archive ? <>
          <header className="settingsHeader"><h2 id="archive-heading">{services.length ? "Choose a sermon" : "No saved sermons yet"}</h2>
            <p className="settingHint">{services.length ? "Pick one from the list to read its transcript and make a summary." : "Tick “Save the transcript” on the Live screen before you start a service. Saved sermons are kept for 7 days."}</p></header>
        </> : <>
        <header className="settingsHeader"><h2 id="archive-heading">{metadataDraft.topic || new Intl.DateTimeFormat(undefined, { dateStyle: "full", timeStyle: "short" }).format(metadataDraft.sessionAt ?? archive.details.startedAt)}</h2>
          <p className="settingHint">{metadataDraft.sessionAt !== null ? `${new Intl.DateTimeFormat(undefined, { dateStyle: "full", timeStyle: "short" }).format(metadataDraft.sessionAt)} · ` : ""}{archive.details.status === "ended" ? "Ended" : "Still running"} · kept until {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format((archive.details.endedAt ?? archive.details.expiresAt) + HISTORY_RETENTION)}</p></header>
        {editingMetadata ? <div className="experienceCard"><SessionMetadataFields value={metadataDraft} disabled={busy} onChange={setMetadataDraft} />
          <div className="buttonRow"><button type="button" className="secondaryButton" disabled={busy} onClick={() => { setMetadataDraft(normalizeSessionMetadata(archive.metadata)); setEditingMetadata(false); }}>Cancel</button>
            <button type="button" className="primaryButton" disabled={busy} onClick={() => void perform(async () => { const result = await experienceRequest<{ metadata: SessionMetadata }>(`sermons/${archive.details.id}/metadata`, normalizeSessionMetadata(metadataDraft)); setMetadataDraft(result.metadata); setArchive({ ...archive, metadata: result.metadata }); setEditingMetadata(false); })}>Save details</button></div></div>
          : <><div className="archiveMetadata">{metadataDraft.speaker ? <p><strong>Speaker</strong> {metadataDraft.speaker}</p> : null}{metadataDraft.description ? <p>{metadataDraft.description}</p> : null}</div>
            <button type="button" className="textButton" disabled={busy || !archive.details.saved || !archiveRetained} onClick={() => setEditingMetadata(true)}>Edit details</button></>}
        {archive.details.incomplete && <p className="operatorBanner" data-tone="warn">Parts of this service weren’t captured. Check the gaps in the transcript before sharing.</p>}
        <div className="buttonRow"><button className="secondaryButton" disabled={busy} onClick={() => void perform(() => load(archive.details.id))}>Refresh</button>
          <button className="secondaryButton" disabled={busy} onClick={() => void perform(async () => download("sermon-transcript.json", await allSources(archive.details.id)))}>Export transcript</button>
          <button className="dangerOutlineButton" disabled={busy || archive.details.status !== "ended"} onClick={() => setConfirmation("delete")}>Delete sermon</button></div>
        <SettingGroup title="AI summary" hint={<>{length === "detailed" ? "Detailed" : "Short"} · {LANGUAGE_OPTIONS.find((entry) => entry.locale === language)?.label ?? language}{guidance ? ` · ${guidance}` : ""}. <a href="#settings=summary">Change defaults</a></>}>
          <div className="buttonRow"><button className="primaryButton" disabled={busy || archive.details.status !== "ended" || ["queued", "running"].includes(archive.summary?.status ?? "")}
            onClick={() => void perform(async () => {
              if (summaryRequestRef.current?.serviceId !== archive.details.id) summaryRequestRef.current = { serviceId: archive.details.id, id: crypto.randomUUID() };
              await experienceRequest(`sermons/${archive.details.id}/summary`, { model, language, length, guidance, requestId: summaryRequestRef.current.id });
              summaryRequestRef.current = null;
              await load(archive.details.id);
            })}>Generate summary</button></div>
          {archive.summary && <div className="summaryDraft"><p className="settingHint" role="status">Summary {archive.summary.status}. {archive.summary.error}{archive.summary.automatic ? " Made automatically when the service ended." : ""}</p>
            {archive.summary.result?.map((point, index) => <p key={index}>{point.text} <small>Sources: {point.sourceIds.map((id) => <button key={id} type="button" className="textButton" onClick={() => void perform(async () => {
              const sources = archive.sources.some((source) => source.id === id) ? archive.sources : await allSources(archive.details.id);
              setArchive({ ...archive, sources });
              if (transcriptRef.current) transcriptRef.current.open = true;
              requestAnimationFrame(() => { const source = document.getElementById(`source-${id}`); source?.scrollIntoView({ block: "center" }); source?.focus({ preventScroll: true }); });
            })}>#{id}</button>)}</small></p>)}
            {archive.summary.status === "completed" && <><label className="checkLabel"><input type="checkbox" name="summaryReviewed" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} />I checked this summary against the transcript</label>
              <div className="buttonRow"><button className="secondaryButton" disabled={!reviewed} onClick={() => download("sermon-summary.json", { summary: archive.summary, reviewed: true })}>Export summary</button></div></>}
          </div>}
        </SettingGroup>
        <SettingGroup title="Transcript" hint="What was heard. Corrections stay private; to change what readers see, remove the passage below.">
          <details ref={transcriptRef} className="advancedActions"><summary>Show the transcript</summary><div className="archiveRecords">{archive.sources.map((source) => <article id={`source-${source.id}`} tabIndex={-1} key={source.id}>
            <p className="settingHint">{new Intl.DateTimeFormat(undefined, { timeStyle: "short" }).format(source.at)}{source.excluded ? " · Removed from summaries" : ""}</p>
            <p lang={source.language}>{source.correction ?? source.text}</p>
            <div className="buttonRow"><button type="button" className="secondaryButton" onClick={() => setCorrection({ id: source.id, text: source.correction ?? source.text })}>Correct</button></div>
          </article>)}</div>{archive.more && <div className="buttonRow"><button className="secondaryButton" disabled={busy} onClick={() => void perform(async () => {
            const sources = await allSources(archive.details.id); setArchive({ ...archive, sources, more: false });
          })}>Load full transcript</button></div>}</details>
          {correction && <div className="correctionEditor"><label>Corrected text<textarea name="sourceCorrection" autoComplete="off" value={correction.text} maxLength={4000} rows={4} onChange={(event) => setCorrection({ ...correction, text: event.target.value })} /></label>
            <p className="settingHint">Saving clears any summary made from this passage.</p>
            <div className="buttonRow"><button type="button" className="secondaryButton" onClick={() => setCorrection(null)}>Cancel</button>
              <button type="button" className="primaryButton" disabled={busy || !correction.text.trim()} onClick={() => void perform(async () => {
                await experienceRequest(`sermons/${archive.details.id}/correct`, correction); setCorrection(null); await load(archive.details.id);
              })}>Save correction</button></div></div>}
        </SettingGroup>
        <SettingGroup title="Reader passages" hint="What people with the reader link see.">
          <details className="advancedActions"><summary>Show reader passages</summary>{archive.paragraphs.filter((paragraph) => !paragraph.removed).map((paragraph) => <article key={paragraph.id} className="readerParagraph">
            <p>{paragraph.text}</p><div className="buttonRow"><button type="button" className="dangerOutlineButton" onClick={() => setConfirmation(`remove:${paragraph.id}`)}>Remove</button></div></article>)}{archive.moreParagraphs && <div className="buttonRow"><button className="secondaryButton" disabled={busy} onClick={() => void perform(async () => {
            const result = await experienceRequest<Archive>(`sermons/${archive.details.id}/archive?paragraphAfter=${archive.paragraphs.at(-1)?.id ?? 0}`);
            setArchive({ ...archive, paragraphs: [...archive.paragraphs, ...result.paragraphs], moreParagraphs: result.moreParagraphs });
          })}>Load more passages</button></div>}</details>
        </SettingGroup>
        {(archive.notes?.length ?? 0) > 0 && <SettingGroup title="Your messages" hint="Messages you showed during the service.">
          {archive.notes.map((note) => <p key={note.id} className="readerNote">{note.text}</p>)}
        </SettingGroup>}
        </>}
        <p className="settingHint" role="status" aria-live="polite">{busy ? "Working…" : message}</p>
      </section>
    </div>}
    <dialog ref={dialogRef} className="confirmationDialog" aria-labelledby="experience-confirm-heading" onCancel={() => setConfirmation(null)}><div>
      <h2 id="experience-confirm-heading">{confirmation === "reader" ? "Replace the reader link?" : confirmation === "delete" ? "Delete this sermon?" : "Remove this passage?"}</h2>
      <p>{confirmation === "reader" ? "The old reader link stops working straight away. Send the new one to readers." : confirmation === "delete" ? "The transcript, reader passages and summary are deleted for everyone. This can’t be undone." : "Readers stop seeing this passage and summaries leave it out. The original stays private until the sermon is deleted."}</p>
      <div className="confirmationRow"><button className="secondaryButton" disabled={busy} onClick={() => setConfirmation(null)}>{confirmation === "delete" ? "Keep it" : "Cancel"}</button>
        <button className="dangerButton" disabled={busy || (confirmation === "reader" && !service)} onClick={() => void perform(async () => {
          if (confirmation === "reader") { const result = await experienceRequest<{ url: string }>("reader-rotate", {}, service!.controllerToken); setIssuedLink({ serviceId: service!.serviceId!, url: result.url }); setReaderLink({ serviceId: service!.serviceId!, url: result.url }); onReaderLink(result.url); }
          else if (archive) {
            if (confirmation === "delete") { await experienceRequest(`sermons/${archive.details.id}/delete`, { confirm: true }); setServices(services.filter((entry) => entry.id !== archive.details.id)); setArchive(null); }
            else if (confirmation) { await experienceRequest(`sermons/${archive.details.id}/remove`, { id: Number(confirmation.split(":")[1]), confirm: true }); await load(archive.details.id); }
          }
          setConfirmation(null); setMessage("Done.");
        })}>{confirmation === "reader" ? "Replace link" : confirmation === "delete" ? "Delete sermon" : "Remove passage"}</button></div></div></dialog>
    {view === "sharing" && <p className="settingHint" role="status" aria-live="polite">{busy ? "Working…" : message}</p>}
  </div>;
}
