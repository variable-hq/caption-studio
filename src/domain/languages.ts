export const LANGUAGE_OPTIONS = [
  {
    locale: "en",
    label: "English",
    speechCode: "en",
  },
  {
    locale: "id",
    label: "Indonesian",
    speechCode: "id",
  },
  {
    locale: "ja",
    label: "Japanese",
    speechCode: "ja",
  },
  {
    locale: "ko-KR",
    label: "Korean",
    speechCode: "ko",
  },
  {
    locale: "tl-PH",
    label: "Tagalog",
    speechCode: "tl",
  },
  {
    locale: "zh-Hans",
    label: "Chinese (Simplified)",
    speechCode: "zh",
    chineseScript: "simplified",
  },
  {
    locale: "zh-Hant",
    label: "Chinese (Traditional)",
    speechCode: "zh",
    chineseScript: "traditional",
  },
  {
    locale: "vi",
    label: "Vietnamese",
    speechCode: "vi",
  },
] as const;

export type LanguageLocale = (typeof LANGUAGE_OPTIONS)[number]["locale"];
export type SourceLanguage = LanguageLocale | "auto";

export const DEFAULT_SOURCE_LANGUAGE: SourceLanguage = "en";
export const DEFAULT_TARGET_LANGUAGE: LanguageLocale = "id";

export function findLanguage(locale: LanguageLocale) {
  return LANGUAGE_OPTIONS.find((language) => language.locale === locale);
}

export function isLanguageLocale(value: string): value is LanguageLocale {
  return LANGUAGE_OPTIONS.some((language) => language.locale === value);
}
