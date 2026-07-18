export const PROVIDER_PLAN = {
  phase1a: {
    mode: "local",
    transcription: {
      provider: "whisper.cpp",
      model: "Whisper small multilingual",
      fallbackModels: ["Whisper base multilingual", "Whisper medium multilingual"],
    },
    translation: {
      provider: "Transformers local worker",
      model: "google/madlad400-3b-mt",
      maxTargetsPerSession: 1,
    },
  },
  phase1b: {
    mode: "paid-optional",
    transcription: "OpenAI realtime transcription adapter",
    translation: "OpenAI context-aware translation adapter",
    keepLocalFallback: true,
  },
} as const;
