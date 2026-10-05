export const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const p2 = (n: number) => String(n).padStart(2, '0');

/** 02 oct 2026 */
export const fmtDate = (d: Date) => `${p2(d.getDate())} ${MES[d.getMonth()]} ${d.getFullYear()}`;
/** 02 oct */
export const fmtDayMonth = (d: Date) => `${p2(d.getDate())} ${MES[d.getMonth()]}`;
/** 14:05 */
export const fmtTime = (d: Date) => `${p2(d.getHours())}:${p2(d.getMinutes())}`;
/** 02 oct 14:05 */
export const fmtDayTime = (d: Date) => `${fmtDayMonth(d)} ${fmtTime(d)}`;
/** 2026-10-02 (local date, for <input type="date">) */
export const isoDate = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** Whole days from a to b (b − a), ignoring the time of day. */
export function daysBetween(a: Date, b: Date): number {
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((ub - ua) / 86400000);
}

/**
 * Parses the date formats used across the app: "2026-10-02", ISO date-times,
 * "02 oct 2026", "02 oct" and "02 oct 09:12" (year defaults to the current one).
 * Returns null for anything else ("—", "Pendiente", …).
 */
export function parseDate(s: string | undefined | null): Date | null {
  if (!s) return null;
  const v = String(s).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) {
    if (v.length === 10) {
      const [y, m, d] = v.split('-').map(Number);
      return new Date(y, m - 1, d);
    }
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  const m = /^(\d{1,2}) ([a-z]{3})(?: (\d{4}))?(?: (\d{1,2}):(\d{2}))?$/.exec(v.toLowerCase());
  if (!m) return null;
  const month = MES.indexOf(m[2]);
  if (month < 0) return null;
  const year = m[3] ? Number(m[3]) : new Date().getFullYear();
  return new Date(year, month, Number(m[1]), m[4] ? Number(m[4]) : 0, m[5] ? Number(m[5]) : 0);
}

/** Display any supported date as "02 oct 2026" (falls back to the raw text). */
export function displayDate(s: string | undefined): string {
  const d = parseDate(s);
  return d ? fmtDate(d) : s || '—';
}
