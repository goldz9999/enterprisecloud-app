import type { RecordsConfig } from '../../features/records/types';

export const vehiculos: RecordsConfig = {
    active: 'Vehículos',
    title: 'Vehículos',
    subtitle: 'Flota propia y de transportistas. Al asignar conductor, se autocompletará en el formulario de despacho.',
    breadcrumb: [{ label: 'Inicio', to: '/' }, { label: 'Mantenimiento' }, { label: 'Vehículos' }],
    newLabel: 'Nuevo vehículo',
    crud: true, entity: 'Vehículo', titleKey: 'placa', subKey: 'tipo', statusKey: 'estado',
    newTitle: 'Nuevo vehículo', newKicker: 'Mantenimiento · Vehículos', msgNew: 'Vehículo registrado', msgDel: 'Vehículo eliminado',
    statuses: { 'Activo': 'green', 'Inactivo': 'muted' },
    collection: 'vehiculos',
    keys: ['placa', 'tipo', 'marca', 'modelo', 'capacidad', 'empresa', 'conductor_cod', 'conductor', 'estado'],
    columns: [
        { k: 'placa', label: 'Placa', w: '90px', mono: true, bold: true },
        { k: 'tipo', label: 'Tipo', w: '110px', muted: true },
        { k: 'marca', label: 'Marca / Modelo', w: 'minmax(0,1fr)', sub: 'modelo' },
        { k: 'capacidad', label: 'Capacidad', w: '100px', muted: true },
        { k: 'empresa', label: 'Empresa', w: 'minmax(0,1fr)', muted: true },
        { k: 'conductor', label: 'Conductor asignado', w: 'minmax(0,1fr)', muted: true },
        { k: 'estado', label: 'Estado', w: '90px', chip: true },
    ],
    fields: [
        { k: 'placa', label: 'Placa', required: true, mono: true, placeholder: 'Ej. F4Q-728' },
        { k: 'tipo', label: 'Tipo de vehículo', type: 'select', options: ['Camión', 'Camioneta', 'Furgón', 'Remolque', 'Semirremolque', 'Motofurgón'] },
        { k: 'marca', label: 'Marca', placeholder: 'Ej. Mercedes-Benz' },
        { k: 'modelo', label: 'Modelo', placeholder: 'Ej. Atego 1726' },
        { k: 'capacidad', label: 'Capacidad de carga', placeholder: 'Ej. 10 Tn' },
        {
            k: 'empresa', label: 'Empresa / Propietario', type: 'select',
            options: d => ['Movilidad propia', ...d.records.proveedores.filter(p => p.rubro === 'Transporte' && p.estado !== 'Inactivo').map(p => String(p.razon))]
        },
        {
            k: 'conductor', label: 'Conductor asignado', type: 'select',
            options: d => ['—', ...d.records.conductores.filter((c: any) => c.estado === 'Activo').map((c: any) => `${c.nombre} · ${c.dni}`)]
        },
        { k: 'estado', label: 'Estado', type: 'select', options: ['Activo', 'Inactivo'] },
    ],
    note: 'El conductor asignado es el habitual para este vehículo. Al seleccionar la placa en un despacho, se precarga automáticamente.',
    rows: [
        ['F4Q-728', 'Camión', 'Mercedes-Benz', 'Atego 1726', '10 Tn', 'Movilidad propia', 'CON-00001', 'Carlos Huamán Quispe · 45213387', 'Activo'],
        ['C3M-901', 'Camioneta', 'Toyota', 'Hilux 2.8', '1.5 Tn', 'Movilidad propia', 'CON-00003', 'Martín Ccopa Vargas · 41887632', 'Activo'],
        ['V8K-512', 'Camión', 'Volvo', 'FH 460', '18 Tn', 'Transportes Rápido Sur S.A.C.', 'CON-00002', 'Julio Ramos Pérez · 32109876', 'Activo'],
        ['T1P-344', 'Furgón', 'Hyundai', 'HD 78', '4 Tn', 'Transportes Rápido Sur S.A.C.', 'CON-00004', 'Roberto Salas Díaz · 28934512', 'Inactivo'],
    ],
};