import { useRef, useState } from 'react';
import { AppShell } from '../components/AppShell';
import { DataDialog } from '../components/DataDialog';
import { canManageData, downloadBackup } from '../lib/dataManagement';
import { Toast, useToast } from '../components/Toast';
import { audit } from '../data/domain/audit';
import { can } from '../data/permissions';
import { SETTING_SECTIONS } from '../data/settings';
import { getDB, importBackup, mutate, useDB } from '../data/store';
import type { Settings } from '../data/types';
import { useTheme } from '../lib/theme';
import './ConfiguracionPage.css';

type Confirm = 'clear' | null;

// Map section titles to anchor ids
const sectionId = (title: string) => title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

// Sidebar groups: each group shows one or more SETTING_SECTIONS together
const CFG_GROUPS = [
  { id: 'datos', label: 'Datos', titles: [] as string[] }, // special
  { id: 'empresa', label: 'Empresa', titles: ['Empresa'] },
  { id: 'comprobantes', label: 'Comprobantes e impuestos', titles: ['Comprobantes electrónicos', 'Impuestos y precios'] },
  { id: 'tesoreria', label: 'Tesorería e inventario', titles: ['Tesorería', 'Inventario'] },
  { id: 'seguridad', label: 'Seguridad y apariencia', titles: ['Seguridad', 'Apariencia'] },
] as const;

const SIDEBAR_ITEMS = CFG_GROUPS.map(g => ({ id: g.id, label: g.label }));

export function ConfiguracionPage() {
  const d = useDB();
  const { theme, setTheme } = useTheme();
  const saved = d.settings;
  const [form, setForm] = useState<Settings>(() => ({ ...saved }));
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [importError, setImportError] = useState('');
  const [activeSection, setActiveSection] = useState('datos');
  const fileInput = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const canEdit = can(d, 'Configuración', 'Editar');
  const keys = SETTING_SECTIONS.flatMap(s => s.fields.map(f => f.k)).filter(k => k !== 'theme');
  const changes = keys.filter(k => form[k] !== saved[k]);
  const set = (k: string, v: string | boolean) => setForm(f => ({ ...f, [k]: v }));

  const save = () => {
    mutate(dr => {
      const labels = Object.fromEntries(SETTING_SECTIONS.flatMap(s => s.fields.map(f => [f.k, f.label])));
      audit(dr, { action: 'Editar', module: 'Administración', ref: 'Configuración', desc: `Configuración actualizada · ${changes.length} cambio${changes.length === 1 ? '' : 's'}`, changes: changes.map(k => [labels[k] ?? k, String(saved[k] ?? ''), String(form[k] ?? '')]) });
      dr.settings = { ...dr.settings, ...form };
    });
    toast.flash('Configuración guardada · registrado en auditoría');
  };

  const counts = {
    clientes: d.records.clientes.length,
    productos: d.records.productos.length,
    ventas: d.orders.filter(o => o.kind === 'venta').length,
    compras: d.orders.filter(o => o.kind === 'compra').length,
    documentos: d.documentos.length,
    eventos: d.audit.length,
  };
  const sizeKb = Math.round(new Blob([JSON.stringify(d)]).size / 1024);

  const doBackup = () => { downloadBackup(); toast.flash('Respaldo descargado'); };

  const doImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      importBackup(await file.text());
      setForm({ ...getDB().settings });
      setImportError('');
      toast.flash('Respaldo importado');
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'No se pudo leer el archivo.');
    }
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
          {activeSection === 'datos' && renderSection('datos', 'Datos', 'Todo lo que haces se guarda en este navegador. Descarga respaldos con frecuencia.', (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="data-mode">
                <span className="data-mode__dot" />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500 }}>Usando tus datos locales</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {counts.clientes} clientes · {counts.productos} productos · {counts.ventas} ventas · {counts.compras} compras · {counts.documentos} documentos · {counts.eventos} eventos de auditoría · {sizeKb} KB
                  </div>
                </div>
              </div>
              {canManageData(d) ? (
                <div className="data-actions">
                  <button type="button" className="btn btn--danger-text" onClick={() => setConfirm('clear')}>
                    Borrar todos los datos
                  </button>
                  <span style={{ flex: 1 }} />
                  <button type="button" className="btn" onClick={doBackup}>Exportar respaldo</button>
                  <button type="button" className="btn" onClick={() => fileInput.current?.click()}>Importar respaldo</button>
                  <input ref={fileInput} type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={e => { doImport(e.target.files?.[0]); e.target.value = ''; }} />
                </div>
              ) : (
                <div style={{ fontSize: 12, color: 'var(--faint)' }}>Solo un Administrador o Gerente puede borrar o importar datos.</div>
              )}
              {importError && <div className="drawer-error">{importError}</div>}
            </div>
          ))}

          {/* Dynamic groups — show all sections belonging to the active group */}
          {CFG_GROUPS.filter(g => g.id === activeSection && g.id !== 'datos').map(group => (
            <div key={group.id} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {SETTING_SECTIONS.filter(sec => (group.titles as readonly string[]).includes(sec.title)).map(sec =>
                renderSection(sectionId(sec.title), sec.title, sec.desc, (
                  <div className="settings__fields">
                    {sec.fields.map(f => {
                      const value = f.k === 'theme' ? (theme === 'dark' ? 'Oscuro' : 'Claro') : form[f.k];
                      const changed = f.k !== 'theme' && form[f.k] !== saved[f.k];
                      const cls = 'field__control' + (changed ? ' is-changed' : '');
                      const options = typeof f.options === 'function' ? f.options(d) : f.options ?? [];
                      const disabled = !canEdit && f.k !== 'theme';
                      return (
                        <div key={f.k} className={'field' + (f.wide ? ' field--wide' : '')}>
                          <span className="field__label">{f.label}</span>
                          {f.type === 'toggle' ? (
                            <button type="button" role="switch" aria-checked={!!value} aria-label={f.label} className="switch-row" disabled={disabled} onClick={() => set(f.k, !form[f.k])}>
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
              <span style={{ flex: 1 }}>{changes.length} cambio{changes.length === 1 ? '' : 's'} sin guardar</span>
              <button type="button" className="btn" onClick={() => setForm({ ...saved })}>Descartar</button>
              <button type="button" className="btn btn--primary" style={{ padding: '0 16px' }} onClick={save}>Guardar cambios</button>
            </div>
          )}
        </div>
      </div>

      {confirm && <DataDialog initial={confirm} onClose={() => setConfirm(null)} onDone={msg => { setForm({ ...getDB().settings }); toast.flash(msg); }} />}
      <Toast message={toast.message} />
    </AppShell>
  );
}