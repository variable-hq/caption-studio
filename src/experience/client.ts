export async function experienceRequest<T>(path: string, body?: unknown, controller?: string) {
  const response = await fetch(`/api/live/experience/${path}`, {
    method: body === undefined ? "GET" : "POST", cache: "no-store",
    headers: { "content-type": "application/json", ...(controller ? { "x-caption-controller": controller } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(10_000),
  });
  const result = await response.json() as { error?: string };
  if (!response.ok) throw new Error(result.error || "Service request failed. Check your connection.");
  return result as T;
}
