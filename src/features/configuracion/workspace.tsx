import { useEffect, useState } from 'react';
import { AppShell } from '@/shared/components/AppShell';
import { Toast, useToast } from '@/shared/components/Toast';
import { fetchAuditTotal, loadAdmin, saveSettings } from '@/data/domain/admin';
import { can } from '@/data/permissions';
import { SETTING_SECTIONS } from '@/data/settings';
import { useDB } from '@/data/store';
import type { Settings } from '@/data/types';
import { api } from '@/shared/lib/api';
import { useSidebarFollowsTheme, useTheme } from '@/shared/lib/theme';
import { ModulosOpcionales } from '@/modules/ModulosOpcionales';

// Map section titles to anchor ids
const sectionId = (title: string) => title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

// Sidebar groups: each group shows one or more SETTING_SECTIONS together
const CFG_GROUPS = [
  { id: 'datos', label: 'Datos', titles: [] as string[] }, // special
  { id: 'empresa', label: 'Empresa', titles: ['Empresa'] },
  { id: 'comprobantes', label: 'Comprobantes e impuestos', titles: ['Comprobantes electrónicos', 'Impuestos y precios'] },
  { id: 'tesoreria', label: 'Tesorería e inventario', titles: ['Tesorería', 'Inventario'] },
  { id: 'seguridad', label: 'Seguridad y apariencia', titles: ['Seguridad', 'Apariencia'] },
  { id: 'modulos', label: 'Módulos opcionales', titles: [] as string[] }, // special: src/modules
] as const;

const SIDEBAR_ITEMS = CFG_GROUPS.map(g => ({ id: g.id, label: g.label }));

export function ConfiguracionPage() {
  const d = useDB();
  const { theme, setTheme } = useTheme();
  const { sidebarFollowsTheme, setSidebarFollowsTheme } = useSidebarFollowsTheme();
  const saved = d.settings;
  const [form, setForm] = useState<Settings>(() => ({ ...saved }));
  const [conn, setConn] = useState<'checking' | 'ok' | 'down'>('checking');
  const [auditTotal, setAuditTotal] = useState<number | null>(null);
  const [activeSection, setActiveSection] = useState('datos');
  const toast = useToast();
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  // La configuración vive en el backend: se carga al entrar y el formulario se sincroniza cuando cambia lo guardado.
  const savedKey = JSON.stringify(saved);
  useEffect(() => { void loadAdmin(); }, []);
  useEffect(() => { setForm({ ...saved }); }, [savedKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const canEdit = can(d, 'Configuración', 'Editar');
  const keys = SETTING_SECTIONS.flatMap(s => s.fields.map(f => f.k)).filter(k => k !== 'theme' && k !== 'sbtheme'); // preferencias locales del navegador: no se guardan en el servidor
  const changes = keys.filter(k => form[k] !== saved[k]);
  const set = (k: string, v: string | boolean) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setSaveError('');
    const res = await saveSettings(form);
    setSaving(false);
    if (!res.ok) return setSaveError(res.error);
    toast.flash('Configuración guardada · registrado en auditoría');
  };

  // Estado real de la conexión con la base de datos y total de eventos de auditoría registrados en el servidor.
  useEffect(() => {
    let on = true;
    api('/health', { auth: false }).then(() => on && setConn('ok')).catch(() => on && setConn('down'));
    fetchAuditTotal().then(n => on && setAuditTotal(n)).catch(() => undefined);
    return () => { on = false; };
  }, []);

  const counts = {
    clientes: d.records.clientes.length,
    proveedores: d.records.proveedores.length,
    productos: d.records.productos.length,
    usuarios: d.records.usuarios.length,
    roles: d.records.roles.length,
  };

  const renderSection = (id: string, title: string, desc: string, children: React.ReactNode) => (
    <section key={id} className="cfg-section">
      <div className="cfg-section__head">
        <div className="cfg-section__title">{title}</div>
        <div className="cfg-section__desc">{desc}</div>
      </div>
      <div className="cfg-section__body">{children}</div>
    </section>
  );

  return (
    <AppShell active="Configuración" breadcrumb={[{ label: 'Inicio', to: '/' }, { label: 'Sistema' }, { label: 'Configuración' }]}>
      <div>
        <h1 className="page__title">Configuración</h1>
        <div className="page__subtitle">Parámetros generales de la empresa y del sistema.{!canEdit && ' Solo el rol Administrador puede modificarlos.'}</div>
      </div>

      <div className="cfg-layout">
        {/* Sidebar */}
        <nav className="cfg-nav">
          {SIDEBAR_ITEMS.map(item => (
            <button
              key={item.id}
              type="button"
              className={'cfg-nav__item' + (activeSection === item.id ? ' is-active' : '')}
              onClick={() => setActiveSection(item.id)}
            >
              {item.label}
              {item.id === 'datos' && changes.length > 0 && (
                <span className="cfg-nav__dot" />
              )}
            </button>
          ))}
        </nav>

        {/* Content */}
        <div className="cfg-content">

          {/* Only the active section is rendered */}
          {activeSection === 'datos' && renderSection('datos', 'Datos', 'Mantenimiento y Administración se guardan en la base de datos (Supabase), no en este navegador.', (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="data-mode">
                <span className="data-mode__dot" style={conn === 'down' ? { background: 'var(--red)' } : undefined} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500 }}>
                    {conn === 'ok' ? 'Conectado a la base de datos' : conn === 'down' ? 'Sin conexión con el servidor' : 'Comprobando conexión…'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {counts.clientes} clientes · {counts.proveedores} proveedores · {counts.productos} productos · {counts.usuarios} usuarios · {counts.roles} roles
                    {auditTotal !== null && ` · ${auditTotal} eventos de auditoría`}
                  </div>
                </div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--faint)' }}>
                Todo lo que crees o edites en Mantenimiento y Administración se guarda en el servidor y se ve igual desde cualquier navegador. Cotizaciones, órdenes de venta y compra, inventario, finanzas y documentos aún no están conectados a la base.
              </div>
            </div>
          ))}

          {activeSection === 'modulos' && renderSection('modulos', 'Módulos opcionales', 'Gestión para pymes (solo frontend): enciende solo lo que la empresa usa. Apagado, desaparece del menú y sus datos se conservan.', (
            <ModulosOpcionales canEdit={canEdit} onMessage={toast.flash} />
          ))}

          {/* Dynamic groups — show all sections belonging to the active group */}
          {CFG_GROUPS.filter(g => g.id === activeSection && g.id !== 'datos' && g.id !== 'modulos').map(group => (
            <div key={group.id} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {SETTING_SECTIONS.filter(sec => (group.titles as readonly string[]).includes(sec.title)).map(sec =>
                renderSection(sectionId(sec.title), sec.title, sec.desc, (
                  <div className="settings__fields">
                    {sec.fields.map(f => {
                      const isLocalPref = f.k === 'theme' || f.k === 'sbtheme';
                      const value = f.k === 'theme' ? (theme === 'dark' ? 'Oscuro' : 'Claro') : f.k === 'sbtheme' ? sidebarFollowsTheme : form[f.k];
                      const changed = !isLocalPref && form[f.k] !== saved[f.k];
                      const cls = 'field__control' + (changed ? ' is-changed' : '');
                      const options = typeof f.options === 'function' ? f.options(d) : f.options ?? [];
                      const disabled = !canEdit && !isLocalPref;
                      return (
                        <div key={f.k} className={'field' + (f.wide ? ' field--wide' : '')}>
                          <span className="field__label">{f.label}</span>
                          {f.type === 'toggle' ? (
                            <button type="button" role="switch" aria-checked={!!value} aria-label={f.label} className="switch-row" disabled={disabled} onClick={() => (f.k === 'sbtheme' ? setSidebarFollowsTheme(!sidebarFollowsTheme) : set(f.k, !form[f.k]))}>
                              <span className={'switch' + (value ? ' is-on' : '')}><span /></span>
                              {f.hint}
                            </button>
                          ) : f.type === 'select' ? (
                            <select className={cls} aria-label={f.label} value={String(value ?? '')} disabled={disabled}
                              onChange={e => (f.k === 'theme' ? setTheme(e.target.value === 'Oscuro' ? 'dark' : 'light') : set(f.k, e.target.value))}>
                              {value && !options.includes(String(value)) && <option>{String(value)}</option>}
                              {options.map(o => <option key={o}>{o}</option>)}
                            </select>
                          ) : (
                            <input className={cls + (f.mono ? ' mono' : '')} aria-label={f.label} value={String(value ?? '')} disabled={disabled} onChange={e => set(f.k, e.target.value)} style={{ padding: '0 10px' }} placeholder={f.hint} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          ))}

          {/* Save bar */}
          {changes.length > 0 && (
            <div className="savebar">
              <span className="savebar__dot" />
              <span style={{ flex: 1 }}>{changes.length} cambio{changes.length === 1 ? '' : 's'} sin guardar{saveError && <span style={{ color: 'var(--red)' }}> · {saveError}</span>}</span>
              <button type="button" className="btn" disabled={saving} onClick={() => { setForm({ ...saved }); setSaveError(''); }}>Descartar</button>
              <button type="button" className="btn btn--primary" style={{ padding: '0 16px' }} disabled={saving} onClick={() => void save()}>{saving ? 'Guardando…' : 'Guardar cambios'}</button>
            </div>
          )}
        </div>
      </div>

      <Toast message={toast.message} />
    </AppShell>
  );
}