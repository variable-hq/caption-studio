import type { UiLocale } from "@/i18n";

export function formatCount(value: number, locale: UiLocale = "en") {
  return new Intl.NumberFormat(locale).format(value);
}

export function formatDecimal(value: number, locale: UiLocale = "en", fractionDigits = 1) {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}
