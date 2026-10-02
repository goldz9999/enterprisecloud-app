import { Fragment, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '../../components/AppShell';
import { StatusChip, toneColor } from '../../components/StatusChip';
import { formatMoney } from '../../lib/format';
import type { FlowListConfig, FlowRow } from './types';
import './FlowListPage.css';

const COLS = '104px minmax(0, 1fr) 96px 132px';
const IGV = 1.18;

const totalOf = (r: FlowRow) => r.items.reduce((a, i) => a + i.qty * i.price, 0) * IGV;

/** List + sticky detail panel for documents that start a flow (Cotizaciones, Solicitudes). */
export function FlowListPage({ cfg }: { cfg: FlowListConfig }) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState('Todos');
  const [query, setQuery] = useState('');
  const [selId, setSelId] = useState(cfg.rows[0]?.id);
  // Status changes made on this screen, by document id.
  const [overrides, setOverrides] = useState<Record<string, string>>({});

  const all = cfg.rows.map(r => ({ ...r, status: overrides[r.id] ?? r.status }));
  const q = query.trim().toLowerCase();
  const searched = all.filter(r => !q || (r.id + r.party + r.partySub).toLowerCase().includes(q));
  const list = filter === 'Todos' ? searched : searched.filter(r => r.status === filter);
  const sel = all.find(r => r.id === selId);
  const actions = sel ? cfg.actions[sel.status] ?? [] : [];
  const note = sel ? cfg.notes[sel.status] : undefined;

  return (
    <AppShell
      active={cfg.active}
      breadcrumb={[{ label: 'Inicio', to: '/' }, { label: cfg.section }, { label: cfg.title }]}
      actions={
        <button type="button" className="btn btn--primary">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          {cfg.newLabel}
        </button>
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
              onClick={() => setSelId(r.id)}
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
              <span className="mono t-right" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{formatMoney(totalOf(r))}</span>
              <span><StatusChip label={r.status} tone={cfg.statuses[r.status]} /></span>
            </div>
          ))}
          {list.length === 0 && <div className="table__empty">Sin resultados.</div>}
          <div className="table__foot">{list.length} registros</div>
        </div>

        <aside className="flowdetail">
          {sel && (
            <>
              <div className="flowdetail__head">
                <div className="flowdetail__idrow">
                  <span className="mono" style={{ fontWeight: 600 }}>{sel.id}</span>
                  <StatusChip label={sel.status} tone={cfg.statuses[sel.status]} />
                </div>
                <div style={{ fontWeight: 500 }}>{sel.party}</div>
                <div className="flowdetail__sub">{sel.partySub}</div>
              </div>
              <div className="flowdetail__body">
                <div className="facts">
                  {sel.facts.map(f => (
                    <Fragment key={f.k}><span className="facts__k">{f.k}</span><span>{f.v}</span></Fragment>
                  ))}
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
                    <span className="mono">{formatMoney(totalOf(sel))}</span>
                  </div>
                </div>
                {note && <div className="note">{note}</div>}
                <div className="flowdetail__actions">
                  {actions.map(a => (
                    <button
                      key={a.label}
                      type="button"
                      className={'btn btn--block' + (a.primary ? ' btn--primary' : '') + (a.danger ? ' btn--danger-text' : '')}
                      onClick={() => {
                        if (a.href) navigate(a.href);
                        else if (a.to) setOverrides(o => ({ ...o, [sel.id]: a.to! }));
                      }}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </aside>
      </section>
    </AppShell>
  );
}
