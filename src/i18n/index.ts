import { GENERAL_PRESET, presetTermParams, type PresetWording } from "../experience/presets";
import { en, type MessageKey } from "./messages/en";
import { id } from "./messages/id";

export type { MessageKey };
export type UiLocale = "en" | "id";
export type UiLocalePreference = UiLocale | null;
export type MessageParams = Record<string, string | number>;
type PluralMessageKey = {
  [Key in MessageKey]: Key extends `${infer Stem}.one`
    ? `${Stem}.other` extends MessageKey
      ? Stem
      : never
    : never;
}[MessageKey];

function browserLanguages() {
  if (typeof navigator === "undefined") return [];
  const languages = Array.from(navigator.languages ?? []);
  return languages.length ? languages : [navigator.language];
}

export function normalizeUiLocale(
  preference: unknown,
  languages: readonly string[] = browserLanguages(),
): UiLocale {
  if (preference === "en" || preference === "id") return preference;
  for (const language of languages) {
    const base = language.trim().toLowerCase().split(/[-_]/u, 1)[0];
    if (base === "en" || base === "id") return base;
  }
  return "en";
}

export function normalizeUiLocalePreference(value: unknown): UiLocalePreference {
  return value === "en" || value === "id" ? value : null;
}

export function localeFromAcceptLanguage(header: string | null | undefined): UiLocale {
  if (!header) return "en";
  const languages = header
    .split(",")
    .map((part) => {
      const [tag, ...parameters] = part.trim().split(";");
      const qualityParameter = parameters.find((parameter) =>
        parameter.trim().startsWith("q="),
      );
      const quality = qualityParameter
        ? Number(qualityParameter.trim().slice(2))
        : 1;
      return {
        tag: tag?.trim() ?? "",
        quality: Number.isFinite(quality) ? quality : 0,
      };
    })
    .filter(({ tag, quality }) => tag !== "" && tag !== "*" && quality > 0)
    .sort((left, right) => right.quality - left.quality)
    .map(({ tag }) => tag);
  return normalizeUiLocale(null, languages);
}

const termParamsByPreset = new WeakMap<PresetWording, Record<UiLocale, MessageParams>>();

/** Term values a preset fills into placeholders the caller does not pass. */
function presetTermParamsFor(preset: PresetWording, locale: UiLocale): MessageParams {
  let byLocale = termParamsByPreset.get(preset);
  if (!byLocale) {
    byLocale = { en: presetTermParams(preset, "en"), id: presetTermParams(preset, "id") };
    termParamsByPreset.set(preset, byLocale);
  }
  return byLocale[locale];
}

/** Message for a key in a locale: the preset's whole-message override, else the catalog text. */
function messageFor(locale: UiLocale, key: MessageKey, preset: PresetWording): string {
  return preset.messageOverrides?.[locale]?.[key] ?? ((locale === "id" ? id[key] : undefined) ?? en[key]);
}

export function translate(
  locale: UiLocale,
  key: MessageKey,
  params?: MessageParams,
  preset: PresetWording = GENERAL_PRESET,
): string {
  const message = messageFor(locale, key, preset);
  const termParams = presetTermParamsFor(preset, locale);
  return message.replace(/\{([a-zA-Z0-9_]+)\}/gu, (placeholder, name: string) => {
    const value = params?.[name] ?? termParams[name];
    return value === undefined ? placeholder : String(value);
  });
}

export function translatePlural(
  locale: UiLocale,
  key: PluralMessageKey,
  count: number,
  params: MessageParams = {},
  preset: PresetWording = GENERAL_PRESET,
): string {
  const category = new Intl.PluralRules(locale).select(count);
  const pluralKey = `${key}.${category === "one" ? "one" : "other"}` as MessageKey;
  return translate(locale, pluralKey, { ...params, count }, preset);
}
