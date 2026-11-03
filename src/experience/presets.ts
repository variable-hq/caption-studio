/**
 * Workspace presets are declarative data. A preset supplies the wording terms that
 * the operator interface fills into its messages; it never carries code or changes
 * identifiers, routes, stored fields or the AI safeguards.
 */
export const PRESET_SCHEMA_VERSION = 1;
export const GENERAL_PRESET_ID = "builtin:general";

export const MAX_PRESET_VERSION = 1_000_000;
export const MAX_PRESET_NAME_CHARS = 40;
export const MAX_PRESET_DESCRIPTION_CHARS = 200;
export const MAX_PRESET_AUTHOR_CHARS = 80;
export const MAX_PRESET_TERM_CHARS = 40;

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

export type Preset = {
  schemaVersion: typeof PRESET_SCHEMA_VERSION;
  version: number;
  id: string;
  name: PresetLocalizedText;
  description: PresetLocalizedText;
  author?: string;
  /** Indonesian terms fall back through the lookup order in `resolvePresetTerm`. */
  terms: { en: PresetTermSet; id?: PresetTermSet };
};

const PRESET_FIELDS = ["schemaVersion", "version", "id", "name", "description", "author", "terms"] as const;
const TERM_SET_LOCALES = ["en", "id"] as const;
const CUSTOM_ID_PATTERN = /^custom:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const BUILT_IN_ID_PATTERN = /^builtin:[a-z]+$/u;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u;

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
  const text = value.trim();
  if (text === "") fail(`${label} must not be empty`);
  if (text.length > maxChars) fail(`${label} must be ${maxChars} characters or fewer`);
  if (CONTROL_CHARACTERS.test(text)) fail(`${label} must not contain control characters`);
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
