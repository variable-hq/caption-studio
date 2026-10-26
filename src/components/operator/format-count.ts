const numberFormatter = new Intl.NumberFormat("en");

export function formatCount(value: number) {
  return numberFormatter.format(value);
}
