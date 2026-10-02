import { useState } from 'react';
import { AppShell } from '../components/AppShell';
import { Toast, useToast } from '../components/Toast';
import { useTheme } from '../lib/theme';
import './ConfiguracionPage.css';

interface SettingField {
  k: string;
  label: string;
  type?: 'select' | 'toggle';
  options?: string[];
  /** Toggle caption. */
  hint?: string;
  mono?: boolean;
  wide?: boolean;
}

const SECTIONS: { title: string; desc: string; fields: SettingField[] }[] = [
  { title: 'Empresa', desc: 'Datos que aparecen en comprobantes, reportes y documentos.', fields: [{ k: 'ruc', label: 'RUC', mono: true }, { k: 'razon', label: 'Razón social' }, { k: 'dir', label: 'Dirección fiscal', wide: true }, { k: 'moneda', label: 'Moneda base', type: 'select', options: ['Soles (PEN)', 'Dólares (USD)'] }, { k: 'zona', label: 'Zona horaria', type: 'select', options: ['America/Lima (UTC−5)'] }] },
  { title: 'Comprobantes electrónicos', desc: 'Series autorizadas por SUNAT y envío automático de comprobantes.', fields: [{ k: 'sf', label: 'Serie de facturas', mono: true }, { k: 'sb', label: 'Serie de boletas', mono: true }, { k: 'sg', label: 'Serie de guías de remisión', mono: true }, { k: 'snc', label: 'Serie de notas de crédito', mono: true }, { k: 'auto', label: 'Envío a SUNAT', type: 'toggle', hint: 'Enviar automáticamente al emitir' }, { k: 'mail', label: 'Correo al cliente', type: 'toggle', hint: 'Adjuntar PDF y XML por correo' }] },
  { title: 'Impuestos y precios', desc: 'Cálculo del IGV y condiciones comerciales por defecto.', fields: [{ k: 'igv', label: 'Tasa de IGV', type: 'select', options: ['18%', '10% (MYPE restaurantes)', 'Exonerado'] }, { k: 'incl', label: 'Precios de lista', type: 'select', options: ['No incluyen IGV', 'Incluyen IGV'] }, { k: 'desc', label: 'Descuento máximo sin aprobación', type: 'select', options: ['5%', '10%', '15%'] }, { k: 'vcot', label: 'Validez de cotizaciones', type: 'select', options: ['7 días', '14 días', '30 días'] }] },
  { title: 'Inventario', desc: 'Reglas de valorización y control de stock.', fields: [{ k: 'cost', label: 'Método de costeo', type: 'select', options: ['Promedio ponderado móvil', 'PEPS (FIFO)'] }, { k: 'almdef', label: 'Almacén por defecto', type: 'select', options: ['Almacén Lima', 'Almacén Callao'] }, { k: 'neg', label: 'Stock negativo', type: 'toggle', hint: 'Permitir despachar sin stock' }, { k: 'alert', label: 'Alertas de reposición', type: 'toggle', hint: 'Avisar al llegar al stock mínimo' }] },
  { title: 'Seguridad', desc: 'Políticas de acceso aplicadas a todos los usuarios.', fields: [{ k: 'ses', label: 'Duración de la sesión', type: 'select', options: ['4 horas', '8 horas', '12 horas'] }, { k: 'int', label: 'Intentos antes de bloquear', type: 'select', options: ['3', '5', '10'] }, { k: 'mfa', label: 'Verificación en 2 pasos', type: 'toggle', hint: 'Obligatoria para Gerente y Administrador' }, { k: 'aud', label: 'Retención de auditoría', type: 'select', options: ['1 año', '5 años', '10 años'] }] },
  { title: 'Apariencia', desc: 'Preferencia visual para tu usuario.', fields: [{ k: 'theme', label: 'Tema', type: 'select', options: ['Oscuro', 'Claro'] }, { k: 'dens', label: 'Densidad de tablas', type: 'select', options: ['Cómoda', 'Compacta'] }] },
];

type Settings = Record<string, string | boolean>;

const INITIAL: Settings = {
  ruc: '20601987451', razon: 'Comercializadora Andina de Materiales S.A.C.', dir: 'Av. Argentina 1820, Cercado de Lima, Lima', moneda: 'Soles (PEN)', zona: 'America/Lima (UTC−5)',
  sf: 'F001', sb: 'B001', sg: 'T001', snc: 'FC01', auto: true, mail: true,
  igv: '18%', incl: 'No incluyen IGV', desc: '5%', vcot: '14 días',
  cost: 'Promedio ponderado móvil', almdef: 'Almacén Lima', neg: false, alert: true,
  ses: '8 horas', int: '5', mfa: true, aud: '5 años', dens: 'Cómoda',
};

export function ConfiguracionPage() {
  const { theme, setTheme } = useTheme();
  const [saved, setSaved] = useState(INITIAL);
  const [form, setForm] = useState(INITIAL);
  const toast = useToast();
  const changes = Object.keys(INITIAL).filter(k => form[k] !== saved[k]).length;
  const set = (k: string, v: string | boolean) => setForm(f => ({ ...f, [k]: v }));

  return (
    <AppShell active="Configuración" breadcrumb={[{ label: 'Inicio', to: '/' }, { label: 'Sistema' }, { label: 'Configuración' }]} narrow>
      <div>
        <h1 className="page__title">Configuración</h1>
        <div className="page__subtitle">Parámetros generales de la empresa y del sistema. Solo el rol Administrador puede modificarlos.</div>
      </div>

      {SECTIONS.map(sec => (
        <section key={sec.title} className="settings">
          <div>
            <div style={{ fontWeight: 600 }}>{sec.title}</div>
            <div className="settings__desc">{sec.desc}</div>
          </div>
          <div className="settings__fields">
            {sec.fields.map(f => {
              // The theme applies immediately; it is a personal preference, not a saved setting.
              const value = f.k === 'theme' ? (theme === 'dark' ? 'Oscuro' : 'Claro') : form[f.k];
              const changed = f.k !== 'theme' && form[f.k] !== saved[f.k];
              const cls = 'field__control' + (changed ? ' is-changed' : '');
              return (
                <div key={f.k} className={'field' + (f.wide ? ' field--wide' : '')}>
                  <span className="field__label">{f.label}</span>
                  {f.type === 'toggle' ? (
                    <button type="button" role="switch" aria-checked={!!value} className="switch-row" onClick={() => set(f.k, !form[f.k])}>
                      <span className={'switch' + (value ? ' is-on' : '')}><span /></span>
                      {f.hint}
                    </button>
                  ) : f.type === 'select' ? (
                    <select
                      className={cls}
                      aria-label={f.label}
                      value={String(value)}
                      onChange={e => (f.k === 'theme' ? setTheme(e.target.value === 'Oscuro' ? 'dark' : 'light') : set(f.k, e.target.value))}
                    >
                      {f.options?.map(o => <option key={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input className={cls + (f.mono ? ' mono' : '')} aria-label={f.label} value={String(value)} onChange={e => set(f.k, e.target.value)} style={{ padding: '0 10px' }} />
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {changes > 0 && (
        <div className="savebar">
          <span className="savebar__dot" />
          <span style={{ flex: 1 }}>{changes} cambio{changes === 1 ? '' : 's'} sin guardar</span>
          <button type="button" className="btn" onClick={() => setForm(saved)}>Descartar</button>
          <button type="button" className="btn btn--primary" style={{ padding: '0 16px' }} onClick={() => { setSaved(form); toast.flash('Configuración guardada · registrado en auditoría'); }}>
            Guardar cambios
          </button>
        </div>
      )}
      <Toast message={toast.message} />
    </AppShell>
  );
}
