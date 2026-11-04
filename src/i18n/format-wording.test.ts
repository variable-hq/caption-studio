import { describe, expect, it } from "vitest";

import { translate, translatePlural, type UiLocale } from "@/i18n";
import { resolveWorkspacePreset, type BuiltInPresetId } from "@/experience/presets";
import { workspaceFormatView } from "@/components/operator/workspace-format";

// Synthetic workspace name, passed to the messages the way the operator screens pass the saved name.
const WORKSPACE = "Synthetic workspace";

type FormatWording = {
  preset: BuiltInPresetId;
  name: Record<UiLocale, string>;
  /** The Transcripts tab label and the Transcripts heading, which use the same term. */
  transcriptsTitle: Record<UiLocale, string>;
  transcriptsHint: Record<UiLocale, string>;
  liveSaveHint: Record<UiLocale, string>;
  manualCaptionExample: Record<UiLocale, string>;
  starterTerms: readonly string[];
  /** The "N starter terms added" note the format's preview shows, when it sets starter terms. */
  starterAdded?: Record<UiLocale, string>;
};

const FORMATS: readonly FormatWording[] = [
  {
    preset: "builtin:general",
    name: { en: "General", id: "Umum" },
    transcriptsTitle: { en: "Transcripts", id: "Transkrip" },
    transcriptsHint: {
      en: `Saved transcripts are kept for 7 days and shared with everyone at ${WORKSPACE}.`,
      id: `Transkrip disimpan selama 7 hari dan dibagikan kepada semua orang di ${WORKSPACE}.`,
    },
    liveSaveHint: {
      en: `For Transcripts and AI summary, shared with everyone at ${WORKSPACE}. Tell attendees when it’s on.`,
      id: `Untuk Transkrip dan ringkasan AI, dibagikan kepada semua orang di ${WORKSPACE}. Beri tahu hadirin saat fitur ini aktif.`,
    },
    manualCaptionExample: { en: "e.g. Please silence your phones…", id: "mis. Mohon senyapkan ponsel Anda…" },
    starterTerms: [],
  },
  {
    preset: "builtin:sermon",
    name: { en: "Sermon", id: "Khotbah" },
    transcriptsTitle: { en: "Sermons", id: "Khotbah" },
    transcriptsHint: {
      en: `Saved sermons are kept for 7 days and shared with everyone at ${WORKSPACE}.`,
      id: `Khotbah disimpan selama 7 hari dan dibagikan kepada semua orang di ${WORKSPACE}.`,
    },
    liveSaveHint: {
      en: `For Sermons and AI summary, shared with everyone at ${WORKSPACE}. Tell the congregation when it’s on.`,
      id: `Untuk Khotbah dan ringkasan AI, dibagikan kepada semua orang di ${WORKSPACE}. Beri tahu jemaat saat fitur ini aktif.`,
    },
    manualCaptionExample: { en: "e.g. Reading Psalm 23…", id: "mis. Membaca Mazmur 23…" },
    starterTerms: ["Yesus Kristus", "Roh Kudus", "Betlehem", "Saul", "Daud", "Musa", "Petrus", "Paulus", "Yohanes"],
    starterAdded: { en: "9 starter terms added", id: "9 istilah awal ditambahkan" },
  },
  {
    preset: "builtin:talkshow",
    name: { en: "Talkshow", id: "Talkshow" },
    transcriptsTitle: { en: "Episodes", id: "Episode" },
    transcriptsHint: {
      en: `Saved episodes are kept for 7 days and shared with everyone at ${WORKSPACE}.`,
      id: `Episode disimpan selama 7 hari dan dibagikan kepada semua orang di ${WORKSPACE}.`,
    },
    liveSaveHint: {
      en: `For Episodes and AI summary, shared with everyone at ${WORKSPACE}. Tell attendees when it’s on.`,
      id: `Untuk Episode dan ringkasan AI, dibagikan kepada semua orang di ${WORKSPACE}. Beri tahu hadirin saat fitur ini aktif.`,
    },
    manualCaptionExample: { en: "e.g. Guest: Dr. Rina…", id: "mis. Tamu: Dr. Rina…" },
    starterTerms: [],
  },
  {
    preset: "builtin:keynote",
    name: { en: "Keynote", id: "Keynote" },
    transcriptsTitle: { en: "Talks", id: "Presentasi" },
    transcriptsHint: {
      en: `Saved talks are kept for 7 days and shared with everyone at ${WORKSPACE}.`,
      id: `Presentasi disimpan selama 7 hari dan dibagikan kepada semua orang di ${WORKSPACE}.`,
    },
    liveSaveHint: {
      en: `For Talks and AI summary, shared with everyone at ${WORKSPACE}. Tell attendees when it’s on.`,
      id: `Untuk Presentasi dan ringkasan AI, dibagikan kepada semua orang di ${WORKSPACE}. Beri tahu hadirin saat fitur ini aktif.`,
    },
    manualCaptionExample: { en: "e.g. Demo of Acme Cloud…", id: "mis. Demo Acme Cloud…" },
    starterTerms: [],
  },
];

const LOCALES: readonly UiLocale[] = ["en", "id"];
// The top bar's format label, as the operator provider composes it from the resolved preset.
const FORMAT_ARIA_LABEL: Record<UiLocale, string> = { en: "Session format: ", id: "Format sesi: " };

// Each case resolves the preset as the operator provider does (resolveWorkspacePreset, then translate
// with that preset), so these checks cover the same wording the operator screens render.
for (const format of FORMATS) {
  describe(`operator wording for ${format.preset}`, () => {
    const preset = resolveWorkspacePreset(format.preset);

    it("names the Transcripts tab and heading", () => {
      for (const locale of LOCALES) {
        expect(translate(locale, "shell.navigation.transcripts", undefined, preset), locale).toBe(format.transcriptsTitle[locale]);
        expect(translate(locale, "transcripts.title", undefined, preset), locale).toBe(format.transcriptsTitle[locale]);
      }
    });

    it("states the saved-transcript retention and sharing on the Transcripts screen", () => {
      for (const locale of LOCALES) {
        expect(translate(locale, "transcripts.hint", { workspace: WORKSPACE }, preset), locale).toBe(format.transcriptsHint[locale]);
      }
    });

    it("names the transcript and AI summary on the Live save hint", () => {
      for (const locale of LOCALES) {
        expect(translate(locale, "live.saveTranscriptHint", { workspace: WORKSPACE }, preset), locale).toBe(format.liveSaveHint[locale]);
      }
    });

    it("names the format in the top bar and its label", () => {
      for (const locale of LOCALES) {
        const name = workspaceFormatView(preset, locale, false).name;
        expect(name, locale).toBe(format.name[locale]);
        expect(translate(locale, "shell.format.ariaLabel", { format: name }, preset), locale).toBe(`${FORMAT_ARIA_LABEL[locale]}${format.name[locale]}`);
      }
    });

    it("fills the manual caption example", () => {
      for (const locale of LOCALES) {
        expect(translate(locale, "manualCaption.placeholder", undefined, preset), locale).toBe(format.manualCaptionExample[locale]);
      }
    });

    it("adds exactly the starter terms the format sets", () => {
      const starters = preset.defaults?.starterTerms ?? [];
      expect(starters.map((term) => term.word)).toEqual(format.starterTerms);
      for (const locale of LOCALES) {
        if (format.starterAdded) {
          expect(translatePlural(locale, "settings.presets.starterAdded", starters.length, undefined, preset), locale).toBe(format.starterAdded[locale]);
        }
      }
    });
  });
}
