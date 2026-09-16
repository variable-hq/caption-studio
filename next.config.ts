import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  agentRules: false,
  // The browser QA scripts load http://127.0.0.1:3100; Next 16 blocks that origin for dev chunks by default.
  allowedDevOrigins: ["127.0.0.1"],
  async headers() {
    return ["/read", "/operator/mobile"].map((source) => ({ source, headers: [
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Permissions-Policy", value: "microphone=(), camera=(), geolocation=()" },
      { key: "Cache-Control", value: "no-store" },
    ] }));
  },
};

export default nextConfig;
