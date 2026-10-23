import { useMemo, useState } from 'react';
import { can } from '@/data/permissions';
import { currentUser } from '@/data/store';
import { KpiCard, KpiRow } from '@/shared/components/KpiCard';
import { StatusChip } from '@/shared/components/StatusChip';
import { Toast, useToast } from '@/shared/components/Toast';
import { downloadCsv } from '@/shared/lib/csv';
import { fmtDate } from '@/shared/lib/dates';
import { formatMoney } from '@/shared/lib/format';
import { useModuleStore } from '../localStore';
import { useGestionDB } from '../localCopy';
import { lastMonths, saleFacts, sellers } from '../salesData';
import { DataTable, ModulePage, PeriodSelect, periodLabel, Tabs } from '../ui';
import { commissions, payoutStatus, type CommissionRules, type Payout } from './comisionesLogic';

type Tab = 'liquidacion' | 'detalle' | 'reglas';
interface Store extends CommissionRules { paid: Payout[] }
const DEFAULTS: Store = { defaultPct: 2, bySeller: {}, paid: [] };

export function ComisionesPage() {
    const d = useGestionDB();
    const toast = useToast();
    const months = lastMonths(12);
    const [period, setPeriod] = useState(months[0]);
    const [tab, setTab] = useState<Tab>('liquidacion');
    const [store, setStore] = useModuleStore<Store>('comisiones', DEFAULTS);
    const [pctDraft, setPctDraft] = useState<Record<string, string>>({});
    const canEdit = can(d, 'Configuración', 'Editar');

    const facts = useMemo(() => saleFacts(d), [d]);
    const r = commissions(facts, period, store);
    const total = r.bySeller.reduce((a, s) => a + s.amount, 0);
    const status = r.bySeller.map(s => ({ s, st: payoutStatus(store.paid, s.seller, period, s.amount) }));
    const pendingPay = status.filter(x => x.st.state !== 'Pagada').reduce((a, x) => a + (x.st.state === 'Diferencia' ? x.st.diff : x.s.amount), 0);
    const sellerList = sellers(d, facts);

    const markPaid = (seller: string, amount: number) => {
        const me = currentUser(d).name;
        const rest = store.paid.filter(p => !(p.seller === seller && p.period === period));
        setStore({ ...store, paid: [...rest, { seller, period, amount, at: new Date().toISOString(), by: me }] });
        toast.flash(`Comisión de ${seller} (${periodLabel(period)}) marcada como pagada`);
    };
    const savePct = (key: string, raw: string) => {
        const v = Number(raw.replace(',', '.'));
        if (raw.trim() !== '' && !(v >= 0 && v <= 100)) return toast.flash('El porcentaje debe estar entre 0 y 100');
        if (key === '__default') setStore({ ...store, defaultPct: raw.trim() === '' ? 0 : v });
        else {
            const bySeller = { ...store.bySeller };
            if (raw.trim() === '') delete bySeller[key];
            else bySeller[key] = v;
            setStore({ ...store, bySeller });
        }
        setPctDraft(p => { const n = { ...p }; delete n[key]; return n; });
        toast.flash('Regla guardada');
    };
    const exportCsv = () => downloadCsv(`comisiones-${period}.csv`, ['Orden', 'Vendedor', 'Cliente', 'Base sin IGV', '%', 'Comisión'], r.lines.map(l => [l.code, l.seller, l.client, l.base, l.pct, l.amount]));

    const pctInput = (key: string, value: number | undefined, placeholder: string) => (
        <input
            className="field__control mod-num" style={{ width: 90 }} inputMode="decimal" disabled={!canEdit} placeholder={placeholder}
            value={pctDraft[key] ?? (value === undefined ? '' : String(value))}
            onChange={e => setPctDraft(p => ({ ...p, [key]: e.target.value.replace(/[^\d.,]/g, '') }))}
            onBlur={e => pctDraft[key] !== undefined && savePct(key, e.target.value)}
            onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            aria-label={key === '__default' ? 'Porcentaje general' : `Porcentaje de ${key}`}
        />
    );

    return (
        <ModulePage
            label="Comisiones"
            subtitle="Comisión sobre las ventas cobradas del mes (subtotal sin IGV, ya con descuento). Las ventas por cobrar se suman cuando se cobren."
            local
            actions={<>
                <PeriodSelect value={period} options={months} onChange={setPeriod} />
                <button type="button" className="btn btn--sm" onClick={exportCsv} disabled={!r.lines.length}>Exportar detalle</button>
            </>}
        >
            <KpiRow>
                <KpiCard label="Comisiones del mes" value={formatMoney(total)} note={`${r.lines.length} ventas cobradas`} />
                <KpiCard label="Por pagar" value={formatMoney(pendingPay)} note="pendiente o con diferencia" tone={pendingPay > 0.005 ? 'amber' : 'green'} />
                <KpiCard label="Venta cobrada (base)" value={formatMoney(r.bySeller.reduce((a, s) => a + s.base, 0))} note="sin IGV" />
                <KpiCard label="Facturado sin cobrar" value={formatMoney(r.pendingBase)} note="aún no genera comisión" tone={r.pendingBase ? 'blue' : undefined} />
            </KpiRow>

            <Tabs<Tab> tabs={[{ id: 'liquidacion', label: 'Liquidación' }, { id: 'detalle', label: 'Detalle por venta' }, { id: 'reglas', label: 'Reglas' }]} value={tab} onChange={setTab} />

            {tab === 'liquidacion' && (
                <DataTable
                    cols={[{ label: 'Vendedor', w: 'minmax(0, 1.4fr)' }, { label: 'Ventas', w: '80px', right: true }, { label: 'Base cobrada', w: '140px', right: true }, { label: 'Comisión', w: '130px', right: true }, { label: 'Estado', w: 'minmax(150px, 1fr)' }, { label: '', w: '150px', right: true }]}
                    rows={status.map(({ s, st }) => [
                        <span key="v"><span className="mod-main">{s.seller}</span><span className="mod-sub">{store.bySeller[s.seller] !== undefined ? `${store.bySeller[s.seller]}% propio` : `${store.defaultPct}% general`}</span></span>,
                        <span key="c" className="mono">{s.count}</span>,
                        <span key="b" className="mono">{formatMoney(s.base)}</span>,
                        <span key="a" className="mono" style={{ fontWeight: 600 }}>{formatMoney(s.amount)}</span>,
                        st.state === 'Pagada' ? <span key="e"><StatusChip label="Pagada" tone="green" /><span className="mod-sub">{fmtDate(new Date(st.payout!.at))} · {st.payout!.by}</span></span>
                            : st.state === 'Diferencia' ? <span key="e"><StatusChip label={`Diferencia ${formatMoney(st.diff)}`} tone="amber" /><span className="mod-sub">se pagó {formatMoney(st.payout!.amount)}</span></span>
                                : <StatusChip key="e" label="Pendiente" tone="blue" />,
                        canEdit && st.state !== 'Pagada' ? <button key="x" type="button" className="btn btn--sm" onClick={() => markPaid(s.seller, s.amount)}>Marcar pagada</button> : <span key="x" />,
                    ])}
                    empty={`No hay ventas cobradas en ${periodLabel(period)}.`}
                    foot={r.bySeller.length > 0 && <><span>Marcar como pagada solo registra la liquidación aquí; el egreso regístralo en Finanzas › Caja o Bancos.</span><span>Total <b>{formatMoney(total)}</b></span></>}
                />
            )}

            {tab === 'detalle' && (
                <DataTable
                    cols={[{ label: 'Orden', w: '130px' }, { label: 'Vendedor', w: 'minmax(0, 1fr)' }, { label: 'Cliente', w: 'minmax(0, 1.4fr)' }, { label: 'Base sin IGV', w: '130px', right: true }, { label: '%', w: '60px', right: true }, { label: 'Comisión', w: '120px', right: true }]}
                    rows={r.lines.map(l => [
                        <span key="o" className="mono">{l.code}</span>,
                        <span key="v" className="ellipsis">{l.seller}</span>,
                        <span key="c" className="ellipsis">{l.client}</span>,
                        <span key="b" className="mono">{formatMoney(l.base)}</span>,
                        <span key="p" className="mono">{l.pct}%</span>,
                        <span key="a" className="mono" style={{ fontWeight: 500 }}>{formatMoney(l.amount)}</span>,
                    ])}
                    empty={`No hay ventas cobradas en ${periodLabel(period)}.`}
                />
            )}

            {tab === 'reglas' && (
                <DataTable
                    cols={[{ label: 'Vendedor', w: 'minmax(0, 1.6fr)' }, { label: '% de comisión', w: '140px', right: true }, { label: 'Se aplica', w: 'minmax(0, 1fr)' }]}
                    rows={[
                        [<span key="v"><span className="mod-main">General</span><span className="mod-sub">para quien no tenga un % propio</span></span>, pctInput('__default', store.defaultPct, '0'), <span key="a" className="muted">todos los demás</span>],
                        ...sellerList.map(s => [
                            <span key="v" className="mod-main">{s}</span>,
                            pctInput(s, store.bySeller[s], `${store.defaultPct}`),
                            <span key="a" className="muted">{store.bySeller[s] !== undefined ? `${store.bySeller[s]}% propio` : `usa el general (${store.defaultPct}%)`}</span>,
                        ]),
                    ]}
                    empty=""
                    foot={<span>{canEdit ? 'Deja vacío el % de un vendedor para que use el general. Se guarda al salir de la casilla.' : 'Solo quien puede editar Configuración cambia las reglas.'}</span>}
                />
            )}
            <Toast message={toast.message} />
        </ModulePage>
    );
}