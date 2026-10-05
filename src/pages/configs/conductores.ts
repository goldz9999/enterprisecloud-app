import type { RecordsConfig } from '../../features/records/types';

export const conductores: RecordsConfig = {
    active: 'Conductores',
    title: 'Conductores',
    subtitle: 'Registro de conductores propios y de transportistas. Se usan al registrar despachos.',
    breadcrumb: [{ label: 'Inicio', to: '/' }, { label: 'Mantenimiento' }, { label: 'Conductores' }],
    newLabel: 'Nuevo conductor',
    crud: true, entity: 'Conductor', titleKey: 'nombre', subKey: 'dni', statusKey: 'estado',
    newTitle: 'Nuevo conductor', newKicker: 'Mantenimiento · Conductores', msgNew: 'Conductor registrado', msgDel: 'Conductor eliminado',
    statuses: { 'Activo': 'green', 'Inactivo': 'muted' },
    collection: 'conductores',
    keys: ['cod', 'nombre', 'dni', 'tel', 'licencia', 'categoria', 'empresa', 'estado'],
    code: { key: 'cod', prefix: 'CON-', width: 5 },
    columns: [
        { k: 'nombre', label: 'Nombre', w: 'minmax(0, 1.4fr)', sub: 'dni', bold: true },
        { k: 'licencia', label: 'Licencia', w: '110px', mono: true },
        { k: 'categoria', label: 'Categoría', w: '90px', muted: true },
        { k: 'empresa', label: 'Empresa', w: 'minmax(0, 1fr)', muted: true },
        { k: 'tel', label: 'Teléfono', w: '110px', muted: true },
        { k: 'estado', label: 'Estado', w: '90px', chip: true },
    ],
    fields: [
        { k: 'nombre', label: 'Nombre completo', required: true, wide: true },
        { k: 'dni', label: 'DNI', required: true, placeholder: '8 dígitos', mono: true },
        { k: 'licencia', label: 'N.º de licencia', required: true, mono: true, placeholder: 'Ej. Q03512345' },
        { k: 'categoria', label: 'Categoría de licencia', type: 'select', options: ['A-I', 'A-IIa', 'A-IIb', 'A-IIIa', 'A-IIIb', 'A-IIIc', 'B-I', 'B-IIa', 'B-IIb'] },
        { k: 'tel', label: 'Teléfono', placeholder: '9xx xxx xxx' },
        {
            k: 'empresa', label: 'Empresa / Transportista', type: 'select',
            options: d => ['Movilidad propia', ...d.records.proveedores.filter(p => p.rubro === 'Transporte' && p.estado !== 'Inactivo').map(p => String(p.razon))]
        },
        { k: 'estado', label: 'Estado', type: 'select', options: ['Activo', 'Inactivo'] },
    ],
    note: 'Los conductores con empresa "Movilidad propia" son empleados directos. Los demás pertenecen a transportistas registrados en Proveedores.',
    rows: [
        ['CON-00001', 'Carlos Huamán Quispe', '45213387', '947 221 088', 'Q03512345', 'A-IIIb', 'Movilidad propia', 'Activo'],
        ['CON-00002', 'Julio Ramos Pérez', '32109876', '951 334 220', 'Q07788123', 'A-IIIb', 'Transportes Rápido Sur S.A.C.', 'Activo'],
        ['CON-00003', 'Martín Ccopa Vargas', '41887632', '966 445 117', 'Q01234567', 'A-IIb', 'Movilidad propia', 'Activo'],
        ['CON-00004', 'Roberto Salas Díaz', '28934512', '970 112 334', 'Q09988123', 'A-IIIc', 'Transportes Rápido Sur S.A.C.', 'Inactivo'],
    ],
};