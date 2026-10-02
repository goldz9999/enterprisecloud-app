import type { RecordsConfig } from '../../features/records/types';

export const proveedores: RecordsConfig = {
  active: 'Proveedores',
  title: 'Proveedores',
  subtitle: 'Registro maestro de proveedores. Se usan al crear órdenes de compra, recepciones y cuentas por pagar.',
  breadcrumb: [{ label: 'Inicio', to: '/' }, { label: 'Mantenimiento' }, { label: 'Proveedores' }],
  newLabel: 'Nuevo proveedor',
  crud: true, entity: 'Proveedor', titleKey: 'razon', subKey: 'cod', statusKey: 'estado', newTitle: 'Nuevo proveedor', newKicker: 'Mantenimiento · Proveedores', msgNew: 'Proveedor creado', msgDel: 'Proveedor eliminado',
  statuses: { 'Activo': 'green', 'Inactivo': 'muted' },
  keys: ['cod','razon','ruc','contacto','tel','correo','dir','rubro','cond','cuenta','estado'],
  defaults: n => ({ cod: 'PRV-' + String(150 + n).padStart(6, '0') }),
  columns: [{ k: 'cod', label: 'Código', w: '100px', mono: true, muted: true }, { k: 'razon', label: 'Razón social', w: 'minmax(0, 1.4fr)', sub: 'ruc', bold: true }, { k: 'contacto', label: 'Contacto', w: 'minmax(0, 1fr)', sub: 'tel' }, { k: 'rubro', label: 'Rubro', w: '112px', muted: true }, { k: 'cond', label: 'Condición', w: '116px', muted: true }, { k: 'estado', label: 'Estado', w: '96px', chip: true }],
  fields: [{ k: 'ruc', label: 'RUC', required: true, placeholder: '11 dígitos' }, { k: 'rubro', label: 'Rubro', type: 'select', options: ['Acero y fierro', 'Cemento', 'Tubería PVC', 'EPP', 'Acabados', 'Eléctricos', 'Transporte'] }, { k: 'razon', label: 'Razón social', required: true, wide: true }, { k: 'dir', label: 'Dirección', wide: true }, { k: 'contacto', label: 'Persona de contacto' }, { k: 'tel', label: 'Teléfono' }, { k: 'correo', label: 'Correo', wide: true }, { k: 'cond', label: 'Condición de pago', type: 'select', options: ['Contado', 'Crédito 15 días', 'Crédito 30 días', 'Crédito 45 días'] }, { k: 'cuenta', label: 'Cuenta bancaria', placeholder: 'Banco y número' }, { k: 'estado', label: 'Estado', type: 'select', options: ['Activo', 'Inactivo'] }],
  note: 'La cuenta bancaria se usa para los pagos desde Cuentas por pagar. Su cambio queda registrado en auditoría.',
  rows: [
    ['PRV-000142','Aceros del Sur S.A.C.','20433221109','Lic. Karina Vela','945 112 908','ventas@acerosdelsur.pe','Av. Industrial 2280, Ate','Acero y fierro','Crédito 45 días','Interbank 200-3088812201','Activo'],
    ['PRV-000118','Cementos Pacasmayo Dist. S.A.','20419387658','Óscar Linares','944 887 120','olinares@pacasmayodist.pe','Av. Argentina 3120, Callao','Cemento','Crédito 30 días','BCP 193-0045512','Activo'],
    ['PRV-000131','Plásticos Lima S.R.L.','20377766554','Mónica Sáenz','987 300 455','ventas@plasticoslima.pe','Jr. Las Industrias 455, SJL','Tubería PVC','Crédito 30 días','BBVA 0011-0388','Activo'],
    ['PRV-000150','EPP Seguridad Total S.A.C.','20566778899','Hugo Vílchez','965 441 290','hvilchez@epptotal.pe','Av. Colonial 1880, Cercado','EPP','Crédito 15 días','BCP 191-7781203','Activo'],
    ['PRV-000097','Pinturas Andinas S.A.','20288877766','Silvia Román','958 220 117','sroman@pinturasandinas.pe','Av. Universitaria 6000, Los Olivos','Acabados','Crédito 30 días','Interbank 200-1100245','Activo'],
    ['PRV-000104','Transportes Rápido Sur S.A.C.','20599911122','Julio Ramos','947 555 210','operaciones@rapidosur.pe','Av. Faucett 1290, Callao','Transporte','Crédito 15 días','BCP 191-5532018','Activo'],
    ['PRV-000088','Cables y Conductores Perú S.A.','20511199988','Ricardo Tello','946 008 331','rtello@cablesperu.pe','Av. Néstor Gambetta 7400, Callao','Eléctricos','Contado','BCP 194-2200871','Inactivo'],
  ],
};
