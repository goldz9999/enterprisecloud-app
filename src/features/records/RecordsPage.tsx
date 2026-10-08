import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AppShell } from '../../components/AppShell';
import '../../components/KpiCard.css';
import { StatusChip, toneColor } from '../../components/StatusChip';
import { Toast, useToast } from '../../components/Toast';
import { audit, diff } from '../../data/domain/audit';
import { can } from '../../data/permissions';
import { createRemote, deactivateRemote, isRemote, loadRemote, updateRemote, type RemoteCollection } from '../../data/domain/remote';
import { getDB, mutate, nextCode, nextId, useDB } from '../../data/store';
import type { DB } from '../../data/types';
import { downloadCsv } from '../../lib/csv';
import { formatValue } from '../../lib/format';
import { RecordDrawer, type DrawerMode } from './RecordDrawer';
import type { Action, Column, RecordsConfig, Row, Value } from './types';

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

/** Side panel shown instead of the KPI cards + drawer when cfg.sidePanel = true */
function SidePanel({ cfg, row, kpis }: { cfg: RecordsConfig; row: Row | null; kpis: { label: string; value: string; note: string; tone?: string }[] }) {
  const tone = (t?: string) => t && t !== 'muted' ? `var(--${t})` : 'var(--text)';
  return (
    <aside className="records-side">
      {/* KPIs compactos */}
      <div className="records-side__kpis">
        {kpis.map(k => (
          <div key={k.label} className="records-side__kpi">
            <div className="records-side__kpi-label">{k.label}</div>
            <div className="records-side__kpi-value" style={{ color: tone(k.tone) }}>{k.value}</div>
            {k.note && <div className="records-side__kpi-note">{k.note}</div>}
          </div>
        ))}
      </div>

      {/* Detalle del registro seleccionado */}
      <div className="records-side__detail">
        {!row ? (
          <div className="records-side__empty">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 12h6M9 16h6M5 8h14M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6z" /></svg>
            <span>Selecciona una fila para ver el detalle</span>
          </div>
        ) : (
          <>
            <div className="records-side__detail-head">
              <div className="records-side__detail-title">{String(row[cfg.titleKey] ?? '')}</div>
              {cfg.subKey && <div className="records-side__detail-sub mono">{String(row[cfg.subKey] ?? '')}</div>}
              {cfg.statusKey && <StatusChip label={String(row[cfg.statusKey])} tone={cfg.statuses[String(row[cfg.statusKey])] ?? 'muted'} />}
            </div>
            <div className="records-side__fields">
              {cfg.fields.map(f => {
                const val = row[f.k];
                if (val == null || val === '') return null;
                return (
                  <div key={f.k} className="records-side__field">
                    <span className="records-side__field-label">{f.label}</span>
                    <span className={'records-side__field-value' + (f.mono ? ' mono' : '')}>{formatValue(val, f.fmt)}</span>
                  </div>
                );
              })}
            </div>
            {cfg.note && <div className="records-side__note">{cfg.note}</div>}
          </>
        )}
      </div>
    </aside>
  );
}

function rawRows(cfg: RecordsConfig, d: DB): Row[] {
  return cfg.collection ? d.records[cfg.collection] : cfg.source?.(d) ?? [];
}

const moduleOf = (cfg: RecordsConfig) => cfg.breadcrumb[1]?.label ?? cfg.title;

export function RecordsPage({ cfg }: { cfg: RecordsConfig }) {
  const d = useDB();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [filter, setFilter] = useState('Todos');
  const [query, setQuery] = useState(params.get('q') ?? '');
  useEffect(() => setQuery(params.get('q') ?? ''), [params]);
  const [drawer, setDrawer] = useState<{ mode: DrawerMode; id: number | null } | null>(null);
  const [error, setError] = useState('');
  const toast = useToast();
  // Mantenimiento y Administración (usuarios y roles) viven en el backend (Supabase); el resto de pantallas siguen locales.
  const remote = isRemote(cfg.collection);
  const busy = useRef(false);
  useEffect(() => {
    if (remote) void loadRemote(cfg.collection as RemoteCollection);
  }, [remote, cfg.collection]);
  const sk = cfg.statusKey;
  const mod = cfg.active;
  const canCreate = can(d, mod, 'Crear') && !!cfg.collection;
  const canEdit = can(d, mod, 'Editar');
  const canRemove = can(d, mod, 'Eliminar');

  const rows = useMemo(() => rawRows(cfg, d).map(r => (cfg.view ? cfg.view(r, d) : r)), [cfg, d]);
  const q = query.trim().toLowerCase();
  const searched = useMemo(() => (q ? rows.filter(r => Object.values(r).join(' ').toLowerCase().includes(q)) : rows), [rows, q]);
  const visible = filter === 'Todos' ? searched : searched.filter(r => r[sk] === filter);
  const current = drawer?.id != null ? rows.find(r => r._id === drawer.id) ?? null : null;
  const kpis = typeof cfg.kpis === 'function' ? cfg.kpis(rows, d) : cfg.kpis ?? [];
  const cols = cfg.columns.map(c => c.w).join(' ');
  const editable = !!cfg.crud && canEdit;
  const actions = current && cfg.actions ? (cfg.actions[String(current[sk])] ?? cfg.actions['*'] ?? []).filter(a => a.href || can(d, mod, a.perm ?? 'Editar')) : [];

  // Side panel mode: clicking a row selects it (shows detail) instead of opening a drawer
  const sidePanel = !!(cfg as any).sidePanel;
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selectedRow = selectedId != null ? rows.find(r => r._id === selectedId) ?? null : null;

  const open = (mode: DrawerMode, id: number | null) => {
    if (sidePanel && mode !== 'new') { setSelectedId(id); return; }
    setError('');
    setDrawer({ mode, id });
  };
  const close = () => setDrawer(null);
  const labels = Object.fromEntries(cfg.fields.map(f => [f.k, f.label]));

  /** Guarda un registro en el backend y refleja el resultado en el store local. */
  const saveRemote = async (rec: Record<string, Value>, isNew: boolean) => {
    if (busy.current) return;
    const coll = cfg.collection as RemoteCollection;

    // Validaciones locales (duplicados, etc.) sobre una copia, antes de llamar al servidor.
    const probe = structuredClone(getDB());
    if (isNew) {
      const row = { ...(cfg.defaults?.(probe) ?? {}), ...rec, _id: 0 } as Row;
      const e = cfg.onCreate?.(probe, row);
      if (e) return setError(e);
    } else {
      const before = probe.records[coll as 'clientes'].find(r => r._id === drawer?.id);
      if (!before) return setError('El registro ya no existe.');
      const e = cfg.onUpdate?.(probe, before, { ...before, ...rec } as Row);
      if (e) return setError(e);
    }

    // La auditoría de estos registros la escribe el backend; aquí solo van los efectos locales (p. ej. stock inicial).
    const effects = (draft: DB, saved: Row) => {
      if (isNew) cfg.onCreate?.(draft, saved);
      else {
        const before = draft.records[coll as 'clientes'].find(r => r._id === saved._id);
        if (before) cfg.onUpdate?.(draft, before, { ...before, ...rec } as Row);
      }
    };

    busy.current = true;
    setError('');
    const res = isNew ? await createRemote(coll, rec, effects) : await updateRemote(coll, drawer!.id!, rec, effects);
    busy.current = false;
    if (!res.ok) return setError(res.error);
    if (isNew) setFilter('Todos');
    toast.flash(res.warning ?? (isNew ? cfg.msgNew ?? 'Registro creado' : 'Cambios guardados'));
    close();
  };

  /** Baja lógica en el backend: el registro queda Inactivo y conserva su historial. */
  const removeRemote = async () => {
    if (busy.current || !current || drawer?.id == null) return;
    busy.current = true;
    setError('');
    const res = await deactivateRemote(cfg.collection as RemoteCollection, drawer.id);
    busy.current = false;
    if (!res.ok) return setError(res.error);
    close();
    toast.flash(`${cfg.entity} dado de baja (Inactivo)`);
  };

  const save = (values: Record<string, Value>) => {
    const rec = cfg.onSave ? cfg.onSave(values) : values;
    const isNew = drawer?.mode === 'new';
    if (remote) return void saveRemote(rec, isNew);
    // Inventario: creación asíncrona vía API
    if (isNew && cfg.asyncCreate) {
      void (async () => {
        const probe = { ...(cfg.defaults?.(getDB()) ?? {}), ...rec, _id: 0 } as Row;
        const e = await cfg.asyncCreate!(getDB(), probe);
        if (e) { setError(e); return; }
        setDrawer(null);
        setError('');
        toast.flash(cfg.msgNew || 'Guardado');
      })();
      return;
    }
    const err = mutate(draft => {
      const list = draft.records[cfg.collection!];
      if (isNew) {
        const row = { ...(cfg.defaults?.(draft) ?? {}), ...rec, _id: nextId(list) } as Row;
        if (cfg.code) row[cfg.code.key] = nextCode(draft, typeof cfg.code.prefix === 'function' ? cfg.code.prefix() : cfg.code.prefix, cfg.code.width);
        const e = cfg.onCreate?.(draft, row);
        if (e) return e;
        list.unshift(row);
        audit(draft, { action: 'Crear', module: moduleOf(cfg), ref: String(row[cfg.code?.key ?? cfg.titleKey] ?? ''), desc: `${cfg.entity} creado · ${row[cfg.titleKey] ?? ''}`, changes: diff({}, rec, labels) });
      } else {
        const i = list.findIndex(r => r._id === drawer?.id);
        if (i < 0) return 'El registro ya no existe.';
        const before = list[i];
        const after = { ...before, ...rec } as Row;
        const e = cfg.onUpdate?.(draft, before, after);
        if (e) return e;
        list[i] = after;
        const changes = diff(before, after, labels);
        if (changes.length) audit(draft, { action: 'Editar', module: moduleOf(cfg), ref: String(after[cfg.code?.key ?? cfg.titleKey] ?? ''), desc: `${cfg.entity} actualizado`, changes });
      }
    });
    if (err) return setError(err);
    if (isNew) setFilter('Todos');
    toast.flash(isNew ? cfg.msgNew ?? 'Registro creado' : 'Cambios guardados');
    close();
  };

  const remove = () => {
    if (remote) return void removeRemote();
    const err = mutate(draft => {
      const list = draft.records[cfg.collection!];
      const row = list.find(r => r._id === drawer?.id);
      if (!row) return;
      const reason = cfg.canDelete?.(row, draft);
      if (reason) return reason;
      draft.records[cfg.collection!] = list.filter(r => r !== row);
      audit(draft, { action: 'Eliminar', module: moduleOf(cfg), ref: String(row[cfg.code?.key ?? cfg.titleKey] ?? ''), desc: `${cfg.entity} eliminado · ${row[cfg.titleKey] ?? ''}` });
    });
    if (err) return setError(err);
    close();
    toast.flash(cfg.msgDel ?? 'Registro eliminado');
  };

  const runAction = (a: Action, values: Record<string, string>) => {
    const err = mutate(draft => {
      const row = cfg.collection ? draft.records[cfg.collection].find(r => r._id === current?._id) : cfg.source?.(draft).find(r => r._id === current?._id);
      if (!row) return 'El registro ya no existe.';
      const before = String(row[sk]);
      const e = a.run?.(draft, row, values);
      if (e) return e;
      if (a.to) Object.assign(row, { [sk]: a.to }, a.set);
      if (a.to && cfg.collection) audit(draft, { action: 'Editar', module: moduleOf(cfg), ref: String(row[cfg.code?.key ?? cfg.titleKey] ?? ''), desc: a.label.replace(' →', ''), changes: [[labels[sk] ?? 'Estado', before, a.to]] });
    });
    if (err) return setError(err);
    setError('');
    toast.flash(a.toast ?? 'Estado actualizado');
  };

  const exportCsv = () => {
    const fields = cfg.fields.length ? cfg.fields : cfg.columns.map(c => ({ k: c.k, label: c.label }));
    const keys = [...new Set([...cfg.columns.map(c => c.k), ...fields.map(c => c.k)])];
    const label = (k: string) => cfg.columns.find(c => c.k === k)?.label ?? fields.find(c => c.k === k)?.label ?? k;
    downloadCsv(`${cfg.title.toLowerCase().replace(/\s+/g, '-')}.csv`, keys.map(label), visible.map(r => keys.map(k => r[k] ?? '')));
    mutate(draft => audit(draft, { action: 'Exportar', module: moduleOf(cfg), ref: cfg.title, desc: `Exportación a CSV · ${visible.length} filas` }));
  };

  const tableSection = (
    <section className="table" aria-label={cfg.title}>
      <div className="table__row table__head" role="row" style={{ gridTemplateColumns: cols }}>
        {cfg.columns.map(c => <span key={c.k} style={{ textAlign: c.align ?? 'left' }}>{c.label}</span>)}
      </div>

      {visible.map(r => (
        <div
          key={r._id}
          role="row"
          tabIndex={0}
          className={'table__row table__body-row' + ((sidePanel ? selectedId === r._id : current?._id === r._id) ? ' is-selected' : '')}
          style={{ gridTemplateColumns: cols }}
          onClick={() => open(editable ? 'edit' : 'view', r._id)}
          onKeyDown={e => { if (e.key === 'Enter') open(editable ? 'edit' : 'view', r._id); }}
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

      {visible.length === 0 && (
        <div className="table__empty">
          {rows.length === 0 ? (
            <>
              Aún no hay registros.
              {cfg.newLabel && canCreate && (
                <> <a style={{ cursor: 'pointer' }} onClick={() => (cfg.newTo ? navigate(cfg.newTo) : open('new', null))}>{cfg.newLabel}</a></>
              )}
            </>
          ) : (
            'No hay registros que coincidan.'
          )}
        </div>
      )}

      <div className="table__foot">
        <span>{visible.length} registros</span>
        <span>{editable ? 'Haz clic en una fila para editar' : 'Haz clic en una fila para ver el detalle'}</span>
      </div>
    </section>
  );

  return (
    <AppShell
      active={cfg.active}
      breadcrumb={cfg.breadcrumb}
      actions={
        cfg.newLabel && (canCreate || cfg.newTo) && can(d, mod, 'Crear') ? (
          <button type="button" className="btn btn--primary" onClick={() => (cfg.newTo ? navigate(cfg.newTo) : open('new', null))}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            {cfg.newLabel}
          </button>
        ) : undefined
      }
    >
      <div>
        <h1 className="page__title">{cfg.title}</h1>
        <div className="page__subtitle">{cfg.subtitle}</div>
      </div>

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
        <button type="button" className="icon-btn" title="Exportar a CSV" aria-label="Exportar a CSV" onClick={exportCsv} style={{ width: 30, height: 30 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12M7 10l5 5 5-5M4 21h16" /></svg>
        </button>
      </div>

      {sidePanel ? (
        <div className="records-layout">
          <div className="records-layout__table">{tableSection}</div>
          <SidePanel cfg={cfg} row={selectedRow} kpis={kpis as any} />
        </div>
      ) : (
        <>
          {kpis.length > 0 && (
            <div className="kpi-row">
              {kpis.map((k: any) => (
                <div key={k.label} className="kpi">
                  <div className="kpi__label">{k.label}</div>
                  <div className="kpi__value" style={{ color: k.tone && k.tone !== 'muted' ? `var(--${k.tone})` : 'var(--text)' }}>{k.value}</div>
                  {k.note && <div className="kpi__note">{k.note}</div>}
                </div>
              ))}
            </div>
          )}
          {tableSection}
        </>
      )}

      {!sidePanel && drawer && (drawer.mode === 'new' || current) && (
        <RecordDrawer
          key={drawer.mode + (drawer.id ?? 'new')}
          cfg={cfg}
          mode={drawer.mode}
          row={current}
          error={error}
          canDelete={canRemove && !!cfg.collection}
          actions={actions}
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