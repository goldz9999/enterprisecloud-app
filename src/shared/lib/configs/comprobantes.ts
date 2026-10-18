import type { RecordsConfig } from '@/shared/components/records/types';
import { setInvoiceTaxStatusRemote, voidInvoiceRemote } from '@/data/domain/invoices';
import { parseDate } from '@/lib/dates';
import { formatMoney } from '@/lib/format';

export const comprobantes: RecordsConfig = {
  active: 'Comprobantes',
  title: 'Comprobantes',
  subtitle: 'Facturas, boletas y notas de crédito electrónicas emitidas a partir de las órdenes de venta.',
  breadcrumb: [{ label: 'Inicio', to: '/' }, { label: 'Ventas' }, { label: 'Comprobantes' }],
  collection: 'comprobantes',
  entity: 'Comprobante electrónico', titleKey: 'num', subKey: 'cliente', statusKey: 'sunat',
  statuses: { 'Aceptado': 'green', 'Pendiente': 'amber', 'Rechazado': 'red', 'Anulado': 'muted' },
  keys: ['num', 'tipo', 'cliente', 'ruc', 'emision', 'vence', 'total', 'sunat', 'orden'],
  kpis: rows => {
    const now = new Date();
    const month = rows.filter(r => {
      const t = parseDate(String(r.emision));
      return t && t.getMonth() === now.getMonth() && t.getFullYear() === now.getFullYear() && r.sunat !== 'Anulado';
    });
    return [
      { label: 'Emitidos en el mes', value: String(month.length), note: formatMoney(month.reduce((a, r) => a + Number(r.total), 0)) + ' facturado' },
      { label: 'Pendientes SUNAT', value: String(rows.filter(r => r.sunat === 'Pendiente').length), note: 'por enviar o sin respuesta', tone: 'amber' },
      { label: 'Rechazados', value: String(rows.filter(r => r.sunat === 'Rechazado').length), note: 'requieren corrección', tone: 'red' },
    ];
  },
  columns: [{ k: 'num', label: 'Comprobante', w: '120px', mono: true, sub: 'tipo' }, { k: 'cliente', label: 'Cliente', w: 'minmax(0, 1fr)', sub: 'ruc' }, { k: 'emision', label: 'Emisión', w: '96px', muted: true, mono: true }, { k: 'total', label: 'Total', w: '116px', fmt: 'money', align: 'right' }, { k: 'sunat', label: 'Estado SUNAT', w: '116px', chip: true }],
  fields: [{ k: 'tipo', label: 'Tipo' }, { k: 'num', label: 'Serie y número', mono: true }, { k: 'cliente', label: 'Cliente', wide: true }, { k: 'ruc', label: 'RUC / DNI', mono: true }, { k: 'orden', label: 'Orden de origen', mono: true }, { k: 'emision', label: 'Emisión' }, { k: 'vence', label: 'Vencimiento' }, { k: 'total', label: 'Total (inc. IGV)', fmt: 'money' }, { k: 'sunat', label: 'Estado SUNAT' }],
  notes: { 'Pendiente': 'SUNAT aún no confirma la recepción. Reenvíalo para registrar la aceptación.', 'Rechazado': 'SUNAT rechazó el comprobante: el RUC del receptor no coincide con la razón social. Corrige los datos del cliente en Mantenimiento.', 'Anulado': 'Comprobante anulado mediante nota de crédito. Su cuenta por cobrar quedó cancelada.' },
  actions: {
    'Pendiente': [{
      label: 'Reenviar a SUNAT', to: 'Aceptado', primary: true, toast: 'Comprobante aceptado por SUNAT',
      run: (_d, r) => {
        void setInvoiceTaxStatusRemote(Number(r._id), 'Aceptado').then(res => {
          if (!res.ok) console.error(res.error);
        });
      },
    }],
    'Aceptado': [
      { label: 'Descargar PDF y XML', href: r => `/documentos?q=${encodeURIComponent(String(r.num))}` },
      {
        label: 'Anular con nota de crédito', to: 'Anulado', danger: true, toast: 'Nota de crédito emitida · cuenta por cobrar cancelada',
        fields: [{ k: 'motivo', label: 'Motivo de la anulación', required: true, wide: true, placeholder: 'Ej. Error en la razón social' }],
        run: (_d, r, v) => {
          if (r.tipo === 'Nota de crédito') return 'Una nota de crédito no se anula con otra nota de crédito.';
          void voidInvoiceRemote(Number(r._id), String(v.motivo || '')).then(res => {
            if (!res.ok) console.error(res.error);
          });
        },
      },
    ],
    'Rechazado': [{
      label: 'Corregir y reenviar', to: 'Pendiente', primary: true, toast: 'Comprobante reenviado a SUNAT',
      run: (_d, r) => {
        void setInvoiceTaxStatusRemote(Number(r._id), 'Pendiente').then(res => {
          if (!res.ok) console.error(res.error);
        });
      },
    }],
  },
};
