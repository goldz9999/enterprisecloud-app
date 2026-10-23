import type { Domain } from '@/data/loadAll';
import { readModule, useModuleStore, writeModule } from './localStore';

/**
 * Módulos opcionales (solo frontend). Para agregar uno nuevo: crear su carpeta en src/modules/<id>/,
 * agregarlo aquí y su página en pages.tsx. El menú, la ruta, la carga de datos, el permiso y el
 * interruptor de Configuración salen de esta lista.
 *
 * Este archivo no importa páginas (eso va en pages.tsx) para que el menú y los permisos lo usen sin ciclos.
 */
export interface OptionalModule {
    id: string;
    /** Texto del menú y título de la pantalla. */
    label: string;
    path: string;
    /** Sección del documento de arquitectura (ERP AlvaPlast) que cubre. */
    section: string;
    /** Qué hace, para la tarjeta de Configuración. */
    desc: string;
    /** Permiso existente que se usa para «Ver» (no se crean permisos nuevos en el backend). */
    viewPerm: string;
    /** Permiso existente que se usa para guardar cambios en el módulo. */
    editPerm: [module: string, action: 'Crear' | 'Editar'];
    /** Datos del sistema que la pantalla necesita cargados. */
    needs: Domain[];
}

export const OPTIONAL_MODULES: OptionalModule[] = [
    {
        id: 'reposicion', label: 'Reposición sugerida', path: '/gestion/reposicion', section: '04 → 02 · Stock bajo mínimo',
        desc: 'Productos bajo su stock mínimo, cantidad sugerida y proveedor más barato. Crea la orden de compra ya llena.',
        viewPerm: 'Órdenes de compra', editPerm: ['Órdenes de compra', 'Crear'], needs: ['stock', 'purchases'],
    },
    {
        id: 'flujoCaja', label: 'Flujo de caja', path: '/gestion/flujo-caja', section: '05.3 · Flujo de caja',
        desc: 'Entradas (cuentas por cobrar) y salidas (cuentas por pagar) por semana, con saldo proyectado.',
        viewPerm: 'Cuentas por cobrar', editPerm: ['Caja', 'Editar'], needs: ['receivables', 'payables', 'cash', 'bank'],
    },
    {
        id: 'metas', label: 'Metas y ranking', path: '/gestion/metas', section: '08 · Metas y objetivos',
        desc: 'Metas mensuales por vendedor o categoría, con avance automático desde las ventas facturadas y ranking.',
        viewPerm: 'Reportes', editPerm: ['Configuración', 'Editar'], needs: ['sales', 'invoices', 'receivables'],
    },
    {
        id: 'comisiones', label: 'Comisiones', path: '/gestion/comisiones', section: '07 · Comisiones de vendedores',
        desc: 'Comisión por vendedor sobre las ventas cobradas, liquidación mensual y detalle por venta.',
        viewPerm: 'Reportes', editPerm: ['Configuración', 'Editar'], needs: ['sales', 'invoices', 'receivables'],
    },
    {
        id: 'conteo', label: 'Inventario físico', path: '/gestion/conteo', section: '04.6 · Inventario físico',
        desc: 'Conteo de un almacén contra el sistema, con diferencias valorizadas y exportación a Excel.',
        viewPerm: 'Ajustes', editPerm: ['Ajustes', 'Crear'], needs: ['stock'],
    },
    {
        id: 'entregas', label: 'Hoja de ruta', path: '/gestion/entregas', section: '06 · Logística y transporte',
        desc: 'Ventas despachadas del día agrupadas por vehículo y conductor, con confirmación de entrega.',
        viewPerm: 'Órdenes de venta', editPerm: ['Órdenes de venta', 'Editar'], needs: ['sales'],
    },
];

/** Interruptores de Configuración. Por defecto todos encendidos. */
export const isEnabled = (id: string) => readModule<Record<string, boolean>>('activos', {})[id] !== false;

export function setEnabled(id: string, on: boolean) {
    writeModule('activos', { ...readModule<Record<string, boolean>>('activos', {}), [id]: on });
}

export const enabledModules = () => OPTIONAL_MODULES.filter(m => isEnabled(m.id));

export const moduleByLabel = (label: string) => OPTIONAL_MODULES.find(m => m.label === label);

/**
 * Suscribe el componente a los interruptores: al encender o apagar un módulo, el menú, el buscador y las rutas
 * se vuelven a pintar al instante (sin recargar la página). Devuelve el estado actual de los interruptores.
 */
export const useModuleSwitches = () => useModuleStore<Record<string, boolean>>('activos', {})[0];