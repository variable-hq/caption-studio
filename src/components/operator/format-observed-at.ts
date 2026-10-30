import type { UiLocale } from "@/i18n";

export function formatObservedAt(date: Date, locale: UiLocale) {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
}
