import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AppShell } from '../../components/AppShell';
import { LinesEditor } from '../../components/LinesEditor';
import { linesError } from '../../lib/lines';
import { createOrder, igvRate, partyFromClient, partyFromSupplier, warehouses } from '../../data/domain/orders';
import { can } from '../../data/permissions';
import { currentUser, mutate, useDB } from '../../data/store';
import type { Order, OrderLine } from '../../data/types';

/** Creates a sales order (direct sale) or a purchase order without a prior quotation/request. */
export function NewOrderPage({ kind }: { kind: Order['kind'] }) {
  const d = useDB();
  const navigate = useNavigate();
  const sale = kind === 'venta';
  const parties = (sale ? d.records.clientes : d.records.proveedores).filter(p => p.estado !== 'Inactivo');
  const whs = warehouses(d);
  const [partyId, setPartyId] = useState<number | ''>(parties[0]?._id ?? '');
  const [warehouse, setWarehouse] = useState(String(d.settings.almdef && whs.includes(String(d.settings.almdef)) ? d.settings.almdef : whs[0]));
  const [seller, setSeller] = useState(currentUser(d).name);
  const [lines, setLines] = useState<OrderLine[]>([]);
  const [error, setError] = useState('');
  const module = sale ? 'Órdenes de venta' : 'Órdenes de compra';
  const list = sale ? { label: 'Órdenes de venta', to: '/ventas/ordenes' } : { label: 'Órdenes de compra', to: '/compras/ordenes' };
  const users = [...new Set([currentUser(d).name, ...d.records.usuarios.filter(u => u.estado === 'Activo').map(u => String(u.nombre))])];

  const save = () => {
    const party = parties.find(p => p._id === partyId);
    if (!party) return setError(sale ? 'Elige un cliente.' : 'Elige un proveedor.');
    const le = linesError(lines);
    if (le) return setError(le);
    let code = '';
    const err = mutate(draft => {
      code = createOrder(draft, { kind, party: sale ? partyFromClient(party) : partyFromSupplier(party), lines, warehouse, seller }).code;
    });
    if (err) return setError(err);
    navigate(`/${sale ? 'ventas' : 'compras'}/orden/${code}`);
  };

  return (
    <AppShell active={module} breadcrumb={[{ label: 'Inicio', to: '/' }, { label: sale ? 'Ventas' : 'Compras' }, list, { label: sale ? 'Nueva venta' : 'Nueva orden de compra' }]}>
      <div>
        <h1 className="page__title">{sale ? 'Nueva venta' : 'Nueva orden de compra'}</h1>
        <div className="page__subtitle">
          {sale
            ? 'Venta directa, sin cotización previa. Al guardarla se crea la orden de venta y sigue el flujo: confirmar, despachar, facturar y cobrar.'
            : 'Compra directa, sin solicitud previa. Al guardarla queda por aprobar y sigue el flujo: aprobar, recibir, registrar factura y pagar.'}
        </div>
      </div>

      {!can(d, module, 'Crear') ? (
        <div className="note">Tu rol no tiene permiso para crear {sale ? 'ventas' : 'órdenes de compra'}.</div>
      ) : !parties.length ? (
        <div className="note">
          Primero registra {sale ? 'un cliente' : 'un proveedor'} en <Link to={sale ? '/mantenimiento/clientes' : '/mantenimiento/proveedores'}>Mantenimiento</Link>.
        </div>
      ) : (
        <section className="card" style={{ gap: 16 }}>
          <div className="grid3">
            <label className="field">
              <span className="field__label">{sale ? 'Cliente' : 'Proveedor'} *</span>
              <select className="field__control" value={partyId} onChange={e => setPartyId(Number(e.target.value))}>
                {parties.map(p => <option key={p._id} value={p._id}>{String(p.razon)}</option>)}
              </select>
            </label>
            <label className="field">
              <span className="field__label">{sale ? 'Almacén de despacho' : 'Almacén destino'}</span>
              <select className="field__control" value={warehouse} onChange={e => setWarehouse(e.target.value)}>
                {whs.map(w => <option key={w}>{w}</option>)}
              </select>
            </label>
            <label className="field">
              <span className="field__label">{sale ? 'Vendedor' : 'Comprador'}</span>
              <select className="field__control" value={seller} onChange={e => setSeller(e.target.value)}>
                {users.map(u => <option key={u}>{u}</option>)}
              </select>
            </label>
          </div>
          <LinesEditor lines={lines} onChange={setLines} priceFrom={sale ? 'precio' : 'costo'} warehouse={sale ? warehouse : undefined} igvRate={igvRate(d)} priceLabel={sale ? 'P. unit.' : 'Costo unit.'} />
          {error && <div className="drawer-error" role="alert">{error}</div>}
          <div className="drawer-actions">
            <span className="drawer-actions__spacer" />
            <button type="button" className="btn" onClick={() => navigate(list.to)}>Cancelar</button>
            <button type="button" className="btn btn--primary" style={{ padding: '0 16px' }} onClick={save}>
              {sale ? 'Crear orden de venta' : 'Crear orden de compra'}
            </button>
          </div>
        </section>
      )}
    </AppShell>
  );
}