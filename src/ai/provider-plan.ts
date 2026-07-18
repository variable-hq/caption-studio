export const PROVIDER_PLAN = {
  phase1a: {
    mode: "cloud-free-tier",
    hosting: {
      provider: "Cloudflare Workers",
      freeRequestLimitPerDay: 100_000,
    },
    transcription: {
      provider: "GroqCloud",
      model: "whisper-large-v3-turbo",
      recommendedChunkSeconds: 4,
    },
    translation: {
      provider: "GroqCloud",
      model: "llama-3.1-8b-instant",
      maxTargetsPerSession: 1,
    },
    quotaFallback: "Continue source captions when translation is unavailable",
  },
  phase1b: {
    mode: "paid-optional",
    transcription: "Higher-limit or realtime provider adapter",
    translation: "Higher-quality context-aware provider adapter",
    keepProviderContracts: true,
  },
} as const;
