import type { RecordsConfig } from '../../features/records/types';

export const almacenes: RecordsConfig = {
  active: 'Almacenes',
  title: 'Almacenes',
  subtitle: 'Locales físicos y virtuales donde se guarda la mercadería. Se usan en despachos, recepciones y transferencias.',
  breadcrumb: [{ label: 'Inicio', to: '/' }, { label: 'Mantenimiento' }, { label: 'Almacenes' }],
  newLabel: 'Nuevo almacén',
  crud: true, entity: 'Almacén', titleKey: 'nombre', subKey: 'cod', statusKey: 'estado', newTitle: 'Nuevo almacén', newKicker: 'Mantenimiento · Almacenes', msgNew: 'Almacén creado', msgDel: 'Almacén eliminado',
  statuses: { 'Activo': 'green', 'Inactivo': 'muted' },
  keys: ['cod','nombre','dir','distrito','resp','tipo','prods','valor','estado'],
  defaults: n => ({ cod: 'ALM-' + String(4 + n).padStart(2, '0'), prods: 0, valor: 0 }),
  columns: [{ k: 'cod', label: 'Código', w: '80px', mono: true, muted: true }, { k: 'nombre', label: 'Almacén', w: 'minmax(0, 1fr)', sub: 'dir', bold: true }, { k: 'resp', label: 'Responsable', w: '124px', muted: true }, { k: 'tipo', label: 'Tipo', w: '100px', muted: true }, { k: 'valor', label: 'Valorizado', w: '116px', fmt: 'money', align: 'right' }, { k: 'estado', label: 'Estado', w: '96px', chip: true }],
  fields: [{ k: 'nombre', label: 'Nombre', required: true }, { k: 'tipo', label: 'Tipo', type: 'select', options: ['Principal', 'Secundario', 'Tránsito'] }, { k: 'dir', label: 'Dirección', wide: true }, { k: 'distrito', label: 'Distrito / ciudad' }, { k: 'resp', label: 'Responsable', type: 'select', options: ['Jorge Quispe', 'Carlos Huamán', '—'] }, { k: 'estado', label: 'Estado', type: 'select', options: ['Activo', 'Inactivo'] }],
  rows: [
    ['ALM-01','Almacén Lima','Av. Argentina 1820','Cercado de Lima','Jorge Quispe','Principal',312,112640,'Activo'],
    ['ALM-02','Almacén Callao','Av. Néstor Gambetta 5120','Callao','Carlos Huamán','Secundario',248,73780,'Activo'],
    ['ALM-03','Almacén en tránsito','Virtual · mercadería en traslado','—','Jorge Quispe','Tránsito',6,4260,'Activo'],
    ['ALM-04','Almacén Arequipa','Parque Industrial Mz. C Lt. 9','Arequipa','—','Secundario',0,0,'Inactivo'],
  ],
};
