import { fmtDate } from '../../lib/dates';
import { formatMoney } from '../../lib/format';
import { currentUser, nextId } from '../store';
import type { DB, OrderLine, OrderParty } from '../types';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

interface PrintableDoc {
  title: string;
  number: string;
  party?: OrderParty;
  partyLabel?: string;
  lines?: OrderLine[];
  igvRate?: number;
  /** Extra label/value pairs shown under the header. */
  facts?: [string, string][];
}

/** Standalone printable HTML for a generated document (guía, factura, nota de ingreso…). */
export function renderDocHtml(d: DB, doc: PrintableDoc): string {
  const s = d.settings;
  const sub = (doc.lines ?? []).reduce((a, l) => a + l.qty * l.price, 0);
  const igv = sub * (doc.igvRate ?? 0);
  const rows = (doc.lines ?? [])
    .map(l => `<tr><td>${esc(l.sku)}</td><td>${esc(l.name)}</td><td class="r">${l.qty.toLocaleString('en-US')} ${esc(l.unit)}</td><td class="r">${formatMoney(l.price)}</td><td class="r">${formatMoney(l.qty * l.price)}</td></tr>`)
    .join('');
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(doc.title)} ${esc(doc.number)}</title>
<style>body{font:13px/1.45 system-ui,sans-serif;color:#14161C;margin:40px}h1{font-size:18px;margin:0}table{width:100%;border-collapse:collapse;margin-top:16px}
th,td{border-bottom:1px solid #E3E5EA;padding:6px 8px;text-align:left}th{font-size:11px;text-transform:uppercase;color:#5F6676}.r{text-align:right}
.head{display:flex;justify-content:space-between;gap:24px;border-bottom:2px solid #14161C;padding-bottom:12px}.box{border:1px solid #14161C;padding:8px 12px;text-align:center}
.facts{display:grid;grid-template-columns:160px 1fr;gap:4px 12px;margin-top:16px}.facts span:nth-child(odd){color:#5F6676}.tot{margin-left:auto;width:260px;margin-top:12px}
.tot div{display:flex;justify-content:space-between;padding:3px 0}.tot .g{font-weight:600;border-top:1px solid #14161C}</style></head><body>
<div class="head"><div><h1>${esc(s.razon)}</h1><div>RUC ${esc(s.ruc)}</div><div>${esc(s.dir)}</div></div>
<div class="box"><div>${esc(doc.title)}</div><strong>${esc(doc.number)}</strong></div></div>
<div class="facts">${doc.party ? `<span>${esc(doc.partyLabel ?? 'Cliente')}</span><span>${esc(doc.party.name)} · ${esc(doc.party.ruc)}</span><span>Dirección</span><span>${esc(doc.party.address)}</span>` : ''}
<span>Fecha</span><span>${fmtDate(new Date())}</span>${(doc.facts ?? []).map(([k, v]) => `<span>${esc(k)}</span><span>${esc(v)}</span>`).join('')}</div>
${rows ? `<table><thead><tr><th>Código</th><th>Descripción</th><th class="r">Cantidad</th><th class="r">P. unit.</th><th class="r">Importe</th></tr></thead><tbody>${rows}</tbody></table>
<div class="tot"><div><span>Subtotal</span><span>${formatMoney(sub)}</span></div>${doc.igvRate ? `<div><span>IGV</span><span>${formatMoney(igv)}</span></div>` : ''}<div class="g"><span>Total</span><span>${formatMoney(sub + igv)}</span></div></div>` : ''}
<p style="margin-top:32px;color:#5F6676;font-size:11px">Documento generado por EnterpriseCloud · ${esc(currentUser(d).name)}</p>
<script>window.onload=()=>window.print()</script></body></html>`;
}

/** Adds a system-generated document to the Documentos repository. */
export function addGeneratedDoc(d: DB, doc: { name: string; cat: string; ref: string; entity: string; html: string }) {
  d.documentos.unshift({
    id: nextId(d.documentos.map(x => ({ _id: x.id }))),
    name: doc.name,
    cat: doc.cat,
    ref: doc.ref,
    entity: doc.entity,
    size: Math.max(1, Math.round(doc.html.length / 1024)) + ' KB',
    date: new Date().toISOString(),
    by: 'Sistema',
    version: 'v1 · actual',
    html: doc.html,
  });
}
