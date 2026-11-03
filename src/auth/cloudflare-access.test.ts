import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CloudAccessError,
  isCloudAccessConfigured,
  requireCloudAccess,
} from "@/auth/cloudflare-access";

describe("Cloudflare Access guard", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("fails closed in production when Access is not configured", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CLOUDFLARE_ACCESS_AUD", "");
    vi.stubEnv("CLOUDFLARE_ACCESS_TEAM_DOMAIN", "");

    await expect(requireCloudAccess(new Request("https://example.test"))).rejects.toMatchObject({
      status: 503,
    } satisfies Partial<CloudAccessError>);
  });

  it("allows local development without a Cloudflare Access tenant", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("CLOUDFLARE_ACCESS_AUD", "");
    vi.stubEnv("CLOUDFLARE_ACCESS_TEAM_DOMAIN", "");

    await expect(requireCloudAccess(new Request("http://localhost"))).resolves.toEqual({ email: null });
  });

  it("requires a signed Access token when deployment values exist", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CLOUDFLARE_ACCESS_AUD", "caption-studio-audience");
    vi.stubEnv(
      "CLOUDFLARE_ACCESS_TEAM_DOMAIN",
      "https://caption-studio.cloudflareaccess.com",
    );

    expect(isCloudAccessConfigured()).toBe(true);
    await expect(requireCloudAccess(new Request("https://example.test"))).rejects.toMatchObject({
      status: 401,
    } satisfies Partial<CloudAccessError>);
  });
});
