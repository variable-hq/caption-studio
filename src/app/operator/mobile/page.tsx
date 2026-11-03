"use client";
import { useEffect, useRef, useState } from "react";
import { startSerialPolling } from "@/live/serial-polling";
import { applyTheme, readStoredTheme } from "@/live/theme";
import type { MessageKey } from "@/i18n";
import { I18nProvider, useI18n } from "@/i18n/provider";

interface RemoteState { status: string; connected: boolean; command: { action: string; status: string } | null }
type RemoteMessage = { key: MessageKey } | { text: string } | null;

export default function OperatorMobilePage() {
  return <I18nProvider><OperatorMobileContent /></I18nProvider>;
}

function OperatorMobileContent() {
  const { t, setBrowserFallbackPreference } = useI18n();
  const tRef = useRef(t);
  const [state, setState] = useState<RemoteState | null>(null);
  const [message, setMessage] = useState<RemoteMessage>({ key: "mobile.message.connecting" });
  const [busy, setBusy] = useState(false);
  const credential = useRef({ sessionId: "", token: "" });
  const requestId = useRef<{ action: string; id: string } | null>(null);
  async function request(body: object = {}) {
    const response = await fetch("/api/live/experience/remote", { method: "POST", cache: "no-store",
      headers: { "content-type": "application/json", "x-caption-remote": credential.current.token },
      body: JSON.stringify({ ...body, sessionId: credential.current.sessionId }), signal: AbortSignal.timeout(8000) });
    const result = await response.json() as RemoteState & { error?: string };
    if (!response.ok) throw new Error(result.error || tRef.current("mobile.error.unavailable"));
    return result;
  }
  useEffect(() => {
    tRef.current = t;
  }, [t]);
  useEffect(() => {
    setBrowserFallbackPreference();
  }, [setBrowserFallbackPreference]);
  useEffect(() => {
    applyTheme(readStoredTheme());
  }, []);
  useEffect(() => {
    const [sessionId, token] = location.hash.slice(1).split(".");
    credential.current = { sessionId, token };
    let cancelled = false;
    if (!sessionId || !token) {
      const explain = window.setTimeout(() => setMessage({ key: "mobile.message.notPaired" }), 0);
      return () => { cancelled = true; window.clearTimeout(explain); };
    }
    const stop = startSerialPolling(async () => {
      try { const result = await request(); if (!cancelled) { setState(result); setMessage(null); } }
      catch (error) { if (!cancelled) { setState(null); setMessage(error instanceof Error ? { text: error.message } : { key: "mobile.error.connectionLost" }); } }
    }, 2000);
    return () => { cancelled = true; stop(); };
  }, []);
  async function send(action: "pause" | "resume" | "clear") {
    if (busy) return;
    setBusy(true);
    if (requestId.current?.action !== action) requestId.current = { action, id: crypto.randomUUID() };
    try {
      const result = await request({ action, id: requestId.current.id });
      setState(result); setMessage(null); requestId.current = null;
    } catch (error) { setMessage(error instanceof Error ? { text: error.message } : { key: "mobile.error.commandFailed" }); }
    finally { setBusy(false); }
  }
  const pending = state?.command?.status === "pending";
  const messageText = message === null ? "" : "text" in message ? message.text : t(message.key);
  const connectionStatus = state?.connected
    ? t("mobile.status.connected", { status: state.status === "paused" ? t("mobile.status.paused") : t("mobile.status.live") })
    : t("mobile.status.disconnected");
  const commandLabel = (action: string) => action === "pause"
    ? t("shell.controls.pause")
    : action === "resume"
      ? t("shell.controls.resume")
      : action === "clear"
        ? t("shell.controls.clearScreen")
        : action;
  const commandStatus = state?.command ? (() => {
    const action = commandLabel(state.command.action);
    if (state.command.status === "pending") {
      return state.connected
        ? t("mobile.commandStatus.pendingConnected", { action })
        : t("mobile.commandStatus.pendingDisconnected", { action });
    }
    return state.command.status === "confirmed"
      ? t("mobile.commandStatus.confirmed", { action })
      : t("mobile.commandStatus.failed", { action });
  })() : null;
  return <main className="experiencePage">
    <header className="experienceHeader"><p className="eyebrow">Caption Studio</p><h1>{t("sessionExperience.remoteTitle")}</h1>
      <p>{t("mobile.description")}</p></header>
    <section className="experienceCard" aria-label={t("mobile.controlsLabel")}>
      <p role="status" aria-live="polite">{messageText || connectionStatus}</p>
      <div className="buttonGrid"><button className="primaryButton" disabled={!state || busy || pending || (state.status === "paused" && !state.connected)}
        onClick={() => void send(state?.status === "paused" ? "resume" : "pause")}>{busy ? t("mobile.sending") : state?.status === "paused" ? t("shell.controls.resume") : t("shell.controls.pause")}</button>
        <button className="secondaryButton" disabled={!state || busy || pending} onClick={() => void send("clear")}>{t("shell.controls.clearScreen")}</button></div>
      {commandStatus && <p role="status">{commandStatus}</p>}
      <p className="helpText">{t("mobile.help")}</p>
    </section>
  </main>;
}
