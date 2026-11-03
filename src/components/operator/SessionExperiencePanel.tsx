"use client";
import { useEffect, useRef, useState } from "react";
import type { LiveObserverDetails, LiveSessionDetails } from "@/live/contracts";
import { experienceRequest, ExperienceRequestError } from "@/experience/client";
import { HISTORY_RETENTION, EMPTY_SESSION_METADATA, normalizeSessionMetadata, type SessionMetadata, type JournalState, type ReaderNote, type ReaderParagraph, type SourceRecord, type SummaryJob, type SummaryModel, type SummaryOptions } from "@/experience/contracts";
import { DEFAULT_SUMMARY_OPTIONS } from "@/experience/summary-defaults";
import { LANGUAGE_OPTIONS } from "@/domain/languages";
import { SettingGroup } from "@/components/operator/SettingsParts";
import { SessionMetadataFields } from "@/components/operator/SessionMetadataFields";
import type { MessageKey } from "@/i18n";
import { useI18n } from "@/i18n/provider";

interface Archive { details: Omit<JournalState, "readerHash">; metadata: SessionMetadata; sources: SourceRecord[]; paragraphs: ReaderParagraph[]; notes: ReaderNote[]; summary: SummaryJob | null; more: boolean; moreParagraphs: boolean }
interface SessionEntry { id: string; startedAt: number; metadata?: SessionMetadata }

type PanelMessage = { key: MessageKey } | { text: string } | null;

export function SessionExperiencePanel({ view, liveSession, observer = null, onReaderLink, summaryDefaults = DEFAULT_SUMMARY_OPTIONS }: { view: "sharing" | "archive"; liveSession: LiveSessionDetails | null; observer?: LiveObserverDetails | null; onReaderLink: (url: string) => void; summaryDefaults?: SummaryOptions }) {
  const { locale, t } = useI18n();
  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [archive, setArchive] = useState<Archive | null>(null);
  const [metadataDraft, setMetadataDraft] = useState<SessionMetadata>({ ...EMPTY_SESSION_METADATA });
  const [editingMetadata, setEditingMetadata] = useState(false);
  const [issuedLink, setIssuedLink] = useState<{ sessionId: string; url: string } | null>(null);
  const [readerLink, setReaderLink] = useState<{ sessionId: string; url: string } | null>(null);
  // Pairing works for every workspace operator, so the running session may be
  // one this browser only watches. A controller can pair whether or not its start
  // response carried the session id.
  const canPair = Boolean(liveSession || observer?.sessionId);
  const pairedSessionId = liveSession?.sessionId ?? observer?.sessionId ?? "";
  const link = issuedLink?.sessionId === pairedSessionId ? issuedLink?.url : "";
  const dialogRef = useRef<HTMLDialogElement>(null);
  const transcriptRef = useRef<HTMLDetailsElement>(null);
  const summaryRequestRef = useRef<{ sessionId: string; id: string } | null>(null);
  const [message, setMessage] = useState<PanelMessage>(null);
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
  const dateTime = (value: number, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, options).format(value);
  const summaryState = (status: string) => {
    const key = `sessionExperience.summaryState.${status}` as MessageKey;
    return status in SUMMARY_STATE_KEYS ? t(key) : status;
  };
  const messageText = message === null ? "" : "text" in message ? message.text : t(message.key);
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
        const result = await experienceRequest<Archive>(`transcripts/${id}/archive`);
        if (!stopped) setArchive((old) => old?.details.id === id ? { ...old, details: result.details, summary: result.summary } : old);
      } catch { if (!stopped) setMessage({ key: "sessionExperience.summaryStatusUnavailable" }); }
      if (!stopped) timer = setTimeout(() => void poll(), 5000);
    };
    timer = setTimeout(() => void poll(), 5000);
    return () => { stopped = true; clearTimeout(timer); };
  }, [archive?.details.id, archive?.summary?.status]);
  async function perform(work: () => Promise<void>) {
    if (busy) return; setBusy(true); setMessage(null);
    try { await work(); } catch (error) {
      if (error instanceof ExperienceRequestError && error.status === 410) { setArchive(null); setEditingMetadata(false); }
      // A network failure or a non-JSON reply (an HTML error page, a proxy) is a connection
      // problem, not a message to show verbatim.
      setMessage(error instanceof Error && !(error instanceof SyntaxError) && !(error instanceof TypeError)
        ? { text: error.message }
        : { key: "sessionExperience.transcriptStoreUnreachable" });
    }
    finally { setBusy(false); }
  }
  const [loadedList, setLoadedList] = useState(false);
  async function loadList() {
    await perform(async () => {
      const result = await experienceRequest<{ sessions: SessionEntry[] }>("history");
      setSessions(result.sessions);
      setLoadedList(true);
    });
  }
  useEffect(() => {
    if (view !== "archive") return;
    const timeout = setTimeout(() => void loadList(), 0);
    return () => clearTimeout(timeout);
    // Loads once when Transcripts opens; Refresh list reloads on demand.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);
  async function load(id: string) {
    const result = await experienceRequest<Archive>(`transcripts/${id}/archive`);
    const loaded = { ...result, metadata: normalizeSessionMetadata(result.metadata) };
    setArchive(loaded); setMetadataDraft(loaded.metadata); setEditingMetadata(false); setReviewed(false); setCorrection(null);
  }
  async function allSources(id: string) {
    const sources: SourceRecord[] = []; let after = 0;
    for (let page = 0; page < 19; page++) {
      const result = await experienceRequest<Archive>(`transcripts/${id}/archive?after=${after}`);
      sources.push(...result.sources);
      if (result.sources.length < 50) return sources;
      after = result.sources.at(-1)!.id;
    }
    throw new Error(t("sessionExperience.transcriptExceeded"));
  }
  function download(name: string, content: unknown) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(content, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <div className="experienceStack">
    {view === "sharing" && <>
      <div className="shareRow">
        <span><strong>{t("sessionExperience.readerTitle")}</strong><br /><span className="operatorHint">{liveSession ? t("sessionExperience.readerReady") : t("common.afterStart")}</span></span>
        <button className="secondaryButton" disabled={!liveSession || busy} onClick={() => {
          const current = readerLink && readerLink.sessionId === liveSession?.sessionId ? readerLink.url : liveSession?.readerUrl;
          if (current) { setIssuedLink({ sessionId: liveSession!.sessionId!, url: current }); setMessage({ key: "sessionExperience.readerLinkReady" }); }
          else setConfirmation("reader");
        }}>{t("sessionExperience.getLink")}</button>
      </div>
      <div className="shareRow">
        <span><strong>{t("sessionExperience.remoteTitle")}</strong><br /><span className="operatorHint">{canPair ? t("sessionExperience.remoteReady") : t("common.afterStart")}</span></span>
        <button className="secondaryButton" disabled={!canPair || busy} onClick={() => void perform(async () => {
          const result = await experienceRequest<{ url: string }>("pair", {}, liveSession?.controllerToken); setIssuedLink({ sessionId: pairedSessionId, url: result.url }); setMessage({ key: "sessionExperience.phonePaired" });
        })}>{t("sessionExperience.pairPhone")}</button>
      </div>
      {!liveSession && observer && <p className="operatorHint">{t("sessionExperience.otherOperator")}</p>}
      {link && <label>{t("sessionExperience.phoneLinkLabel")}<input name="experienceLink" autoComplete="off" spellCheck={false} readOnly value={link} />
        <button className="secondaryButton" onClick={() => void perform(async () => { await navigator.clipboard.writeText(link); setMessage({ key: "sessionExperience.linkCopied" }); })}>{t("common.copyLink")}</button></label>}
      {liveSession && <details className="advancedActions"><summary>{t("sessionExperience.readerSharedByMistake")}</summary>
        <p className="operatorHint">{t("sessionExperience.readerReplaceHint")}</p>
        <button className="dangerOutlineButton" disabled={busy} onClick={() => setConfirmation("reader")}>{t("sessionExperience.replaceReaderLink")}</button></details>}
    </>}
    {view === "archive" && <div className="operatorColumns">
      <nav className="settingsNav transcriptList" aria-label={t("sessionExperience.savedTranscripts")}>
        <div className="buttonRow"><button className="secondaryButton" disabled={busy} onClick={() => void loadList()}>{t("sessionExperience.refreshList")}</button></div>
        {loadedList && !sessions.length && <p className="settingHint">{t("sessionExperience.noTranscripts")}</p>}
        <div className="archiveList">{sessions.map((entry) => <button type="button" className="transcriptListItem" key={entry.id} disabled={busy}
          aria-current={archive?.details.id === entry.id ? "page" : undefined}
          onClick={() => void perform(() => load(entry.id))}>{entry.metadata?.topic ? `${entry.metadata.topic} · ` : ""}{dateTime(entry.metadata?.sessionAt ?? entry.startedAt, { dateStyle: "medium", timeStyle: "short" })}</button>)}</div>
      </nav>
      <section className="operatorCard settingsPanel" aria-labelledby="archive-heading">
        {!archive ? <>
          <header className="settingsHeader"><h2 id="archive-heading">{sessions.length ? t("sessionExperience.chooseTranscript") : t("sessionExperience.noTranscripts")}</h2>
            <p className="settingHint">{sessions.length ? t("sessionExperience.chooseTranscriptHint") : t("sessionExperience.noTranscriptsHint")}</p></header>
        </> : <>
        <header className="settingsHeader"><h2 id="archive-heading">{archive.metadata.topic || dateTime(archive.metadata.sessionAt ?? archive.details.startedAt, { dateStyle: "full", timeStyle: "short" })}</h2>
          <p className="settingHint">{archive.metadata.sessionAt !== null ? `${dateTime(archive.metadata.sessionAt, { dateStyle: "full", timeStyle: "short" })} · ` : ""}{t("sessionExperience.keptUntil", {
            status: archive.details.status === "ended" ? t("sessionExperience.ended") : t("sessionExperience.stillRunning"),
            date: dateTime((archive.details.endedAt ?? archive.details.expiresAt) + HISTORY_RETENTION, { dateStyle: "medium", timeStyle: "short" }),
          })}</p></header>
        {editingMetadata ? <div className="experienceCard"><SessionMetadataFields value={metadataDraft} disabled={busy} onChange={setMetadataDraft} />
          <div className="buttonRow"><button type="button" className="secondaryButton" disabled={busy} onClick={() => { setMetadataDraft(normalizeSessionMetadata(archive.metadata)); setEditingMetadata(false); }}>{t("common.cancel")}</button>
            <button type="button" className="primaryButton" disabled={busy} onClick={() => void perform(async () => { const result = await experienceRequest<{ metadata: SessionMetadata }>(`transcripts/${archive.details.id}/metadata`, normalizeSessionMetadata(metadataDraft)); setMetadataDraft(result.metadata); setArchive({ ...archive, metadata: result.metadata }); setEditingMetadata(false); })}>{t("sessionExperience.saveDetails")}</button></div></div>
          : <><div className="archiveMetadata">{archive.metadata.speaker ? <p><strong>{t("sessionExperience.speaker")}</strong> {archive.metadata.speaker}</p> : null}{archive.metadata.description ? <p>{archive.metadata.description}</p> : null}</div>
            <button type="button" className="textButton" disabled={busy || !archive.details.saved || !archiveRetained} onClick={() => setEditingMetadata(true)}>{t("sessionExperience.editDetails")}</button></>}
        {archive.details.incomplete && <p className="operatorBanner" data-tone="warn">{t("sessionExperience.incomplete")}</p>}
        <div className="buttonRow"><button className="secondaryButton" disabled={busy} onClick={() => void perform(() => load(archive.details.id))}>{t("common.refresh")}</button>
          <button className="secondaryButton" disabled={busy} onClick={() => void perform(async () => download("transcript.json", await allSources(archive.details.id)))}>{t("sessionExperience.exportTranscript")}</button>
          <button className="dangerOutlineButton" disabled={busy || archive.details.status !== "ended"} onClick={() => setConfirmation("delete")}>{t("sessionExperience.deleteTranscript")}</button></div>
        <SettingGroup title={t("sessionExperience.summaryTitle")} hint={<>{guidance
          ? t("sessionExperience.summaryHintWithGuidance", {
              length: length === "detailed" ? t("summarySettings.detailed") : t("summarySettings.short"),
              language: LANGUAGE_OPTIONS.find((entry) => entry.locale === language)?.label ?? language,
              guidance,
            })
          : t("sessionExperience.summaryHint", {
              length: length === "detailed" ? t("summarySettings.detailed") : t("summarySettings.short"),
              language: LANGUAGE_OPTIONS.find((entry) => entry.locale === language)?.label ?? language,
            })}{" "}<a href="#settings=summary">{t("sessionExperience.changeDefaults")}</a></>}>
          <div className="buttonRow"><button className="primaryButton" disabled={busy || archive.details.status !== "ended" || ["queued", "running"].includes(archive.summary?.status ?? "")}
            onClick={() => void perform(async () => {
              if (summaryRequestRef.current?.sessionId !== archive.details.id) summaryRequestRef.current = { sessionId: archive.details.id, id: crypto.randomUUID() };
              await experienceRequest(`transcripts/${archive.details.id}/summary`, { model, language, length, guidance, requestId: summaryRequestRef.current.id });
              summaryRequestRef.current = null;
              await load(archive.details.id);
            })}>{t("sessionExperience.generateSummary")}</button></div>
          {archive.summary && <div className="summaryDraft"><p className="settingHint" role="status">{
            (archive.summary.automatic ? t("sessionExperience.summaryStatusAutomatic", {
              status: summaryState(archive.summary.status),
              error: archive.summary.error ?? "",
            }) : t("sessionExperience.summaryStatus", {
              status: summaryState(archive.summary.status),
              error: archive.summary.error ?? "",
            }))
          }</p>
            {archive.summary.result?.map((point, index) => <p key={index}>{point.text} <small>{t("sessionExperience.sources")} {point.sourceIds.map((id) => <button key={id} type="button" className="textButton" onClick={() => void perform(async () => {
              const sources = archive.sources.some((source) => source.id === id) ? archive.sources : await allSources(archive.details.id);
              setArchive({ ...archive, sources });
              if (transcriptRef.current) transcriptRef.current.open = true;
              requestAnimationFrame(() => { const source = document.getElementById(`source-${id}`); source?.scrollIntoView({ block: "center" }); source?.focus({ preventScroll: true }); });
            })}>#{id}</button>)}</small></p>)}
            {archive.summary.status === "completed" && <><label className="checkLabel"><input type="checkbox" name="summaryReviewed" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} />{t("sessionExperience.summaryReviewed")}</label>
              <div className="buttonRow"><button className="secondaryButton" disabled={!reviewed} onClick={() => download("summary.json", { summary: archive.summary, reviewed: true })}>{t("sessionExperience.exportSummary")}</button></div></>}
          </div>}
        </SettingGroup>
        <SettingGroup title={t("sessionExperience.transcriptTitle")} hint={t("sessionExperience.transcriptHint")}>
          <details ref={transcriptRef} className="advancedActions"><summary>{t("sessionExperience.showTranscript")}</summary><div className="archiveRecords">{archive.sources.map((source) => <article id={`source-${source.id}`} tabIndex={-1} key={source.id}>
            <p className="settingHint">{dateTime(source.at, { timeStyle: "short" })}{source.excluded ? ` · ${t("sessionExperience.removedFromSummaries")}` : ""}</p>
            <p lang={source.language}>{source.correction ?? source.text}</p>
            <div className="buttonRow"><button type="button" className="secondaryButton" onClick={() => setCorrection({ id: source.id, text: source.correction ?? source.text })}>{t("sessionExperience.correct")}</button></div>
          </article>)}</div>{archive.more && <div className="buttonRow"><button className="secondaryButton" disabled={busy} onClick={() => void perform(async () => {
            const sources = await allSources(archive.details.id); setArchive({ ...archive, sources, more: false });
          })}>{t("sessionExperience.loadFullTranscript")}</button></div>}</details>
          {correction && <div className="correctionEditor"><label>{t("sessionExperience.correctedText")}<textarea name="sourceCorrection" autoComplete="off" value={correction.text} maxLength={4000} rows={4} onChange={(event) => setCorrection({ ...correction, text: event.target.value })} /></label>
            <p className="settingHint">{t("sessionExperience.correctionHint")}</p>
            <div className="buttonRow"><button type="button" className="secondaryButton" onClick={() => setCorrection(null)}>{t("common.cancel")}</button>
              <button type="button" className="primaryButton" disabled={busy || !correction.text.trim()} onClick={() => void perform(async () => {
                await experienceRequest(`transcripts/${archive.details.id}/correct`, correction); setCorrection(null); await load(archive.details.id);
              })}>{t("sessionExperience.saveCorrection")}</button></div></div>}
        </SettingGroup>
        <SettingGroup title={t("sessionExperience.readerPassagesTitle")} hint={t("sessionExperience.readerPassagesHint")}>
          <details className="advancedActions"><summary>{t("sessionExperience.showReaderPassages")}</summary>{archive.paragraphs.filter((paragraph) => !paragraph.removed).map((paragraph) => <article key={paragraph.id} className="readerParagraph">
            <p>{paragraph.text}</p><div className="buttonRow"><button type="button" className="dangerOutlineButton" onClick={() => setConfirmation(`remove:${paragraph.id}`)}>{t("common.remove")}</button></div></article>)}{archive.moreParagraphs && <div className="buttonRow"><button className="secondaryButton" disabled={busy} onClick={() => void perform(async () => {
            const result = await experienceRequest<Archive>(`transcripts/${archive.details.id}/archive?paragraphAfter=${archive.paragraphs.at(-1)?.id ?? 0}`);
            setArchive({ ...archive, paragraphs: [...archive.paragraphs, ...result.paragraphs], moreParagraphs: result.moreParagraphs });
          })}>{t("sessionExperience.loadMorePassages")}</button></div>}</details>
        </SettingGroup>
        {(archive.notes?.length ?? 0) > 0 && <SettingGroup title={t("sessionExperience.yourMessagesTitle")} hint={t("sessionExperience.yourMessagesHint")}>
          {archive.notes.map((note) => <p key={note.id} className="readerNote">{note.text}</p>)}
        </SettingGroup>}
        </>}
        <p className="settingHint" role="status" aria-live="polite">{busy ? t("common.working") : messageText}</p>
      </section>
    </div>}
    <dialog ref={dialogRef} className="confirmationDialog" aria-labelledby="experience-confirm-heading" onCancel={() => setConfirmation(null)}><div>
      <h2 id="experience-confirm-heading">{confirmation === "reader" ? t("sessionExperience.dialogReplaceReaderTitle") : confirmation === "delete" ? t("sessionExperience.dialogDeleteTitle") : t("sessionExperience.dialogRemoveTitle")}</h2>
      <p>{confirmation === "reader" ? t("sessionExperience.dialogReplaceReaderBody") : confirmation === "delete" ? t("sessionExperience.dialogDeleteBody") : t("sessionExperience.dialogRemoveBody")}</p>
      <div className="confirmationRow"><button className="secondaryButton" disabled={busy} onClick={() => setConfirmation(null)}>{confirmation === "delete" ? t("sessionExperience.keepIt") : t("common.cancel")}</button>
        <button className="dangerButton" disabled={busy || (confirmation === "reader" && !liveSession)} onClick={() => void perform(async () => {
          if (confirmation === "reader") { const result = await experienceRequest<{ url: string }>("reader-rotate", {}, liveSession!.controllerToken); setIssuedLink({ sessionId: liveSession!.sessionId!, url: result.url }); setReaderLink({ sessionId: liveSession!.sessionId!, url: result.url }); onReaderLink(result.url); }
          else if (archive) {
            if (confirmation === "delete") { await experienceRequest(`transcripts/${archive.details.id}/delete`, { confirm: true }); setSessions(sessions.filter((entry) => entry.id !== archive.details.id)); setArchive(null); }
            else if (confirmation) { await experienceRequest(`transcripts/${archive.details.id}/remove`, { id: Number(confirmation.split(":")[1]), confirm: true }); await load(archive.details.id); }
          }
          setConfirmation(null); setMessage({ key: "common.done" });
        })}>{confirmation === "reader" ? t("sessionExperience.replaceLink") : confirmation === "delete" ? t("sessionExperience.deleteTranscript") : t("sessionExperience.removePassage")}</button></div></div></dialog>
    {view === "sharing" && <p className="settingHint" role="status" aria-live="polite">{busy ? t("common.working") : messageText}</p>}
  </div>;
}

const SUMMARY_STATE_KEYS = {
  queued: "sessionExperience.summaryState.queued",
  running: "sessionExperience.summaryState.running",
  completed: "sessionExperience.summaryState.completed",
  failed: "sessionExperience.summaryState.failed",
} as const satisfies Record<string, MessageKey>;
