import type { DB, Settings } from './types';

export interface SettingField {
  k: string;
  label: string;
  type?: 'select' | 'toggle';
  options?: string[] | ((d: DB) => string[]);
  /** Toggle caption, or helper text under a text field. */
  hint?: string;
  mono?: boolean;
  wide?: boolean;
}

export const SETTING_SECTIONS: { title: string; desc: string; fields: SettingField[] }[] = [
  { title: 'Empresa', desc: 'Datos que aparecen en comprobantes, reportes y documentos.', fields: [{ k: 'ruc', label: 'RUC', mono: true }, { k: 'razon', label: 'Razón social' }, { k: 'dir', label: 'Dirección fiscal', wide: true }, { k: 'moneda', label: 'Moneda base', type: 'select', options: ['Soles (PEN)', 'Dólares (USD)'] }, { k: 'zona', label: 'Zona horaria', type: 'select', options: ['America/Lima (UTC−5)'] }] },
  { title: 'Comprobantes electrónicos', desc: 'Series autorizadas por SUNAT y envío automático de comprobantes.', fields: [{ k: 'sf', label: 'Serie de facturas', mono: true }, { k: 'sb', label: 'Serie de boletas', mono: true }, { k: 'sg', label: 'Serie de guías de remisión', mono: true }, { k: 'snc', label: 'Serie de notas de crédito', mono: true }, { k: 'auto', label: 'Envío a SUNAT', type: 'toggle', hint: 'Enviar automáticamente al emitir' }, { k: 'mail', label: 'Correo al cliente', type: 'toggle', hint: 'Adjuntar PDF y XML por correo' }] },
  { title: 'Impuestos y precios', desc: 'Cálculo del IGV y condiciones comerciales por defecto.', fields: [{ k: 'igv', label: 'Tasa de IGV', type: 'select', options: ['18%', '10% (MYPE restaurantes)', 'Exonerado'] }, { k: 'incl', label: 'Precios de lista', type: 'select', options: ['No incluyen IGV', 'Incluyen IGV'] }, { k: 'desc', label: 'Descuento máximo sin aprobación', type: 'select', options: ['5%', '10%', '15%'] }, { k: 'vcot', label: 'Validez de cotizaciones', type: 'select', options: ['7 días', '14 días', '30 días'] }] },
  { title: 'Tesorería', desc: 'Cuentas donde se registran cobros y pagos. Una por línea o separadas por comas.', fields: [{ k: 'cuentas', label: 'Cuentas bancarias', wide: true, hint: 'Ej. BCP · 191-2345678, Interbank · 200-3011' }] },
  { title: 'Inventario', desc: 'Reglas de valorización y control de stock.', fields: [{ k: 'cost', label: 'Método de costeo', type: 'select', options: ['Promedio ponderado móvil'] }, { k: 'almdef', label: 'Almacén por defecto', type: 'select', options: d => { const a = d.records.almacenes.map(x => String(x.nombre)); return a.length ? a : ['Almacén principal']; } }, { k: 'neg', label: 'Stock negativo', type: 'toggle', hint: 'Permitir despachar sin stock' }, { k: 'alert', label: 'Alertas de reposición', type: 'toggle', hint: 'Avisar al llegar al stock mínimo' }] },
  { title: 'Seguridad', desc: 'Políticas de acceso aplicadas a todos los usuarios.', fields: [{ k: 'ses', label: 'Duración de la sesión', type: 'select', options: ['4 horas', '8 horas', '12 horas'] }, { k: 'int', label: 'Intentos antes de bloquear', type: 'select', options: ['3', '5', '10'] }, { k: 'mfa', label: 'Verificación en 2 pasos', type: 'toggle', hint: 'Obligatoria para Gerente y Administrador' }, { k: 'aud', label: 'Retención de auditoría', type: 'select', options: ['1 año', '5 años', '10 años'] }] },
  { title: 'Apariencia', desc: 'Preferencia visual para tu usuario.', fields: [{ k: 'theme', label: 'Tema', type: 'select', options: ['Oscuro', 'Claro'] }, { k: 'dens', label: 'Densidad de tablas', type: 'select', options: ['Cómoda', 'Compacta'] }] },
];

export const DEFAULT_SETTINGS: Settings = {
  ruc: '20601987451', razon: 'Comercializadora Andina de Materiales S.A.C.', dir: 'Av. Argentina 1820, Cercado de Lima, Lima', moneda: 'Soles (PEN)', zona: 'America/Lima (UTC−5)',
  sf: 'F001', sb: 'B001', sg: 'T001', snc: 'FC01', auto: true, mail: true,
  igv: '18%', incl: 'No incluyen IGV', desc: '5%', vcot: '14 días',
  cuentas: 'BCP · 191-2345678, Interbank · 200-3011, BBVA · 0011-0245',
  cost: 'Promedio ponderado móvil', almdef: 'Almacén Lima', neg: false, alert: true,
  ses: '8 horas', int: '5', mfa: true, aud: '5 años', dens: 'Cómoda',
};
