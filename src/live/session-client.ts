import type {
  CaptionStyle,
  LiveSessionControlAction,
  LiveSessionControlResponse,
  LiveSessionDetails,
  PublicCaptionEvent,
} from "@/live/contracts";

async function errorMessage(response: Response, fallback: string) {
  const payload = (await response.json().catch(() => null)) as
    | { error?: string }
    | null;
  return payload?.error ?? fallback;
}

export class LiveSessionClient {
  async create(style: CaptionStyle): Promise<LiveSessionDetails> {
    const response = await fetch("/api/live/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ style }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new Error(await errorMessage(response, "Could not create the OBS session."));
    }
    return (await response.json()) as LiveSessionDetails;
  }

  async publish(sessionId: string, event: PublicCaptionEvent) {
    const response = await fetch(`/api/live/session/${sessionId}/caption`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new Error(await errorMessage(response, "Could not publish the OBS caption."));
    }
  }

  async updateStyle(sessionId: string, style: CaptionStyle) {
    const response = await fetch(`/api/live/session/${sessionId}/style`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ style }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) {
      throw new Error(await errorMessage(response, "Could not update the OBS style."));
    }
  }

  async control(
    sessionId: string,
    action: LiveSessionControlAction,
    options?: { targetLanguage?: PublicCaptionEvent["targetLanguage"]; style?: CaptionStyle },
  ) {
    const response = await fetch(`/api/live/session/${sessionId}/control`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, ...options }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) {
      throw new Error(await errorMessage(response, "Could not update the live caption controls."));
    }
    return (await response.json()) as LiveSessionControlResponse;
  }

  async revoke(sessionId: string) {
    const response = await fetch(`/api/live/session/${sessionId}`, {
      method: "DELETE",
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok && response.status !== 404) {
      throw new Error(await errorMessage(response, "Could not close the OBS session."));
    }
  }
}
