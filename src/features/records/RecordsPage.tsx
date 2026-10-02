import { useMemo, useState } from 'react';
import { AppShell } from '../../components/AppShell';
import { KpiCard, KpiRow } from '../../components/KpiCard';
import { StatusChip, toneColor } from '../../components/StatusChip';
import { Toast, useToast } from '../../components/Toast';
import { formatValue } from '../../lib/format';
import { RecordDrawer, type DrawerMode } from './RecordDrawer';
import type { Action, Column, RecordsConfig, Row, Value } from './types';

function toRows(cfg: RecordsConfig): Row[] {
  return cfg.rows.map((r, i) => ({ _id: i + 1, ...Object.fromEntries(cfg.keys.map((k, j) => [k, r[j]])) }) as Row);
}

function Cell({ col, row, first }: { col: Column; row: Row; first: boolean }) {
  const raw = row[col.k];
  const mono = col.mono || !!col.fmt;
  let color = col.muted ? 'var(--muted)' : undefined;
  if (col.fmt === 'signed' || col.fmt === 'sint') color = Number(raw) < 0 ? 'var(--red)' : 'var(--green)';
  return (
    <div className="cell" style={{ textAlign: col.align ?? 'left' }}>
      <div className={'cell__main' + (mono ? ' mono-cell' : '')} style={{ color, fontWeight: first || col.bold ? 500 : 400 }}>
        {formatValue(raw, col.fmt)}
      </div>
      {col.sub && <div className="cell__sub">{String(row[col.sub] ?? '')}</div>}
    </div>
  );
}

/**
 * Generic list screen: KPI row, status filter chips + search, a grid table and a side drawer.
 * Driven entirely by a RecordsConfig — maintenance catalogs (CRUD) and operational lists (read-only + actions).
 */
export function RecordsPage({ cfg }: { cfg: RecordsConfig }) {
  const [rows, setRows] = useState<Row[]>(() => toRows(cfg));
  const [seq, setSeq] = useState(cfg.rows.length);
  const [filter, setFilter] = useState('Todos');
  const [query, setQuery] = useState('');
  const [drawer, setDrawer] = useState<{ mode: DrawerMode; id: number | null } | null>(null);
  const toast = useToast();
  const sk = cfg.statusKey;

  const q = query.trim().toLowerCase();
  const searched = useMemo(() => (q ? rows.filter(r => Object.values(r).join(' ').toLowerCase().includes(q)) : rows), [rows, q]);
  const visible = filter === 'Todos' ? searched : searched.filter(r => r[sk] === filter);
  const current = drawer?.id != null ? rows.find(r => r._id === drawer.id) ?? null : null;
  const kpis = typeof cfg.kpis === 'function' ? cfg.kpis(rows) : cfg.kpis ?? [];
  const cols = cfg.columns.map(c => c.w).join(' ');

  const close = () => setDrawer(null);

  const save = (values: Record<string, Value>) => {
    const rec = cfg.onSave ? cfg.onSave(values) : values;
    if (drawer?.mode === 'new') {
      const n = seq + 1;
      setSeq(n);
      setRows(list => [{ ...(cfg.defaults?.(n) ?? {}), ...rec, _id: 1000 + n } as Row, ...list]);
      setFilter('Todos'); // make sure the new record is visible
      toast.flash(cfg.msgNew ?? 'Registro creado');
    } else if (current) {
      setRows(list => list.map(r => (r._id === current._id ? ({ ...r, ...rec } as Row) : r)));
      toast.flash('Cambios guardados');
    }
    close();
  };

  const remove = () => {
    if (current) setRows(list => list.filter(r => r._id !== current._id));
    close();
    toast.flash(cfg.msgDel ?? 'Registro eliminado');
  };

  const runAction = (a: Action) => {
    if (a.to && current) setRows(list => list.map(r => (r._id === current._id ? ({ ...r, [sk]: a.to!, ...a.set } as Row) : r)));
    toast.flash(a.toast ?? 'Estado actualizado');
  };

  return (
    <AppShell
      active={cfg.active}
      breadcrumb={cfg.breadcrumb}
      actions={
        cfg.newLabel && (
          <button type="button" className="btn btn--primary" onClick={() => setDrawer({ mode: 'new', id: null })}>
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

      {kpis.length > 0 && (
        <KpiRow>
          {kpis.map(k => <KpiCard key={k.label} {...k} />)}
        </KpiRow>
      )}

      <div className="toolbar">
        {['Todos', ...Object.keys(cfg.statuses)].map(f => {
          const count = f === 'Todos' ? searched.length : searched.filter(r => r[sk] === f).length;
          return (
            <button key={f} type="button" className={'filter-chip' + (filter === f ? ' is-on' : '')} aria-pressed={filter === f} onClick={() => setFilter(f)}>
              <span className="filter-chip__dot" style={{ background: f === 'Todos' ? 'var(--faint)' : toneColor(cfg.statuses[f]) }} />
              {f}
              <span className="filter-chip__count">{count}</span>
            </button>
          );
        })}
        <label className="search toolbar__search">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar…" aria-label={'Buscar en ' + cfg.title} />
        </label>
      </div>

      <section className="table" aria-label={cfg.title}>
        <div className="table__row table__head" role="row" style={{ gridTemplateColumns: cols }}>
          {cfg.columns.map(c => <span key={c.k} style={{ textAlign: c.align ?? 'left' }}>{c.label}</span>)}
        </div>

        {visible.map(r => (
          <div
            key={r._id}
            role="row"
            tabIndex={0}
            className={'table__row table__body-row' + (current?._id === r._id ? ' is-selected' : '')}
            style={{ gridTemplateColumns: cols }}
            onClick={() => setDrawer({ mode: cfg.crud ? 'edit' : 'view', id: r._id })}
            onKeyDown={e => {
              if (e.key === 'Enter') setDrawer({ mode: cfg.crud ? 'edit' : 'view', id: r._id });
            }}
          >
            {cfg.columns.map((c, i) =>
              c.chip ? (
                <div key={c.k} className="cell"><StatusChip label={String(r[c.k])} tone={cfg.statuses[String(r[c.k])] ?? 'muted'} /></div>
              ) : (
                <Cell key={c.k} col={c} row={r} first={i === 0} />
              ),
            )}
          </div>
        ))}

        {visible.length === 0 && <div className="table__empty">No hay registros que coincidan.</div>}

        <div className="table__foot">
          <span>{visible.length} registros</span>
          <span>{cfg.crud ? 'Haz clic en una fila para editar' : 'Haz clic en una fila para ver el detalle'}</span>
        </div>
      </section>

      {drawer && (drawer.mode === 'new' || current) && (
        <RecordDrawer
          key={drawer.mode + (drawer.id ?? 'new')}
          cfg={cfg}
          mode={drawer.mode}
          row={current}
          onClose={close}
          onSave={save}
          onDelete={remove}
          onAction={runAction}
        />
      )}

      <Toast message={toast.message} />
    </AppShell>
  );
}
