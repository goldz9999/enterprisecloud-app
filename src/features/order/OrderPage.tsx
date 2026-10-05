import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { AppShell } from '../../components/AppShell';
import { StatusChip } from '../../components/StatusChip';
import { Toast, useToast } from '../../components/Toast';
import { canCancel, cancelOrder, completeStep, orderEffects, orderStatus, orderSubtotal, partyCredit, STEPS, type StepField } from '../../data/domain/orders';
import { stockRow } from '../../data/domain/stock';
import { can } from '../../data/permissions';
import { mutate, useDB } from '../../data/store';
import { displayDate, fmtDayMonth } from '../../lib/dates';
import { openPrintable } from '../../lib/csv';
import { formatMoney } from '../../lib/format';
import './OrderPage.css';

const FILE_TONE: Record<string, string> = { PDF: 'red', XML: 'amber' };
const extOf = (name: string) => name.split('.').pop()!.toUpperCase();

/**
 * One sales/purchase order and its 5-step flow. Each step is a form while it's next,
 * read-only once done, and locked until the previous one is completed.
 */
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
  const toast = useToast();

  const steps = STEPS[kind];
  const n = steps.length;
  const vi = o ? view ?? Math.min(o.done, n - 1) : 0;
  const step = steps[vi];

  // Form values for the step being viewed: what was typed, else what was saved, else the defaults.
  const fieldsFor = (i: number): StepField[] => {
    if (!o) return [];
    const typed = forms[i] ?? {};
    const saved = o.forms[i] ?? {};
    const base = steps[i].fields(o, d, { ...saved, ...typed });
    // Re-evaluate once with defaults so dependent fields (e.g. account when paying cash) are consistent.
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
  // Approving a purchase order needs the Aprobar permission; other steps need Editar.
  const allowed = can(d, module, sale || o.done !== 1 ? 'Editar' : 'Aprobar');
  const docs = d.documentos.filter(x => x.ref === o.code);

  const setValue = (k: string, v: string) => setForms(s => ({ ...s, [vi]: { ...s[vi], [k]: v } }));
  const goTo = (i: number) => {
    setView(i);
    setShowErrors(false);
    setError('');
  };
  const goCurrent = () => goTo(Math.min(o.done, n - 1));

  const submit = () => {
    if (fields.some(f => f.required && !String(f.value).trim())) return setShowErrors(true);
    const values = Object.fromEntries(fields.map(f => [f.k, String(f.value)]));
    let result: { error?: string; stay?: string } = {};
    const err = mutate(draft => {
      result = completeStep(draft, o.code, values);
      return result.error;
    });
    if (err) return setError(err);
    setError('');
    setShowErrors(false);
    setForms(s => ({ ...s, [vi]: {} }));
    if (result.stay) return toast.flash(result.stay);
    setView(vi);
    setJustDone(vi);
  };

  const cancel = () => {
    mutate(draft => cancelOrder(draft, o.code));
    setConfirmCancel(false);
    toast.flash(`${o.code} anulada`);
  };

  const chip = isRead ? { label: 'Completado', cls: 'chip--green' } : isForm ? { label: 'Por completar', cls: 'chip--accent' } : { label: o.cancelled ? 'Anulada' : 'Bloqueado', cls: 'chip--muted' };

  return (
    <AppShell active={module} breadcrumb={[{ label: 'Inicio', to: '/' }, { label: sale ? 'Ventas' : 'Compras' }, list, { label: o.code, mono: true }]}>
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
          {canCancel(o) && can(d, module, 'Editar') && <button type="button" className="btn btn--sm btn--danger-text" onClick={() => setConfirmCancel(true)}>Anular</button>}
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

      {/* Flow bar */}
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

      {/* Selected step */}
      <section className="panel">
        <div className="panel__head" style={{ padding: '12px 16px', gap: 10, flexWrap: 'wrap' }}>
          <span className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>PASO {vi + 1} / {n}</span>
          <span style={{ fontWeight: 600, fontSize: 14 }}>{step.title}</span>
          <span className={'chip ' + chip.cls}>{chip.label}</span>
          <span className="mono" style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--blue)' }}>{isRead ? o.docs[vi] : isForm ? 'Se generará al confirmar' : ''}</span>
        </div>

        {isForm && !allowed && (
          <div className="locked">
            <span>Tu rol no tiene permiso para {sale || o.done !== 1 ? 'avanzar esta orden' : 'aprobar órdenes de compra'}.</span>
          </div>
        )}

        {isForm && allowed && (
          <div className="stepbody">
            <div style={{ color: 'var(--text-2)', textWrap: 'pretty' }}>{step.intro}</div>
            <div className="grid3">
              {fields.map(f => {
                const invalid = showErrors && !!f.required && !String(f.value).trim();
                const cls = 'field__control' + (invalid ? ' is-invalid' : '');
                return (
                  <label key={f.k} className={'field' + (f.wide ? ' field--wide' : '')}>
                    <span className="field__label">{f.label}{f.required ? ' *' : ''}</span>
                    {f.type === 'select' ? (
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
            <div className="stepbody__foot">
              <div className="stepbody__note">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8v.01" /></svg>
                {step.note(o, d) || 'Total: ' + formatMoney(total)}
              </div>
              <button type="button" className="btn btn--primary" style={{ height: 34, padding: '0 16px' }} onClick={submit}>{step.submit}</button>
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
            <div className="grid3">
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
                <button key={x.id} type="button" className="docpill" onClick={() => x.html && openPrintable(x.html)}>
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

      <section className="order-grid">
        <div className="order-grid__main">
          <div className="panel">
            <div className="panel__head">
              <span style={{ fontWeight: 600 }}>Detalle de productos</span>
              <span className="panel__hint" style={{ marginLeft: 'auto' }}>{sale ? 'Despacho desde' : 'Ingresa a'}: {o.warehouse}</span>
            </div>
            <div className="lines lines--head">
              <span>Producto</span><span className="t-right">Cant.</span><span className="t-right">Stock</span><span className="t-right">{sale ? 'P. unit.' : 'Costo'}</span><span className="t-right">Subtotal</span>
            </div>
            {o.lines.map(l => {
              const st = stockRow(d, l.sku, o.warehouse);
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
          </div>

          <div className="panel">
            <div className="panel__head">
              <span style={{ fontWeight: 600 }}>Impacto en otros módulos</span>
              <span className="panel__hint">Lo que genera cada paso del flujo</span>
            </div>
            {orderEffects(o).map(e => {
              const on = o.done > e.at;
              return (
                <div key={e.text} className="effect" style={{ opacity: on ? 1 : 0.6 }}>
                  <span className="effect__module">{e.module}</span>
                  <div style={{ minWidth: 0 }}>
                    <div>{e.text}</div>
                    <div className="mono" style={{ fontSize: 11, color: 'var(--faint)' }}>{e.ref}</div>
                  </div>
                  <span className={'chip effect__chip ' + (on ? 'chip--green' : 'chip--muted-plain')}>{on ? 'Generado' : o.cancelled ? 'Anulada' : 'Al ' + steps[e.at].verb}</span>
                </div>
              );
            })}
          </div>
        </div>

        <aside className="order-grid__side">
          <div className="card">
            <div className="card__row">
              <span className="field__label">{sale ? 'Cliente' : 'Proveedor'}</span>
              <Link to={`${sale ? '/mantenimiento/clientes' : '/mantenimiento/proveedores'}?q=${encodeURIComponent(o.party.name)}`} style={{ fontSize: 12 }}>Ver en Mantenimiento</Link>
            </div>
            <div>
              <div style={{ fontWeight: 600 }}>{o.party.name}</div>
              <div className="mono" style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>{o.party.ruc.length === 8 ? 'DNI' : 'RUC'} {o.party.ruc}</div>
            </div>
            <div className="kv" style={{ gridTemplateColumns: '92px minmax(0, 1fr)' }}>
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

          <div className="card" style={{ gap: 10 }}>
            <span className="field__label">Datos de la orden</span>
            <div className="kv" style={{ gridTemplateColumns: '110px minmax(0, 1fr)' }}>
              <span>{sale ? 'Vendedor' : 'Comprador'}</span><span>{o.seller}</span>
              <span>{sale ? 'Entrega' : 'Entrega pactada'}</span><span>{o.forms[1]?.ent ? displayDate(o.forms[1].ent) : '—'}</span>
              <span>Moneda</span><span>Soles (PEN)</span>
              <span>Origen</span><span>{o.origin ?? (sale ? 'Venta directa' : 'Compra directa')}</span>
            </div>
          </div>

          <div className="card" style={{ gap: 10 }}>
            <span className="field__label">Documentos asociados</span>
            {docs.length === 0 && <span style={{ fontSize: 12, color: 'var(--faint)' }}>Se generan al despachar, facturar o recibir.</span>}
            {docs.map(x => {
              const ext = extOf(x.name);
              return (
                <button key={x.id} type="button" className="doclink" onClick={() => x.html && openPrintable(x.html)}>
                  <span className={'filetag chip--' + (FILE_TONE[ext] ?? 'muted')}>{ext}</span>
                  <span className="ellipsis" style={{ flex: 1, minWidth: 0, fontSize: 12, textAlign: 'left' }}>{x.name}</span>
                </button>
              );
            })}
          </div>

          <div className="card" style={{ gap: 10 }}>
            <span className="field__label">Historial</span>
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
            {o.cancelled && <div className="history"><span className="history__dot" style={{ background: 'var(--red)' }} /><div style={{ flex: 1, color: 'var(--red)' }}>Orden anulada</div></div>}
          </div>
        </aside>
      </section>
      <Toast message={toast.message} />
    </AppShell>
  );
}
