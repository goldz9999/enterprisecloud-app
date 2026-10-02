import { formatMoney as fmtM } from '../../lib/format';
import type { RecordsConfig } from '../../features/records/types';

export const cuentasPorPagar: RecordsConfig = {
  active: 'Cuentas por pagar',
  title: 'Cuentas por pagar',
  subtitle: 'Obligaciones con proveedores, generadas al registrar sus facturas. Se cierran al registrar el pago.',
  breadcrumb: [{ label: 'Inicio', to: '/' }, { label: 'Finanzas' }, { label: 'Cuentas por pagar' }],
  entity: 'Cuenta por pagar', titleKey: 'doc', subKey: 'prov', statusKey: 'estado',
  statuses: { 'Por vencer': 'blue', 'Vence esta semana': 'amber', 'Vencida': 'red', 'Pagada': 'green' },
  keys: ['doc','emision','prov','ruc','vence','total','saldo','estado','dias'],
  kpis: rows => {
    const open = rows.filter(r => r.estado !== 'Pagada');
    const sum = (list: typeof rows) => list.reduce((a, r) => a + Number(r.saldo), 0);
    return [
      { label: 'Saldo por pagar', value: fmtM(sum(open)), note: open.length + ' documentos abiertos' },
      { label: 'Vence esta semana', value: fmtM(sum(open.filter(r => r.estado === 'Vence esta semana'))), note: 'programar pagos', tone: 'amber' },
      { label: 'Vencido', value: fmtM(sum(open.filter(r => r.estado === 'Vencida'))), note: 'pagar a la brevedad', tone: 'red' },
    ];
  },
  columns: [{ k: 'doc', label: 'Factura', w: '120px', mono: true, sub: 'emision' }, { k: 'prov', label: 'Proveedor', w: 'minmax(0, 1fr)', sub: 'ruc' }, { k: 'vence', label: 'Vence', w: '120px', sub: 'dias' }, { k: 'saldo', label: 'Saldo', w: '116px', fmt: 'money', align: 'right' }, { k: 'estado', label: 'Estado', w: '136px', chip: true }],
  fields: [{ k: 'doc', label: 'Factura del proveedor', mono: true }, { k: 'emision', label: 'Emisión' }, { k: 'prov', label: 'Proveedor', wide: true }, { k: 'vence', label: 'Vencimiento' }, { k: 'dias', label: 'Situación' }, { k: 'total', label: 'Importe original', fmt: 'money' }, { k: 'saldo', label: 'Saldo pendiente', fmt: 'money' }],
  actions: { '*': [{ label: 'Registrar pago', to: 'Pagada', set: { saldo: 0, dias: 'pagada hoy' }, primary: true, toast: 'Pago registrado · cuenta cancelada' }, { label: 'Programar pago al vencimiento', toast: 'Pago programado' }], 'Pagada': [] },
  rows: [
    ['F002-08812','03 oct 2026','Aceros del Sur S.A.C.','20433221109','17 nov 2026',14393.64,14393.64,'Por vencer','vence en 46 días'],
    ['F001-22871','25 sep 2026','Cementos Pacasmayo Dist. S.A.','20419387658','05 oct 2026',6240,6240,'Vence esta semana','vence en 3 días'],
    ['E001-00918','22 sep 2026','EPP Seguridad Total S.A.C.','20566778899','06 oct 2026',2140.5,2140.5,'Vence esta semana','vence en 4 días'],
    ['F003-00412','10 sep 2026','Transportes Rápido Sur S.A.C.','20599911122','04 oct 2026',1086,1086,'Vence esta semana','vence en 2 días'],
    ['F001-04410','01 sep 2026','Pinturas Andinas S.A.','20288877766','01 oct 2026',6320,1000,'Vencida','1 día vencida'],
    ['F001-03392','28 ago 2026','Cables y Conductores Perú S.A.','20511199988','27 sep 2026',4880,0,'Pagada','pagada 26 sep'],
  ],
};
