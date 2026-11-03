import { describe, expect, it } from "vitest";

import {
  localeFromAcceptLanguage,
  normalizeUiLocale,
  normalizeUiLocalePreference,
  translate,
  translatePlural,
  type MessageKey,
} from "@/i18n";
import { en } from "@/i18n/messages/en";
import { id } from "@/i18n/messages/id";
import { formatCount, formatDecimal } from "@/components/operator/format-count";
import { BUILT_IN_PRESETS, GENERAL_PRESET, presetTermParams, resolveWorkspacePreset } from "@/experience/presets";

// Messages with the General term set filled in, as the operator interface shows them.
const enDisplay: Record<string, string> = Object.fromEntries(
  Object.keys(en).map((key) => [key, translate("en", key as MessageKey)]),
);
const idDisplay: Record<string, string> = Object.fromEntries(
  Object.keys(id).map((key) => [key, translate("id", key as MessageKey)]),
);

describe("operator interface translations", () => {
  it("keeps every Indonesian key and placeholder aligned with English", () => {
    // Term names may differ only in the capital letter of Term_ between languages; other names must match exactly.
    const placeholders = (message: string) => [...message.matchAll(/\{([a-zA-Z0-9_]+)\}/gu)].map((match) => match[1].replace(/^Term_/u, "term_")).sort();

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
    expect(en["common.savedDefaultBadge"]).toBe(" · Saved default");
    expect(id["common.savedDefaultBadge"]).toBe(" · Default tersimpan");
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
    expect(enDisplay["live.audienceSees"]).toBe("Audience view");
    expect(idDisplay["live.audienceSees"]).toBe("Tampilan audiens");
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
    expect(enDisplay["translationSettings.source"]).toBe("Speaker\u2019s language");
    expect(idDisplay["translationSettings.source"]).toBe("Bahasa pembicara");
    expect(en["translationSettings.target"]).toBe("Show captions in");
    expect(id["translationSettings.target"]).toBe("Tampilkan caption dalam");
    expect(en["translationSettings.speedTitle"]).toBe("Caption wait time");
    expect(id["translationSettings.speedTitle"]).toBe("Waktu tunggu caption");
    expect(enDisplay["translationSettings.languagesHint"]).toBe("Choosing the speaker\u2019s language manually helps improve reliability.");
    expect(idDisplay["translationSettings.languagesHint"]).toBe("Memilih bahasa pembicara secara manual membantu meningkatkan keandalan.");
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
    expect(enDisplay["settings.message.savedTranslationDefaults"]).toContain("caption wait time, Terms, caption cleanup");
    expect(idDisplay["settings.message.savedTranslationDefaults"]).toContain("waktu tunggu caption, Istilah, pembersihan caption");
    expect(en["liveNote.hint"]).toContain("Settings › Terms");
    expect(id["liveNote.hint"]).toContain("Pengaturan › Istilah");
    expect(enDisplay["liveWord.hint"]).toContain("Keep in Terms");
    expect(idDisplay["liveWord.hint"]).toContain("Simpan di Istilah");
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
    expect(enDisplay["wordsEditor.addHint"]).toBeTruthy();
    expect(idDisplay["wordsEditor.addHint"]).toBeTruthy();
    for (const catalog of [en, id]) {
      for (const key of ["wordAction.recognise", "wordAction.fix", "wordAction.translate"] as const) {
        expect(catalog["wordsEditor.addHint"]).toContain(catalog[key]);
      }
    }
  });

  it("imports a Terms list with one format and no Bible names group", () => {
    expect(en["wordsEditor.importTitle"]).toBe("Import a list");
    expect(id["wordsEditor.importTitle"]).toBe("Impor daftar");
    expect(en["wordsEditor.importHint"]).toContain("term,action,with");
    expect(id["wordsEditor.importHint"]).toContain("istilah,tindakan,dengan");
    expect(en["wordsEditor.importSuccess.one"]).toBe("Imported {count} term.");
    expect(en["wordsEditor.importSuccess.other"]).toBe("Imported {count} terms.");
    expect(id["wordsEditor.importSuccess.one"]).toBe("{count} istilah diimpor.");
    expect(id["wordsEditor.importSuccess.other"]).toBe("{count} istilah diimpor.");
    expect(en["wordsEditor.importParseError"]).toBe("Couldn’t import: line {line} {reason}.");
    expect(id["wordsEditor.importParseError"]).toBe("Gagal mengimpor: baris {line} {reason}.");
    for (const key of [
      "wordsEditor.bibleNamesTitle",
      "wordsEditor.bibleNamesHint",
      "wordsEditor.importNames",
    ]) {
      expect(key in en).toBe(false);
      expect(key in id).toBe(false);
    }
  });

  it("has no Live drafts switch, preview or saved-default copy", () => {
    for (const key of [
      "liveDraft.empty",
      "liveDraft.label",
      "liveDraft.hidden",
      "live.draftsTitle",
      "live.draftsHint",
      "live.draftsStopped",
      "live.draftsSavedChoice",
      "live.draftsSavesForEveryone",
    ]) {
      expect(key in en).toBe(false);
      expect(key in id).toBe(false);
    }
  });

  it("no operator message names the feature Words", () => {
    for (const [key, message] of [...Object.entries(en), ...Object.entries(id)]) {
      expect(message, `${key} avoids the feature name “Words”`).not.toContain("Words");
    }
  });

  it("gives the empty Terms list generic examples", () => {
    expect(enDisplay["wordsEditor.empty"]).toBe("No terms yet. Add names or terms the AI should know, such as speaker names, place or product names, or terms never to show.");
    expect(idDisplay["wordsEditor.empty"]).toBe("Belum ada istilah. Tambahkan nama atau istilah yang perlu dikenali AI, misalnya nama pembicara, tempat, atau produk, atau istilah yang tidak boleh ditampilkan.");
  });

  it("names the saved archive Transcripts in both catalogs", () => {
    expect(enDisplay["shell.navigation.transcripts"]).toBe("Transcripts");
    expect(idDisplay["shell.navigation.transcripts"]).toBe("Transkrip");
    expect(enDisplay["transcripts.title"]).toBe("Transcripts");
    expect(idDisplay["transcripts.title"]).toBe("Transkrip");
    expect(en["sessionExperience.readerTitle"]).toBe("Transcript reader");
    expect(id["sessionExperience.readerTitle"]).toBe("Pembaca transkrip");
    expect(enDisplay["sessionExperience.savedTranscripts"]).toBe("Saved transcripts");
    expect(idDisplay["sessionExperience.savedTranscripts"]).toBe("Transkrip tersimpan");
  });

  it("calls the captioned event a session and keeps service for the backend", () => {
    const backendServiceKeys = new Set([
      "aiUsage.title",
      "readiness.service",
      "live.startHelp.checkingService",
      "live.startHelp.notConfigured",
      "live.message.captionServiceBusy",
      "usage.byAiService",
    ]);
    for (const [key, message] of Object.entries(en)) {
      if (!backendServiceKeys.has(key)) {
        expect(message, `${key} avoids the event sense of service`).not.toMatch(/\bservices?\b/iu);
      }
    }
    for (const [key, message] of Object.entries(id)) {
      if (!backendServiceKeys.has(key)) {
        expect(message, `${key} avoids layanan`).not.toMatch(/layanan/iu);
      }
    }
    expect(enDisplay["shell.controls.endSession"]).toBe("End session");
    expect(idDisplay["shell.controls.endSession"]).toBe("Akhiri sesi");
    expect(enDisplay["dialog.endAction"]).toBe("End session");
    expect(enDisplay["live.message.ended"]).toBe("Live session ended. The reusable OBS URL is ready for next time.");
    expect(enDisplay["usage.sessions"]).toBe("Sessions");
    expect(idDisplay["usage.sessions"]).toBe("Sesi");
    expect(enDisplay["usage.bySession"]).toBe("Usage by session");
    expect(idDisplay["usage.bySession"]).toBe("Penggunaan per sesi");
    expect(enDisplay["reader.status.ended"]).toBe("Session ended");
    expect(idDisplay["reader.status.ended"]).toBe("Sesi berakhir");
  });

  it("addresses the audience and attendees instead of the congregation", () => {
    for (const [key, message] of [...Object.entries(en), ...Object.entries(id)]) {
      expect(message, `${key} avoids congregation wording`).not.toMatch(/congregation|jemaat/iu);
    }
    expect(enDisplay["liveOutputs.phoneViewerLiveHint"]).toBe(
      "Share this with the audience. It shows only the current caption and stops working when the session ends.",
    );
    expect(idDisplay["liveOutputs.phoneViewerLiveHint"]).toBe(
      "Bagikan ini dengan audiens. Ini hanya menampilkan caption saat ini dan berhenti berfungsi saat sesi berakhir.",
    );
    expect(enDisplay["live.saveTranscriptHint"]).toContain("Tell attendees when it’s on.");
    expect(idDisplay["live.saveTranscriptHint"]).toContain("Beri tahu hadirin saat fitur ini aktif.");
    expect(enDisplay["help.step4.after"]).toBe("link and share it with the audience.");
    expect(idDisplay["help.step4.after"]).toBe("dan bagikan kepada audiens.");
  });

  it("calls the person talking the speaker and drops the example names", () => {
    for (const key of ["liveWord.placeholderWord", "liveWord.placeholderFix", "wordsEditor.placeholderWord"] as const) {
      expect(enDisplay[key]).toBe("e.g. Speaker’s name…");
      expect(idDisplay[key]).toBe("mis. Nama pembicara…");
    }
    expect(enDisplay["live.startHelp.ready"]).toBe("Press Start when the speaker begins.");
    expect(idDisplay["live.startHelp.ready"]).toBe("Tekan Mulai saat pembicara mulai berbicara.");
    expect(enDisplay["help.step3.after"]).toBe("when the speaker begins.");
    expect(idDisplay["help.step3.after"]).toBe("saat pembicara mulai berbicara.");
    expect(id["translationChange.spokenLanguage"]).toBe("Bahasa pembicara");
  });

  it("no operator message uses sermon, preacher or pastor wording", () => {
    const forbidden = ["sermon", "khotbah", "preacher", "pengkhotbah", "pastor"];
    for (const [key, message] of [...Object.entries(en), ...Object.entries(id)]) {
      for (const phrase of forbidden) {
        expect(message.toLowerCase(), `${key} avoids “${phrase}”`).not.toContain(phrase);
      }
    }
  });

  it("labels each wait-time option by its cap and names Dynamic", () => {
    expect(en["recordingWindow.dynamicShort"]).toBe("Dynamic");
    expect(id["recordingWindow.dynamicShort"]).toBe("Dynamic");
    expect(en["translationSettings.windowFastest"]).toBe("6 seconds: quickest, may break mid-sentence");
    expect(id["translationSettings.windowFastest"]).toBe("6 detik: tercepat, bisa terpotong di tengah kalimat");
    expect(en["translationSettings.windowBalanced"]).toBe("10 seconds: balanced");
    expect(id["translationSettings.windowBalanced"]).toBe("10 detik: seimbang");
    expect(en["translationSettings.windowSmooth"]).toBe("14 seconds: fuller sentences");
    expect(id["translationSettings.windowSmooth"]).toBe("14 detik: kalimat lebih utuh");
    expect(enDisplay["translationSettings.windowAutomatic"]).toBe("Dynamic: adapts to the speaker, up to 14 seconds");
    expect(idDisplay["translationSettings.windowAutomatic"]).toBe("Dynamic: menyesuaikan pembicara, hingga 14 detik");
    expect(enDisplay["translationSettings.speedHint"]).toContain("Sets the longest each caption waits.");
    expect(idDisplay["translationSettings.speedHint"]).toContain("waktu tunggu terlama");
  });

  it("reports the provider busy back-off in both languages", () => {
    expect(en["live.message.captionServiceBusy"]).toBe("The caption service is busy, so captions will wait a little longer.");
    expect(id["live.message.captionServiceBusy"]).toBe("Layanan caption sedang sibuk, jadi caption akan menunggu sedikit lebih lama.");
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

  it("fills every term placeholder from the General term set", () => {
    for (const [locale, catalog] of [["en", en], ["id", id]] as const) {
      const termNames = new Set(Object.keys(presetTermParams(GENERAL_PRESET, locale)));
      for (const [key, message] of Object.entries<string>(catalog)) {
        for (const [, name] of message.matchAll(/\{([a-zA-Z0-9_]+)\}/gu)) {
          if (/^[Tt]erm_/u.test(name)) expect(termNames.has(name), `${locale} ${key} uses ${name}`).toBe(true);
        }
      }
    }
  });

  it("keeps the resolved General wording of every message", () => {
    expect(enDisplay).toMatchSnapshot();
    expect(idDisplay).toMatchSnapshot();
  });

  it("keeps every preset override to a catalog key whose placeholders it uses", () => {
    const names = (text: string) => [...text.matchAll(/\{([a-zA-Z0-9_]+)\}/gu)].map((match) => match[1]);
    for (const preset of BUILT_IN_PRESETS) {
      for (const locale of ["en", "id"] as const) {
        const catalog: Record<string, string> = locale === "en" ? en : id;
        for (const [key, message] of Object.entries(preset.messageOverrides?.[locale] ?? {})) {
          expect(catalog[key], `${preset.id} ${locale} ${key} exists in the catalog`).toBeDefined();
          for (const name of names(message)) {
            expect(names(catalog[key]), `${preset.id} ${locale} ${key} uses ${name}, which the base message lacks`).toContain(name);
          }
        }
      }
    }
  });

  it("renders the Sermon, Talkshow and Keynote wording", () => {
    const sermon = resolveWorkspacePreset("builtin:sermon");
    expect(translate("en", "liveOutputs.phoneViewerLiveHint", undefined, sermon)).toBe(
      "Share this with the congregation. It shows only the current caption and stops working when the service ends.",
    );
    expect(translate("en", "live.saveTranscriptHint", { workspace: "BEST" }, sermon)).toBe(
      "For Sermons and AI summary, shared with everyone at BEST. Tell the congregation when it’s on.",
    );
    expect(translate("en", "liveWord.placeholderWord", undefined, sermon)).toBe("e.g. Reading Psalm 23…");
    expect(translate("id", "liveOutputs.phoneViewerLiveHint", undefined, sermon)).toBe(
      "Bagikan ini dengan jemaat. Ini hanya menampilkan caption saat ini dan berhenti berfungsi saat ibadah berakhir.",
    );
    expect(translate("en", "transcripts.title", undefined, sermon)).toBe("Sermons");
    expect(translate("en", "help.step4.after", undefined, resolveWorkspacePreset("builtin:keynote"))).toBe(
      "link and share it with the attendees.",
    );
    expect(translate("en", "manualCaption.placeholder", undefined, resolveWorkspacePreset("builtin:talkshow"))).toBe(
      "e.g. Guest: Dr. Rina…",
    );
  });

  it("renders the General wording when no preset is given or the profile is unknown", () => {
    expect(translate("en", "liveOutputs.phoneViewerLiveHint", undefined, resolveWorkspacePreset("builtin:market"))).toBe(
      enDisplay["liveOutputs.phoneViewerLiveHint"],
    );
  });
});
