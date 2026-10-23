import { useMemo, useState } from 'react';
import { can } from '@/data/permissions';
import { KpiCard, KpiRow } from '@/shared/components/KpiCard';
import { StatusChip } from '@/shared/components/StatusChip';
import { addDays, parseDate } from '@/shared/lib/dates';
import { formatMoney } from '@/shared/lib/format';
import { useModuleStore } from '../localStore';
import { useGestionDB } from '../localCopy';
import { DataTable, ModulePage, shortDay } from '../ui';
import { currentBalance, projectCash } from './flujoCajaLogic';

const WEEKS = 8;

export function FlujoCajaPage() {
    const d = useGestionDB();
    const [cfg, setCfg] = useModuleStore<{ opening: number | null }>('flujoCaja', { opening: null });
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState('');
    const [open, setOpen] = useState<string | null>(null);
    const canEdit = can(d, 'Caja', 'Editar');

    const fromBooks = currentBalance(d.records.caja, d.records.bancos);
    const opening = cfg.opening ?? fromBooks;
    const today = new Date();
    const r = useMemo(() => projectCash({ cxc: d.records.cxc, cxp: d.records.cxp, opening, today, weeks: WEEKS }), [d.records.cxc, d.records.cxp, opening]); // eslint-disable-line react-hooks/exhaustive-deps
    const last = r.weeks[r.weeks.length - 1];
    const firstNegative = r.weeks.find(w => w.balance < 0);
    const max = Math.max(1, ...r.weeks.flatMap(w => [w.inflow, w.outflow]));
    const totalIn = r.weeks.reduce((a, w) => a + w.inflow, 0);
    const totalOut = r.weeks.reduce((a, w) => a + w.outflow, 0);

    const saveOpening = () => {
        const v = Number(draft.replace(',', '.'));
        setCfg({ opening: draft.trim() === '' || !isFinite(v) ? null : v });
        setEditing(false);
    };
    const range = (start: string) => `${shortDay(start)} – ${shortDay(addDaysIso(start, 6))}`;

    return (
        <ModulePage
            label="Flujo de caja"
            subtitle={`Proyección de las próximas ${WEEKS} semanas: entra lo que vence en Cuentas por cobrar y sale lo que vence en Cuentas por pagar.`}
            local={cfg.opening !== null}
            actions={canEdit && (editing ? (
                <>
                    <input className="field__control mod-num" style={{ width: 140 }} autoFocus inputMode="decimal" placeholder={String(fromBooks)} value={draft} onChange={e => setDraft(e.target.value.replace(/[^\d.,-]/g, ''))} onKeyDown={e => e.key === 'Enter' && saveOpening()} aria-label="Saldo inicial" />
                    <button type="button" className="btn btn--sm" onClick={() => setEditing(false)}>Cancelar</button>
                    <button type="button" className="btn btn--primary btn--sm" onClick={saveOpening}>Guardar</button>
                </>
            ) : (
                <button type="button" className="btn btn--sm" onClick={() => { setDraft(cfg.opening === null ? '' : String(cfg.opening)); setEditing(true); }}>Ajustar saldo inicial</button>
            ))}
        >
            <KpiRow>
                <KpiCard label="Saldo inicial" value={formatMoney(opening)} note={cfg.opening === null ? 'Caja + Bancos del sistema' : 'escrito a mano (vacío = Caja + Bancos)'} />
                <KpiCard label={`Entradas en ${WEEKS} semanas`} value={formatMoney(totalIn)} note="cuentas por cobrar por vencer" tone="green" />
                <KpiCard label={`Salidas en ${WEEKS} semanas`} value={formatMoney(totalOut)} note="cuentas por pagar por vencer" tone="red" />
                <KpiCard label="Saldo proyectado" value={formatMoney(last?.balance ?? opening)} note={firstNegative ? `queda en negativo la semana del ${shortDay(firstNegative.start)}` : `al ${shortDay(addDaysIso(last.start, 6))}`} tone={firstNegative ? 'red' : 'green'} />
            </KpiRow>

            {(r.overdueIn > 0 || r.overdueOut > 0) && (
                <div className="mod-hint">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 8v4M12 16h.01" /></svg>
                    <span>Ya vencido y fuera de la proyección: por cobrar <b>{formatMoney(r.overdueIn)}</b> y por pagar <b>{formatMoney(r.overdueOut)}</b>. Gestiona la cobranza en Cuentas por cobrar.</span>
                </div>
            )}

            <section className="panel">
                <div className="panel__head" style={{ padding: '12px 16px' }}><div className="panel__title">Entradas y salidas por semana</div></div>
                <div className="mod-cash" style={{ ['--n' as string]: WEEKS }}>
                    {r.weeks.map(w => (
                        <div key={w.start} className="mod-cash__col" title={`${range(w.start)}\nEntradas ${formatMoney(w.inflow)}\nSalidas ${formatMoney(w.outflow)}\nSaldo ${formatMoney(w.balance)}`}>
                            <div className="mod-cash__bars">
                                <i className="mod-cash__in" style={{ height: `${(w.inflow / max) * 100}%` }} />
                                <i className="mod-cash__out" style={{ height: `${(w.outflow / max) * 100}%` }} />
                            </div>
                            <span className="mod-cash__lbl">{shortDay(w.start)}</span>
                        </div>
                    ))}
                </div>
                <div className="mod-legend"><span><i className="mod-cash__in" /> Entradas (CxC)</span><span><i className="mod-cash__out" /> Salidas (CxP)</span></div>
            </section>

            <DataTable
                cols={[{ label: 'Semana', w: 'minmax(0, 1.2fr)' }, { label: 'Entradas', w: '140px', right: true }, { label: 'Salidas', w: '140px', right: true }, { label: 'Neto', w: '140px', right: true }, { label: 'Saldo proyectado', w: '160px', right: true }, { label: 'Documentos', w: '110px', right: true }]}
                rows={r.weeks.flatMap((w, wi) => {
                    const main = [
                        <span key="s"><span className="mod-main">{range(w.start)}</span>{wi === 0 && <span className="mod-sub">semana actual</span>}</span>,
                        <span key="i" className="mono" style={{ color: w.inflow ? 'var(--green)' : 'var(--faint)' }}>{formatMoney(w.inflow)}</span>,
                        <span key="o" className="mono" style={{ color: w.outflow ? 'var(--red)' : 'var(--faint)' }}>{formatMoney(w.outflow)}</span>,
                        <span key="n" className="mono">{formatMoney(w.inflow - w.outflow)}</span>,
                        <span key="b" className="mono" style={{ fontWeight: 600, color: w.balance < 0 ? 'var(--red)' : 'var(--text)' }}>{formatMoney(w.balance)}</span>,
                        w.docs.length ? <button key="d" type="button" className="link-btn" onClick={() => setOpen(open === w.start ? null : w.start)}>{open === w.start ? 'Ocultar' : `Ver ${w.docs.length}`}</button> : <span key="d" className="muted">—</span>,
                    ];
                    const detail = open === w.start ? w.docs.map(x => [
                        <span key="s" className="mod-sub" style={{ paddingLeft: 12 }}>{shortDay(x.due)} · {x.kind === 'cobro' ? 'Cobro' : 'Pago'}</span>,
                        <span key="i" className="mono mod-sub">{x.kind === 'cobro' ? formatMoney(x.amount) : ''}</span>,
                        <span key="o" className="mono mod-sub">{x.kind === 'pago' ? formatMoney(x.amount) : ''}</span>,
                        <span key="w" className="mod-sub">{x.who}</span>,
                        <span key="e" />,
                        <span key="c" className="mod-sub mono">{x.doc}</span>,
                    ]) : [];
                    return [main, ...detail];
                })}
                empty="No hay semanas para mostrar."
                foot={<>
                    <span>Fuente: saldos pendientes de Cuentas por cobrar y por pagar, según su fecha de vencimiento.</span>
                    {firstNegative ? <StatusChip label="Falta liquidez" tone="red" /> : <StatusChip label="Liquidez suficiente" tone="green" />}
                </>}
            />
        </ModulePage>
    );
}

const isoToday = (t: Date) => `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
function addDaysIso(iso: string, n: number) {
    const base = parseDate(iso) ?? new Date();
    return isoToday(addDays(base, n));
}