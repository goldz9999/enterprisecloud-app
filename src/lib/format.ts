/** S/ 1,234.56 — negative values use a true minus sign. */
export function formatMoney(n: number | string | null | undefined): string {
  const v = Number(n) || 0;
  return (v < 0 ? '−' : '') + 'S/ ' + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Empty values render as an em dash. */
export function formatText(v: unknown): string {
  return v === '' || v == null ? '—' : String(v);
}
