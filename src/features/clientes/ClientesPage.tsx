import { useMemo, useState } from 'react';
import { AppShell } from '../../components/AppShell';
import { StatusChip } from '../../components/StatusChip';
import { Toast, useToast } from '../../components/Toast';
import { formatMoney } from '../../lib/format';
import { ClienteDrawer } from './ClienteDrawer';
import { ESTADO_TONE } from './estado';
import { ESTADOS_CLIENTE, type Cliente, type ClienteInput, type EstadoCliente } from './types';
import { useClientes } from './useClientes';
import './ClientesPage.css';

type Filter = 'Todos' | EstadoCliente;

/** null = closed, 'new' = creating, number = editing that client id. */
type DrawerState = null | 'new' | number;

const FILTERS: Filter[] = ['Todos', ...ESTADOS_CLIENTE];

function matches(c: Cliente, q: string): boolean {
  return Object.values(c).join(' ').toLowerCase().includes(q);
}

export function ClientesPage() {
  const { clientes, create, update, remove } = useClientes();
  const [filter, setFilter] = useState<Filter>('Todos');
  const [query, setQuery] = useState('');
  const [drawer, setDrawer] = useState<DrawerState>(null);
  const toast = useToast();

  const q = query.trim().toLowerCase();
  const searched = useMemo(() => (q ? clientes.filter(c => matches(c, q)) : clientes), [clientes, q]);
  const visible = filter === 'Todos' ? searched : searched.filter(c => c.estado === filter);
  const editing = typeof drawer === 'number' ? clientes.find(c => c.id === drawer) ?? null : null;

  const close = () => setDrawer(null);

  const handleSave = (input: ClienteInput) => {
    if (drawer === 'new') {
      create(input);
      setFilter('Todos'); // make sure the new record is visible
      toast.flash('Cliente creado');
    } else if (editing) {
      update(editing.id, input);
      toast.flash('Cambios guardados');
    }
    close();
  };

  const handleDelete = () => {
    if (editing) remove(editing.id);
    close();
    toast.flash('Cliente eliminado');
  };

  return (
    <AppShell
      active="Clientes"
      breadcrumb={[{ label: 'Inicio', to: '/' }, { label: 'Mantenimiento' }, { label: 'Clientes' }]}
      actions={
        <button type="button" className="btn btn--primary" onClick={() => setDrawer('new')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          Nuevo cliente
        </button>
      }
    >
      <div>
        <h1 className="page__title">Clientes</h1>
        <div className="page__subtitle">Registro maestro de clientes. Se usan al crear cotizaciones, órdenes de venta y comprobantes.</div>
      </div>

      <div className="toolbar">
        {FILTERS.map(f => {
          const count = f === 'Todos' ? searched.length : searched.filter(c => c.estado === f).length;
          const dot = f === 'Todos' ? 'var(--faint)' : ESTADO_TONE[f] === 'muted' ? 'var(--text-2)' : `var(--${ESTADO_TONE[f]})`;
          return (
            <button
              key={f}
              type="button"
              className={'filter-chip' + (filter === f ? ' is-on' : '')}
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
            >
              <span className="filter-chip__dot" style={{ background: dot }} />
              {f}
              <span className="filter-chip__count">{count}</span>
            </button>
          );
        })}
        <label className="search toolbar__search">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar…" aria-label="Buscar clientes" />
        </label>
      </div>

      <section className="table" aria-label="Clientes">
        <div className="table__row table__head" role="row">
          <span>Código</span>
          <span>Razón social / nombre</span>
          <span>Contacto</span>
          <span>Condición</span>
          <span className="t-right">Línea crédito</span>
          <span>Estado</span>
        </div>

        {visible.map(c => (
          <div
            key={c.id}
            role="row"
            tabIndex={0}
            className={'table__row table__body-row' + (editing?.id === c.id ? ' is-selected' : '')}
            onClick={() => setDrawer(c.id)}
            onKeyDown={e => {
              if (e.key === 'Enter') setDrawer(c.id);
            }}
          >
            <div className="cell"><div className="cell__main mono-cell muted" style={{ fontWeight: 500 }}>{c.codigo}</div></div>
            <div className="cell">
              <div className="cell__main" style={{ fontWeight: 500 }}>{c.razonSocial}</div>
              <div className="cell__sub">{c.numeroDocumento}</div>
            </div>
            <div className="cell">
              <div className="cell__main">{c.contacto || '—'}</div>
              <div className="cell__sub">{c.telefono}</div>
            </div>
            <div className="cell"><div className="cell__main muted">{c.condicionPago}</div></div>
            <div className="cell t-right"><div className="cell__main mono-cell">{formatMoney(c.lineaCredito)}</div></div>
            <div className="cell"><StatusChip label={c.estado} tone={ESTADO_TONE[c.estado]} /></div>
          </div>
        ))}

        {visible.length === 0 && <div className="table__empty">No hay registros que coincidan.</div>}

        <div className="table__foot">
          <span>{visible.length} registros</span>
          <span>Haz clic en una fila para editar</span>
        </div>
      </section>

      {drawer !== null && (drawer === 'new' || editing) && (
        <ClienteDrawer
          // Remount per record so the form re-initialises.
          key={drawer}
          cliente={editing}
          onClose={close}
          onSave={handleSave}
          onDelete={handleDelete}
        />
      )}

      <Toast message={toast.message} />
    </AppShell>
  );
}
