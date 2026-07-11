const compactNumberFormatter = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

export function formatCompactNumber(value: number): string {
  return compactNumberFormatter.format(value);
}
