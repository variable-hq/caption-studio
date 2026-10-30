import type { UiLocale } from "@/i18n";

export function formatCount(value: number, locale: UiLocale = "en") {
  return new Intl.NumberFormat(locale).format(value);
}
