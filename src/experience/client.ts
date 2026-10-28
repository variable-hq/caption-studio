export class ExperienceRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); this.name = "ExperienceRequestError"; }
}

export async function experienceRequest<T>(path: string, body?: unknown, controller?: string) {
  const response = await fetch(`/api/live/experience/${path}`, {
    method: body === undefined ? "GET" : "POST", cache: "no-store",
    headers: { "content-type": "application/json", ...(controller ? { "x-caption-controller": controller } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(10_000),
  });
  const result = await response.json() as { error?: string };
  if (!response.ok) throw new ExperienceRequestError(result.error || "Service request failed. Check your connection.", response.status);
  return result as T;
}
