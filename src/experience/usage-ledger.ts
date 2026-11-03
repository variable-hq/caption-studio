import { normalizeLlmTokenUsage } from "@/ai/usage";
import { DAY, USAGE_RETENTION, json, type UsageRecord } from "./contracts";

const MAX_DAILY_NEURONS = 9_000;
const MAX_READER_NEURONS = 6_000;
const SAFE_ID = /^[a-zA-Z0-9:_-]{1,180}$/u;

/** Numeric accounting only. This object never receives transcript text or credentials. */
export class AiUsageLedger {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request) {
    const path = new URL(request.url).pathname;
    if (path === "/history") {
      const since = Date.now() - USAGE_RETENTION;
      const records = await this.state.storage.list<UsageRecord>({ prefix: "event:", limit: 1000,
        startAfter: new URL(request.url).searchParams.get("after") || undefined });
      const entries = [...records].filter(([, value]) => value.at > since);
      return json({ records: entries.map(([, value]) => value),
        next: records.size === 1000 ? [...records.keys()].at(-1) : null });
    }
    if (path === "/admit" && request.method === "POST") {
      const body = await request.json() as Partial<UsageRecord>;
      if (!SAFE_ID.test(body.id ?? "") || !SAFE_ID.test(body.serviceId ?? "") ||
          !["transcription", "translation", "reader", "summary"].includes(body.stage ?? "") ||
          !["groq", "cloudflare"].includes(body.provider ?? "") ||
          typeof body.model !== "string" || body.model.length > 160 ||
          !Number.isFinite(body.reservedNeurons) || body.reservedNeurons! < 0) {
        return json({ error: "Invalid usage admission." }, 400);
      }
      return this.state.storage.transaction(async (storage) => {
        const at = Date.now();
        const duplicate = await storage.get<string>(`id:${body.id}`);
        if (duplicate) return json({ error: "This inference attempt was already admitted." }, 409);
        const dayKey = `day:${Math.floor(at / DAY)}`;
        const budget = await storage.get<{ total: number; reader: number }>(dayKey) ?? { total: 0, reader: 0 };
        const reserve = body.reservedNeurons!;
        if (reserve > MAX_DAILY_NEURONS || budget.total + reserve > MAX_DAILY_NEURONS ||
            (body.stage === "reader" && budget.reader + reserve > MAX_READER_NEURONS)) {
          return json({ error: "Optional AI daily budget reached. Retry after reset." }, 429);
        }
        const key = `event:${String(at).padStart(13, "0")}:${body.id}`;
        const record: UsageRecord = {
          id: body.id!, serviceId: body.serviceId!, stage: body.stage!, provider: body.provider!,
          model: body.model!, at, status: "pending", tokens: null, audioSeconds: null,
          reservedNeurons: reserve, estimatedNeurons: 0,
        };
        await storage.put(key, record);
        await storage.put(`id:${record.id}`, key);
        await storage.put(dayKey, { total: budget.total + reserve,
          reader: budget.reader + (record.stage === "reader" ? reserve : 0) });
        const alarm = await storage.getAlarm();
        if (alarm === null || alarm > at + USAGE_RETENTION) await storage.setAlarm(at + USAGE_RETENTION);
        return json({ admitted: true });
      });
    }
    if (path === "/finish" && request.method === "POST") {
      const body = await request.json() as Partial<UsageRecord>;
      if (!SAFE_ID.test(body.id ?? "")) return json({ error: "Invalid usage ID." }, 400);
      return this.state.storage.transaction(async (storage) => {
        const key = await storage.get<string>(`id:${body.id}`);
        const record = key ? await storage.get<UsageRecord>(key) : undefined;
        if (!record || record.at + USAGE_RETENTION <= Date.now()) return json({ error: "Usage expired." }, 410);
        // Repeated acknowledgements do not add usage. A late known result may resolve unknown usage.
        if (record.status === "completed") return json({ recorded: true });
        record.tokens = normalizeLlmTokenUsage(body.tokens);
        record.audioSeconds = typeof body.audioSeconds === "number" && Number.isFinite(body.audioSeconds) &&
          body.audioSeconds >= 0 && body.audioSeconds <= 120 ? body.audioSeconds : null;
        record.status = body.status === "completed" && (record.tokens || record.audioSeconds !== null) ? "completed" : "unknown";
        record.estimatedNeurons = typeof body.estimatedNeurons === "number" && Number.isFinite(body.estimatedNeurons)
          ? Math.max(0, body.estimatedNeurons) : 0;
        // Reservations deliberately remain charged for the day, including uncertain outcomes.
        await storage.put(key!, record);
        return json({ recorded: true });
      });
    }
    return json({ error: "Usage route not found." }, 404);
  }

  async alarm() {
    const now = Date.now();
    const records = await this.state.storage.list<UsageRecord>({ prefix: "event:", limit: 1000 });
    for (const [key, record] of records) {
      if (record.at + USAGE_RETENTION > now) break;
      await this.state.storage.delete([key, `id:${record.id}`]);
    }
    const days = await this.state.storage.list({ prefix: "day:" });
    for (const key of days.keys()) if (Number(key.slice(4)) <= Math.floor((now - USAGE_RETENTION) / DAY)) await this.state.storage.delete(key);
    const remaining = [...(await this.state.storage.list<UsageRecord>({ prefix: "event:", limit: 1 })).values()];
    if (remaining.length) await this.state.storage.setAlarm(Math.max(now + 1000, remaining[0].at + USAGE_RETENTION));
    else await this.state.storage.deleteAlarm();
  }
}
