"use client";
import { useEffect, useRef, useState } from "react";
import { startSerialPolling } from "@/live/serial-polling";
interface RemoteState { status: string; connected: boolean; command: { action: string; status: string } | null }

export default function OperatorMobilePage() {
  const [state, setState] = useState<RemoteState | null>(null);
  const [message, setMessage] = useState("Connecting to the capture computer…");
  const [busy, setBusy] = useState(false);
  const credential = useRef({ serviceId: "", token: "" });
  const requestId = useRef<{ action: string; id: string } | null>(null);
  async function request(body: object = {}) {
    const response = await fetch("/api/live/experience/remote", { method: "POST", cache: "no-store",
      headers: { "content-type": "application/json", "x-caption-remote": credential.current.token },
      body: JSON.stringify({ ...body, serviceId: credential.current.serviceId }), signal: AbortSignal.timeout(8000) });
    const result = await response.json() as RemoteState & { error?: string };
    if (!response.ok) throw new Error(result.error || "Remote control unavailable. Pair this phone again.");
    return result;
  }
  useEffect(() => {
    const [serviceId, token] = location.hash.slice(1).split(".");
    credential.current = { serviceId, token };
    let cancelled = false;
    const stop = startSerialPolling(async () => {
      try { const result = await request(); if (!cancelled) { setState(result); setMessage(""); } }
      catch (error) { if (!cancelled) { setState(null); setMessage(error instanceof Error ? error.message : "Connection lost."); } }
    }, 2000);
    return () => { cancelled = true; stop(); };
  }, []);
  async function send(action: "pause" | "resume" | "clear") {
    if (busy) return;
    setBusy(true);
    if (requestId.current?.action !== action) requestId.current = { action, id: crypto.randomUUID() };
    try {
      const result = await request({ action, id: requestId.current.id });
      setState(result); setMessage(""); requestId.current = null;
    } catch (error) { setMessage(error instanceof Error ? error.message : "Command failed. Retry to confirm its status."); }
    finally { setBusy(false); }
  }
  const pending = state?.command?.status === "pending";
  return <main className="experiencePage">
    <header className="experienceHeader"><p className="eyebrow">Church Live Caption</p><h1>Operator remote</h1>
      <p>This phone controls the microphone on the capture computer.</p></header>
    <section className="experienceCard" aria-label="Remote capture controls">
      <p role="status" aria-live="polite">{message || (state?.connected ? `Capture computer connected · ${state.status}` : "Capture computer disconnected")}</p>
      <div className="buttonGrid"><button className="primaryButton" disabled={!state || busy || pending || (state.status === "paused" && !state.connected)}
        onClick={() => void send(state?.status === "paused" ? "resume" : "pause")}>{busy ? "Sending…" : state?.status === "paused" ? "Resume captions" : "Pause captions"}</button>
        <button className="secondaryButton" disabled={!state || busy || pending} onClick={() => void send("clear")}>Clear live caption</button></div>
      {state?.command && <p role="status">{state.command.action}: {state.command.status === "pending" ? "Waiting for capture computer acknowledgement" : state.command.status}</p>}
      <p className="helpText">Pause blocks new inference immediately. Microphone stop is confirmed only after the capture computer acknowledges it.</p>
    </section>
  </main>;
}
