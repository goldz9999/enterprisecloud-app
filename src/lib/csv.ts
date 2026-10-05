/** Downloads rows as a CSV file Excel opens correctly (UTF-8 BOM, semicolon-free quoting). */
export function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    const s = String(v ?? '');
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const text = [headers, ...rows].map(r => r.map(esc).join(',')).join('\r\n');
  downloadBlob(filename, new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' }));
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Opens printable HTML in a new tab (it calls print() itself). */
export function openPrintable(html: string) {
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}
