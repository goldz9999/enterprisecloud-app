import { useEffect, Fragment, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AppShell } from '../../components/AppShell';
import { StatusChip, toneColor } from '../../components/StatusChip';
import { Toast, useToast } from '../../components/Toast';
import { renderDocHtml } from '../../data/domain/documents';
import { dataOf, flowTotal, setFlowStatus } from '../../data/domain/flows';
import {
  convertQuotationRemote,
  deleteQuotationRemote,
  duplicateQuotationRemote,
  saveQuotationRemote,
  setQuotationStatusRemote,
} from '../../data/domain/quotations';
import {
  convertPurchaseRequestRemote,
  deletePurchaseRequestRemote,
  savePurchaseRequestRemote,
  setPurchaseRequestStatusRemote,
} from '../../data/domain/purchaseRequests';
import { stockRow } from '../../data/domain/stock';
import { can, type PermAction } from '../../data/permissions';
import { getDB, mutate, useDB } from '../../data/store';
import type { OrderLine } from '../../data/types';
import { openPrintable } from '../../lib/csv';
import { addDays, isoDate } from '../../lib/dates';
import { formatMoney } from '../../lib/format';
import { QuoteModal } from '../../pages/QuoteModal';
import { FlowEditor } from './FlowEditor';
import type { FlowListConfig, FlowRow } from './types';
import './FlowListPage.css';

const COLS = '104px minmax(0, 1fr) 96px 132px';

interface FlowAction {
  label: string;
  primary?: boolean;
  danger?: boolean;
  /** Permission module and action required. */
  perm: [string, PermAction];
  run: () => void;
}

/** List + sticky detail panel for documents that start a flow (Cotizaciones, Solicitudes). */
export function FlowListPage({ cfg }: { cfg: FlowListConfig }) {
  const d = useDB();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const quote = cfg.kind === 'cotizacion';
  const rows = quote ? d.cotizaciones : d.solicitudes;
  const [filter, setFilter] = useState('Todos');
  const [query, setQuery] = useState(params.get('q') ?? '');
  // Follow ?q= when arriving from the global search or a link while already on this screen.
  useEffect(() => setQuery(params.get('q') ?? ''), [params]);
  const [selId, setSelId] = useState(rows[0]?.id);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Cotización sin cliente: al convertirla hay que indicar con qué cliente registrado se crea la orden.
  const [convertTo, setConvertTo] = useState('');
  const [error, setError] = useState('');
  const toast = useToast();

  // Opened from Stock bajo mínimo: ?nuevo=SKU&alm=Almacén → new request pre-filled with that product.
  const [editor, setEditor] = useState<{ row?: FlowRow; lines?: OrderLine[]; alm?: string } | null>(() => {
    const sku = params.get('nuevo');
    if (!sku || quote) return null;
    const db = getDB();
    const p = db.records.productos.find(x => x.sku === sku);
    if (!p) return {};
    const alm = params.get('alm') ?? undefined;
    const st = alm ? stockRow(db, sku, alm) : undefined;
    const qty = Math.max(1, Number(p.min) * 2 - Number(st?.stock ?? 0));
    return { lines: [{ sku, name: String(p.nombre), unit: String(p.unidad).toLowerCase(), qty, price: Number(p.costo) || 0 }], alm };
  });

  const q = query.trim().toLowerCase();
  const searched = rows.filter(r => !q || (r.id + r.party + r.partySub).toLowerCase().includes(q));
  const list = filter === 'Todos' ? searched : searched.filter(r => r.status === filter);
  const sel = rows.find(r => r.id === selId) ?? list[0];
  const note = sel ? cfg.notes[sel.status] : undefined;
  const orderModule = quote ? 'Órdenes de venta' : 'Órdenes de compra';

  const act = (fn: (draft: ReturnType<typeof getDB>) => string | void, msg: string) => {
    const err = mutate(fn);
    if (err) return setError(err);
    setError('');
    toast.flash(msg);
  };
  const status = (to: string) => async () => {
    if (quote) {
      const res = await setQuotationStatusRemote(sel!.id, to);
      if (!res.ok) return setError(res.error);
      setError('');
      toast.flash(`${sel!.id} · ${to}`);
      return;
    }
    if (!quote) {
      const res = await setPurchaseRequestStatusRemote(sel!.id, to);
      if (!res.ok) return setError(res.error);
      setError('');
      toast.flash(`${sel!.id} · ${to}`);
      return;
    }
    act(dr => setFlowStatus(dr, cfg.kind, sel!.id, to), `${sel!.id} · ${to}`);
  };
  const convert = async () => {
    if (quote) {
      let customerLocalId: number | undefined;
      if (sel!.prospect) {
        const c = d.records.clientes.find(x => x.razon === convertTo);
        if (!c) return setError('Elige el cliente de la orden de venta (si aún no está registrado, créalo en Mantenimiento › Clientes).');
        customerLocalId = Number(c._id);
      }
      const res = await convertQuotationRemote(sel!.id, customerLocalId);
      if (!res.ok) return setError(res.error);
      setError('');
      if (res.code) navigate(`/ventas/orden/${res.code}`);
      return;
    }
    // solicitud → orden de compra: usa proveedor sugerido del data
    const data = dataOf(d, 'solicitud', sel!);
    const prov = data.prov;
    if (!prov || prov === '—') {
      return setError('Indica un proveedor sugerido en la solicitud (o edítala) antes de generar la orden.');
    }
    const res = await convertPurchaseRequestRemote(sel!.id, prov, data.alm || undefined);
    if (!res.ok) return setError(res.error);
    setError('');
    if (res.code) navigate(`/compras/orden/${res.code}`);
  };

  const actionsFor = (r: FlowRow): FlowAction[] => {
    const edit: FlowAction = { label: 'Editar', perm: [cfg.active, 'Editar'], run: () => setEditor({ row: r }) };
    const duplicate = (r: FlowRow): FlowAction => ({
      label: 'Duplicar como nueva cotización', perm: [cfg.active, 'Crear'], run: () => {
        void (async () => {
          const data = dataOf(d, 'cotizacion', r);
          // La copia es un borrador nuevo: si la original ya venció, arranca con la vigencia por defecto.
          const res = await duplicateQuotationRemote(r.id, r.status === 'Vencida' ? { ...data, valida: isoDate(addDays(new Date(), Number(/(\d+)/.exec(String(d.settings.vcot ?? '14'))?.[1] ?? 14))) } : data, r.items);
          if (!res.ok) return setError(res.error);
          setError('');
          toast.flash('Cotización duplicada como borrador');
          if (res.code) setSelId(res.code);
        })();
      }
    });
    const openOrder: FlowAction = { label: `Ver ${quote ? 'orden de venta' : 'orden de compra'} ${r.order ?? ''}`, perm: [orderModule, 'Ver'], run: () => r.order && navigate(`/${quote ? 'ventas' : 'compras'}/orden/${r.order}`) };
    if (quote) {
      switch (r.status) {
        case 'Borrador': return [{ label: 'Enviar al cliente', primary: true, perm: [cfg.active, 'Editar'], run: () => void status('Enviada')() }, edit, { label: 'Eliminar borrador', danger: true, perm: [cfg.active, 'Eliminar'], run: () => setConfirmDelete(true) }];
        case 'Enviada': return [{ label: 'Marcar como aprobada', primary: true, perm: [cfg.active, 'Editar'], run: () => void status('Aprobada')() }, { label: 'Marcar como rechazada', danger: true, perm: [cfg.active, 'Editar'], run: () => void status('Rechazada')() }, edit];
        case 'Aprobada': return [{ label: 'Convertir en orden de venta →', primary: true, perm: [orderModule, 'Crear'], run: () => void convert() }];
        case 'Vencida': return [{ label: 'Extender vigencia', primary: true, perm: [cfg.active, 'Editar'], run: () => setEditor({ row: r }) }, duplicate(r)];
        case 'Convertida': return r.order ? [openOrder] : [];
        case 'Rechazada': return [duplicate(r)];
      }
      return [];
    }
    switch (r.status) {
      case 'Pendiente': return [{ label: 'Aprobar solicitud', primary: true, perm: [cfg.active, 'Aprobar'], run: () => void status('Aprobada')() }, { label: 'Rechazar', danger: true, perm: [cfg.active, 'Aprobar'], run: () => void status('Rechazada')() }, edit];
      case 'Aprobada': return [{ label: 'Generar orden de compra →', primary: true, perm: [orderModule, 'Crear'], run: () => void convert() }];
      case 'Atendida': return r.order ? [openOrder] : [];
    }
    return [];
  };
  const actions = sel ? actionsFor(sel).filter(a => can(d, ...a.perm)) : [];

  const printQuote = (r: FlowRow) => {
    const c = d.records.clientes.find(x => x.razon === r.party);
    openPrintable(
      renderDocHtml(d, {
        title: quote ? 'Cotización' : 'Solicitud de compra',
        number: r.id,
        party: quote ? { name: r.party, ruc: String(c?.ndoc ?? ''), contact: '', terms: '', address: String(c?.dir ?? '') } : undefined,
        lines: r.items.map(i => ({ sku: i.sku ?? '', name: i.name, unit: i.unit, qty: i.qty, price: i.price })),
        igvRate: 0.18,
        facts: r.facts.map(f => [f.k, f.v]),
      }),
    );
  };

  return (
    <AppShell
      active={cfg.active}
      breadcrumb={[{ label: 'Inicio', to: '/' }, { label: cfg.section }, { label: cfg.title }]}
      actions={
        can(d, cfg.active, 'Crear') && (
          <button type="button" className="btn btn--primary" onClick={() => setEditor({})}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            {cfg.newLabel}
          </button>
        )
      }
    >
      <div>
        <h1 className="page__title">{cfg.title}</h1>
        <div className="page__subtitle">{cfg.subtitle}</div>
      </div>

      <div className="flowbar">
        <span className="flowbar__label">Flujo</span>
        {cfg.flow.map((f, i) => (
          <Fragment key={f}>
            <span className={'flowbar__step' + (i === 0 ? ' is-current' : '')}>{f}</span>
            {i < cfg.flow.length - 1 && <span className="flowbar__arrow">→</span>}
          </Fragment>
        ))}
      </div>

      <div className="toolbar">
        {['Todos', ...Object.keys(cfg.statuses)].map(f => (
          <button key={f} type="button" className={'filter-chip' + (filter === f ? ' is-on' : '')} aria-pressed={filter === f} onClick={() => setFilter(f)}>
            <span className="filter-chip__dot" style={{ background: f === 'Todos' ? 'var(--faint)' : toneColor(cfg.statuses[f]) }} />
            {f}
            <span className="filter-chip__count">{f === 'Todos' ? searched.length : searched.filter(r => r.status === f).length}</span>
          </button>
        ))}
        <label className="search toolbar__search" style={{ width: 240 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder={cfg.searchPh} aria-label={'Buscar ' + cfg.title} />
        </label>
      </div>

      <section className="split">
        <div className="table">
          <div className="table__row table__head" style={{ gridTemplateColumns: COLS, gap: 10 }}>
            <span>Código</span><span>{cfg.partyHead}</span><span className="t-right">{cfg.amountHead}</span><span>Estado</span>
          </div>
          {list.map(r => (
            <div
              key={r.id}
              role="row"
              tabIndex={0}
              className={'table__row table__body-row' + (r.id === sel?.id ? ' is-selected is-marked' : '')}
              style={{ gridTemplateColumns: COLS, gap: 10 }}
              onClick={() => { setSelId(r.id); setError(''); setConfirmDelete(false); }}
              onKeyDown={e => e.key === 'Enter' && setSelId(r.id)}
            >
              <div className="mono" style={{ whiteSpace: 'nowrap' }}>
                <div style={{ fontSize: 11.5, color: 'var(--text-2)' }}>{r.id}</div>
                <div style={{ fontSize: 11, color: 'var(--faint)' }}>{r.date}</div>
              </div>
              <div className="cell">
                <div className="cell__main" style={{ fontWeight: 500 }}>{r.party}</div>
                <div className="cell__sub">{r.partySub}</div>
              </div>
              <span className="mono t-right" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{formatMoney(flowTotal(r.items))}</span>
              <span><StatusChip label={r.status} tone={cfg.statuses[r.status] ?? 'muted'} /></span>
            </div>
          ))}
          {list.length === 0 && (
            <div className="table__empty">
              {rows.length === 0 ? <>Aún no hay registros. {can(d, cfg.active, 'Crear') && <a style={{ cursor: 'pointer' }} onClick={() => setEditor({})}>{cfg.newLabel}</a>}</> : 'Sin resultados.'}
            </div>
          )}
          <div className="table__foot">{list.length} registros</div>
        </div>

        <aside className="flowdetail">
          {sel && (
            <>
              <div className="flowdetail__head">
                <div className="flowdetail__idrow">
                  <span className="mono" style={{ fontWeight: 600 }}>{sel.id}</span>
                  <StatusChip label={sel.status} tone={cfg.statuses[sel.status] ?? 'muted'} />
                  <button type="button" className="link-btn" style={{ marginLeft: 'auto', height: 22, padding: 0 }} onClick={() => printQuote(sel)}>Imprimir</button>
                </div>
                <div style={{ fontWeight: 500 }}>{sel.party}</div>
                <div className="flowdetail__sub">{sel.partySub}</div>
              </div>
              <div className="flowdetail__body">
                <div className="facts">
                  {sel.facts.map(f => (
                    <Fragment key={f.k}><span className="facts__k">{f.k}</span><span>{f.v}</span></Fragment>
                  ))}
                  {sel.order && <><span className="facts__k">Orden generada</span><span className="mono">{sel.order}</span></>}
                </div>
                <div className="flowdetail__items">
                  <span className="field__label">Productos</span>
                  {sel.items.map(i => (
                    <div key={i.name} className="lineitem">
                      <div className="lineitem__main">
                        <div className="lineitem__name">{i.name}</div>
                        <div className="lineitem__qty mono">{i.qty} {i.unit} × {formatMoney(i.price)}</div>
                      </div>
                      <span className="mono">{formatMoney(i.qty * i.price)}</span>
                    </div>
                  ))}
                  <div className="lineitem__total">
                    <span>{cfg.amountHead} (inc. IGV)</span>
                    <span className="mono">{formatMoney(flowTotal(sel.items))}</span>
                  </div>
                </div>
                {note && <div className="note">{note}</div>}
                {quote && sel.prospect && sel.status === 'Aprobada' && (
                  <label className="field">
                    <span className="field__label">Cliente para la orden de venta *</span>
                    <select className="field__control" value={convertTo} onChange={e => setConvertTo(e.target.value)}>
                      <option value="">Elige un cliente registrado…</option>
                      {d.records.clientes.filter(c => c.estado !== 'Inactivo').map(c => <option key={c._id} value={String(c.razon)}>{String(c.razon)}</option>)}
                    </select>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>Esta cotización no tiene cliente. Elige quién compra; si no está registrado, créalo en Mantenimiento › Clientes.</span>
                  </label>
                )}
                {error && <div className="drawer-error" role="alert">{error}</div>}
                {confirmDelete ? (
                  <div className="confirm-del">
                    <span className="confirm-del__text">¿Eliminar {sel.id}?</span>
                    <button type="button" className="confirm-del__no" onClick={() => setConfirmDelete(false)}>No</button>
                    <button type="button" className="confirm-del__yes" onClick={() => {
                      setConfirmDelete(false); void (async () => {
                        if (quote) {
                          const res = await deleteQuotationRemote(sel.id);
                          if (!res.ok) return setError(res.error);
                          setError('');
                          toast.flash(`${sel.id} eliminada`);
                          return;
                        }
                        {
                          const res = await deletePurchaseRequestRemote(sel.id);
                          if (!res.ok) return setError(res.error);
                          setError('');
                          toast.flash(`${sel.id} eliminada`);
                          return;
                        }
                      })();
                    }}>Sí, eliminar</button>
                  </div>
                ) : (
                  <div className="flowdetail__actions">
                    {actions.map(a => (
                      <button key={a.label} type="button" className={'btn btn--block' + (a.primary ? ' btn--primary' : '') + (a.danger ? ' btn--danger-text' : '')} onClick={a.run}>
                        {a.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
          {!sel && <div className="flowdetail__body" style={{ color: 'var(--muted)' }}>Selecciona un documento para ver su detalle.</div>}
        </aside>
      </section>

      {editor && quote && (
        <QuoteModal
          row={editor.row}
          onClose={() => setEditor(null)}
          onSave={async (data, items) => {
            const cliente = d.records.clientes.find(c => c.razon === data.cliente);
            const res = await saveQuotationRemote(data, items, editor.row?.id, cliente?._id);
            if (!res.ok) return res.error;
            setError('');
            setEditor(null);
            setFilter('Todos');
            if (res.code) setSelId(res.code);
            toast.flash(editor.row ? 'Cambios guardados' : `${res.code} creada`);
            return undefined;
          }}
        />
      )}
      {editor && !quote && (
        <FlowEditor
          kind={cfg.kind}
          row={editor.row}
          initialLines={editor.lines}
          initialData={editor.alm ? { alm: editor.alm, motivo: 'Reposición por stock bajo mínimo' } : undefined}
          onClose={() => {
            setEditor(null);
            if (params.has('nuevo')) setParams({}, { replace: true });
          }}
          onSave={(data, items) => {
            if (quote) {
              void (async () => {
                const cliente = d.records.clientes.find(c => c.razon === data.cliente);
                const res = await saveQuotationRemote(data, items, editor.row?.id, cliente?._id);
                if (!res.ok) {
                  setError(res.error);
                  return;
                }
                setError('');
                setEditor(null);
                if (params.has('nuevo')) setParams({}, { replace: true });
                setFilter('Todos');
                if (res.code) setSelId(res.code);
                toast.flash(editor.row ? 'Cambios guardados' : `${res.code} creada`);
              })();
              return undefined;
            }
            // solicitud de compra
            void (async () => {
              const res = await savePurchaseRequestRemote(data, items, editor.row?.id);
              if (!res.ok) {
                setError(res.error);
                return;
              }
              setError('');
              setEditor(null);
              if (params.has('nuevo')) setParams({}, { replace: true });
              setFilter('Todos');
              if (res.code) setSelId(res.code);
              toast.flash(editor.row ? 'Cambios guardados' : `${res.code} creada`);
            })();
            return undefined;
          }}
        />
      )}
      <Toast message={toast.message} />
    </AppShell>
  );
}