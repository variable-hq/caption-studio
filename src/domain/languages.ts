export const LANGUAGE_OPTIONS = [
  {
    locale: "en",
    label: "English",
    speechCode: "en",
    madladCode: "en",
  },
  {
    locale: "id",
    label: "Indonesian",
    speechCode: "id",
    madladCode: "id",
  },
  {
    locale: "ja",
    label: "Japanese",
    speechCode: "ja",
    madladCode: "ja",
  },
  {
    locale: "ko-KR",
    label: "Korean",
    speechCode: "ko",
    madladCode: "ko",
  },
  {
    locale: "tl-PH",
    label: "Tagalog",
    speechCode: "tl",
    madladCode: "tl",
  },
  {
    locale: "zh-Hans",
    label: "Chinese (Simplified)",
    speechCode: "zh",
    madladCode: "zh",
    chineseScript: "simplified",
  },
  {
    locale: "zh-Hant",
    label: "Chinese (Traditional)",
    speechCode: "zh",
    madladCode: "zh",
    chineseScript: "traditional",
  },
  {
    locale: "vi",
    label: "Vietnamese",
    speechCode: "vi",
    madladCode: "vi",
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
