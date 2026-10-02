import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AppShell } from '../../components/AppShell';
import { StatusChip } from '../../components/StatusChip';
import { formatMoney } from '../../lib/format';
import type { OrderConfig, OrderField } from './types';
import './OrderPage.css';

const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** 2026-10-03 → 03 oct 2026 */
function formatIsoDate(v: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v.slice(8)} ${MES[+v.slice(5, 7) - 1]} ${v.slice(0, 4)}` : v || '—';
}

const FILE_TONE: Record<string, 'red' | 'amber'> = { PDF: 'red', XML: 'amber' };
const extOf = (name: string) => name.split('.').pop()!.toUpperCase();

/**
 * One sales/purchase order and its 5-step flow. Each step is a form while it's next,
 * read-only once done, and locked until the previous one is completed.
 */
export function OrderPage({ cfg }: { cfg: OrderConfig }) {
  const [params] = useSearchParams();
  const n = cfg.steps.length;
  const initial = () => {
    const p = parseInt(params.get('paso') ?? '', 10);
    return p >= 1 && p <= n ? p : cfg.initialDone;
  };
  const [done, setDone] = useState(initial);
  const [view, setView] = useState<number | null>(null);
  const [forms, setForms] = useState<Record<number, Record<string, string>>>({});
  const [showErrors, setShowErrors] = useState(false);
  const [justDone, setJustDone] = useState<number | null>(null);

  const subtotal = cfg.lines.reduce((a, l) => a + l.qty * l.price, 0);
  const igv = subtotal * 0.18;
  const total = subtotal + igv;
  const stockApplied = done >= cfg.stockAt;
  const [statusLabel, statusTone] = cfg.status[done - 1];
  const credit = cfg.credit(done, total);

  const vi = view ?? Math.min(done, n - 1);
  const step = cfg.steps[vi];
  const isRead = vi < done;
  const isForm = vi === done;
  const isLocked = vi > done;
  const current = done < n ? cfg.steps[done] : null;

  const valueOf = (i: number, f: OrderField) => forms[i]?.[f.k] ?? (f.total ? formatMoney(total) : f.value);
  const setValue = (i: number, k: string, v: string) => setForms(s => ({ ...s, [i]: { ...s[i], [k]: v } }));
  const isMissing = (f: OrderField) => !!f.required && !valueOf(vi, f).trim();

  const goTo = (i: number) => {
    setView(i);
    setShowErrors(false);
  };
  const goCurrent = () => goTo(Math.min(done, n - 1));

  const submit = () => {
    if (step.fields.some(isMissing)) {
      setShowErrors(true);
      return;
    }
    setDone(done + 1);
    setView(vi);
    setShowErrors(false);
    setJustDone(vi);
  };

  const reset = () => {
    setDone(cfg.initialDone);
    setView(null);
    setForms({});
    setShowErrors(false);
    setJustDone(null);
  };

  const chip = isRead
    ? { label: 'Completado', cls: 'chip--green' }
    : isForm
      ? { label: 'Por completar', cls: 'chip--accent' }
      : { label: 'Bloqueado', cls: 'chip--muted' };

  return (
    <AppShell
      active={cfg.active}
      breadcrumb={[{ label: 'Inicio', to: '/' }, { label: cfg.section }, { label: cfg.list.label, to: cfg.list.to }, { label: cfg.code, mono: true }]}
    >
      <div className="order-head">
        <div style={{ minWidth: 0 }}>
          <div className="order-head__title">
            <h1 className="page__title mono">{cfg.code}</h1>
            <StatusChip label={statusLabel} tone={statusTone} />
          </div>
          <div className="page__subtitle">{cfg.kind} · {cfg.party.name} · emitida {cfg.issued}</div>
        </div>
        <div className="order-head__actions">
          <button type="button" className="btn btn--sm">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9V3h12v6M6 18H4v-7h16v7h-2M8 14h8v7H8z" /></svg>
            Imprimir
          </button>
          {done < cfg.stockAt && <button type="button" className="btn btn--sm btn--danger-text">Anular</button>}
          {current && (
            <button type="button" className="btn btn--sm btn--primary" style={{ padding: '0 14px' }} onClick={goCurrent}>
              {current.action}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </button>
          )}
          {done >= n && <button type="button" className="btn btn--sm" onClick={reset}>Reiniciar demo</button>}
        </div>
      </div>

      {/* Flow bar */}
      <section className="panel">
        <div className="panel__head">
          <span style={{ fontWeight: 600 }}>Flujo de la orden</span>
          <span className="panel__hint">{cfg.flowHint}</span>
          <span className="panel__hint" style={{ marginLeft: 'auto', color: 'var(--faint)' }}>Haz clic en un paso para ver su detalle</span>
        </div>
        <div className="steps">
          {cfg.steps.map((s, i) => {
            const state = i < done ? 'done' : i === done ? 'current' : 'todo';
            return (
              <button key={s.title} type="button" className={`step step--${state}` + (i === vi ? ' is-viewing' : '')} onClick={() => goTo(i)}>
                <span className="step__bar" />
                <span className="step__title-row">
                  <span className="step__dot">{state === 'done' ? '✓' : i + 1}</span>
                  <span className="step__title">{s.title}</span>
                </span>
                <span className="step__doc mono">{state === 'done' ? s.doc : state === 'current' ? 'Siguiente paso' : 'Pendiente'}</span>
                <span className="step__meta">{state === 'done' ? s.meta : s.pending}</span>
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
          <span className="mono" style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--blue)' }}>
            {isRead ? step.doc : isForm ? 'Se generará al confirmar' : ''}
          </span>
        </div>

        {isForm && (
          <div className="stepbody">
            <div style={{ color: 'var(--text-2)', textWrap: 'pretty' }}>{step.intro}</div>
            <div className="grid3">
              {step.fields.map(f => {
                const invalid = showErrors && isMissing(f);
                const cls = 'field__control' + (invalid ? ' is-invalid' : '');
                const v = valueOf(vi, f);
                return (
                  <label key={f.k} className={'field' + (f.wide ? ' field--wide' : '')}>
                    <span className="field__label">{f.label}{f.required ? ' *' : ''}</span>
                    {f.type === 'select' ? (
                      <select className={cls} value={v} onChange={e => setValue(vi, f.k, e.target.value)}>
                        {f.options?.map(o => <option key={o}>{o}</option>)}
                      </select>
                    ) : (
                      <input className={cls} type={f.type === 'date' ? 'date' : 'text'} value={v} placeholder={f.placeholder} onChange={e => setValue(vi, f.k, e.target.value)} aria-invalid={invalid || undefined} />
                    )}
                    {invalid && <span className="field__error">Campo obligatorio</span>}
                  </label>
                );
              })}
            </div>
            <div className="stepbody__foot">
              <div className="stepbody__note">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8v.01" /></svg>
                {step.note || 'Total: ' + formatMoney(total)}
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
                <span style={{ flex: 1 }}>{step.doneMsg}</span>
              </div>
            )}
            <div className="grid3">
              {step.fields.map(f => {
                const v = valueOf(vi, f);
                const shown = f.type === 'date' ? formatIsoDate(v) : v || (f.required ? (f.placeholder ?? '').replace('Ej. ', '') : '—');
                return (
                  <div key={f.k} className={'readfield' + (f.wide ? ' field--wide' : '')}>
                    <span className="field__label">{f.label}</span>
                    <span className="ellipsis">{shown}</span>
                  </div>
                );
              })}
            </div>
            <div className="stepbody__foot" style={{ gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>{step.meta} · {step.who}</span>
              {cfg.docs.filter(d => d.at === vi).map(d => (
                <Link key={d.name} to="/documentos" className="docpill">
                  <span className="mono" style={{ fontSize: 9.5, fontWeight: 500, color: `var(--${FILE_TONE[extOf(d.name)]})` }}>{extOf(d.name)}</span>
                  {d.name}
                </Link>
              ))}
              {vi === done - 1 && current && (
                <button type="button" className="btn btn--primary" style={{ marginLeft: 'auto', padding: '0 14px' }} onClick={() => goTo(done)}>
                  Continuar: {current.title} →
                </button>
              )}
            </div>
          </div>
        )}

        {isLocked && current && (
          <div className="locked">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
            <span>Este paso se habilita cuando completes <b style={{ color: 'var(--text)' }}>{current.title}</b>.</span>
            <button type="button" className="btn" onClick={goCurrent}>Ir a {current.title}</button>
          </div>
        )}
      </section>

      <section className="order-grid">
        <div className="order-grid__main">
          {/* Lines */}
          <div className="panel">
            <div className="panel__head">
              <span style={{ fontWeight: 600 }}>Detalle de productos</span>
              <span className="panel__hint" style={{ marginLeft: 'auto' }}>{cfg.whLabel}: {cfg.warehouse}</span>
            </div>
            <div className="lines lines--head">
              <span>Producto</span><span className="t-right">Cant.</span><span className="t-right">{cfg.stockHead}</span><span className="t-right">P. unit.</span><span className="t-right">Subtotal</span>
            </div>
            {cfg.lines.map(l => {
              const stockNow = stockApplied ? l.stock + cfg.sign * l.qty : l.stock;
              const stockColor = stockApplied ? (cfg.sign < 0 ? 'var(--amber)' : 'var(--green)') : 'var(--text-2)';
              return (
                <div key={l.sku} className="lines">
                  <div style={{ minWidth: 0 }}>
                    <div className="ellipsis" style={{ fontWeight: 500 }}>{l.name}</div>
                    <div className="mono" style={{ fontSize: 11, color: 'var(--faint)' }}>{l.sku} · {l.unit}</div>
                  </div>
                  <span className="mono t-right">{l.qty.toLocaleString('en-US')}</span>
                  <span className="mono t-right" style={{ color: stockColor }}>{stockNow.toLocaleString('en-US')}</span>
                  <span className="mono t-right" style={{ color: 'var(--text-2)' }}>{formatMoney(l.price)}</span>
                  <span className="mono t-right">{formatMoney(l.qty * l.price)}</span>
                </div>
              );
            })}
            <div className="totals-wrap">
              <div className="totals">
                <span className="totals__k">Subtotal</span><span className="mono t-right">{formatMoney(subtotal)}</span>
                <span className="totals__k">IGV (18%)</span><span className="mono t-right">{formatMoney(igv)}</span>
                <span className="totals__grand">Total</span><span className="totals__grand totals__grand--v mono t-right">{formatMoney(total)}</span>
              </div>
            </div>
          </div>

          {/* Effects */}
          <div className="panel">
            <div className="panel__head">
              <span style={{ fontWeight: 600 }}>Impacto en otros módulos</span>
              <span className="panel__hint">Lo que genera cada paso del flujo</span>
            </div>
            {cfg.effects(total).map(e => {
              const on = done > e.at;
              return (
                <div key={e.text} className="effect" style={{ opacity: on ? 1 : 0.6 }}>
                  <span className="effect__module">{e.module}</span>
                  <div style={{ minWidth: 0 }}>
                    <div>{e.text}</div>
                    <div className="mono" style={{ fontSize: 11, color: 'var(--faint)' }}>{e.ref}</div>
                  </div>
                  <span className={'chip effect__chip ' + (on ? 'chip--green' : 'chip--muted-plain')}>{on ? 'Generado' : 'Al ' + cfg.steps[e.at].verb}</span>
                </div>
              );
            })}
          </div>
        </div>

        <aside className="order-grid__side">
          <div className="card">
            <div className="card__row">
              <span className="field__label">{cfg.partyLabel}</span>
              <Link to={cfg.partyTo} style={{ fontSize: 12 }}>Ver en Mantenimiento</Link>
            </div>
            <div>
              <div style={{ fontWeight: 600 }}>{cfg.party.name}</div>
              <div className="mono" style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>RUC {cfg.party.ruc}</div>
            </div>
            <div className="kv" style={{ gridTemplateColumns: '92px minmax(0, 1fr)' }}>
              <span>Contacto</span><span>{cfg.party.contact}</span>
              <span>Condición</span><span>{cfg.party.terms}</span>
              <span>Dirección</span><span style={{ textWrap: 'pretty' }}>{cfg.party.address}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div className="card__row" style={{ fontSize: 12 }}>
                <span style={{ color: 'var(--muted)' }}>{cfg.creditLabel}</span>
                <span className="mono" style={{ whiteSpace: 'nowrap' }}>{credit.text}</span>
              </div>
              <div className="meter"><div style={{ width: credit.pct, background: credit.color }} /></div>
            </div>
          </div>

          <div className="card" style={{ gap: 10 }}>
            <span className="field__label">Datos de la orden</span>
            <div className="kv" style={{ gridTemplateColumns: '110px minmax(0, 1fr)' }}>
              {cfg.facts.map(f => [<span key={f.k + 'k'}>{f.k}</span>, <span key={f.k + 'v'}>{f.v}</span>])}
            </div>
          </div>

          <div className="card" style={{ gap: 10 }}>
            <span className="field__label">Documentos asociados</span>
            {cfg.docs.filter(d => done > d.at).map(d => {
              const ext = extOf(d.name);
              return (
                <Link key={d.name} to="/documentos" className="doclink">
                  <span className={'filetag chip--' + FILE_TONE[ext]}>{ext}</span>
                  <span className="ellipsis" style={{ flex: 1, minWidth: 0, fontSize: 12 }}>{d.name}</span>
                </Link>
              );
            })}
          </div>

          <div className="card" style={{ gap: 10 }}>
            <span className="field__label">Historial</span>
            {cfg.steps.slice(0, done).map((s, i) => (
              <div key={s.title} className="history">
                <span className="history__dot" style={{ background: i === done - 1 ? 'var(--accent)' : 'var(--border-strong)' }} />
                <div style={{ flex: 1 }}><span>{s.who}</span> <span style={{ color: 'var(--muted)' }}>{s.histo}</span></div>
                <span className="mono" style={{ color: 'var(--faint)', whiteSpace: 'nowrap' }}>{s.when}</span>
              </div>
            )).reverse()}
          </div>
        </aside>
      </section>
    </AppShell>
  );
}
