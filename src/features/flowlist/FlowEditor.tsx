import { useState } from 'react';
import { Drawer } from '../../components/Drawer';
import { LinesEditor } from '../../components/LinesEditor';
import { linesError } from '../../lib/lines';
import { dataOf, type FlowData, type FlowKind } from '../../data/domain/flows';
import { PAY_TERMS, warehouses } from '../../data/domain/orders';
import { currentUser, useDB } from '../../data/store';
import type { OrderLine } from '../../data/types';
import { addDays, isoDate, parseDate } from '../../lib/dates';
import type { FlowItem, FlowRow } from './types';

interface FlowEditorProps {
  kind: FlowKind;
  /** Editing an existing document; omit to create. */
  row?: FlowRow;
  /** Pre-filled lines for a new document (e.g. from Stock bajo mínimo). */
  initialLines?: OrderLine[];
  initialData?: Partial<FlowData>;
  onClose: () => void;
  onSave: (data: FlowData, items: FlowItem[]) => string | undefined;
}

const toIso = (v: string | undefined, fallback: Date) => isoDate(parseDate(v) ?? fallback);

/** Wide drawer to create or edit a quotation / purchase request with its product lines. */
export function FlowEditor({ kind, row, initialLines, initialData, onClose, onSave }: FlowEditorProps) {
  const d = useDB();
  const quote = kind === 'cotizacion';
  const clients = d.records.clientes.filter(c => c.estado !== 'Inactivo').map(c => String(c.razon));
  const suppliers = d.records.proveedores.filter(p => p.estado !== 'Inactivo').map(p => String(p.razon));
  const users = [...new Set([currentUser(d).name, ...d.records.usuarios.filter(u => u.estado === 'Activo').map(u => String(u.nombre))])];
  const whs = warehouses(d);
  const defWh = String(d.settings.almdef && whs.includes(String(d.settings.almdef)) ? d.settings.almdef : whs[0]);
  const validity = Number(/(\d+)/.exec(String(d.settings.vcot ?? '14'))?.[1] ?? 14);

  const [data, setData] = useState<FlowData>(() => {
    const base = row ? dataOf(d, kind, row) : {};
    if (quote) {
      const cliente = base.cliente ?? clients[0] ?? '';
      const c = d.records.clientes.find(x => x.razon === cliente);
      return { cliente, vendedor: base.vendedor ?? currentUser(d).name, valida: toIso(base.valida, addDays(new Date(), validity)), cond: base.cond ?? String(c?.cond ?? 'Contado'), alm: base.alm ?? defWh, ...initialData };
    }
    return { solicitante: base.solicitante ?? currentUser(d).name, area: base.area ?? 'Almacén', motivo: base.motivo ?? '', prioridad: base.prioridad ?? 'Media', req: toIso(base.req, addDays(new Date(), 7)), alm: base.alm ?? defWh, prov: base.prov ?? suppliers[0] ?? '', ...initialData };
  });
  const [lines, setLines] = useState<OrderLine[]>(() =>
    row
      ? row.items.map(i => {
        const p = d.records.productos.find(x => x.sku === i.sku || x.nombre === i.name);
        return { sku: String(p?.sku ?? i.sku ?? i.name), name: String(p?.nombre ?? i.name), unit: i.unit, qty: i.qty, price: i.price };
      })
      : initialLines ?? [],
  );
  const [error, setError] = useState('');
  const set = (k: string, v: string) => setData(s => ({ ...s, [k]: v }));

  const save = () => {
    if (quote && !data.cliente) return setError('Elige un cliente (regístralo antes en Mantenimiento › Clientes).');
    if (!quote && !data.motivo.trim()) return setError('Indica el motivo de la solicitud.');
    const le = linesError(lines);
    if (le) return setError(le);
    const err = onSave(data, lines.map(l => ({ sku: l.sku, name: l.name, qty: l.qty, unit: l.unit, price: l.price })));
    if (err) setError(err);
  };

  const select = (k: string, label: string, options: string[]) => (
    <label className="field">
      <span className="field__label">{label}</span>
      <select className="field__control" value={data[k]} onChange={e => set(k, e.target.value)}>
        {data[k] && !options.includes(data[k]) && <option>{data[k]}</option>}
        {options.map(o => <option key={o}>{o}</option>)}
      </select>
    </label>
  );

  return (
    <Drawer
      width={760}
      kicker={quote ? 'Ventas · Cotizaciones' : 'Compras · Solicitudes'}
      title={row ? `Editar ${row.id}` : quote ? 'Nueva cotización' : 'Nueva solicitud de compra'}
      subtitle={quote ? 'Precios de lista sin IGV; puedes ajustarlos por línea.' : 'Costos estimados sin IGV, según el costo promedio.'}
      onClose={onClose}
      footer={
        <>
          {error && <div className="drawer-error" role="alert">{error}</div>}
          <div className="drawer-actions">
            <span className="drawer-actions__spacer" />
            <button type="button" className="btn" onClick={onClose}>Cancelar</button>
            <button type="button" className="btn btn--primary" style={{ padding: '0 16px' }} onClick={save}>{row ? 'Guardar cambios' : quote ? 'Crear cotización' : 'Crear solicitud'}</button>
          </div>
        </>
      }
    >
      {quote ? (
        <div className="grid3">
          {select('cliente', 'Cliente *', clients)}
          {select('vendedor', 'Vendedor', users)}
          <label className="field">
            <span className="field__label">Válida hasta</span>
            <input className="field__control" style={{ padding: '0 10px' }} type="date" value={data.valida} onChange={e => set('valida', e.target.value)} />
          </label>
          {select('cond', 'Condición de pago', PAY_TERMS)}
          {select('alm', 'Entrega desde', whs)}
        </div>
      ) : (
        <div className="grid3">
          {select('solicitante', 'Solicitante', users)}
          {select('area', 'Área', ['Almacén', 'Compras', 'Ventas', 'Finanzas', 'Gerencia', 'Sistemas'])}
          {select('prioridad', 'Prioridad', ['Alta', 'Media', 'Baja'])}
          <label className="field field--wide">
            <span className="field__label">Motivo *</span>
            <input className="field__control" style={{ padding: '0 10px' }} value={data.motivo} onChange={e => set('motivo', e.target.value)} placeholder="Ej. Reposición por stock bajo mínimo" />
          </label>
          <label className="field">
            <span className="field__label">Requerido para</span>
            <input className="field__control" style={{ padding: '0 10px' }} type="date" value={data.req} onChange={e => set('req', e.target.value)} />
          </label>
          {select('alm', 'Almacén destino', whs)}
          {select('prov', 'Proveedor sugerido', ['', ...suppliers])}
        </div>
      )}
      <LinesEditor lines={lines} onChange={setLines} priceFrom={quote ? 'precio' : 'costo'} warehouse={quote ? data.alm : undefined} igvRate={0.18} priceLabel={quote ? 'P. unit.' : 'Costo est.'} />
    </Drawer>
  );
}