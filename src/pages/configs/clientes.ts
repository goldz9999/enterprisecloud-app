import { opts } from './shared';
import type { RecordsConfig } from '../../features/records/types';

export const clientes: RecordsConfig = {
  active: 'Clientes',
  title: 'Clientes',
  subtitle: 'Registro maestro de clientes. Se usan al crear cotizaciones, órdenes de venta y comprobantes.',
  breadcrumb: [{ label: 'Inicio', to: '/' }, { label: 'Mantenimiento' }, { label: 'Clientes' }],
  newLabel: 'Nuevo cliente',
  crud: true, entity: 'Cliente', titleKey: 'razon', subKey: 'cod', statusKey: 'estado', newTitle: 'Nuevo cliente', newKicker: 'Mantenimiento · Clientes', msgNew: 'Cliente creado', msgDel: 'Cliente eliminado',
  statuses: { 'Activo': 'green', 'Inactivo': 'muted' },
  keys: ['cod','razon','tdoc','ndoc','contacto','tel','correo','dir','cond','linea','vend','estado'],
  collection: 'clientes',
  code: { key: 'cod', prefix: 'CLI-', width: 6 },
  canDelete: (row, d) => {
    if (d.orders.some(o => o.kind === 'venta' && o.party.name === row.razon) || d.records.cxc.some(r => r.cliente === row.razon))
      return 'Este cliente tiene órdenes o comprobantes registrados. Márcalo como Inactivo para conservar el historial.';
  },
  columns: [{ k: 'cod', label: 'Código', w: '100px', mono: true, muted: true }, { k: 'razon', label: 'Razón social / nombre', w: 'minmax(0, 1.4fr)', sub: 'ndoc', bold: true }, { k: 'contacto', label: 'Contacto', w: 'minmax(0, 1fr)', sub: 'tel' }, { k: 'cond', label: 'Condición', w: '116px', muted: true }, { k: 'linea', label: 'Línea crédito', w: '112px', fmt: 'money', align: 'right' }, { k: 'estado', label: 'Estado', w: '96px', chip: true }],
  fields: [{ k: 'tdoc', label: 'Tipo de documento', type: 'select', options: ['RUC', 'DNI', 'CE'] }, { k: 'ndoc', label: 'N.º de documento', required: true, placeholder: '11 dígitos para RUC' }, { k: 'razon', label: 'Razón social / nombre', required: true, wide: true }, { k: 'dir', label: 'Dirección fiscal', wide: true }, { k: 'contacto', label: 'Persona de contacto' }, { k: 'tel', label: 'Teléfono' }, { k: 'correo', label: 'Correo para comprobantes', wide: true }, { k: 'cond', label: 'Condición de pago', type: 'select', options: ['Contado', 'Crédito 15 días', 'Crédito 30 días', 'Crédito 45 días'] }, { k: 'linea', label: 'Línea de crédito (S/)', type: 'number', fmt: 'money' }, { k: 'vend', label: 'Vendedor asignado', type: 'select', options: opts.usersWithRole('Ventas') }, { k: 'estado', label: 'Estado', type: 'select', options: ['Activo', 'Inactivo'] }],
  note: 'Un cliente con órdenes o comprobantes registrados no se elimina: se marca como Inactivo para conservar el historial.',
  rows: [
    ['CLI-000245','Constructora Pacífico E.I.R.L.','RUC','20601122334','Ing. Pedro Salas','987 654 321','compras@constructorapacifico.pe','Av. Los Constructores 1450, Chorrillos','Crédito 30 días',40000,'Luis Paredes','Activo'],
    ['CLI-000318','Minera Los Andes S.A.','RUC','20100987652','Lic. Carmen Ríos','984 221 077','logistica@mineraandes.pe','Av. Javier Prado Este 4200, Surco','Crédito 45 días',120000,'Luis Paredes','Activo'],
    ['CLI-000112','Distribuidora Andina S.A.C.','RUC','20512345671','Raúl Gutiérrez','991 330 412','compras@distandina.pe','Jr. Huallaga 380, Cercado de Lima','Crédito 30 días',60000,'María Rojas','Activo'],
    ['CLI-000207','Textil Arequipa S.R.L.','RUC','20455667788','Patricia Zegarra','959 118 224','pzegarra@textilaqp.pe','Parque Industrial Mz. B Lt. 4, Arequipa','Crédito 30 días',25000,'María Rojas','Activo'],
    ['CLI-000189','Farmacias Salud Total S.A.C.','RUC','20488776651','Diego Paz','976 552 019','dpaz@saludtotal.pe','Av. Arequipa 2450, Lince','Crédito 15 días',15000,'Luis Paredes','Activo'],
    ['CLI-000231','Agroexportadora Ica S.A.C.','RUC','20577889900','Ing. Marco Huertas','956 701 338','mhuertas@agroica.pe','Panamericana Sur Km 302, Ica','Contado',0,'Luis Paredes','Activo'],
    ['CLI-000154','Inversiones Cusco Plaza S.A.C.','RUC','20522334455','Elena Quispe','984 660 120','equispe@cuscoplaza.pe','Av. El Sol 820, Cusco','Contado',0,'María Rojas','Inactivo'],
    ['CLI-000176','Comercial Norte Trujillo S.A.','RUC','20399887766','Gustavo Arana','944 118 302','compras@comercialnorte.pe','Av. España 1450, Trujillo','Crédito 30 días',30000,'Luis Paredes','Activo'],
    ['CLI-000221','Ferretería El Constructor E.I.R.L.','RUC','20611223344','Rosa Huamaní','966 402 118','ventas@elconstructor.pe','Av. Túpac Amaru 3210, Comas','Crédito 15 días',10000,'María Rojas','Activo'],
    ['CLI-000265','Clínica San Gabriel S.A.','RUC','20144556677','Dra. Lucía Ferro','981 554 210','logistica@clinicasangabriel.pe','Av. La Marina 2240, San Miguel','Crédito 30 días',20000,'María Rojas','Activo'],
    ['CLI-000301','Juan Carlos Mendoza','DNI','41827364','Juan Carlos Mendoza','999 120 334','jcmendoza@gmail.com','Calle Los Pinos 145, San Borja','Contado',0,'María Rojas','Activo'],
  ],
};
