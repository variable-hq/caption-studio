import { describe, expect, it } from "vitest";

import {
  localeFromAcceptLanguage,
  normalizeUiLocale,
  normalizeUiLocalePreference,
  translate,
  translatePlural,
} from "@/i18n";
import { en } from "@/i18n/messages/en";
import { id } from "@/i18n/messages/id";
import { formatCount, formatDecimal } from "@/components/operator/format-count";

describe("operator interface translations", () => {
  it("keeps every Indonesian key and placeholder aligned with English", () => {
    const placeholders = (message: string) => [...message.matchAll(/\{([a-zA-Z0-9_]+)\}/gu)].map((match) => match[1]).sort();

    for (const [key, message] of Object.entries(id)) {
      expect(key in en, `${key} exists in English`).toBe(true);
      expect(message.trim(), `${key} is not empty`).not.toBe("");
      expect(placeholders(message), `${key} placeholders`).toEqual(placeholders(en[key as keyof typeof en]));
    }
    for (const [key, message] of Object.entries(en)) {
      expect(message.trim(), `${key} is not empty`).not.toBe("");
    }
  });

  it("drops the redundant empty output-buffer queue message", () => {
    expect("outputBuffer.empty" in en).toBe(false);
    expect("outputBuffer.empty" in id).toBe(false);
  });

  it("uses system for the local device and the capture role", () => {
    const forbidden = [
      "this computer",
      "another computer",
      "capture computer",
      "caption computer",
      "komputer ini",
      "komputer lain",
      "komputer caption",
    ];
    for (const [key, message] of [...Object.entries(en), ...Object.entries(id)]) {
      for (const phrase of forbidden) {
        expect(message.toLowerCase(), `${key} avoids “${phrase}”`).not.toContain(phrase);
      }
    }
  });

  it("names saved defaults without church wording", () => {
    expect(en["common.churchDefaultBadge"]).toBe(" · Saved default");
    expect(id["common.churchDefaultBadge"]).toBe(" · Default tersimpan");
    expect(en["live.makeDefault"]).toBe("Save selected settings as default");
    expect(id["live.makeDefault"]).toBe("Simpan pengaturan terpilih sebagai default");
    for (const [locale, catalog] of [["en", en], ["id", id]] as const) {
      for (const [key, message] of Object.entries(catalog)) {
        expect(message.toLowerCase(), `${locale} ${key} does not say church default`).not.toContain("church default");
        expect(message.toLowerCase(), `${locale} ${key} does not say bawaan gereja`).not.toContain("bawaan gereja");
      }
    }
  });

  it("names the Live panes by role", () => {
    expect(en["live.onlyYou"]).toBe("Operator view");
    expect(id["live.onlyYou"]).toBe("Tampilan operator");
    expect(en["captionPreview.heardLabel"]).toBe("Heard \u00b7 operator view");
    expect(id["captionPreview.heardLabel"]).toBe("Terdengar \u00b7 tampilan operator");
    expect(en["live.audienceSees"]).toBe("Audience view");
    expect(id["live.audienceSees"]).toBe("Tampilan audiens");
  });

  it("names the Settings sections and Theme", () => {
    expect(en["settings.section.computer.title"]).toBe("System");
    expect(id["settings.section.computer.title"]).toBe("Sistem");
    expect(en["settings.section.languages.title"]).toBe("Language");
    expect(id["settings.section.languages.title"]).toBe("Bahasa");
    expect(en["settings.section.look.title"]).toBe("Output");
    expect(id["settings.section.look.title"]).toBe("Keluaran");
    expect(en["settings.section.translator.title"]).toBe("Translation");
    expect(id["settings.section.translator.title"]).toBe("Terjemahan");
    expect(en["settings.section.summary.title"]).toBe("Summary");
    expect(id["settings.section.summary.title"]).toBe("Ringkasan");
    expect(en["settings.appearance.title"]).toBe("Theme");
    expect(id["settings.appearance.title"]).toBe("Tema");
  });

  it("drops the System and Language section descriptions", () => {
    expect("settings.section.computer.description" in en).toBe(false);
    expect("settings.section.computer.description" in id).toBe(false);
    expect("settings.section.languages.description" in en).toBe(false);
    expect("settings.section.languages.description" in id).toBe(false);
  });

  it("uses System default for follow-the-device choices", () => {
    expect(en["settings.appearance.matchComputer"]).toBe("System default");
    expect(id["settings.appearance.matchComputer"]).toBe("Default sistem");
    expect(en["settings.interfaceLanguage.matchBrowser"]).toBe("System default");
    expect(id["settings.interfaceLanguage.matchBrowser"]).toBe("Default sistem");
  });

  it("labels the language fields and the caption wait time", () => {
    expect(en["translationSettings.sourceKind"]).toBe("Input");
    expect(id["translationSettings.sourceKind"]).toBe("Input");
    expect(en["translationSettings.targetKind"]).toBe("Output");
    expect(id["translationSettings.targetKind"]).toBe("Output");
    expect(en["translationSettings.source"]).toBe("Speaker\u2019s language");
    expect(id["translationSettings.source"]).toBe("Bahasa pembicara");
    expect(en["translationSettings.target"]).toBe("Show captions in");
    expect(id["translationSettings.target"]).toBe("Tampilkan caption dalam");
    expect(en["translationSettings.speedTitle"]).toBe("Caption wait time");
    expect(id["translationSettings.speedTitle"]).toBe("Waktu tunggu caption");
    expect(en["translationSettings.languagesHint"]).toBe("Choosing the speaker\u2019s language manually helps improve reliability.");
    expect(id["translationSettings.languagesHint"]).toBe("Memilih bahasa pembicara secara manual membantu meningkatkan keandalan.");
  });

  it("drops the old section names and the caption speed term", () => {
    const forbidden = [
      "caption speed",
      "kecepatan caption",
      "languages & timing",
      "bahasa & waktu",
      "light or dark",
      "terang atau gelap",
    ];
    for (const [key, message] of [...Object.entries(en), ...Object.entries(id)]) {
      for (const phrase of forbidden) {
        expect(message.toLowerCase(), `${key} avoids \u201c${phrase}\u201d`).not.toContain(phrase);
      }
    }
  });

  it("renames the Words feature to Terms in both catalogs", () => {
    expect(en["settings.section.words.title"]).toBe("Terms");
    expect(id["settings.section.words.title"]).toBe("Istilah");
    expect(en["settings.section.words.description"]).toBe("Names the AI should know, and terms to keep off the screen.");
    expect(id["settings.section.words.description"]).toBe("Nama yang harus diketahui AI, dan istilah yang tidak boleh tampil di layar.");
    expect(en["readiness.words"]).toBe("Terms");
    expect(id["readiness.words"]).toBe("Istilah");
    expect(en["readiness.wordCount.one"]).toBe("{count} term");
    expect(id["readiness.wordCount.one"]).toBe("{count} istilah");
    expect(en["readiness.wordCount.other"]).toBe("{count} terms");
    expect(id["readiness.wordCount.other"]).toBe("{count} istilah");
    expect(en["settings.message.savedTranslationDefaults"]).toContain("caption wait time, Terms, caption cleanup");
    expect(id["settings.message.savedTranslationDefaults"]).toContain("waktu tunggu caption, Istilah, pembersihan caption");
    expect(en["liveNote.hint"]).toContain("Settings › Terms");
    expect(id["liveNote.hint"]).toContain("Pengaturan › Istilah");
    expect(en["liveWord.hint"]).toContain("Keep in Terms");
    expect(id["liveWord.hint"]).toContain("Simpan di Istilah");
    expect(en["liveWord.keep"]).toBe("Keep in Terms");
    expect(id["liveWord.keep"]).toBe("Simpan di Istilah");
    expect(en["liveWord.word"]).toBe("Term");
    expect(id["liveWord.word"]).toBe("Istilah");
    expect(en["liveWord.empty"]).toBe("No quick overrides in use. Add a term and choose what to do.");
    expect(id["liveWord.empty"]).toBe("Tidak ada quick override yang digunakan. Tambahkan istilah dan pilih tindakan.");
    expect(en["common.typeWordFirst"]).toBe("Type the term first.");
    expect(id["common.typeWordFirst"]).toBe("Ketik istilah terlebih dahulu.");
    expect(en["wordsEditor.yourWordsTitle"]).toBe("Your terms");
    expect(id["wordsEditor.yourWordsTitle"]).toBe("Istilah Anda");
    expect(en["wordsEditor.word"]).toBe("Term");
    expect(id["wordsEditor.word"]).toBe("Istilah");
    expect(en["wordsEditor.addTitle"]).toBe("Add a term");
    expect(id["wordsEditor.addTitle"]).toBe("Tambah istilah");
    expect(en["wordsEditor.add"]).toBe("Add term");
    expect(id["wordsEditor.add"]).toBe("Tambah istilah");
    expect(en["wordsEditor.overLimit"]).toBe("Only the first {max} names and terms and the first {max} hidden terms are used. Remove some you no longer need.");
    expect(id["wordsEditor.overLimit"]).toBe("Hanya {max} nama dan istilah pertama serta {max} istilah tersembunyi pertama yang digunakan. Hapus beberapa yang tidak lagi diperlukan.");
  });

  it("keeps ordinary word wording and the imported names", () => {
    expect(en["wordAction.mask"]).toBe("Hide the word (***)");
    expect(id["wordAction.mask"]).toBe("Sembunyikan kata (***)");
    expect(en["recentOutputs.hint"]).toBe("Wrong word? Use Quick override.");
    expect(id["recentOutputs.hint"]).toBe("Kata keliru? Gunakan Quick override.");
    expect(en["inference.low"]).toBe("Close: nearly word for word");
    expect(id["inference.low"]).toBe("Dekat: hampir kata per kata");
    expect(id["promptEditor.filterHint"]).toContain("kata kasar");
    expect(en["sanitize.balanced.detail"]).toContain("filler words");
    expect(en["liveNote.hint"]).toContain("sound words");
    expect(id["liveNote.hint"]).toContain("kata bunyi");
  });

  it("names the Add a term language hint after the current actions", () => {
    expect(en["wordsEditor.addHint"]).toBeTruthy();
    expect(id["wordsEditor.addHint"]).toBeTruthy();
    for (const catalog of [en, id]) {
      for (const key of ["wordAction.recognise", "wordAction.fix", "wordAction.translate"] as const) {
        expect(catalog["wordsEditor.addHint"]).toContain(catalog[key]);
      }
    }
  });

  it("no operator message names the feature Words", () => {
    for (const [key, message] of [...Object.entries(en), ...Object.entries(id)]) {
      expect(message, `${key} avoids the feature name “Words”`).not.toContain("Words");
    }
  });

  it("gives the empty Terms list generic examples", () => {
    expect(en["wordsEditor.empty"]).toBe("No terms yet. Add names or terms the AI should know, such as a speaker, place or product name, or terms never to show.");
    expect(id["wordsEditor.empty"]).toBe("Belum ada istilah. Tambahkan nama atau istilah yang perlu dikenali AI, misalnya nama pembicara, tempat, atau produk, atau istilah yang tidak boleh ditampilkan.");
  });

  it("names the saved archive Transcripts in both catalogs", () => {
    expect(en["shell.navigation.sermons"]).toBe("Transcripts");
    expect(id["shell.navigation.sermons"]).toBe("Transkrip");
    expect(en["sermons.title"]).toBe("Transcripts");
    expect(id["sermons.title"]).toBe("Transkrip");
    expect(en["serviceExperience.readerTitle"]).toBe("Transcript reader");
    expect(id["serviceExperience.readerTitle"]).toBe("Pembaca transkrip");
    expect(en["serviceExperience.savedSermons"]).toBe("Saved transcripts");
    expect(id["serviceExperience.savedSermons"]).toBe("Transkrip tersimpan");
  });

  it("falls back to English when an Indonesian message is not translated yet", () => {
    expect(translate("id", "shell.navigation.live")).toBe("Live");
    expect(translate("id", "shell.status.ready")).toBe("Siap");
  });

  it("interpolates named parameters and leaves absent placeholders intact", () => {
    expect(translate("en", "shell.controls.sessionStatus", { minutes: 12, transcriptState: "saving" }))
      .toBe("12 min left · Transcript saving");
    expect(translate("en", "shell.controls.sessionStatus", { minutes: 12 }))
      .toBe("12 min left · Transcript {transcriptState}");
  });

  it("selects one or other plural forms with Intl plural rules", () => {
    expect(translatePlural("en", "unit.captionCount", 1)).toBe("1 caption");
    expect(translatePlural("en", "unit.captionCount", 2)).toBe("2 captions");
    expect(translatePlural("id", "unit.captionCount", 2)).toBe("2 caption");
  });

  it("normalizes account preferences and detects English or Indonesian browser languages", () => {
    expect(normalizeUiLocalePreference("id")).toBe("id");
    expect(normalizeUiLocalePreference("fr")).toBeNull();
    expect(normalizeUiLocale(null, ["fr-FR", "id-ID"])).toBe("id");
    expect(normalizeUiLocale(null, ["en-US", "id-ID"])).toBe("en");
    expect(normalizeUiLocale("en", ["id-ID"])).toBe("en");
    expect(normalizeUiLocale(null, ["fr-FR"])).toBe("en");
  });

  it("chooses a public locale from Accept-Language with an English fallback", () => {
    expect(localeFromAcceptLanguage("id-ID,id;q=0.9,en;q=0.8")).toBe("id");
    expect(localeFromAcceptLanguage("en-US,en;q=0.9")).toBe("en");
    expect(localeFromAcceptLanguage("fr-FR,id;q=0.8")).toBe("id");
    expect(localeFromAcceptLanguage("fr-FR")).toBe("en");
    expect(localeFromAcceptLanguage("id;q=0")).toBe("en");
    expect(localeFromAcceptLanguage(null)).toBe("en");
  });

  it("formats counts with the selected interface locale", () => {
    expect(formatCount(12_345, "en")).toBe("12,345");
    expect(formatCount(12_345, "id")).toBe("12.345");
  });

  it("formats one-decimal values with the selected interface locale", () => {
    expect(formatDecimal(1.5, "en")).toBe("1.5");
    expect(formatDecimal(1.5, "id")).toBe("1,5");
  });
});
