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

export function translate(
  locale: UiLocale,
  key: MessageKey,
  params?: MessageParams,
): string {
  const message = (locale === "id" ? id[key] : undefined) ?? en[key];
  return message.replace(/\{([a-zA-Z0-9_]+)\}/gu, (placeholder, name: string) =>
    params?.[name] === undefined ? placeholder : String(params[name]),
  );
}

export function translatePlural(
  locale: UiLocale,
  key: PluralMessageKey,
  count: number,
  params: MessageParams = {},
): string {
  const category = new Intl.PluralRules(locale).select(count);
  const pluralKey = `${key}.${category === "one" ? "one" : "other"}` as MessageKey;
  return translate(locale, pluralKey, { ...params, count });
}
