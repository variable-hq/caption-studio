import type { UiLocale } from "@/i18n";

export function formatClock(ms: number, locale: UiLocale) {
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1_000);
  const minuteNumber = new Intl.NumberFormat(locale, { useGrouping: false });
  const secondNumber = new Intl.NumberFormat(locale, { useGrouping: false, minimumIntegerDigits: 2 });
  return `${minuteNumber.format(minutes)}:${secondNumber.format(seconds)}`;
}
