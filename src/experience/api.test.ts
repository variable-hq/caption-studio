import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LiveWorkerEnvironment } from "@/live/api";
import type { Namespace } from "./contracts";
import { OperatorPreferences } from "./operator-preferences";
import { handleExperienceRequest } from "./api";

vi.mock("jose", () => ({
  createRemoteJWKSet: () => ({}),
  jwtVerify: async (token: string) => {
    if (!token.endsWith("@example.test")) throw new Error("Unknown Access session.");
    return { payload: { email: token } };
  },
}));

const OPERATOR = "terms.operator@example.test";
const plans: { plan?: string; expected: { maxTermsPerList: number; termsImport: boolean } }[] = [
  { expected: { maxTermsPerList: 40, termsImport: true } },
  { plan: "", expected: { maxTermsPerList: 40, termsImport: true } },
  { plan: "pro", expected: { maxTermsPerList: 40, termsImport: true } },
  { plan: "free", expected: { maxTermsPerList: 10, termsImport: false } },
];

function authorized(method: string, path: string, body?: unknown) {
  return new Request(`https://caption.example.test${path}`, {
    method,
    headers: { "cf-access-jwt-assertion": OPERATOR },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function environment(plan?: string, preferences?: Namespace, usage?: Namespace) {
  return {
    ...(plan === undefined ? {} : { WORKSPACE_PLAN: plan }),
    ...(preferences === undefined ? {} : { OPERATOR_PREFERENCES: preferences }),
    ...(usage === undefined ? {} : { AI_USAGE: usage }),
    CLOUDFLARE_ACCESS_AUD: "caption-studio-audience",
    CLOUDFLARE_ACCESS_TEAM_DOMAIN: "https://caption-studio.cloudflareaccess.com",
  } as unknown as LiveWorkerEnvironment;
}

class SetupStorage {
  values = new Map<string, unknown>();
  async get<T>(key: string) { return structuredClone(this.values.get(key)) as T | undefined; }
  async put(key: string, value: unknown) { this.values.set(key, structuredClone(value)); }
  async delete(key: string) { this.values.delete(key); }
  async transaction<T>(work: (store: SetupStorage) => Promise<T>) { return work(this); }
}

describe("experience limits route", () => {
  it.each(plans)("returns Terms limits for plan $plan", async ({ plan, expected }) => {
    const response = await handleExperienceRequest(authorized("GET", "/api/live/experience/limits"), environment(plan));
    expect(response?.status).toBe(200);
    expect(await response?.json()).toEqual(expected);
  });

  it("requires operator authorization and is read-only", async () => {
    const env = environment("free");
    const unauthorized = await handleExperienceRequest(new Request("https://caption.example.test/api/live/experience/limits"), env);
    const post = await handleExperienceRequest(authorized("POST", "/api/live/experience/limits"), env);
    expect(unauthorized?.status).toBe(401);
    expect(post?.status).toBe(405);
  });

  it("answers without the preferences Durable Object binding", async () => {
    const response = await handleExperienceRequest(authorized("GET", "/api/live/experience/limits"), environment("free"));
    expect(response?.status).toBe(200);
    expect(await response?.json()).toEqual({ maxTermsPerList: 10, termsImport: false });
  });
});

describe("Terms plan pass-through", () => {
  let forwarded: Request[];
  let preferences: Namespace;

  beforeEach(() => {
    forwarded = [];
    preferences = {
      idFromName: (name) => name,
      get: () => ({
        fetch: async (request) => {
          forwarded.push(request);
          return Response.json({ ok: true });
        },
      }),
    };
  });

  it.each(plans)("forwards the Worker plan limit on preferences and setup, ignoring client values ($plan)", async ({ plan, expected }) => {
    for (const operation of ["preferences", "setup"]) {
      const response = await handleExperienceRequest(
        new Request(`https://caption.example.test/api/live/experience/${operation}?termsMax=777`, {
          method: "POST",
          headers: {
            "cf-access-jwt-assertion": OPERATOR,
            "x-terms-max": "888",
            "content-type": "application/json",
          },
          body: JSON.stringify({ termsMax: 999, translationDefaults: { keywordText: "synthetic" } }),
        }),
        environment(plan, preferences),
      );
      expect(response?.status).toBe(200);
    }
    expect(forwarded).toHaveLength(2);
    for (const request of forwarded) {
      const url = new URL(request.url);
      expect(url.pathname).toBe("/preferences");
      expect(url.searchParams.get("termsMax")).toBe(String(expected.maxTermsPerList));
      expect(await request.json()).toMatchObject({ translationDefaults: { keywordText: "synthetic" } });
    }
  });

  it("keeps preset allowance pass-through unchanged", async () => {
    const response = await handleExperienceRequest(authorized("GET", "/api/live/experience/presets"), environment("free", preferences));
    expect(response?.status).toBe(200);
    expect(new URL(forwarded[0]!.url).pathname).toBe("/presets");
    expect(new URL(forwarded[0]!.url).searchParams.get("max")).toBe("0");
  });

  it("keeps usage operations unchanged", async () => {
    let usagePath = "";
    const usage: Namespace = {
      idFromName: (name) => name,
      get: () => ({ fetch: async (request) => { usagePath = new URL(request.url).pathname + new URL(request.url).search; return Response.json({ records: [] }); } }),
    };
    const response = await handleExperienceRequest(authorized("GET", "/api/live/experience/usage?after=cursor"), environment("free", preferences, usage));
    expect(response?.status).toBe(200);
    expect(usagePath).toBe("/history?after=cursor");
  });

  it("refuses an over-cap first shared setup save without writing a partial record", async () => {
    const storage = new SetupStorage();
    const object = new OperatorPreferences({ storage } as unknown as DurableObjectState);
    const namespace: Namespace = { idFromName: (name) => name, get: () => ({ fetch: (request) => object.fetch(request) }) };
    const response = await handleExperienceRequest(
      authorized("POST", "/api/live/experience/setup", {
        theme: "dark",
        translationDefaults: { keywordText: Array.from({ length: 11 }, (_, index) => `synthetic-${index}`).join(", "), filterText: "" },
      }),
      environment("free", namespace),
    );
    expect(response?.status).toBe(409);
    expect(await response?.json()).toMatchObject({ code: "terms-limit-reached", max: 10 });
    expect(storage.values.size).toBe(0);
  });
});
