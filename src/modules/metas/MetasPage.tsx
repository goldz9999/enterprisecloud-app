import { useMemo, useState } from 'react';
import { can } from '@/data/permissions';
import { KpiCard, KpiRow } from '@/shared/components/KpiCard';
import { Modal } from '@/shared/components/Modal';
import { StatusChip } from '@/shared/components/StatusChip';
import { Toast, useToast } from '@/shared/components/Toast';
import { formatMoney } from '@/shared/lib/format';
import { newId, useModuleStore } from '../localStore';
import { lastMonths, saleFacts, sellers } from '../salesData';
import { useGestionDB } from '../localCopy';
import { DataTable, ModulePage, PeriodSelect, periodLabel, Progress, Tabs } from '../ui';
import { goalProgress, ranking, type Goal } from './metasLogic';

type Tab = 'metas' | 'ranking';
const EMPTY = { kind: 'vendedor' as Goal['kind'], target: '', amount: '' };

export function MetasPage() {
    const d = useGestionDB();
    const toast = useToast();
    const months = lastMonths(12);
    const [period, setPeriod] = useState(months[0]);
    const [tab, setTab] = useState<Tab>('metas');
    const [store, setStore] = useModuleStore<{ items: Goal[] }>('metas', { items: [] });
    const [form, setForm] = useState<typeof EMPTY & { id?: string }>(EMPTY);
    const [editing, setEditing] = useState(false);
    const canEdit = can(d, 'Configuración', 'Editar');

    const facts = useMemo(() => saleFacts(d), [d]);
    const catOf = useMemo(() => {
        const m = new Map(d.records.productos.map(p => [String(p.sku), String(p.cat || '—')]));
        return (sku: string) => m.get(sku) ?? '—';
    }, [d.records.productos]);
    const today = new Date();
    const goals = store.items.filter(g => g.period === period);
    const progress = goals.map(g => ({ g, p: goalProgress(g, facts, catOf, today) })).sort((a, b) => b.p.pct - a.p.pct);
    const rank = ranking(facts, period);
    const monthTotal = rank.reduce((a, r) => a + r.total, 0);
    const reached = progress.filter(x => x.p.pct >= 100).length;
    const behind = progress.filter(x => x.p.behind).length;
    const sellerList = sellers(d, facts);
    const categories = [...new Set(d.records.categorias.map(c => String(c.nombre)).filter(Boolean))].sort();

    const openNew = () => { setForm(EMPTY); setEditing(true); };
    const openEdit = (g: Goal) => { setForm({ id: g.id, kind: g.kind, target: g.target, amount: String(g.amount) }); setEditing(true); };
    const amount = Number(form.amount.replace(',', '.'));
    const formError = !form.target ? `Elige ${form.kind === 'vendedor' ? 'un vendedor' : 'una categoría'}` : !(amount > 0) ? 'Escribe una meta mayor que cero'
        : store.items.some(g => g.id !== form.id && g.period === period && g.kind === form.kind && g.target === form.target) ? 'Ya hay una meta para eso en este mes' : '';
    const save = () => {
        if (formError) return;
        const goal: Goal = { id: form.id ?? newId(), period, kind: form.kind, target: form.target, amount: Math.round(amount * 100) / 100 };
        setStore({ items: form.id ? store.items.map(g => (g.id === form.id ? goal : g)) : [...store.items, goal] });
        setEditing(false);
        toast.flash(form.id ? 'Meta actualizada' : 'Meta creada');
    };
    const remove = (id: string) => { setStore({ items: store.items.filter(g => g.id !== id) }); setEditing(false); toast.flash('Meta eliminada'); };
    const copyPrevious = () => {
        const [y, m] = period.split('-').map(Number);
        const pd = new Date(y, m - 2, 1);
        const prev = `${pd.getFullYear()}-${String(pd.getMonth() + 1).padStart(2, '0')}`;
        const from = store.items.filter(g => g.period === prev && !goals.some(x => x.kind === g.kind && x.target === g.target));
        if (!from.length) return toast.flash(`No hay metas nuevas que copiar de ${periodLabel(prev)}`);
        setStore({ items: [...store.items, ...from.map(g => ({ ...g, id: newId(), period }))] });
        toast.flash(`${from.length} meta(s) copiadas de ${periodLabel(prev)}`);
    };

    return (
        <ModulePage
            label="Metas y ranking"
            subtitle="Metas mensuales en soles (sin IGV). El avance sale solo de las ventas con comprobante emitido."
            local
            actions={<>
                <PeriodSelect value={period} options={months} onChange={setPeriod} />
                {canEdit && <button type="button" className="btn btn--sm" onClick={copyPrevious}>Copiar del mes anterior</button>}
                {canEdit && <button type="button" className="btn btn--primary btn--sm" onClick={openNew}>Nueva meta</button>}
            </>}
        >
            <KpiRow>
                <KpiCard label="Venta del mes" value={formatMoney(monthTotal)} note={`${rank.reduce((a, r) => a + r.count, 0)} comprobantes · sin IGV`} />
                <KpiCard label="Metas del mes" value={String(goals.length)} note={periodLabel(period)} />
                <KpiCard label="Cumplidas" value={String(reached)} note="100 % o más" tone={reached ? 'green' : undefined} />
                <KpiCard label="Atrasadas" value={String(behind)} note="más de 10 puntos bajo el ritmo del mes" tone={behind ? 'red' : undefined} />
            </KpiRow>

            <Tabs<Tab> tabs={[{ id: 'metas', label: 'Metas' }, { id: 'ranking', label: 'Ranking de vendedores' }]} value={tab} onChange={setTab} />

            {tab === 'metas' ? (
                <DataTable
                    cols={[{ label: 'Meta', w: 'minmax(0, 1.4fr)' }, { label: 'Objetivo', w: '130px', right: true }, { label: 'Avance', w: '130px', right: true }, { label: 'Cumplimiento', w: 'minmax(160px, 1.2fr)' }, { label: 'Estado', w: '130px' }, { label: '', w: '70px', right: true }]}
                    rows={progress.map(({ g, p }) => [
                        <span key="m"><span className="mod-main">{g.target}</span><span className="mod-sub">{g.kind === 'vendedor' ? 'Vendedor' : 'Categoría'}</span></span>,
                        <span key="o" className="mono">{formatMoney(g.amount)}</span>,
                        <span key="a" className="mono" style={{ fontWeight: 500 }}>{formatMoney(p.actual)}</span>,
                        <span key="p" className="mod-pct" title={`Ritmo esperado del mes: ${p.expectedPct}%`}><Progress pct={p.pct} tone={p.pct >= 100 ? 'green' : p.behind ? 'red' : 'blue'} /><span>{p.pct.toFixed(0)}%</span></span>,
                        p.pct >= 100 ? <StatusChip key="e" label="Cumplida" tone="green" /> : p.behind ? <StatusChip key="e" label="Atrasada" tone="red" /> : <StatusChip key="e" label="En curso" tone="blue" />,
                        canEdit ? <button key="x" type="button" className="link-btn" onClick={() => openEdit(g)}>Editar</button> : <span key="x" />,
                    ])}
                    empty={<>No hay metas para {periodLabel(period)}.{canEdit && ' Usa «Nueva meta» o «Copiar del mes anterior».'}</>}
                    foot={goals.length > 0 && <span>Ritmo esperado hoy: <b>{progress[0]?.p.expectedPct.toFixed(0)}%</b> del mes</span>}
                />
            ) : (
                <DataTable
                    cols={[{ label: '#', w: '40px' }, { label: 'Vendedor', w: 'minmax(0, 1.4fr)' }, { label: 'Ventas', w: '90px', right: true }, { label: 'Total sin IGV', w: '140px', right: true }, { label: 'Participación', w: 'minmax(160px, 1.2fr)' }]}
                    rows={rank.map((r, i) => [
                        <span key="n" className={'mod-medal' + (i < 3 ? ` is-${i + 1}` : '')}>{i + 1}</span>,
                        <span key="v" className="mod-main">{r.seller}</span>,
                        <span key="c" className="mono">{r.count}</span>,
                        <span key="t" className="mono" style={{ fontWeight: 500 }}>{formatMoney(r.total)}</span>,
                        <span key="p" className="mod-pct"><Progress pct={monthTotal ? (r.total / monthTotal) * 100 : 0} tone="blue" /><span>{monthTotal ? ((r.total / monthTotal) * 100).toFixed(0) : 0}%</span></span>,
                    ])}
                    empty={`Aún no hay ventas facturadas en ${periodLabel(period)}.`}
                />
            )}

            {editing && (
                <Modal
                    title={form.id ? 'Editar meta' : `Nueva meta · ${periodLabel(period)}`}
                    onClose={() => setEditing(false)}
                    footer={<>
                        {form.id && <button type="button" className="btn btn--danger-text" style={{ marginRight: 'auto' }} onClick={() => remove(form.id!)}>Eliminar</button>}
                        <button type="button" className="btn" onClick={() => setEditing(false)}>Cancelar</button>
                        <button type="button" className="btn btn--primary" disabled={!!formError} title={formError || undefined} onClick={save}>Guardar</button>
                    </>}
                >
                    <div className="form-grid">
                        <label className="field">
                            <span className="field__label">Tipo de meta</span>
                            <select className="field__control" value={form.kind} onChange={e => setForm(f => ({ ...f, kind: e.target.value as Goal['kind'], target: '' }))}>
                                <option value="vendedor">Por vendedor</option>
                                <option value="categoria">Por categoría de producto</option>
                            </select>
                        </label>
                        <label className="field">
                            <span className="field__label">{form.kind === 'vendedor' ? 'Vendedor' : 'Categoría'}</span>
                            <select className="field__control" value={form.target} onChange={e => setForm(f => ({ ...f, target: e.target.value }))}>
                                <option value="">Elegir…</option>
                                {(form.kind === 'vendedor' ? sellerList : categories).map(x => <option key={x}>{x}</option>)}
                            </select>
                        </label>
                        <label className="field field--wide">
                            <span className="field__label">Meta del mes (S/, sin IGV)</span>
                            <input className="field__control mono" inputMode="decimal" placeholder="Ej. 20000" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value.replace(/[^\d.,]/g, '') }))} style={{ padding: '0 10px' }} />
                        </label>
                    </div>
                    {formError && form.amount && <p className="field__error" style={{ marginTop: 8 }}>{formError}</p>}
                </Modal>
            )}
            <Toast message={toast.message} />
        </ModulePage>
    );
}