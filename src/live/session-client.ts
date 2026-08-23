import type {
  CaptionStyle,
  LiveApiErrorCode,
  LiveServiceDetails,
  LiveSessionControlAction,
  LiveSessionControlResponse,
  ObsChannelDetails,
  PublicCaptionRequest,
} from "@/live/contracts";

interface ErrorPayload {
  error?: string;
  code?: LiveApiErrorCode;
  expiresAt?: string | null;
}

export class LiveApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: LiveApiErrorCode,
    readonly expiresAt?: string | null,
  ) {
    super(message);
  }
}

async function requireSuccess(response: Response, fallback: string) {
  if (response.ok) return response;
  const payload = (await response.json().catch(() => null)) as ErrorPayload | null;
  throw new LiveApiError(
    payload?.error ?? fallback,
    response.status,
    payload?.code,
    payload?.expiresAt,
  );
}

function controllerHeaders(controllerToken?: string) {
  return controllerToken
    ? { "x-caption-controller": controllerToken }
    : undefined;
}

export class LiveSessionClient {
  async getChannel(): Promise<ObsChannelDetails> {
    const response = await fetch("/api/live/channel", {
      signal: AbortSignal.timeout(8_000),
    });
    await requireSuccess(response, "Could not load the Main OBS channel.");
    return (await response.json()) as ObsChannelDetails;
  }

  async createChannel(style: CaptionStyle): Promise<ObsChannelDetails> {
    const response = await fetch("/api/live/channel", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ style }),
      signal: AbortSignal.timeout(10_000),
    });
    await requireSuccess(response, "Could not create the Main OBS channel.");
    return (await response.json()) as ObsChannelDetails;
  }

  async rotateChannel(): Promise<ObsChannelDetails> {
    const response = await fetch("/api/live/channel/rotate", {
      method: "POST",
      signal: AbortSignal.timeout(10_000),
    });
    await requireSuccess(response, "Could not rotate the Main OBS channel URL.");
    return (await response.json()) as ObsChannelDetails;
  }

  async startService(
    style: CaptionStyle,
    takeover = false,
  ): Promise<LiveServiceDetails> {
    const response = await fetch("/api/live/channel/service", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ style, takeover }),
      signal: AbortSignal.timeout(10_000),
    });
    await requireSuccess(response, "Could not start the live service.");
    return (await response.json()) as LiveServiceDetails;
  }

  async endService(controllerToken: string) {
    const response = await fetch("/api/live/channel/service", {
      method: "DELETE",
      headers: controllerHeaders(controllerToken),
      signal: AbortSignal.timeout(5_000),
    });
    await requireSuccess(response, "Could not end the live service.");
  }

  async replaceViewerLink(controllerToken: string) {
    const response = await fetch("/api/live/channel/viewer/rotate", {
      method: "POST",
      headers: controllerHeaders(controllerToken),
      signal: AbortSignal.timeout(5_000),
    });
    await requireSuccess(response, "Could not replace the mobile viewer link.");
    return (await response.json()) as { viewerUrl: string };
  }

  async publish(controllerToken: string, event: PublicCaptionRequest) {
    const response = await fetch("/api/live/channel/caption", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...controllerHeaders(controllerToken),
      },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(10_000),
    });
    await requireSuccess(response, "Could not publish the OBS caption.");
    return (await response.json()) as { published: true; sequence: number };
  }

  async reserveTranscriptionAttempt(controllerToken: string) {
    const response = await fetch("/api/live/channel/lease", {
      method: "POST",
      headers: controllerHeaders(controllerToken),
      signal: AbortSignal.timeout(5_000),
    });
    await requireSuccess(response, "Could not reserve this transcription attempt.");
    return (await response.json()) as {
      valid: true;
      status: "live";
      expiresAt: string;
      transcriptionRequests: number;
    };
  }

  async updateStyle(style: CaptionStyle, controllerToken?: string) {
    const response = await fetch("/api/live/channel/style", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        ...controllerHeaders(controllerToken),
      },
      body: JSON.stringify({ style }),
      signal: AbortSignal.timeout(5_000),
    });
    await requireSuccess(response, "Could not update the OBS style.");
  }

  async control(
    action: LiveSessionControlAction,
    controllerToken?: string,
    options?: {
      targetLanguage?: PublicCaptionRequest["targetLanguage"];
      style?: CaptionStyle;
    },
  ) {
    const response = await fetch("/api/live/channel/control", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...controllerHeaders(controllerToken),
      },
      body: JSON.stringify({ action, ...options }),
      signal: AbortSignal.timeout(5_000),
    });
    await requireSuccess(response, "Could not update the live caption controls.");
    return (await response.json()) as LiveSessionControlResponse;
  }
}
