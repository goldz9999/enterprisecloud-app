import { Fragment, useMemo, useState } from 'react';
import { AppShell } from '../components/AppShell';
import { Pagination } from '../components/Pagination';
import { StatusChip, type Tone } from '../components/StatusChip';
import './AuditoriaPage.css';

const USERS: Record<string, [string, string]> = {
  MR: ['María Rojas', 'Gerente de Operaciones'],
  RM: ['Rosa Medina', 'Contadora'],
  LP: ['Luis Paredes', 'Ejecutivo comercial'],
  AT: ['Ana Torres', 'Jefa de Compras'],
  JQ: ['Jorge Quispe', 'Almacén'],
  CH: ['Carlos Huamán', 'Almacén'],
  SY: ['Sistema', 'Proceso automático'],
};

type Result = 'Exitoso' | 'Fallido' | 'Denegado';
type Change = [field: string, before: string, after: string];
// [minutes ago, user, action, module, record, description, result, changes | note]
type RawEvent = [number, keyof typeof USERS, string, string, string, string, Result, Change[] | string];

const EVENTS: RawEvent[] = [
  [4, 'MR', 'Ingreso', 'Seguridad', 'maria.rojas@empresa.pe', 'Inicio de sesión', 'Exitoso', 'Autenticación con correo y contraseña. Sesión válida por 8 horas.'],
  [18, 'LP', 'Crear', 'Ventas', 'OV-2026-1284', 'Orden de venta · Distribuidora Andina', 'Exitoso', [['Total', '—', 'S/ 12,480.00'], ['Estado', '—', 'Pendiente']]],
  [26, 'RM', 'Editar', 'Ventas', 'OV-2026-1284', 'Cambio de estado de cobro', 'Exitoso', [['Estado', 'Pendiente', 'Pagado'], ['Medio de pago', '—', 'Transferencia BCP']]],
  [41, 'JQ', 'Ingreso', 'Seguridad', 'jorge.quispe@empresa.pe', 'Inicio de sesión', 'Fallido', 'Contraseña incorrecta (intento 2 de 5). La cuenta aún no confirmó su correo.'],
  [55, 'JQ', 'Editar', 'Finanzas', 'CxP · FA-0098', 'Intento de acceso a cuentas por pagar', 'Denegado', 'El rol Almacén no tiene el permiso finanzas.cxp.editar. Principio de mínimo privilegio.'],
  [72, 'SY', 'Crear', 'Documentos', 'F001-00248.xml', 'Comprobante electrónico generado', 'Exitoso', 'XML firmado y almacenado en el repositorio documental.'],
  [96, 'AT', 'Crear', 'Compras', 'OC-2026-0412', 'Orden de compra · Aceros del Sur', 'Exitoso', [['Total', '—', 'S/ 18,240.00'], ['Proveedor', '—', 'Aceros del Sur S.A.C.']]],
  [130, 'CH', 'Editar', 'Inventario', 'SKU-CEM-0042', 'Ajuste de stock · Almacén Lima', 'Exitoso', [['Stock', '42', '18'], ['Motivo', '—', 'Merma por humedad']]],
  [185, 'MR', 'Exportar', 'Ventas', 'Reporte ventas set-2026', 'Exportación a Excel · 312 filas', 'Exitoso', 'Archivo generado: ventas_2026-09.xlsx'],
  [240, 'LP', 'Descargar', 'Documentos', 'Contrato_suministro_2026_MineraAndes.pdf', 'Descarga de contrato', 'Exitoso', 'Descarga autorizada para el rol Ejecutivo comercial.'],
  [310, 'RM', 'Eliminar', 'Finanzas', 'MOV-CAJA-00871', 'Movimiento de caja duplicado', 'Exitoso', [['Monto', 'S/ 450.00', '—'], ['Estado', 'Registrado', 'Anulado']]],
  [420, 'MR', 'Crear', 'Administración', 'jorge.quispe@empresa.pe', 'Invitación de usuario · rol Almacén', 'Exitoso', [['Rol', '—', 'Almacén'], ['Estado', '—', 'Sin confirmar']]],
  [1460, 'AT', 'Editar', 'Compras', 'PRV-000142', 'Datos bancarios de proveedor', 'Exitoso', [['Cuenta', '191-0045…', '193-2210…'], ['Banco', 'BCP', 'Interbank']]],
  [1530, 'LP', 'Eliminar', 'Ventas', 'COT-2026-0311', 'Intento de eliminar cotización aprobada', 'Denegado', 'Las cotizaciones aprobadas solo pueden anularse por un Gerente.'],
  [1610, 'SY', 'Ingreso', 'Seguridad', 'admin@empresa.pe', 'Inicio de sesión desde IP desconocida', 'Fallido', '5 intentos fallidos. Cuenta bloqueada temporalmente por 15 minutos.'],
  [2900, 'CH', 'Crear', 'Inventario', 'TRF-2026-0088', 'Transferencia Lima → Callao', 'Exitoso', [['Productos', '—', '6 ítems'], ['Estado', '—', 'En tránsito']]],
  [3100, 'RM', 'Exportar', 'Finanzas', 'Conciliación set-2026', 'Exportación a Excel', 'Exitoso', 'Archivo generado: conciliacion_2026-09.xlsx'],
  [4400, 'MR', 'Editar', 'Administración', 'Rol: Ventas', 'Permisos de rol actualizados', 'Exitoso', [['ventas.descuento', 'Hasta 5%', 'Hasta 10%']]],
  [7300, 'LP', 'Crear', 'Ventas', 'OV-2026-1270', 'Orden de venta · Clínica San Gabriel', 'Exitoso', [['Total', '—', 'S/ 9,460.00']]],
  [11800, 'AT', 'Descargar', 'Documentos', 'OC-2026-0399.pdf', 'Descarga de orden de compra', 'Exitoso', 'Descarga autorizada para el rol Compras.'],
  [20500, 'JQ', 'Ingreso', 'Seguridad', 'jorge.quispe@empresa.pe', 'Inicio de sesión', 'Fallido', 'Contraseña incorrecta (intento 1 de 5).'],
  [30100, 'MR', 'Eliminar', 'Documentos', 'Borrador_contrato_v0.docx', 'Documento eliminado', 'Exitoso', 'El archivo pasa a la papelera por 30 días antes de borrarse definitivamente.'],
];

const ACTION_COLOR: Record<string, string> = { Ingreso: 'var(--faint)', Crear: 'var(--green)', Editar: 'var(--blue)', Eliminar: 'var(--red)', Exportar: 'var(--amber)', Descargar: 'var(--amber)' };
const RESULT_TONE: Record<Result, Tone> = { Exitoso: 'green', Fallido: 'red', Denegado: 'amber' };
const RANGE_MINUTES = { Hoy: 700, '7 días': 10080, '30 días': 43200 } as const;
type Range = keyof typeof RANGE_MINUTES;
const MODULES = ['Todos', 'Seguridad', 'Ventas', 'Compras', 'Inventario', 'Finanzas', 'Documentos', 'Administración'];
const ACTIONS = ['Todas', 'Ingreso', 'Crear', 'Editar', 'Eliminar', 'Exportar', 'Descargar'];
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const COLS = '118px minmax(0, 1fr) 104px 100px minmax(0, 1.3fr) 96px 20px';
const PAGE_SIZE = 12;

const p2 = (n: number) => String(n).padStart(2, '0');

/** Expands the compact sample events into display records (timestamps relative to 02 oct 2026 10:46). */
function buildEvents() {
  const base = new Date(2026, 9, 2, 10, 46, 12).getTime();
  return EVENTS.map(([mins, u, action, module, ref, desc, result, extra], i) => {
    const t = new Date(base - mins * 60000 - i * 17000);
    const system = u === 'SY';
    return {
      id: 'AUD-' + (884120 - i),
      mins, action, module, ref, desc, result,
      user: USERS[u][0],
      role: USERS[u][1],
      changes: Array.isArray(extra) ? extra : [],
      note: Array.isArray(extra) ? '' : extra,
      day: p2(t.getDate()) + ' ' + MES[t.getMonth()],
      time: `${p2(t.getHours())}:${p2(t.getMinutes())}:${p2(t.getSeconds())}`,
      full: `${t.getFullYear()}-${p2(t.getMonth() + 1)}-${p2(t.getDate())} ${p2(t.getHours())}:${p2(t.getMinutes())}:${p2(t.getSeconds())} (UTC−5)`,
      ip: system && action === 'Ingreso' ? '181.65.203.17' : system ? 'interno' : `10.0.${12 + (i % 4)}.${20 + ((i * 7) % 200)}`,
      device: system ? (action === 'Ingreso' ? 'Desconocido · Linux' : 'Servicio backend') : ['Chrome · Windows', 'Edge · Windows', 'Safari · macOS', 'Chrome · Android'][i % 4],
    };
  });
}

export function AuditoriaPage() {
  const events = useMemo(buildEvents, []);
  const [range, setRange] = useState<Range>('7 días');
  const [result, setResult] = useState<'Todos' | Result>('Todos');
  const [mod, setMod] = useState('Todos');
  const [act, setAct] = useState('Todas');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  // Filter changes go back to page 1 and collapse any open row.
  const refilter = (fn: () => void) => {
    fn();
    setPage(1);
    setOpen(null);
  };

  const q = query.trim().toLowerCase();
  const list = events.filter(
    e =>
      e.mins <= RANGE_MINUTES[range] &&
      (result === 'Todos' || e.result === result) &&
      (mod === 'Todos' || e.module === mod) &&
      (act === 'Todas' || e.action === act) &&
      (!q || (e.user + e.ref + e.desc).toLowerCase().includes(q)),
  );
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const cur = Math.min(page, pages);
  const hasFilters = range !== '7 días' || result !== 'Todos' || mod !== 'Todos' || act !== 'Todas' || !!q;
  const clear = () => refilter(() => { setRange('7 días'); setResult('Todos'); setMod('Todos'); setAct('Todas'); setQuery(''); });

  return (
    <AppShell
      active="Auditoría"
      breadcrumb={[{ label: 'Inicio', to: '/' }, { label: 'Administración' }, { label: 'Auditoría' }]}
      actions={
        <button type="button" className="btn btn--primary">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12M7 10l5 5 5-5M4 21h16" /></svg>
          Exportar registro
        </button>
      }
    >
      <div className="page-head">
        <div>
          <h1 className="page__title">Auditoría</h1>
          <div className="page__subtitle">Registro inalterable de acciones: quién hizo qué, en qué módulo, sobre qué registro y con qué resultado</div>
        </div>
        <div className="audit-counts">
          <span><span className="mono" style={{ color: 'var(--text)' }}>{list.length}</span> eventos</span>
          <span><span className="mono" style={{ color: 'var(--red)' }}>{list.filter(e => e.result === 'Fallido').length}</span> fallidos</span>
          <span><span className="mono" style={{ color: 'var(--amber)' }}>{list.filter(e => e.result === 'Denegado').length}</span> denegados</span>
        </div>
      </div>

      <section className="filters">
        <div className="filters__group">
          <span className="field__label">Periodo</span>
          <div className="seg-buttons">
            {(Object.keys(RANGE_MINUTES) as Range[]).map(r => (
              <button key={r} type="button" className={range === r ? 'is-on' : ''} onClick={() => refilter(() => setRange(r))}>{r}</button>
            ))}
          </div>
        </div>
        <div className="filters__group">
          <span className="field__label">Resultado</span>
          <div className="seg-buttons">
            {(['Todos', 'Exitoso', 'Fallido', 'Denegado'] as const).map(r => (
              <button key={r} type="button" className={result === r ? 'is-on' : ''} onClick={() => refilter(() => setResult(r))}>{r}</button>
            ))}
          </div>
        </div>
        <label className="filters__group">
          <span className="field__label">Módulo</span>
          <select className="field__control" style={{ height: 30 }} value={mod} onChange={e => refilter(() => setMod(e.target.value))}>
            {MODULES.map(m => <option key={m}>{m}</option>)}
          </select>
        </label>
        <label className="filters__group">
          <span className="field__label">Acción</span>
          <select className="field__control" style={{ height: 30 }} value={act} onChange={e => refilter(() => setAct(e.target.value))}>
            {ACTIONS.map(a => <option key={a}>{a}</option>)}
          </select>
        </label>
        <label className="filters__group" style={{ flex: 1, minWidth: 180, maxWidth: 280 }}>
          <span className="field__label">Usuario o registro</span>
          <span className="search search--inset">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
            <input value={query} onChange={e => refilter(() => setQuery(e.target.value))} placeholder="Ej. Rojas, OV-2026-1284" />
          </span>
        </label>
        {hasFilters && <button type="button" className="link-btn" onClick={clear}>Limpiar filtros</button>}
      </section>

      <section className="panel">
        <div role="row" className="audit-row audit-row--head" style={{ gridTemplateColumns: COLS }}>
          <span>Fecha / hora</span><span>Usuario</span><span>Acción</span><span>Módulo</span><span>Registro afectado</span><span>Resultado</span><span />
        </div>
        {list.slice((cur - 1) * PAGE_SIZE, cur * PAGE_SIZE).map(e => {
          const isOpen = open === e.id;
          return (
            <div key={e.id} style={{ borderBottom: '1px solid var(--border-soft)' }}>
              <div
                role="row"
                tabIndex={0}
                aria-expanded={isOpen}
                className={'audit-row audit-row--body' + (isOpen ? ' is-open' : '')}
                style={{ gridTemplateColumns: COLS }}
                onClick={() => setOpen(isOpen ? null : e.id)}
                onKeyDown={k => k.key === 'Enter' && setOpen(isOpen ? null : e.id)}
              >
                <div className="mono" style={{ whiteSpace: 'nowrap' }}>
                  <div style={{ fontSize: 12, color: 'var(--text-2)' }}>{e.day}</div>
                  <div style={{ fontSize: 11, color: 'var(--faint)' }}>{e.time}</div>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div className="ellipsis" style={{ fontWeight: 500 }}>{e.user}</div>
                  <div className="cell__sub">{e.role}</div>
                </div>
                <span className="audit-action"><span style={{ background: ACTION_COLOR[e.action] }} />{e.action}</span>
                <span style={{ color: 'var(--text-2)', whiteSpace: 'nowrap' }}>{e.module}</span>
                <div style={{ minWidth: 0 }}>
                  <div className="mono ellipsis" style={{ fontSize: 11.5, color: 'var(--blue)' }}>{e.ref}</div>
                  <div className="cell__sub">{e.desc}</div>
                </div>
                <span><StatusChip label={e.result} tone={RESULT_TONE[e.result]} /></span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--faint)" strokeWidth="2" strokeLinecap="round" style={{ transform: `rotate(${isOpen ? 90 : 0}deg)`, transition: 'transform .15s' }}><path d="M9 6l6 6-6 6" /></svg>
              </div>
              {isOpen && (
                <div className="audit-detail">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 12 }}>
                    <span className="field__label">{e.changes.length ? 'Cambios (antes → después)' : 'Detalle'}</span>
                    {e.changes.length > 0 && (
                      <div className="changes">
                        {e.changes.map(([field, before, after]) => (
                          <div key={field} className="changes__row">
                            <span style={{ color: 'var(--muted)' }}>{field}</span>
                            <span className="mono changes__before">{before}</span>
                            <span className="mono" style={{ color: 'var(--green)' }}>{after}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {e.note && <div style={{ fontSize: 12, color: 'var(--text-2)', textWrap: 'pretty' }}>{e.note}</div>}
                  </div>
                  <div className="kv" style={{ gridTemplateColumns: '90px minmax(0, 1fr)', columnGap: 8, paddingTop: 12, alignContent: 'start' }}>
                    {[['ID evento', e.id, true], ['Dirección IP', e.ip, true], ['Dispositivo', e.device, false], ['Fecha exacta', e.full, true]].map(([k, v, mono]) => (
                      <Fragment key={String(k)}><span>{k}</span><span className={mono ? 'mono' : ''}>{v}</span></Fragment>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {list.length === 0 && (
          <div className="table__empty">No hay eventos con estos filtros. <a onClick={clear} style={{ cursor: 'pointer' }}>Limpiar filtros</a></div>
        )}
        <div className="pager">
          <span>Mostrando <span style={{ color: 'var(--text)' }}>{list.length ? (cur - 1) * PAGE_SIZE + 1 : 0}–{Math.min(cur * PAGE_SIZE, list.length)}</span> de {list.length}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
            Los eventos no se pueden editar ni eliminar · retención 5 años
          </span>
          <Pagination page={cur} pages={pages} onPage={n => { setPage(n); setOpen(null); }} />
        </div>
      </section>
    </AppShell>
  );
}
