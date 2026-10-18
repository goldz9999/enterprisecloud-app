/** S/ 1,234.56 — negative values use a true minus sign. */
export function formatMoney(n: number | string | null | undefined): string {
  const v = Number(n) || 0;
  return (v < 0 ? '−' : '') + 'S/ ' + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** 1,234 */
export function formatInt(n: number | string | null | undefined): string {
  return (Number(n) || 0).toLocaleString('en-US');
}

/** Empty values render as an em dash. */
export function formatText(v: unknown): string {
  return v === '' || v == null ? '—' : String(v);
}

export type Fmt = 'money' | 'signed' | 'int' | 'sint';

export function formatValue(v: unknown, fmt?: Fmt): string {
  const n = Number(v) || 0;
  switch (fmt) {
    case 'money': return formatMoney(n);
    case 'signed': return (n > 0 ? '+' : '') + formatMoney(n);
    case 'int': return formatInt(n);
    case 'sint': return (n > 0 ? '+' : n < 0 ? '−' : '') + formatInt(Math.abs(n));
    default: return formatText(v);
  }
}
