import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { can } from '@/data/permissions';
import { useDB } from '@/data/store';
import { KpiCard, KpiRow } from '@/shared/components/KpiCard';
import { StatusChip } from '@/shared/components/StatusChip';
import { Toast, useToast } from '@/shared/components/Toast';
import { downloadCsv } from '@/shared/lib/csv';
import { formatMoney } from '@/shared/lib/format';
import { DataTable, ModulePage } from '../ui';
import { suggestRestock, type RestockRow } from './reposicionLogic';
import { savePurchasePrefill } from './prefill';

const keyOf = (r: RestockRow) => `${r.sku}@${r.warehouse}`;

export function ReposicionPage() {
    const d = useDB();
    const navigate = useNavigate();
    const toast = useToast();
    const [warehouse, setWarehouse] = useState('Todos');
    const [supplier, setSupplier] = useState('Todos');
    const [picked, setPicked] = useState<Record<string, boolean>>({});
    const [qty, setQty] = useState<Record<string, string>>({});
    const canCreate = can(d, 'Órdenes de compra', 'Crear');

    const units = useMemo(() => Object.fromEntries(d.records.productos.map(p => [String(p.sku), String(p.unidad || 'und.')])), [d.records.productos]);
    const all = useMemo(() => suggestRestock(d.records.stock, d.records.preciosProv, units), [d.records.stock, d.records.preciosProv, units]);
    const warehouses = [...new Set(all.map(r => r.warehouse))].sort();
    const suppliers = [...new Set(all.map(r => r.supplier || 'Sin proveedor'))].sort();
    const rows = all.filter(r => (warehouse === 'Todos' || r.warehouse === warehouse) && (supplier === 'Todos' || (r.supplier || 'Sin proveedor') === supplier));

    const qtyOf = (r: RestockRow) => {
        const v = Number(qty[keyOf(r)]);
        return qty[keyOf(r)] !== undefined && v > 0 ? v : r.suggested;
    };
    const selected = rows.filter(r => picked[keyOf(r)]);
    const total = rows.reduce((a, r) => a + qtyOf(r) * r.cost, 0);
    const groups = new Set(selected.map(r => `${r.supplier}|${r.warehouse}`));
    const blocker = !selected.length
        ? 'Marca los productos que quieres pedir'
        : selected.some(r => !r.supplier)
            ? 'Hay productos sin proveedor: regístralo en Mantenimiento › Precios por proveedor'
            : groups.size > 1
                ? 'Una orden de compra es de un solo proveedor y un almacén: filtra o marca solo esos'
                : '';

    const createOrder = () => {
        if (blocker) return toast.flash(blocker);
        const first = selected[0];
        savePurchasePrefill({
            supplier: first.supplier,
            warehouse: first.warehouse,
            lines: selected.map(r => ({ sku: r.sku, name: r.name, unit: r.unit, qty: qtyOf(r), price: r.cost })),
        });
        navigate('/compras/ordenes');
    };

    const exportCsv = () =>
        downloadCsv('reposicion-sugerida.csv', ['SKU', 'Producto', 'Almacén', 'Disponible', 'Mínimo', 'Cantidad', 'Unidad', 'Proveedor', 'Costo', 'Importe'],
            rows.map(r => [r.sku, r.name, r.warehouse, r.available, r.min, qtyOf(r), r.unit, r.supplier, r.cost, Math.round(qtyOf(r) * r.cost * 100) / 100]));

    const allPicked = rows.length > 0 && rows.every(r => picked[keyOf(r)]);
    const togglePick = (r: RestockRow) => setPicked(p => ({ ...p, [keyOf(r)]: !p[keyOf(r)] }));

    return (
        <ModulePage
            label="Reposición sugerida"
            subtitle="Productos bajo su stock mínimo, cuánto pedir para llegar al doble del mínimo y a qué proveedor le sale más barato."
            actions={<>
                <button type="button" className="btn btn--sm" onClick={exportCsv} disabled={!rows.length}>Exportar</button>
                {canCreate && <button type="button" className="btn btn--primary btn--sm" onClick={createOrder} title={blocker || undefined} disabled={!selected.length}>Crear orden de compra{selected.length ? ` (${selected.length})` : ''}</button>}
            </>}
        >
            <KpiRow>
                <KpiCard label="Productos a reponer" value={String(all.length)} note={`${new Set(all.map(r => r.sku)).size} SKU distintos`} tone={all.length ? 'amber' : 'green'} />
                <KpiCard label="Sin stock disponible" value={String(all.filter(r => r.available <= 0).length)} note="disponible 0 o menos" tone={all.some(r => r.available <= 0) ? 'red' : undefined} />
                <KpiCard label="Compra sugerida" value={formatMoney(total)} note="sin IGV, según filtros" />
                <KpiCard label="Proveedores" value={String(new Set(all.filter(r => r.supplier).map(r => r.supplier)).size)} note={all.some(r => !r.supplier) ? 'hay productos sin proveedor' : 'con precio registrado'} />
            </KpiRow>

            <div className="mod-toolbar">
                <select className="field__control mod-select" aria-label="Almacén" value={warehouse} onChange={e => setWarehouse(e.target.value)}>
                    <option value="Todos">Todos los almacenes</option>
                    {warehouses.map(w => <option key={w}>{w}</option>)}
                </select>
                <select className="field__control mod-select" aria-label="Proveedor" value={supplier} onChange={e => setSupplier(e.target.value)}>
                    <option value="Todos">Todos los proveedores</option>
                    {suppliers.map(s => <option key={s}>{s}</option>)}
                </select>
                <span className="mod-toolbar__spacer" />
                {selected.length > 0 && <span className="muted" style={{ fontSize: 12.5, color: blocker ? 'var(--amber)' : 'var(--muted)' }}>{blocker || `${selected.length} producto(s) de ${selected[0].supplier} → ${selected[0].warehouse}`}</span>}
            </div>

            <DataTable
                cols={[
                    { label: '', w: '28px' }, { label: 'Producto', w: 'minmax(0, 1.6fr)' }, { label: 'Almacén', w: 'minmax(0, 1fr)' },
                    { label: 'Disponible / mínimo', w: '150px', right: true }, { label: 'Pedir', w: '110px', right: true },
                    { label: 'Proveedor sugerido', w: 'minmax(0, 1.3fr)' }, { label: 'Costo', w: '96px', right: true }, { label: 'Importe', w: '110px', right: true },
                ]}
                rows={rows.map(r => [
                    <input key="c" type="checkbox" className="check" checked={!!picked[keyOf(r)]} onChange={() => togglePick(r)} aria-label={`Elegir ${r.name}`} />,
                    <span key="p"><span className="mod-main">{r.name}</span><span className="mod-sub mono">{r.sku}</span></span>,
                    <span key="w" className="ellipsis">{r.warehouse}</span>,
                    <span key="a" className="mono">
                        {r.available <= 0 ? <StatusChip label={`${r.available} / ${r.min}`} tone="red" /> : <>{r.available.toLocaleString('en-US')} / {r.min.toLocaleString('en-US')}</>}
                    </span>,
                    <input key="q" className="field__control mod-num" inputMode="numeric" value={qty[keyOf(r)] ?? String(r.suggested)} onChange={e => setQty(q => ({ ...q, [keyOf(r)]: e.target.value.replace(/[^\d]/g, '') }))} aria-label={`Cantidad a pedir de ${r.name}`} title={r.unit} />,
                    r.supplier ? <span key="s" className="ellipsis">{r.supplier}</span> : <StatusChip key="s" label="Sin proveedor" tone="amber" />,
                    <span key="k" className="mono">{r.cost ? formatMoney(r.cost) : '—'}</span>,
                    <span key="t" className="mono" style={{ fontWeight: 500 }}>{r.cost ? formatMoney(qtyOf(r) * r.cost) : '—'}</span>,
                ])}
                empty={all.length ? 'Ningún producto coincide con los filtros.' : 'Todo el stock está sobre su mínimo. Define el «Stock mínimo» de cada producto en Mantenimiento › Productos para recibir sugerencias.'}
                foot={rows.length > 0 && <>
                    <button type="button" className="link-btn" onClick={() => setPicked(allPicked ? {} : Object.fromEntries(rows.map(r => [keyOf(r), true])))}>{allPicked ? 'Quitar selección' : 'Marcar todos'}</button>
                    <span>Total sugerido <b>{formatMoney(total)}</b></span>
                </>}
            />
            <Toast message={toast.message} />
        </ModulePage>
    );
}