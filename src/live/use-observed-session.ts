"use client";

import { useEffect, useState } from "react";
import { isLanguageLocale } from "@/domain/languages";
import { experienceRequest } from "@/experience/client";
import type { SourceRecord } from "@/experience/contracts";
import { LiveSessionClient } from "@/live/session-client";
import { startSerialPolling } from "@/live/serial-polling";
import type { LiveObserverDetails, ObservedSessionState } from "@/live/contracts";

const VIEWER_PROTOCOL = "church-caption-viewer-v1";
const SOURCE_POLL_MS = 8_000;
const MAX_RECONNECT_ATTEMPTS = 8;
const MAX_SOURCE_PAGES = 20;

const client = new LiveSessionClient();

const IDLE: ObservedSessionState = {
  status: "idle",
  message: "",
  latestPublicText: "",
  latestPublicLanguage: null,
  latestPublicAt: null,
  latestSourceText: "",
  sequence: 0,
  observer: null,
};

interface ViewerCaption {
  sequence?: number;
  publicText?: string;
  targetLanguage?: string;
  publishedAt?: number;
}

function captionUpdate(caption: ViewerCaption | null | undefined) {
  if (!caption || typeof caption.publicText !== "string") return null;
  return {
    latestPublicText: caption.publicText,
    latestPublicLanguage: isLanguageLocale(caption.targetLanguage ?? "")
      ? (caption.targetLanguage as ObservedSessionState["latestPublicLanguage"])
      : null,
    latestPublicAt: typeof caption.publishedAt === "number" ? caption.publishedAt : Date.now(),
    sequence: Number.isSafeInteger(caption.sequence) ? Number(caption.sequence) : 0,
  };
}

/**
 * Follows the service another operator of the same Access workspace controls.
 * Watching is read-only: it registers a watcher credential, mirrors the public
 * caption stream, and — only when that service saves history — tails the
 * Access-protected source transcript. It never reserves attempts, never sends
 * audio and never displaces the controller.
 */
export function useObservedSession(active: boolean) {
  const [state, setState] = useState<ObservedSessionState>(IDLE);
  // Watching stops the moment this browser controls the service or the channel
  // goes idle, so the mirrored output is derived rather than reset in an effect.
  const observed = active ? state : IDLE;

  useEffect(() => {
    if (!active) return;
    let stopped = false;
    let socket: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;

    const patch = (update: Partial<ObservedSessionState>) =>
      setState((current) => ({ ...current, ...update }));

    const clear = () =>
      patch({ latestPublicText: "", latestPublicLanguage: null, latestPublicAt: null });

    const connect = (observer: LiveObserverDetails) => {
      if (stopped) return;
      patch({
        status: attempt ? "reconnecting" : "connecting",
        message: attempt ? "Reconnecting to the running service…" : "Connecting to the running service…",
        observer,
      });
      const scheme = window.location.protocol === "https:" ? "wss:" : "ws:";
      socket = new WebSocket(
        `${scheme}//${window.location.host}/api/live/viewer?channel=${observer.channelId}`,
        [VIEWER_PROTOCOL, observer.observerToken],
      );
      socket.onmessage = (message) => {
        let payload: { type?: string; caption?: ViewerCaption | null; status?: string };
        try {
          payload = JSON.parse(String(message.data));
        } catch {
          return;
        }
        if (payload.type === "clear") return clear();
        if (payload.type === "caption") {
          const update = captionUpdate(payload.caption);
          if (update) patch(update);
          return;
        }
        if (payload.type === "ready") {
          attempt = 0;
          const update = captionUpdate(payload.caption);
          patch({
            status: "watching",
            message: "Watching the service another operator is running.",
            ...(update ?? { latestPublicText: "", latestPublicLanguage: null, latestPublicAt: null }),
          });
        }
      };
      socket.onclose = (event) => {
        socket = null;
        if (stopped) return;
        if (event.code === 4002 || event.code === 4003) {
          // The service ended or restarted. Drop the stale mirror and re-register:
          // a replacement service issues a new credential, and a channel that is
          // really idle stops this effect through the operator page's poll.
          setState(IDLE);
          retry = setTimeout(() => void start(), 3_000);
          return;
        }
        if (attempt >= MAX_RECONNECT_ATTEMPTS) {
          patch({ status: "unavailable", message: "Live output from the other operator is unavailable." });
          return;
        }
        attempt += 1;
        retry = setTimeout(() => void start(), Math.min(30_000, 1_000 * 2 ** attempt));
      };
      socket.onerror = () => socket?.close();
    };

    const start = async () => {
      if (stopped) return;
      try {
        const observer = await client.observeService();
        connect(observer);
      } catch {
        if (stopped) return;
        if (attempt >= MAX_RECONNECT_ATTEMPTS) {
          patch({ status: "unavailable", message: "Live output from the other operator is unavailable." });
          return;
        }
        attempt += 1;
        retry = setTimeout(() => void start(), Math.min(30_000, 1_000 * 2 ** attempt));
      }
    };

    void start();
    return () => {
      stopped = true;
      if (retry !== undefined) clearTimeout(retry);
      socket?.close();
    };
  }, [active]);

  const serviceId = observed.observer?.saveHistory ? observed.observer.serviceId : null;
  useEffect(() => {
    if (!serviceId) return;
    let after = 0;
    return startSerialPolling(async () => {
      try {
        // One page holds 50 sources, so a watcher that joins late walks forward
        // until it reaches the newest recognized passage.
        for (let page = 0; page < MAX_SOURCE_PAGES; page += 1) {
          const result = await experienceRequest<{ sources: SourceRecord[]; more: boolean }>(
            `sermons/${serviceId}/archive?after=${after}&paragraphAfter=0`,
          );
          if (!result.sources.length) return;
          after = result.sources.at(-1)!.id;
          const latest = result.sources.filter((source) => !source.excluded).at(-1);
          if (latest) {
            setState((current) => ({ ...current, latestSourceText: latest.correction ?? latest.text }));
          }
          if (!result.more) return;
        }
      } catch {
        // Source tailing is best-effort; the caption stream stays authoritative.
      }
    }, SOURCE_POLL_MS);
  }, [serviceId]);

  return observed;
}
