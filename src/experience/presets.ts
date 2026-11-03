/**
 * Workspace presets are declarative data. A preset supplies the wording terms that
 * the operator interface fills into its messages, and starting defaults for the
 * settings a workspace has not saved; it never carries code or changes identifiers,
 * routes, stored fields or the AI safeguards.
 */
import { INFERENCE_LEVEL_OPTIONS, SANITIZE_LEVEL_OPTIONS, type InferenceLevel, type SanitizeLevel } from "@/ai/contracts";
import { MAX_SUMMARY_GUIDANCE_CHARS } from "@/experience/summary-defaults";
import { RECORDING_WINDOW_OPTIONS, type RecordingWindowMs } from "@/live/contracts";
import { OUTPUT_BUFFER_COUNT_OPTIONS, OUTPUT_BUFFER_DWELL_OPTIONS_MS, type OutputBufferCount, type OutputBufferDwellMs } from "@/live/output-buffer";
import { cleanWordValue } from "@/live/words";

export const PRESET_SCHEMA_VERSION = 1;
export const GENERAL_PRESET_ID = "builtin:general";

export const MAX_PRESET_VERSION = 1_000_000;
export const MAX_PRESET_NAME_CHARS = 40;
export const MAX_PRESET_DESCRIPTION_CHARS = 200;
export const MAX_PRESET_AUTHOR_CHARS = 80;
export const MAX_PRESET_TERM_CHARS = 40;
export const MAX_TRANSCRIPTION_PREFIX_CHARS = 120;
export const MAX_PRESET_MODEL_RULE_CHARS = 300;
export const MAX_SUMMARY_FRAMING_CHARS = 120;

export const PRESET_LOCALES = ["en", "id"] as const;
export type PresetLocale = (typeof PRESET_LOCALES)[number];

/** Term names. Each becomes placeholders such as `{term_session}` and `{Term_session}`. */
export const PRESET_TERM_NAMES = ["session", "speaker", "audience", "transcripts"] as const;
export type PresetTermName = (typeof PRESET_TERM_NAMES)[number];

/** Terms with a plural form, used as `{term_sessions}`, `{term_speakers}` and `{term_audiences}`. */
const PLURAL_TERM_NAMES: readonly PresetTermName[] = ["session", "speaker", "audience"];

export type PresetTermForms = { singular: string; plural?: string };
export type PresetTermSet = Record<PresetTermName, PresetTermForms>;
export type PresetLocalizedText = { en: string; id?: string };
/** Whole-message replacements keyed by catalog message key; built-in presets only. */
export type PresetMessageOverrides = Partial<Record<PresetLocale, Record<string, string>>>;

/** A term the Words list starts with: `word => translation`, always translated. */
export type PresetStarterTerm = { word: string; translation: string };
export type PresetSummaryLength = "short" | "detailed";

/**
 * Starting values for settings the workspace has not saved. Each value is a valid option
 * of the setting it fills; a field left out is not filled.
 */
export type PresetDefaults = Partial<{
  recordingWindowMs: RecordingWindowMs;
  inferenceLevel: InferenceLevel;
  sanitizeLevel: SanitizeLevel;
  outputBufferCount: OutputBufferCount;
  outputBufferDwellMs: OutputBufferDwellMs;
  summaryLength: PresetSummaryLength;
  summaryGuidance: string;
  starterTerms: PresetStarterTerm[];
}>;

export type Preset = {
  schemaVersion: typeof PRESET_SCHEMA_VERSION;
  version: number;
  id: string;
  name: PresetLocalizedText;
  description: PresetLocalizedText;
  author?: string;
  /** Indonesian terms fall back through the lookup order in `resolvePresetTerm`. */
  terms: { en: PresetTermSet; id?: PresetTermSet };
  defaults?: PresetDefaults;
  messageOverrides?: PresetMessageOverrides;
  /** Built-in only: the opening of the transcription prompt, before the Terms. */
  transcriptionPrefix?: PresetLocalizedText;
  /** Built-in only: one conditional translation rule, placed after the base safeguards. */
  translationRule?: string;
  /** Built-in only: what the summary's transcript is, stated once in the summary envelope. */
  summaryFraming?: string;
};

const PRESET_FIELDS = ["schemaVersion", "version", "id", "name", "description", "author", "terms", "defaults", "messageOverrides", "transcriptionPrefix", "translationRule", "summaryFraming"] as const;
const PRESET_DEFAULT_FIELDS = [
  "recordingWindowMs",
  "inferenceLevel",
  "sanitizeLevel",
  "outputBufferCount",
  "outputBufferDwellMs",
  "summaryLength",
  "summaryGuidance",
  "starterTerms",
] as const;
const STARTER_TERM_FIELDS = ["word", "translation"] as const;
const SUMMARY_LENGTHS = ["short", "detailed"] as const;
export const MAX_STARTER_TERMS = 40;
const TERM_SET_LOCALES = ["en", "id"] as const;
const CUSTOM_ID_PATTERN = /^custom:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const BUILT_IN_ID_PATTERN = /^builtin:[a-z]+$/u;
// C0 and C1 controls, line and paragraph separators, and bidirectional overrides and isolates.
export const MAX_OVERRIDES_PER_LOCALE = 60;
export const MAX_PRESET_OVERRIDE_CHARS = 400;
const OVERRIDE_KEY_PATTERN = /^[a-zA-Z0-9_.]+$/u;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/u;

export const GENERAL_PRESET: Preset = {
  schemaVersion: PRESET_SCHEMA_VERSION,
  version: 1,
  id: GENERAL_PRESET_ID,
  name: { en: "General", id: "Umum" },
  description: {
    en: "The base wording, used when no format is chosen.",
    id: "Istilah dasar, dipakai saat tidak ada format yang dipilih.",
  },
  terms: {
    en: {
      session: { singular: "session", plural: "sessions" },
      speaker: { singular: "speaker", plural: "speakers" },
      audience: { singular: "audience", plural: "audiences" },
      transcripts: { singular: "transcripts" },
    },
    id: {
      session: { singular: "sesi", plural: "sesi" },
      speaker: { singular: "pembicara", plural: "pembicara" },
      audience: { singular: "audiens", plural: "audiens" },
      transcripts: { singular: "transkrip" },
    },
  },
};

export class PresetValidationError extends Error {
  constructor(message: string) {
    super(`Invalid preset: ${message}`);
    this.name = "PresetValidationError";
  }
}

function fail(message: string): never {
  throw new PresetValidationError(message);
}

function plainRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function rejectUnknownFields(record: Record<string, unknown>, allowed: readonly string[], label: string) {
  for (const field of Object.keys(record)) {
    if (!allowed.includes(field)) fail(`${label} has unknown field "${field}"`);
  }
}

function boundedText(value: unknown, label: string, maxChars: number): string {
  if (typeof value !== "string") fail(`${label} must be text`);
  if (CONTROL_CHARACTERS.test(value)) fail(`${label} must not contain control characters`);
  const text = value.trim();
  if (text === "") fail(`${label} must not be empty`);
  if (text.length > maxChars) fail(`${label} must be ${maxChars} characters or fewer`);
  return text;
}

function localizedText(value: unknown, label: string, maxChars: number): PresetLocalizedText {
  const record = plainRecord(value, label);
  rejectUnknownFields(record, PRESET_LOCALES, label);
  if (record.en === undefined) fail(`${label}.en is required`);
  const text: PresetLocalizedText = { en: boundedText(record.en, `${label}.en`, maxChars) };
  if (record.id !== undefined) text.id = boundedText(record.id, `${label}.id`, maxChars);
  return text;
}

function termForms(value: unknown, term: PresetTermName, label: string): PresetTermForms {
  const record = plainRecord(value, label);
  const allowed = PLURAL_TERM_NAMES.includes(term) ? ["singular", "plural"] : ["singular"];
  rejectUnknownFields(record, allowed, label);
  const forms: PresetTermForms = { singular: boundedText(record.singular, `${label}.singular`, MAX_PRESET_TERM_CHARS) };
  if (PLURAL_TERM_NAMES.includes(term)) {
    if (record.plural === undefined) fail(`${label}.plural is required`);
    forms.plural = boundedText(record.plural, `${label}.plural`, MAX_PRESET_TERM_CHARS);
  }
  return forms;
}

function termSet(value: unknown, label: string): PresetTermSet {
  const record = plainRecord(value, label);
  rejectUnknownFields(record, PRESET_TERM_NAMES, label);
  const set = {} as PresetTermSet;
  for (const term of PRESET_TERM_NAMES) {
    if (record[term] === undefined) fail(`${label}.${term} is required`);
    set[term] = termForms(record[term], term, `${label}.${term}`);
  }
  return set;
}

function presetTerms(value: unknown): Preset["terms"] {
  const record = plainRecord(value, "terms");
  rejectUnknownFields(record, TERM_SET_LOCALES, "terms");
  if (record.en === undefined) fail("terms.en is required");
  const terms: Preset["terms"] = { en: termSet(record.en, "terms.en") };
  if (record.id !== undefined) terms.id = termSet(record.id, "terms.id");
  return terms;
}

function messageOverrides(value: unknown): PresetMessageOverrides {
  const record = plainRecord(value, "messageOverrides");
  rejectUnknownFields(record, PRESET_LOCALES, "messageOverrides");
  const overrides: PresetMessageOverrides = {};
  for (const locale of PRESET_LOCALES) {
    if (record[locale] === undefined) continue;
    const entries = plainRecord(record[locale], `messageOverrides.${locale}`);
    const keys = Object.keys(entries);
    if (keys.length > MAX_OVERRIDES_PER_LOCALE) fail(`messageOverrides.${locale} may have ${MAX_OVERRIDES_PER_LOCALE} keys at most`);
    const table: Record<string, string> = {};
    for (const key of keys) {
      if (!OVERRIDE_KEY_PATTERN.test(key)) fail(`messageOverrides.${locale} key "${key}" is not a message key`);
      table[key] = boundedText(entries[key], `messageOverrides.${locale}.${key}`, MAX_PRESET_OVERRIDE_CHARS);
    }
    overrides[locale] = table;
  }
  return overrides;
}

function oneOf<T>(value: unknown, options: readonly T[], label: string): T {
  if (!(options as readonly unknown[]).includes(value)) fail(`${label} must be one of ${options.join(", ")}`);
  return value as T;
}

function starterTerms(value: unknown): PresetStarterTerm[] {
  if (!Array.isArray(value)) fail("defaults.starterTerms must be a list");
  if (value.length > MAX_STARTER_TERMS) fail(`defaults.starterTerms may have ${MAX_STARTER_TERMS} entries at most`);
  return value.map((entry, index) => {
    const label = `defaults.starterTerms[${index}]`;
    const record = plainRecord(entry, label);
    rejectUnknownFields(record, STARTER_TERM_FIELDS, label);
    const word = boundedText(record.word, `${label}.word`, MAX_PRESET_TERM_CHARS);
    const translation = boundedText(record.translation, `${label}.translation`, MAX_PRESET_TERM_CHARS);
    // The Words list reads `,`, `|` and `=>` as syntax, so a starter term must survive it unchanged.
    if (cleanWordValue(word) !== word || cleanWordValue(translation) !== translation) {
      fail(`${label} must not contain commas, pipes or =>`);
    }
    return { word, translation };
  });
}

function presetDefaults(value: unknown): PresetDefaults {
  const record = plainRecord(value, "defaults");
  rejectUnknownFields(record, PRESET_DEFAULT_FIELDS, "defaults");
  const defaults: PresetDefaults = {};
  if (record.recordingWindowMs !== undefined) {
    defaults.recordingWindowMs = oneOf(record.recordingWindowMs, RECORDING_WINDOW_OPTIONS, "defaults.recordingWindowMs");
  }
  if (record.inferenceLevel !== undefined) {
    defaults.inferenceLevel = oneOf(record.inferenceLevel, INFERENCE_LEVEL_OPTIONS, "defaults.inferenceLevel");
  }
  if (record.sanitizeLevel !== undefined) {
    defaults.sanitizeLevel = oneOf(record.sanitizeLevel, SANITIZE_LEVEL_OPTIONS, "defaults.sanitizeLevel");
  }
  if (record.outputBufferCount !== undefined) {
    defaults.outputBufferCount = oneOf(record.outputBufferCount, OUTPUT_BUFFER_COUNT_OPTIONS, "defaults.outputBufferCount");
  }
  if (record.outputBufferDwellMs !== undefined) {
    defaults.outputBufferDwellMs = oneOf(record.outputBufferDwellMs, OUTPUT_BUFFER_DWELL_OPTIONS_MS, "defaults.outputBufferDwellMs");
  }
  if (record.summaryLength !== undefined) {
    defaults.summaryLength = oneOf(record.summaryLength, SUMMARY_LENGTHS, "defaults.summaryLength");
  }
  if (record.summaryGuidance !== undefined) {
    defaults.summaryGuidance = boundedText(record.summaryGuidance, "defaults.summaryGuidance", MAX_SUMMARY_GUIDANCE_CHARS);
  }
  if (record.starterTerms !== undefined) defaults.starterTerms = starterTerms(record.starterTerms);
  return defaults;
}

function presetId(value: unknown): string {
  if (typeof value !== "string") fail("id must be text");
  if (BUILT_IN_ID_PATTERN.test(value) || CUSTOM_ID_PATTERN.test(value)) return value;
  fail("id must be builtin:<name> or custom:<uuid>");
}

/**
 * Validates a preset from any source (built-in definition, custom editor or import) and
 * returns a normalized copy. Unknown fields, unknown schema versions and out-of-bounds
 * values are rejected.
 */
export function normalizePreset(input: unknown): Preset {
  const record = plainRecord(input, "preset");
  rejectUnknownFields(record, PRESET_FIELDS, "preset");
  if (record.schemaVersion !== PRESET_SCHEMA_VERSION) {
    fail(`schemaVersion must be ${PRESET_SCHEMA_VERSION}`);
  }
  if (!Number.isInteger(record.version) || (record.version as number) < 1 || (record.version as number) > MAX_PRESET_VERSION) {
    fail(`version must be a whole number from 1 to ${MAX_PRESET_VERSION}`);
  }
  const preset: Preset = {
    schemaVersion: PRESET_SCHEMA_VERSION,
    version: record.version as number,
    id: presetId(record.id),
    name: localizedText(record.name, "name", MAX_PRESET_NAME_CHARS),
    description: localizedText(record.description, "description", MAX_PRESET_DESCRIPTION_CHARS),
    terms: presetTerms(record.terms),
  };
  if (record.author !== undefined) preset.author = boundedText(record.author, "author", MAX_PRESET_AUTHOR_CHARS);
  if (record.defaults !== undefined) preset.defaults = presetDefaults(record.defaults);
  if (record.transcriptionPrefix !== undefined) {
    // Model-facing text is shipped with the app; a custom preset carries terms and defaults only.
    if (!preset.id.startsWith("builtin:")) fail("transcriptionPrefix is allowed only on builtin: presets");
    preset.transcriptionPrefix = localizedText(record.transcriptionPrefix, "transcriptionPrefix", MAX_TRANSCRIPTION_PREFIX_CHARS);
  }
  if (record.translationRule !== undefined) {
    if (!preset.id.startsWith("builtin:")) fail("translationRule is allowed only on builtin: presets");
    preset.translationRule = boundedText(record.translationRule, "translationRule", MAX_PRESET_MODEL_RULE_CHARS);
  }
  if (record.summaryFraming !== undefined) {
    if (!preset.id.startsWith("builtin:")) fail("summaryFraming is allowed only on builtin: presets");
    preset.summaryFraming = boundedText(record.summaryFraming, "summaryFraming", MAX_SUMMARY_FRAMING_CHARS);
  }
  if (record.messageOverrides !== undefined) {
    // Only shipped presets may replace messages; a custom preset carries terms alone.
    if (!preset.id.startsWith("builtin:")) fail("messageOverrides is allowed only on builtin: presets");
    preset.messageOverrides = messageOverrides(record.messageOverrides);
  }
  return preset;
}

/**
 * Resolves one term for a language: the preset's own set, then General's, then the same
 * two sets in English.
 */
export function resolvePresetTerm(
  preset: Preset,
  term: PresetTermName,
  locale: PresetLocale,
  general: Preset = GENERAL_PRESET,
): PresetTermForms {
  return (
    preset.terms[locale]?.[term] ??
    general.terms[locale]?.[term] ??
    preset.terms.en[term] ??
    general.terms.en[term]
  );
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Message parameters for a preset in one language: `term_<name>` holds the singular,
 * `term_<name>s` the plural, and the `Term_` forms the same with the first letter capitalized.
 */
export function presetTermParams(preset: Preset, locale: PresetLocale, general: Preset = GENERAL_PRESET) {
  const params: Record<string, string> = {};
  for (const term of PRESET_TERM_NAMES) {
    const forms = resolvePresetTerm(preset, term, locale, general);
    params[`term_${term}`] = forms.singular;
    params[`Term_${term}`] = capitalize(forms.singular);
    if (forms.plural !== undefined) {
      params[`term_${term}s`] = forms.plural;
      params[`Term_${term}s`] = capitalize(forms.plural);
    }
  }
  return params;
}

/** Built-in ids. The workspace profile stores one of these; an absent or unknown value means General. */
export const BUILT_IN_PRESET_IDS = ["builtin:general", "builtin:sermon", "builtin:talkshow", "builtin:keynote"] as const;
export type BuiltInPresetId = (typeof BUILT_IN_PRESET_IDS)[number];

const SERMON_PRESET: Preset = {
  schemaVersion: PRESET_SCHEMA_VERSION,
  version: 1,
  id: "builtin:sermon",
  name: { en: "Sermon", id: "Khotbah" },
  description: {
    en: "Church services: the congregation, the preacher and the service.",
    id: "Ibadah gereja: jemaat, pengkhotbah, dan ibadah.",
  },
  terms: {
    en: {
      session: { singular: "service", plural: "services" },
      speaker: { singular: "preacher", plural: "preachers" },
      audience: { singular: "congregation", plural: "congregations" },
      transcripts: { singular: "sermons" },
    },
    id: {
      session: { singular: "ibadah", plural: "ibadah" },
      speaker: { singular: "pengkhotbah", plural: "pengkhotbah" },
      audience: { singular: "jemaat", plural: "jemaat" },
      transcripts: { singular: "khotbah" },
    },
  },
  transcriptionPrefix: {
    en: "Sermon. Preserve biblical names and references:",
    id: "Khotbah. Nama tokoh dan ayat Alkitab:",
  },
  summaryFraming: "supplied transcript of a sermon",
  translationRule:
    'Context: a sermon. Speakers may read scripture or use call-and-response; follow the scripture and quotation rules. "ya?" or "amen?" said to the audience is call-and-response, never filler.',
  defaults: {
    recordingWindowMs: "dynamic",
    inferenceLevel: "balanced",
    sanitizeLevel: "balanced",
    outputBufferCount: 1,
    outputBufferDwellMs: 3_000,
    summaryLength: "detailed",
    summaryGuidance: "theme, main passage if named, key points, application; quote Scripture only as spoken",
    starterTerms: [
      { word: "Yesus Kristus", translation: "Jesus Christ" },
      { word: "Roh Kudus", translation: "Holy Spirit" },
      { word: "Betlehem", translation: "Bethlehem" },
      { word: "Saul", translation: "Saul" },
      { word: "Daud", translation: "David" },
      { word: "Musa", translation: "Moses" },
      { word: "Petrus", translation: "Peter" },
      { word: "Paulus", translation: "Paul" },
      { word: "Yohanes", translation: "John" },
    ],
  },
  messageOverrides: {
    en: {
      "live.saveTranscriptHint":
        "For {Term_transcripts} and AI summary, shared with everyone at {workspace}. Tell the congregation when it’s on.",
      "liveWord.placeholderWord": "e.g. Reading Psalm 23…",
      "liveWord.placeholderFix": "e.g. Reading Psalm 23…",
      "manualCaption.placeholder": "e.g. Reading Psalm 23…",
    },
    id: {
      "live.saveTranscriptHint":
        "Untuk {Term_transcripts} dan ringkasan AI, dibagikan kepada semua orang di {workspace}. Beri tahu jemaat saat fitur ini aktif.",
      "liveWord.placeholderWord": "mis. Membaca Mazmur 23…",
      "liveWord.placeholderFix": "mis. Membaca Mazmur 23…",
      "manualCaption.placeholder": "mis. Membaca Mazmur 23…",
    },
  },
};

const TALKSHOW_PRESET: Preset = {
  schemaVersion: PRESET_SCHEMA_VERSION,
  version: 1,
  id: "builtin:talkshow",
  name: { en: "Talkshow", id: "Talkshow" },
  description: {
    en: "Talk shows and panels with several speakers.",
    id: "Talk show dan panel dengan beberapa pembicara.",
  },
  terms: {
    en: {
      session: { singular: "episode", plural: "episodes" },
      speaker: { singular: "host and guests", plural: "host and guests" },
      audience: { singular: "audience", plural: "audiences" },
      transcripts: { singular: "episodes" },
    },
    id: {
      session: { singular: "episode", plural: "episode" },
      speaker: { singular: "pembawa acara dan narasumber", plural: "pembawa acara dan narasumber" },
      audience: { singular: "penonton", plural: "penonton" },
      transcripts: { singular: "episode" },
    },
  },
  transcriptionPrefix: {
    en: "Conversation between several speakers. Preserve names and spelling:",
    id: "Percakapan beberapa pembicara. Nama dan ejaan:",
  },
  summaryFraming: "supplied transcript of a talk show episode",
  translationRule:
    "Context: a conversation. Speakers interrupt each other; translate each caption as spoken, keep banter and informal register, never merge speakers' words.",
  defaults: {
    recordingWindowMs: 6_000,
    inferenceLevel: "low",
    sanitizeLevel: "balanced",
    outputBufferCount: 1,
    outputBufferDwellMs: 3_000,
    summaryLength: "short",
    summaryGuidance: "topics, notable moments; attribute statements only where speakers are labelled",
  },
  messageOverrides: {
    en: {
      "liveWord.placeholderWord": "e.g. Guest: Dr. Rina…",
      "liveWord.placeholderFix": "e.g. Guest: Dr. Rina…",
      "manualCaption.placeholder": "e.g. Guest: Dr. Rina…",
      // The plural term "host and guests" needs plural verbs and possessives.
      "live.startHelp.ready": "Press Start when the host and guests begin.",
      "help.step3.after": "when the host and guests begin.",
      "translationSettings.speedHint":
        "Sets the longest each caption waits. Captions appear sooner when the host and guests pause. Shorter limits keep viewers closer to the host and guests; longer limits allow fuller sentences. Dynamic adapts to how the host and guests pause, up to 14 seconds.",
      "translationSettings.source": "Host and guests’ language",
      "translationSettings.languagesHint": "Choosing the host and guests’ language manually helps improve reliability.",
      "wordsEditor.addHint":
        "Write the term in the host and guests’ language for “Help the AI recognise it”, “Fix spelling to…” and “Always translate as…”. Hide and replace actions match the finished captions, so use the caption language. The With value is the corrected spelling (host and guests’ language), the translation or the replacement (caption language).",
      "wordsEditor.placeholderWord": "e.g. Guests’ names…",
      "inference.high.detail": "Favors the host and guests’ intended meaning over exact wording; may reword boldly.",
    },
    id: {
      "liveWord.placeholderWord": "mis. Tamu: Dr. Rina…",
      "liveWord.placeholderFix": "mis. Tamu: Dr. Rina…",
      "manualCaption.placeholder": "mis. Tamu: Dr. Rina…",
    },
  },
};

const KEYNOTE_PRESET: Preset = {
  schemaVersion: PRESET_SCHEMA_VERSION,
  version: 1,
  id: "builtin:keynote",
  name: { en: "Keynote", id: "Keynote" },
  description: {
    en: "Prepared talks and presentations.",
    id: "Presentasi dan pidato yang disiapkan.",
  },
  terms: {
    en: {
      session: { singular: "talk", plural: "talks" },
      speaker: { singular: "speaker", plural: "speakers" },
      audience: { singular: "attendees", plural: "attendees" },
      transcripts: { singular: "talks" },
    },
    id: {
      session: { singular: "presentasi", plural: "presentasi" },
      speaker: { singular: "pembicara", plural: "pembicara" },
      audience: { singular: "peserta", plural: "peserta" },
      transcripts: { singular: "presentasi" },
    },
  },
  transcriptionPrefix: {
    en: "Presentation. Preserve product, company and technical terms:",
    id: "Presentasi. Istilah produk, perusahaan dan teknis:",
  },
  summaryFraming: "supplied transcript of a keynote presentation",
  translationRule:
    "Context: a prepared presentation. Keep product names, technical terms and numbers exact; do not expand acronyms or add facts.",
  defaults: {
    recordingWindowMs: 14_000,
    inferenceLevel: "low",
    sanitizeLevel: "low",
    outputBufferCount: 1,
    outputBufferDwellMs: 3_000,
    summaryLength: "detailed",
    summaryGuidance: "key takeaways, announcements, names; figures exactly as stated, none added",
  },
  messageOverrides: {
    en: {
      "liveWord.placeholderWord": "e.g. Demo of Acme Cloud…",
      "liveWord.placeholderFix": "e.g. Demo of Acme Cloud…",
      "manualCaption.placeholder": "e.g. Demo of Acme Cloud…",
    },
    id: {
      "liveWord.placeholderWord": "mis. Demo Acme Cloud…",
      "liveWord.placeholderFix": "mis. Demo Acme Cloud…",
      "manualCaption.placeholder": "mis. Demo Acme Cloud…",
    },
  },
};

/** Every shipped preset, validated by `normalizePreset()`; General is the first and the default. */
export const BUILT_IN_PRESETS: readonly Preset[] = [GENERAL_PRESET, SERMON_PRESET, TALKSHOW_PRESET, KEYNOTE_PRESET].map(
  (preset) => normalizePreset(preset),
);

/** The stored form of a workspace profile: a known built-in id, or null when none is saved. */
export function normalizeProfileId(value: unknown): BuiltInPresetId | null {
  return typeof value === "string" && (BUILT_IN_PRESET_IDS as readonly string[]).includes(value)
    ? (value as BuiltInPresetId)
    : null;
}

/** The preset a profile id resolves to; an absent or unknown id is General. */
export function resolveWorkspacePreset(profileId: unknown): Preset {
  const id = normalizeProfileId(profileId) ?? GENERAL_PRESET_ID;
  return BUILT_IN_PRESETS.find((preset) => preset.id === id) ?? BUILT_IN_PRESETS[0];
}

/** Display text for a locale; Indonesian falls back to English when a value is missing. */
export function presetLocalizedText(text: PresetLocalizedText, locale: PresetLocale): string {
  return (locale === "id" ? text.id : undefined) ?? text.en;
}
