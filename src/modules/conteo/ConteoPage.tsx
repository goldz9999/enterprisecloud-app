import { useState } from 'react';
import { Link } from 'react-router-dom';
import { can } from '@/data/permissions';
import { currentUser } from '@/data/store';
import { KpiCard, KpiRow } from '@/shared/components/KpiCard';
import { Modal } from '@/shared/components/Modal';
import { StatusChip } from '@/shared/components/StatusChip';
import { Toast, useToast } from '@/shared/components/Toast';
import { downloadBlob } from '@/shared/lib/csv';
import { fmtDate, fmtDayTime } from '@/shared/lib/dates';
import { formatMoney } from '@/shared/lib/format';
import { writeXlsx } from '@/shared/lib/import/xlsx';
import { newId, useModuleStore } from '../localStore';
import { useGestionDB } from '../localCopy';
import { DataTable, ModulePage } from '../ui';
import { countSummary, nextSeq, openCount, type Count } from './conteoLogic';

export function ConteoPage() {
    const d = useGestionDB();
    const toast = useToast();
    const [store, setStore] = useModuleStore<{ counts: Count[] }>('conteo', { counts: [] });
    const [openId, setOpenId] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);
    const [warehouse, setWarehouse] = useState('');
    const [q, setQ] = useState('');
    const [onlyDiff, setOnlyDiff] = useState(false);
    const canEdit = can(d, 'Ajustes', 'Crear');

    const warehouses = [...new Set(d.records.almacenes.filter(a => a.estado !== 'Inactivo').map(a => String(a.nombre)))].sort();
    const product = (sku: string) => {
        const p = d.records.productos.find(x => x.sku === sku);
        return { cost: Number(p?.costo) || 0, unit: String(p?.unidad || 'und.') };
    };
    const current = store.counts.find(c => c.id === openId);
    const update = (c: Count) => setStore({ counts: store.counts.map(x => (x.id === c.id ? c : x)) });

    const create = () => {
        if (!warehouse) return;
        const now = new Date();
        const c = openCount(d.records.stock, warehouse, product, currentUser(d).name, nextSeq(store.counts, now.getFullYear()), now, newId());
        if (!c.items.length) return toast.flash(`${warehouse} no tiene productos con stock registrado`);
        setStore({ counts: [c, ...store.counts] });
        setCreating(false);
        setOpenId(c.id);
        toast.flash(`${c.code} abierto · ${c.items.length} productos`);
    };

    const exportXlsx = (c: Count) => {
        const head = ['SKU', 'Producto', 'Unidad', 'Sistema', 'Contado', 'Diferencia', 'Costo unit. (S/)', 'Valor diferencia (S/)'];
        const rows = c.items.map(i => {
            const diff = i.counted == null ? '' : i.counted - i.system;
            return [i.sku, i.name, i.unit, String(i.system), i.counted == null ? '' : String(i.counted), String(diff), i.cost.toFixed(2), diff === '' ? '' : (Number(diff) * i.cost).toFixed(2)];
        });
        downloadBlob(`${c.code}-${c.warehouse.replace(/\s+/g, '-')}.xlsx`, writeXlsx([{ name: c.code, rows: [head, ...rows] }]));
    };

    if (current) {
        const s = countSummary(current);
        const closed = current.status === 'Cerrado';
        const term = q.trim().toLowerCase();
        const items = current.items
            .map((it, idx) => ({ it, idx }))
            .filter(({ it }) => (!term || it.name.toLowerCase().includes(term) || it.sku.toLowerCase().includes(term)) && (!onlyDiff || (it.counted != null && it.counted !== it.system)));
        const setCounted = (idx: number, raw: string) => {
            const v = raw.trim() === '' ? null : Math.max(0, Number(raw.replace(',', '.')) || 0);
            update({ ...current, items: current.items.map((x, i) => (i === idx ? { ...x, counted: v } : x)) });
        };
        return (
            <ModulePage
                label="Inventario físico"
                subtitle={`${current.code} · ${current.warehouse} · abierto el ${fmtDayTime(new Date(current.openedAt))} por ${current.by}`}
                local
                actions={<>
                    <button type="button" className="btn btn--sm" onClick={() => setOpenId(null)}>← Conteos</button>
                    <button type="button" className="btn btn--sm" onClick={() => window.print()}>Imprimir hoja</button>
                    <button type="button" className="btn btn--sm" onClick={() => exportXlsx(current)}>Exportar a Excel</button>
                    {canEdit && !closed && (
                        <button type="button" className="btn btn--primary btn--sm" disabled={s.pending > 0} title={s.pending ? `Faltan ${s.pending} productos por contar` : undefined}
                            onClick={() => { update({ ...current, status: 'Cerrado', closedAt: new Date().toISOString() }); toast.flash(`${current.code} cerrado`); }}>
                            Cerrar conteo
                        </button>
                    )}
                </>}
            >
                <KpiRow>
                    <KpiCard label="Por contar" value={String(s.pending)} note={`de ${current.items.length} productos`} tone={s.pending ? 'amber' : 'green'} />
                    <KpiCard label="Con diferencia" value={String(s.withDiff)} note="contado ≠ sistema" tone={s.withDiff ? 'red' : undefined} />
                    <KpiCard label="Faltante" value={formatMoney(s.missingValue)} note="al costo promedio" tone={s.missingValue ? 'red' : undefined} />
                    <KpiCard label="Sobrante" value={formatMoney(s.surplusValue)} note={`neto ${formatMoney(s.net)}`} tone={s.surplusValue ? 'green' : undefined} />
                </KpiRow>

                {closed && s.withDiff > 0 && (
                    <div className="mod-hint mod-noprint">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 8v4M12 16h.01" /></svg>
                        <span>Conteo cerrado con {s.withDiff} diferencia(s). Para corregir el stock del sistema, regístralas en <Link to="/inventario/ajustes">Inventario › Ajustes</Link> (Merma o Sobrante, motivo «{current.code}»).</span>
                    </div>
                )}

                <div className="mod-toolbar mod-noprint">
                    <input className="field__control mod-select" style={{ minWidth: 240 }} placeholder="Buscar producto o SKU…" value={q} onChange={e => setQ(e.target.value)} aria-label="Buscar" />
                    <button type="button" className={'filter-chip' + (onlyDiff ? ' is-on' : '')} onClick={() => setOnlyDiff(v => !v)}>Solo con diferencia</button>
                    <span className="mod-toolbar__spacer" />
                    {closed ? <StatusChip label={`Cerrado ${current.closedAt ? fmtDate(new Date(current.closedAt)) : ''}`} tone="muted" /> : <StatusChip label="Abierto" tone="blue" />}
                </div>

                <DataTable
                    cols={[{ label: 'Producto', w: 'minmax(0, 1.8fr)' }, { label: 'Unidad', w: '90px' }, { label: 'Sistema', w: '100px', right: true }, { label: 'Contado', w: '120px', right: true }, { label: 'Diferencia', w: '100px', right: true }, { label: 'Valor', w: '120px', right: true }]}
                    rows={items.map(({ it, idx }) => {
                        const diff = it.counted == null ? null : it.counted - it.system;
                        return [
                            <span key="p"><span className="mod-main">{it.name}</span><span className="mod-sub mono">{it.sku}</span></span>,
                            <span key="u" className="muted">{it.unit}</span>,
                            <span key="s" className="mono">{it.system.toLocaleString('en-US')}</span>,
                            closed || !canEdit
                                ? <span key="c" className="mono">{it.counted ?? '—'}</span>
                                : <input key="c" className={'field__control mod-num' + (diff == null || diff === 0 ? '' : diff < 0 ? ' is-short' : ' is-over')} inputMode="decimal" placeholder="—" defaultValue={it.counted ?? ''} onBlur={e => setCounted(idx, e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} aria-label={`Contado de ${it.name}`} />,
                            <span key="d" className={'mono ' + (diff == null || diff === 0 ? 'muted' : diff < 0 ? 'mod-diff-neg' : 'mod-diff-pos')}>{diff == null ? '—' : diff > 0 ? `+${diff}` : diff}</span>,
                            <span key="v" className={'mono ' + (diff ? (diff < 0 ? 'mod-diff-neg' : 'mod-diff-pos') : 'muted')}>{diff ? formatMoney(diff * it.cost) : '—'}</span>,
                        ];
                    })}
                    empty="Ningún producto coincide."
                    foot={<span>{closed ? 'Conteo cerrado: solo lectura.' : 'Escribe lo contado y pulsa Enter o sal de la casilla; se guarda solo.'}</span>}
                />
                <Toast message={toast.message} />
            </ModulePage>
        );
    }

    return (
        <ModulePage
            label="Inventario físico"
            subtitle="Cuenta lo que hay en un almacén y compáralo con el sistema. Las diferencias se valorizan al costo promedio."
            local
            actions={canEdit && <button type="button" className="btn btn--primary btn--sm" onClick={() => { setWarehouse(warehouses[0] ?? ''); setCreating(true); }}>Nuevo conteo</button>}
        >
            <DataTable
                cols={[{ label: 'Conteo', w: '140px' }, { label: 'Almacén', w: 'minmax(0, 1.3fr)' }, { label: 'Fecha', w: '150px' }, { label: 'Responsable', w: 'minmax(0, 1fr)' }, { label: 'Avance', w: '110px', right: true }, { label: 'Diferencia neta', w: '140px', right: true }, { label: 'Estado', w: '110px' }, { label: '', w: '90px', right: true }]}
                rows={store.counts.map(c => {
                    const s = countSummary(c);
                    return [
                        <span key="c" className="mono">{c.code}</span>,
                        <span key="a" className="ellipsis">{c.warehouse}</span>,
                        <span key="f" className="muted">{fmtDayTime(new Date(c.openedAt))}</span>,
                        <span key="r" className="ellipsis">{c.by}</span>,
                        <span key="v" className="mono">{c.items.length - s.pending}/{c.items.length}</span>,
                        <span key="n" className={'mono ' + (s.net < 0 ? 'mod-diff-neg' : s.net > 0 ? 'mod-diff-pos' : 'muted')}>{formatMoney(s.net)}</span>,
                        <StatusChip key="e" label={c.status} tone={c.status === 'Abierto' ? 'blue' : 'muted'} />,
                        <button key="x" type="button" className="link-btn" onClick={() => setOpenId(c.id)}>{c.status === 'Abierto' && canEdit ? 'Contar' : 'Ver'}</button>,
                    ];
                })}
                empty={<>Aún no hay conteos.{canEdit && ' Usa «Nuevo conteo» y elige el almacén.'}</>}
            />

            {creating && (
                <Modal
                    title="Nuevo conteo"
                    onClose={() => setCreating(false)}
                    footer={<>
                        <button type="button" className="btn" onClick={() => setCreating(false)}>Cancelar</button>
                        <button type="button" className="btn btn--primary" disabled={!warehouse} onClick={create}>Abrir conteo</button>
                    </>}
                >
                    <label className="field">
                        <span className="field__label">Almacén</span>
                        <select className="field__control" value={warehouse} onChange={e => setWarehouse(e.target.value)}>
                            {warehouses.map(w => <option key={w}>{w}</option>)}
                        </select>
                    </label>
                    <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>Se toma una foto del stock actual del almacén. Lo que se mueva después no cambia el conteo.</p>
                </Modal>
            )}
            <Toast message={toast.message} />
        </ModulePage>
    );
}