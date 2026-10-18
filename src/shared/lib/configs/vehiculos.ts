import { carrierOptions } from '@/data/domain/carriers';
import { suggest } from '@/shared/lib/config-utils';
import type { RecordsConfig } from '@/shared/components/records/types';

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
        { k: 'tipo', label: 'Tipo de vehículo', placeholder: 'Ej. Camión', suggestions: suggest('vehiculos', 'tipo', ['Camión', 'Camioneta', 'Furgón', 'Remolque', 'Semirremolque', 'Motofurgón']) },
        { k: 'marca', label: 'Marca', placeholder: 'Ej. Mercedes-Benz' },
        { k: 'modelo', label: 'Modelo', placeholder: 'Ej. Atego 1726' },
        { k: 'capacidad', label: 'Capacidad de carga', placeholder: 'Ej. 10 Tn' },
        {
            k: 'empresa', label: 'Empresa / Propietario', type: 'select',
            options: carrierOptions
        },
        {
            k: 'conductor', label: 'Conductor asignado', type: 'select',
            options: d => ['—', ...d.records.conductores.filter((c: any) => c.estado === 'Activo').map((c: any) => `${c.nombre} · ${c.dni}`)]
        },
        { k: 'estado', label: 'Estado', type: 'select', options: ['Activo', 'Inactivo'] },
    ],
    note: 'El conductor asignado es el habitual para este vehículo. Al seleccionar la placa en un despacho, se precarga automáticamente. Para agregar una empresa transportista, regístrala en Mantenimiento › Proveedores con rubro "Transporte"; aparecerá en "Empresa / Propietario".',
};