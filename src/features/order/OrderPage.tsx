import { useState, useRef, useCallback } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { AppShell } from '../../components/AppShell';
import { StatusChip } from '../../components/StatusChip';
import { Toast, useToast } from '../../components/Toast';
import { canCancel, cancelOrder, completeStep, orderStatus, orderSubtotal, partyCredit, STEPS, type StepField } from '../../data/domain/orders';
import { cancelSaleOrderRemote, completeSaleStepRemote } from '../../data/domain/salesOrders';
import { cancelPurchaseOrderRemote, completePurchaseStepRemote } from '../../data/domain/purchaseOrders';
import { collectRemote, loadPayables, loadReceivables, payRemote } from '../../data/domain/finance';
import { stockRow } from '../../data/domain/stock';
import { can } from '../../data/permissions';
import { getDB, mutate, useDB } from '../../data/store';
import { putFile, getFile } from '../../data/files';
import { displayDate, fmtDayMonth } from '../../lib/dates';
import { formatMoney } from '../../lib/format';
import './OrderPage.css';

const FILE_TONE: Record<string, string> = { PDF: 'red', XML: 'amber' };
const extOf = (name: string) => name.split('.').pop()!.toUpperCase();

export function OrderPage({ kind }: { kind: 'venta' | 'compra' }) {
  const { code = '' } = useParams();
  const [params] = useSearchParams();
  const d = useDB();
  const o = d.orders.find(x => x.code === code && x.kind === kind);
  const sale = kind === 'venta';
  const module = sale ? 'Órdenes de venta' : 'Órdenes de compra';
  const list = sale ? { label: 'Órdenes de venta', to: '/ventas/ordenes' } : { label: 'Órdenes de compra', to: '/compras/ordenes' };

  const [view, setView] = useState<number | null>(() => {
    const p = parseInt(params.get('paso') ?? '', 10);
    return p >= 1 && p <= 5 ? p - 1 : null;
  });
  const [forms, setForms] = useState<Record<number, Record<string, string>>>({});
  const [showErrors, setShowErrors] = useState(false);
  const [error, setError] = useState('');
  const [justDone, setJustDone] = useState<number | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<{ name: string; url: string; html?: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'datos' | 'historial'>('datos');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  const steps = STEPS[kind];
  const n = steps.length;
  const vi = o ? view ?? Math.min(o.done, n - 1) : 0;
  const step = steps[vi];

  const fieldsFor = (i: number): StepField[] => {
    if (!o) return [];
    const typed = forms[i] ?? {};
    const saved = o.forms[i] ?? {};
    const base = steps[i].fields(o, d, { ...saved, ...typed });
    const values = Object.fromEntries(base.map(f => [f.k, typed[f.k] ?? saved[f.k] ?? f.value]));
    return steps[i].fields(o, d, values).map(f => ({ ...f, value: typed[f.k] ?? saved[f.k] ?? f.value }));
  };
  const fields = fieldsFor(vi);

  if (!o)
    return (
      <AppShell active={module} breadcrumb={[{ label: 'Inicio', to: '/' }, { label: sale ? 'Ventas' : 'Compras' }, list, { label: code, mono: true }]}>
        <h1 className="page__title">Orden no encontrada</h1>
        <div className="page__subtitle">
          No existe la orden {code}. <Link to={list.to}>Volver a {list.label}</Link>
        </div>
      </AppShell>
    );

  const subtotal = orderSubtotal(o);
  const igv = subtotal * o.igvRate;
  const total = subtotal + igv;
  const [statusLabel, statusTone] = orderStatus(o);
  const credit = partyCredit(d, o);
  const isRead = vi < o.done;
  const isForm = vi === o.done && !o.cancelled;
  const isLocked = vi > o.done || (o.cancelled && vi >= o.done);
  const current = o.done < n && !o.cancelled ? steps[o.done] : null;
  const allowed = can(d, module, sale || o.done !== 1 ? 'Editar' : 'Aprobar');
  const docs = d.documentos.filter(x => x.ref === o.code);
  // Use the warehouse being typed in the active form (field 'alm') so stock column
  // updates live when the user switches warehouse before confirming.
  const liveWarehouse: string = (forms[vi]?.alm ?? o.forms[vi]?.alm ?? o.warehouse) as string;

  const setValue = (k: string, v: string) => setForms(s => ({ ...s, [vi]: { ...s[vi], [k]: v } }));
  const goTo = (i: number) => { setView(i); setShowErrors(false); setError(''); };
  const goCurrent = () => goTo(Math.min(o.done, n - 1));

  /**
   * Paso final (cobro / pago): registra el movimiento en el servidor contra la cuenta por
   * cobrar/pagar de la orden. Devuelve `stay` si quedó saldo (el paso no se completa aún).
   */
  const settleInServer = async (values: Record<string, string>): Promise<{ error?: string; stay?: string }> => {
    if (sale) await loadReceivables(); else await loadPayables();
    const rows = sale ? getDB().records.cxc : getDB().records.cxp;
    const row = rows.find(r => r.orden === o.code);
    if (!row || !row.uuid) return { error: `No se encontró la cuenta por ${sale ? 'cobrar' : 'pagar'} de esta orden en el servidor.` };
    if (Number(row.saldo) <= 0) return {};
    const amount = Number(values.mon) || 0;
    if (amount <= 0) return { error: 'El monto debe ser mayor a 0.' };
    const channel = values.cta === 'Caja' ? 'CASH' : 'BANK';
    const res = sale
      ? await collectRemote(String(row.uuid), amount, channel, values.op || undefined)
      : await payRemote(String(row.uuid), amount, channel, values.op || undefined);
    if (!res.ok) return { error: res.error };
    const left = Number(getDB().records[sale ? 'cxc' : 'cxp'].find(r => r.orden === o.code)?.saldo ?? 0);
    if (left > 0) return { stay: `${sale ? 'Cobro' : 'Pago'} parcial registrado. Saldo pendiente: ${formatMoney(left)}.` };
    return {};
  };

  const submit = async () => {
    if (fields.some(f => f.required && !String(f.value).trim())) return setShowErrors(true);
    const values = Object.fromEntries(fields.map(f => [f.k, String(f.value)]));
    const finalStep = o.done === 4;
    if (finalStep) {
      const s = await settleInServer(values);
      if (s.error) return setError(s.error);
      if (s.stay) {
        setError(''); setShowErrors(false);
        setForms(st => ({ ...st, [vi]: {} }));
        return toast.flash(s.stay);
      }
    }
    if (sale) {
      // Persistir el paso en el backend y, si OK, aplicar efectos locales (stock, CxC, docs).
      const remote = await completeSaleStepRemote(o.code, values);
      if (!remote.ok) return setError(remote.error);
      if (o.done === 3 || finalStep) await loadReceivables();
      let result: { error?: string; stay?: string } = {};
      mutate(draft => {
        const local = draft.orders.find(x => x.code === o.code && x.kind === 'venta');
        if (local && !local.cancelled && local.done < 5 && local.done === o.done) {
          result = completeStep(draft, o.code, values);
        }
        const i = draft.orders.findIndex(x => x.code === o.code && x.kind === 'venta');
        if (i >= 0) {
          draft.orders[i] = {
            ...draft.orders[i],
            done: remote.order.done,
            forms: { ...draft.orders[i].forms, ...remote.order.forms },
            docs: { ...draft.orders[i].docs, ...remote.order.docs },
            log: { ...draft.orders[i].log, ...remote.order.log },
            cancelled: remote.order.cancelled,
            warehouse: remote.order.warehouse || draft.orders[i].warehouse,
            party: { ...draft.orders[i].party, ...remote.order.party },
          };
        }
        return result.error;
      });
      if (result.error) toast.flash(`Paso guardado en servidor · aviso local: ${result.error}`);
      setError(''); setShowErrors(false);
      setForms(s => ({ ...s, [vi]: {} }));
      if (result.stay) return toast.flash(result.stay);
      setView(vi); setJustDone(vi);
      return;
    }
    // compra: backend + efectos locales
    {
      const remote = await completePurchaseStepRemote(o.code, values);
      if (!remote.ok) return setError(remote.error);
      if (o.done === 3 || finalStep) await loadPayables();
      let result: { error?: string; stay?: string } = {};
      mutate(draft => {
        const local = draft.orders.find(x => x.code === o.code && x.kind === 'compra');
        if (local && !local.cancelled && local.done < 5 && local.done === o.done) {
          result = completeStep(draft, o.code, values);
        }
        const i = draft.orders.findIndex(x => x.code === o.code && x.kind === 'compra');
        if (i >= 0) {
          draft.orders[i] = {
            ...draft.orders[i],
            done: remote.order.done,
            forms: { ...draft.orders[i].forms, ...remote.order.forms },
            docs: { ...draft.orders[i].docs, ...remote.order.docs },
            log: { ...draft.orders[i].log, ...remote.order.log },
            cancelled: remote.order.cancelled,
            warehouse: remote.order.warehouse || draft.orders[i].warehouse,
            party: { ...draft.orders[i].party, ...remote.order.party },
          };
        }
        return result.error;
      });
      if (result.error) toast.flash(`Paso guardado en servidor · aviso local: ${result.error}`);
      setError(''); setShowErrors(false);
      setForms(s => ({ ...s, [vi]: {} }));
      if (result.stay) return toast.flash(result.stay);
      setView(vi); setJustDone(vi);
      return;
    }
  };

  const cancel = async () => {
    if (sale) {
      const remote = await cancelSaleOrderRemote(o.code);
      if (!remote.ok) {
        setConfirmCancel(false);
        return setError(remote.error);
      }
      mutate(draft => cancelOrder(draft, o.code));
      setConfirmCancel(false);
      toast.flash(`${o.code} anulada`);
      return;
    }
    {
      const remote = await cancelPurchaseOrderRemote(o.code);
      if (!remote.ok) {
        setConfirmCancel(false);
        return setError(remote.error);
      }
      mutate(draft => cancelOrder(draft, o.code));
      setConfirmCancel(false);
      toast.flash(`${o.code} anulada`);
    }
  };

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const arr = Array.from(files);
    for (const file of arr) {
      const blobKey = `doc-${Date.now()}-${file.name}`;
      await putFile(blobKey, file);
      mutate(draft => {
        const maxId = draft.documentos.reduce((m, x) => Math.max(m, x.id), 0);
        draft.documentos.push({
          id: maxId + 1, name: file.name, cat: 'Adjunto', ref: o.code,
          entity: o.party.name,
          size: file.size > 1024 * 1024 ? (file.size / 1024 / 1024).toFixed(1) + ' MB' : Math.round(file.size / 1024) + ' KB',
          date: new Date().toISOString().slice(0, 10),
          by: draft.settings?.userName as string ?? 'Usuario',
          version: '1', blobKey,
        });
      });
    }
    toast.flash(`${arr.length === 1 ? arr[0].name : arr.length + ' archivos'} adjuntado${arr.length === 1 ? '' : 's'}`);
  }, [o.code, o.party.name]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const openPreview = async (doc: typeof docs[0]) => {
    if (doc.html) {
      // Strip the auto-print script so the modal doesn't trigger the browser print dialog
      const safeHtml = doc.html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
      setPreviewDoc({ name: doc.name, url: '', html: safeHtml });
      return;
    }
    if (doc.blobKey) {
      const blob = await getFile(doc.blobKey);
      if (blob) setPreviewDoc({ name: doc.name, url: URL.createObjectURL(blob) });
    }
  };

  const closePreview = () => {
    if (previewDoc?.url) URL.revokeObjectURL(previewDoc.url);
    setPreviewDoc(null);
  };

  const chip = isRead
    ? { label: 'Completado', cls: 'chip--green' }
    : isForm ? { label: 'Por completar', cls: 'chip--accent' }
      : { label: o.cancelled ? 'Anulada' : 'Bloqueado', cls: 'chip--muted' };

  return (
    <AppShell active={module} breadcrumb={[{ label: 'Inicio', to: '/' }, { label: sale ? 'Ventas' : 'Compras' }, list, { label: o.code, mono: true }]}>

      {/* ── Encabezado ── */}
      <div className="order-head">
        <div style={{ minWidth: 0 }}>
          <div className="order-head__title">
            <h1 className="page__title mono">{o.code}</h1>
            <StatusChip label={statusLabel} tone={statusTone} />
          </div>
          <div className="page__subtitle">{sale ? 'Orden de venta' : 'Orden de compra'} · {o.party.name} · emitida {displayDate(o.createdAt)}</div>
        </div>
        <div className="order-head__actions no-print">
          <button type="button" className="btn btn--sm" onClick={() => window.print()}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9V3h12v6M6 18H4v-7h16v7h-2M8 14h8v7H8z" /></svg>
            Imprimir
          </button>
          {canCancel(o) && can(d, module, 'Editar') && (
            <button type="button" className="btn btn--sm btn--danger-text" onClick={() => setConfirmCancel(true)}>Anular</button>
          )}
          {current && allowed && (
            <button type="button" className="btn btn--sm btn--primary" style={{ padding: '0 14px' }} onClick={goCurrent}>
              {current.action}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </button>
          )}
        </div>
      </div>

      {confirmCancel && (
        <div className="confirm-del no-print">
          <span className="confirm-del__text">¿Anular {o.code}? {sale && o.done === 2 ? 'Se liberará el stock reservado. ' : ''}La acción queda registrada en auditoría.</span>
          <button type="button" className="confirm-del__no" onClick={() => setConfirmCancel(false)}>No</button>
          <button type="button" className="confirm-del__yes" onClick={cancel}>Sí, anular</button>
        </div>
      )}

      {/* ── Flujo (ancho completo) ── */}
      <section className="panel">
        <div className="panel__head">
          <span style={{ fontWeight: 600 }}>Flujo de la orden</span>
          <span className="panel__hint">{steps.map(s => s.title).join(' → ')}</span>
          <span className="panel__hint no-print" style={{ marginLeft: 'auto', color: 'var(--faint)' }}>Haz clic en un paso para ver su detalle</span>
        </div>
        <div className="steps">
          {steps.map((s, i) => {
            const state = i < o.done ? 'done' : i === o.done && !o.cancelled ? 'current' : 'todo';
            return (
              <button key={s.title} type="button" className={`step step--${state}` + (i === vi ? ' is-viewing' : '')} onClick={() => goTo(i)}>
                <span className="step__bar" />
                <span className="step__title-row">
                  <span className="step__dot">{state === 'done' ? '✓' : i + 1}</span>
                  <span className="step__title">{s.title}</span>
                </span>
                <span className="step__doc mono">{state === 'done' ? o.docs[i] : state === 'current' ? 'Siguiente paso' : o.cancelled ? 'Anulada' : 'Pendiente'}</span>
                <span className="step__meta">{state === 'done' ? s.meta(o) : s.pending}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Dos columnas: productos izquierda | paso derecha ── */}
      <div className="order-body">

        {/* Izquierda: Detalle de productos */}
        <section className="panel order-body__products">
          <div className="panel__head">
            <span style={{ fontWeight: 600 }}>Detalle de productos</span>
            <span className="panel__hint" style={{ marginLeft: 'auto' }}>{sale ? 'Despacho desde' : 'Ingresa a'}: {liveWarehouse}</span>
          </div>
          <div className="lines lines--head">
            <span>Producto</span>
            <span className="t-right">Cant.</span>
            <span className="t-right">Stock</span>
            <span className="t-right">{sale ? 'P. unit.' : 'Costo'}</span>
            <span className="t-right">Subtotal</span>
          </div>
          {o.lines.map(l => {
            const st = stockRow(d, l.sku, liveWarehouse);
            const stock = Number(st?.stock ?? 0);
            const short = sale && o.done < 3 && !o.cancelled && stock < l.qty;
            return (
              <div key={l.sku} className="lines">
                <div style={{ minWidth: 0 }}>
                  <div className="ellipsis" style={{ fontWeight: 500 }}>{l.name}</div>
                  <div className="mono" style={{ fontSize: 11, color: 'var(--faint)' }}>{l.sku} · {l.unit}</div>
                </div>
                <span className="mono t-right">{l.qty.toLocaleString('en-US')}</span>
                <span className="mono t-right" style={{ color: short ? 'var(--red)' : 'var(--text-2)' }} title={st ? `Reservado: ${Number(st.res).toLocaleString('en-US')}` : 'Sin registro de stock'}>{stock.toLocaleString('en-US')}</span>
                <span className="mono t-right" style={{ color: 'var(--text-2)' }}>{formatMoney(l.price)}</span>
                <span className="mono t-right">{formatMoney(l.qty * l.price)}</span>
              </div>
            );
          })}
          <div className="totals-wrap">
            <div className="totals">
              <span className="totals__k">Subtotal</span><span className="mono t-right">{formatMoney(subtotal)}</span>
              <span className="totals__k">IGV ({Math.round(o.igvRate * 100)}%)</span><span className="mono t-right">{formatMoney(igv)}</span>
              <span className="totals__grand">Total</span><span className="totals__grand totals__grand--v mono t-right">{formatMoney(total)}</span>
            </div>
          </div>
        </section>

        {/* Derecha: Paso activo */}
        <section className="panel order-body__step">
          <div className="panel__head" style={{ padding: '12px 16px', gap: 10, flexWrap: 'wrap' }}>
            <span className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>PASO {vi + 1} / {n}</span>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{step.title}</span>
            <span className={'chip ' + chip.cls}>{chip.label}</span>
            <span className="mono" style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--blue)' }}>
              {isRead ? o.docs[vi] : isForm ? 'Se generará al confirmar' : ''}
            </span>
          </div>

          {isForm && !allowed && (
            <div className="locked">
              <span>Tu rol no tiene permiso para {sale || o.done !== 1 ? 'avanzar esta orden' : 'aprobar órdenes de compra'}.</span>
            </div>
          )}

          {isForm && allowed && (
            <div className="stepbody">
              <div style={{ color: 'var(--text-2)', textWrap: 'pretty', fontSize: 13 }}>{step.intro}</div>
              <div className="grid2">
                {fields.map(f => {
                  const invalid = showErrors && !!f.required && !String(f.value).trim();
                  const cls = 'field__control' + (invalid ? ' is-invalid' : '');
                  return (
                    <label key={f.k} className={'field' + (f.wide ? ' field--wide' : '')}>
                      <span className="field__label">{f.label}{f.required ? ' *' : ''}</span>
                      {f.type === 'select' && (f.options?.length ?? 0) > 8 ? (
                        // Combobox with search for long lists (conductores, vehiculos, etc.)
                        <>
                          <input
                            className={cls}
                            list={`dl-${f.k}`}
                            value={f.value}
                            placeholder={`Buscar ${f.label.toLowerCase()}…`}
                            onChange={e => setValue(f.k, e.target.value)}
                            aria-invalid={invalid || undefined}
                          />
                          <datalist id={`dl-${f.k}`}>
                            {f.options?.map(opt => <option key={opt} value={opt} />)}
                          </datalist>
                        </>
                      ) : f.type === 'select' ? (
                        <select className={cls} value={f.value} onChange={e => setValue(f.k, e.target.value)}>
                          {!f.options?.includes(f.value) && <option>{f.value}</option>}
                          {f.options?.map(opt => <option key={opt}>{opt}</option>)}
                        </select>
                      ) : (
                        <input className={cls} type={f.type === 'date' ? 'date' : f.type === 'number' ? 'number' : 'text'} step={f.type === 'number' ? 'any' : undefined} value={f.value} placeholder={f.placeholder} onChange={e => setValue(f.k, e.target.value)} aria-invalid={invalid || undefined} />
                      )}
                      {invalid && <span className="field__error">Campo obligatorio</span>}
                    </label>
                  );
                })}
              </div>
              {error && <div className="drawer-error" role="alert">{error}</div>}
              {step.note(o, d) && (
                <div className="step-note">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8v.01" /></svg>
                  <span>{step.note(o, d)}</span>
                </div>
              )}
              <div className="stepbody__foot">
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>Total: {formatMoney(total)}</span>
                <button type="button" className="btn btn--primary" style={{ height: 34, padding: '0 16px', marginLeft: 'auto' }} onClick={submit}>{step.submit}</button>
              </div>
            </div>
          )}

          {isRead && (
            <div className="stepbody" style={{ gap: 14 }}>
              {justDone === vi && (
                <div className="success">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                  <span style={{ flex: 1 }}>{step.doneMsg(o)}</span>
                </div>
              )}
              <div className="grid2">
                {fieldsFor(vi).map(f => (
                  <div key={f.k} className={'readfield' + (f.wide ? ' field--wide' : '')}>
                    <span className="field__label">{f.label}</span>
                    <span className="ellipsis">{f.type === 'date' ? displayDate(f.value) : f.type === 'number' ? formatMoney(Number(f.value)) : f.value || '—'}</span>
                  </div>
                ))}
              </div>
              <div className="stepbody__foot" style={{ gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{step.meta(o)}{o.log[vi] ? ` · ${o.log[vi].who} · ${fmtDayMonth(new Date(o.log[vi].at))}` : ''}</span>
                {docs.filter(x => o.docs[vi] && x.name.includes(o.docs[vi].split(' ').pop()!)).map(x => (
                  <button key={x.id} type="button" className="docpill" onClick={() => openPreview(x)}>
                    <span className="mono" style={{ fontSize: 9.5, fontWeight: 500, color: `var(--${FILE_TONE[extOf(x.name)] ?? 'muted'})` }}>{extOf(x.name)}</span>
                    {x.name}
                  </button>
                ))}
                {vi === o.done - 1 && current && allowed && (
                  <button type="button" className="btn btn--primary no-print" style={{ marginLeft: 'auto', padding: '0 14px' }} onClick={() => goTo(o.done)}>
                    Continuar: {current.title} →
                  </button>
                )}
              </div>
            </div>
          )}

          {isLocked && (
            <div className="locked">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
              {o.cancelled ? (
                <span>La orden fue anulada; este paso ya no se puede completar.</span>
              ) : (
                <>
                  <span>Este paso se habilita cuando completes <b style={{ color: 'var(--text)' }}>{current?.title}</b>.</span>
                  <button type="button" className="btn" onClick={goCurrent}>Ir a {current?.title}</button>
                </>
              )}
            </div>
          )}
        </section>

      </div>{/* /order-body */}

      {/* ── Grid de 3 cards: Cliente / Documentos / Datos+Historial ── */}
      <div className="order-cards">

        {/* Columna 1: Cliente */}
        <div className="card order-cards__stretch">
          <div className="card__row">
            <span className="field__label">{sale ? 'Cliente' : 'Proveedor'}</span>
            <Link to={`${sale ? '/mantenimiento/clientes' : '/mantenimiento/proveedores'}?q=${encodeURIComponent(o.party.name)}`} style={{ fontSize: 12 }}>Ver en Mantenimiento</Link>
          </div>
          <div>
            <div style={{ fontWeight: 600 }}>{o.party.name}</div>
            <div className="mono" style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>{o.party.ruc.length === 8 ? 'DNI' : 'RUC'} {o.party.ruc}</div>
          </div>
          <div className="kv" style={{ gridTemplateColumns: '80px minmax(0,1fr)' }}>
            <span>Contacto</span><span>{o.party.contact || '—'}</span>
            <span>Condición</span><span>{o.party.terms || '—'}</span>
            <span>Dirección</span><span style={{ textWrap: 'pretty' }}>{o.party.address || '—'}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div className="card__row" style={{ fontSize: 12, gap: 8 }}>
              <span style={{ color: 'var(--muted)' }}>{credit.label}</span>
              <span className="mono" style={{ whiteSpace: 'nowrap' }}>{credit.text}</span>
            </div>
            {credit.pct > 0 && <div className="meter"><div style={{ width: credit.pct + '%', background: credit.over ? 'var(--red)' : 'var(--accent)' }} /></div>}
          </div>
        </div>

        {/* Columna 2: Documentos asociados — misma altura que cliente */}
        <div className="card order-cards__stretch">
          <div className="card__row">
            <span className="field__label">Documentos asociados</span>
            <button
              type="button"
              className="btn btn--sm"
              style={{ fontSize: 11, padding: '2px 8px', height: 24 }}
              onClick={() => fileInputRef.current?.click()}
            >
              + Adjuntar
            </button>
            <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }} onChange={e => handleFiles(e.target.files)} />
          </div>

          <div
            className={'doc-dropzone' + (dragOver ? ' doc-dropzone--active' : '')}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" /></svg>
            <span>Arrastra archivos o haz clic para adjuntar</span>
          </div>

          {docs.length === 0 && (
            <span style={{ fontSize: 12, color: 'var(--faint)' }}>Los documentos del sistema se generan al despachar, facturar o recibir.</span>
          )}
          {docs.map(x => {
            const ext = extOf(x.name);
            const canView = !!(x.html || x.blobKey);
            return (
              <div key={x.id} className="doclink">
                <span className={'filetag chip--' + (FILE_TONE[ext] ?? 'muted')}>{ext}</span>
                <span className="ellipsis" style={{ flex: 1, minWidth: 0, fontSize: 12 }}>{x.name}</span>
                {canView && (
                  <button type="button" className="doc-eye" title="Ver documento" onClick={() => openPreview(x)}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Columna 3: Datos de la orden + Historial como tabs */}
        <div className="card order-cards__stretch">
          <div className="card-tabs">
            <button type="button" className={'card-tab' + (activeTab === 'datos' ? ' card-tab--active' : '')} onClick={() => setActiveTab('datos')}>Datos de la orden</button>
            <button type="button" className={'card-tab' + (activeTab === 'historial' ? ' card-tab--active' : '')} onClick={() => setActiveTab('historial')}>Historial</button>
          </div>

          {activeTab === 'datos' && (
            <div className="kv" style={{ gridTemplateColumns: '80px minmax(0,1fr)', padding: '12px 16px' }}>
              <span>{sale ? 'Vendedor' : 'Comprador'}</span><span>{o.seller}</span>
              <span>Entrega</span><span>{o.forms[1]?.ent ? displayDate(o.forms[1].ent) : '—'}</span>
              <span>Moneda</span><span>Soles (PEN)</span>
              <span>Origen</span><span>{o.origin ?? (sale ? 'Venta directa' : 'Compra directa')}</span>
            </div>
          )}

          {activeTab === 'historial' && (
            <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {Object.entries(o.log)
                .map(([i, l]) => ({ i: Number(i), ...l }))
                .sort((a, b) => b.i - a.i)
                .map(h => (
                  <div key={h.i} className="history">
                    <span className="history__dot" style={{ background: h.i === o.done - 1 ? 'var(--accent)' : 'var(--border-strong)' }} />
                    <div style={{ flex: 1 }}><span>{h.who}</span> <span style={{ color: 'var(--muted)' }}>{steps[h.i].histo}</span></div>
                    <span className="mono" style={{ color: 'var(--faint)', whiteSpace: 'nowrap' }}>{fmtDayMonth(new Date(h.at))}</span>
                  </div>
                ))}
              {o.cancelled && (
                <div className="history">
                  <span className="history__dot" style={{ background: 'var(--red)' }} />
                  <div style={{ flex: 1, color: 'var(--red)' }}>Orden anulada</div>
                </div>
              )}
            </div>
          )}
        </div>

      </div>

      {/* ── Modal de vista previa ── */}
      {previewDoc && (
        <div className="doc-modal" onClick={closePreview}>
          <div className="doc-modal__box" onClick={e => e.stopPropagation()}>
            <div className="doc-modal__head">
              <div className="doc-modal__head-name">
                <span className={'filetag chip--' + (FILE_TONE[extOf(previewDoc.name)] ?? 'muted')} style={{ flexShrink: 0 }}>{extOf(previewDoc.name)}</span>
                <span className="ellipsis" style={{ fontWeight: 500, fontSize: 13 }}>{previewDoc.name}</span>
              </div>
              <button type="button" className="doc-modal__close" onClick={closePreview} title="Cerrar">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>
            {previewDoc.html ? (
              <iframe className="doc-modal__frame" srcDoc={previewDoc.html} title={previewDoc.name} />
            ) : previewDoc.url ? (
              previewDoc.name.toLowerCase().endsWith('.pdf') ? (
                <iframe className="doc-modal__frame" src={previewDoc.url} title={previewDoc.name} />
              ) : (
                <div className="doc-modal__img-wrap">
                  <img src={previewDoc.url} alt={previewDoc.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                </div>
              )
            ) : (
              <div className="doc-modal__nopreview">Vista previa no disponible para este tipo de archivo.</div>
            )}
          </div>
        </div>
      )}

      <Toast message={toast.message} />
    </AppShell>
  );
}