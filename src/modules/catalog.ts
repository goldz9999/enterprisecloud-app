import { useSyncExternalStore } from 'react';
import type { Domain } from '@/data/loadAll';
import { api } from '@/shared/lib/api';

/**
 * Módulos opcionales de Gestión. Para agregar uno nuevo: crear su carpeta en src/modules/<id>/,
 * agregarlo aquí y su página en pages.tsx (y su id en MODULE_IDS de app/services/gestion.py en el backend).
 * El menú, la ruta, la carga de datos, el permiso y el interruptor de Configuración salen de esta lista.
 * Los datos propios de cada módulo se guardan en el backend (ver gestionApi.ts).
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

/**
 * Interruptores de Configuración › Módulos opcionales. Se guardan en el backend (valen para todos los usuarios).
 * Mientras no se hayan leído, todos cuentan como encendidos (así una recarga sobre /gestion/... no cae al inicio).
 */
let switches: Record<string, boolean> = {};
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
    listeners.add(l);
    return () => {
        listeners.delete(l);
    };
};
const publish = (next: Record<string, boolean>) => {
    switches = next;
    listeners.forEach(l => l());
};

export const isEnabled = (id: string) => switches[id] !== false;

/** Lee los interruptores del servidor (al iniciar sesión y cuando otra persona los cambia). */
export async function loadSwitches(): Promise<void> {
    try {
        publish((await api<{ switches: Record<string, boolean> }>('/module-switches')).switches);
    } catch {
        // sin conexión o sin sesión: se conserva lo último que se leyó
    }
}

/** Enciende o apaga un módulo para todos. Lanza ApiError si el servidor lo rechaza (p. ej. sin permiso). */
export async function setEnabled(id: string, on: boolean): Promise<void> {
    publish((await api<{ switches: Record<string, boolean> }>(`/module-switches/${id}`, { method: 'PUT', body: { enabled: on } })).switches);
}

export const enabledModules = () => OPTIONAL_MODULES.filter(m => isEnabled(m.id));

export const moduleByLabel = (label: string) => OPTIONAL_MODULES.find(m => m.label === label);

/**
 * Suscribe el componente a los interruptores: al encender o apagar un módulo, el menú, el buscador y las rutas
 * se vuelven a pintar al instante (sin recargar la página). Devuelve el estado actual de los interruptores.
 */
export const useModuleSwitches = () => useSyncExternalStore(subscribe, () => switches);