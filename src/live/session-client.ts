import type {
  CaptionStyle,
  LiveApiErrorCode,
  LiveObserverDetails,
  LiveServiceDetails,
  LiveSessionControlAction,
  LiveSessionControlResponse,
  ObsChannelDetails,
  PublicCaptionRequest,
} from "@/live/contracts";
import { translate, type MessageKey } from "@/i18n";

type TranslateMessage = (key: MessageKey) => string;

const defaultTranslate: TranslateMessage = (key) => translate("en", key);

interface ErrorPayload {
  error?: string;
  code?: LiveApiErrorCode;
  expiresAt?: string | null;
  translationRevision?: number;
}

export class LiveApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: LiveApiErrorCode,
    readonly expiresAt?: string | null,
    readonly translationRevision?: number,
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
    payload?.translationRevision,
  );
}

function controllerHeaders(controllerToken?: string) {
  return controllerToken
    ? { "x-caption-controller": controllerToken }
    : undefined;
}

export class LiveSessionClient {
  constructor(private readonly message: TranslateMessage = defaultTranslate) {}

  async getChannel(): Promise<ObsChannelDetails> {
    const response = await fetch("/api/live/channel", {
      signal: AbortSignal.timeout(8_000),
    });
    await requireSuccess(response, this.message("request.channelLoad"));
    return (await response.json()) as ObsChannelDetails;
  }

  async createChannel(style: CaptionStyle): Promise<ObsChannelDetails> {
    const response = await fetch("/api/live/channel", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ style }),
      signal: AbortSignal.timeout(10_000),
    });
    await requireSuccess(response, this.message("request.channelCreate"));
    return (await response.json()) as ObsChannelDetails;
  }

  async rotateChannel(): Promise<ObsChannelDetails> {
    const response = await fetch("/api/live/channel/rotate", {
      method: "POST",
      signal: AbortSignal.timeout(10_000),
    });
    await requireSuccess(response, this.message("request.channelRotate"));
    return (await response.json()) as ObsChannelDetails;
  }

  async startService(
    style: CaptionStyle,
    takeover = false,
    saveHistory = false,
  ): Promise<LiveServiceDetails> {
    const response = await fetch("/api/live/channel/service", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ style, takeover, saveHistory }),
      signal: AbortSignal.timeout(10_000),
    });
    await requireSuccess(response, this.message("request.serviceStart"));
    return (await response.json()) as LiveServiceDetails;
  }

  async endService(controllerToken: string) {
    const response = await fetch("/api/live/channel/service", {
      method: "DELETE",
      headers: controllerHeaders(controllerToken),
      signal: AbortSignal.timeout(5_000),
    });
    await requireSuccess(response, this.message("request.serviceEnd"));
  }

  /** Read-only watcher credential for the service another operator controls. */
  async observeService(): Promise<LiveObserverDetails> {
    const response = await fetch("/api/live/channel/observer", {
      method: "POST",
      signal: AbortSignal.timeout(8_000),
    });
    await requireSuccess(response, this.message("request.watchService"));
    return (await response.json()) as LiveObserverDetails;
  }

  async replaceViewerLink(controllerToken: string) {
    const response = await fetch("/api/live/channel/viewer/rotate", {
      method: "POST",
      headers: controllerHeaders(controllerToken),
      signal: AbortSignal.timeout(5_000),
    });
    await requireSuccess(response, this.message("request.viewerReplace"));
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
    await requireSuccess(response, this.message("request.captionPublish"));
    return (await response.json()) as { published: true; sequence: number; historyIncomplete?: boolean };
  }

  async reserveTranscriptionAttempt(controllerToken: string) {
    const response = await fetch("/api/live/channel/lease", {
      method: "POST",
      headers: controllerHeaders(controllerToken),
      signal: AbortSignal.timeout(5_000),
    });
    await requireSuccess(response, this.message("request.lease"));
    return (await response.json()) as {
      valid: true;
      status: "live";
      expiresAt: string;
      transcriptionRequests: number;
      captionEpoch: number;
      translationRevision: number;
    };
  }

  async refreshTranslation(
    controllerToken: string,
    expectedTranslationRevision: number,
    refreshRequestId: string,
  ): Promise<LiveSessionControlResponse> {
    return this.control("refresh-translation", controllerToken, {
      expectedTranslationRevision,
      refreshRequestId,
    });
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
    await requireSuccess(response, this.message("request.styleUpdate"));
  }

  async control(
    action: LiveSessionControlAction,
    controllerToken?: string,
    options?: {
      targetLanguage?: PublicCaptionRequest["targetLanguage"];
      style?: CaptionStyle;
      expectedTranslationRevision?: number;
      refreshRequestId?: string;
      manualText?: string;
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
    await requireSuccess(response, this.message("request.control"));
    return (await response.json()) as LiveSessionControlResponse;
  }
}
