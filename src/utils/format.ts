const usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const usd2 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Cents → "$1,234" (whole dollars) or "$1,234.50" when there are cents. */
export function money(cents: number, opts: { signed?: boolean; forceCents?: boolean } = {}): string {
  const abs = Math.abs(cents);
  const body = abs % 100 === 0 && !opts.forceCents ? usd0.format(abs / 100) : usd2.format(abs / 100);
  if (cents < 0) return `−${body}`;
  if (opts.signed && cents > 0) return `+${body}`;
  return body;
}

export const pct = (fraction: number, digits = 2) => `${(fraction * 100).toFixed(digits)}%`;
export const int = (n: number) => n.toLocaleString('en-US');
export const time = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
export const dateTime = (ms: number) => new Date(ms).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
