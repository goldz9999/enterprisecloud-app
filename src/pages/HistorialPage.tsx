import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '../components/AppShell';
import { Pagination } from '../components/Pagination';
import { StatusChip, type Tone } from '../components/StatusChip';
import { auditError, fetchAuditEvents } from '../data/domain/admin';
import type { AuditEvent } from '../data/types';
import { downloadCsv } from '../lib/csv';
import { fmtDayTime } from '../lib/dates';
import { useRealtimeTick } from '../lib/realtime';
import './AuditoriaPage.css';

const RESULT_TONE: Record<AuditEvent['result'], Tone> = { Exitoso: 'green', Fallido: 'red', Denegado: 'amber' };
const ACTION_COLOR: Record<string, string> = { Crear: 'var(--green)', Editar: 'var(--blue)', Eliminar: 'var(--red)', Exportar: 'var(--amber)', Descargar: 'var(--amber)', Ingreso: 'var(--faint)' };
/** Módulos de negocio: lo que el historial centraliza. Accesos y administración quedan en Auditoría. */
const BUSINESS = ['Ventas', 'Compras', 'Inventario', 'Finanzas', 'Documentos'];
const COLS = '112px 128px minmax(0, 1.8fr) minmax(0, 1fr) 96px';
const PAGE_SIZE = 15;

/**
 * Historial general de operaciones: reúne los acontecimientos de los módulos (compras, ventas, inventario, caja, documentos)
 * a partir de los eventos que registra el servidor; no hay datos de relleno. El registro de movimientos de inventario
 * (existencias anteriores/posteriores) está en «Movimientos Kardex».
 */
export function HistorialPage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [mod, setMod] = useState('Todos');
  const [doc, setDoc] = useState('');
  const [page, setPage] = useState(1);
  const tick = useRealtimeTick();

  useEffect(() => {
    let on = true;
    fetchAuditEvents(1000)
      .then(r => on && setEvents(r))
      .catch(e => on && setLoadError(auditError(e)))
      .finally(() => on && setLoading(false));
    return () => { on = false; };
  }, [tick]);

  // Un mismo acontecimiento no se repite: se descartan los eventos idénticos (mismo documento, texto, usuario y segundo).
  const business = useMemo(() => {
    const seen = new Set<string>();
    return events
      .filter(e => BUSINESS.includes(e.module))
      .filter(e => {
        const key = [e.ref, e.desc, e.user, e.action, e.at.slice(0, 19)].join('|');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => b.at.localeCompare(a.at));
  }, [events]);

  const q = doc.trim().toLowerCase();
  const list = business.filter(e => (mod === 'Todos' || e.module === mod) && (!q || (e.ref + e.desc + e.user).toLowerCase().includes(q)));
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const cur = Math.min(page, pages);
  const counts = (m: string) => (m === 'Todos' ? business.length : business.filter(e => e.module === m).length);

  const exportCsv = () =>
    downloadCsv('historial.csv', ['Fecha', 'Módulo', 'Acción', 'Documento', 'Descripción', 'Usuario', 'Resultado'],
      list.map(e => [e.at, e.module, e.action, e.ref, e.desc, e.user, e.result]));

  return (
    <AppShell
      active="Historial"
      breadcrumb={[{ label: 'Inicio', to: '/' }, { label: 'Historial' }]}
      actions={<button type="button" className="btn btn--primary" onClick={exportCsv}>Exportar historial</button>}
    >
      <div className="page-head">
        <div>
          <h1 className="page__title">Historial</h1>
          <div className="page__subtitle">Todo lo que ocurre en compras, ventas, inventario, caja y documentos, en un solo lugar. Filtra por documento (p. ej. OC-2026-0001) para seguir una orden de punta a punta.</div>
        </div>
        <div className="audit-counts"><span><span className="mono" style={{ color: 'var(--text)' }}>{list.length}</span> eventos</span></div>
      </div>

      {loading && <div className="info-banner">Cargando eventos del servidor…</div>}
      {loadError && <div className="drawer-error">{loadError}</div>}

      <section className="filters">
        <div className="filters__group">
          <span className="field__label">Módulo</span>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {['Todos', ...BUSINESS].map(m => (
              <button key={m} type="button" className={'filter-chip filter-chip--tall filter-chip--ghost' + (mod === m ? ' is-on' : '')} onClick={() => { setMod(m); setPage(1); }}>
                {m}<span className="filter-chip__count">{counts(m)}</span>
              </button>
            ))}
          </div>
        </div>
        <label className="filters__group" style={{ flex: 1, minWidth: 200, maxWidth: 320 }}>
          <span className="field__label">Documento, usuario o texto</span>
          <span className="search search--inset">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
            <input value={doc} onChange={e => { setDoc(e.target.value); setPage(1); }} placeholder="Ej. OC-2026-0001" />
          </span>
        </label>
        {(mod !== 'Todos' || q) && <button type="button" className="link-btn" onClick={() => { setMod('Todos'); setDoc(''); setPage(1); }}>Limpiar filtros</button>}
      </section>

      <section className="panel">
        <div role="row" className="audit-row audit-row--head" style={{ gridTemplateColumns: COLS }}>
          <span>Fecha / hora</span><span>Módulo · acción</span><span>Qué ocurrió</span><span>Documento · usuario</span><span>Resultado</span>
        </div>
        {list.slice((cur - 1) * PAGE_SIZE, cur * PAGE_SIZE).map(e => (
          <div key={e.id} role="row" className="audit-row audit-row--body" style={{ gridTemplateColumns: COLS, cursor: 'default' }}>
            <span className="mono" style={{ fontSize: 12, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>{fmtDayTime(new Date(e.at))}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: 'var(--text-2)' }}>{e.module}</div>
              <span className="audit-action"><span style={{ background: ACTION_COLOR[e.action] }} />{e.action}</span>
            </div>
            <div style={{ textWrap: 'pretty' }}>{e.desc}</div>
            <div style={{ minWidth: 0 }}>
              <button type="button" className="mono ellipsis link-btn" style={{ fontSize: 11.5, padding: 0 }} title="Ver todo lo de este documento" onClick={() => { setDoc(e.ref); setPage(1); }}>{e.ref || '—'}</button>
              <div className="cell__sub">{e.user}</div>
            </div>
            <span><StatusChip label={e.result} tone={RESULT_TONE[e.result]} /></span>
          </div>
        ))}
        {!loading && list.length === 0 && <div className="table__empty">No hay eventos con estos filtros.</div>}
        <div className="pager">
          <span>Mostrando <span style={{ color: 'var(--text)' }}>{list.length ? (cur - 1) * PAGE_SIZE + 1 : 0}–{Math.min(cur * PAGE_SIZE, list.length)}</span> de {list.length}</span>
          <Pagination page={cur} pages={pages} onPage={setPage} />
        </div>
      </section>
    </AppShell>
  );
}
