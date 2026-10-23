import type { ComponentType } from 'react';
import { ComisionesPage } from './comisiones/ComisionesPage';
import { ConteoPage } from './conteo/ConteoPage';
import { EntregasPage } from './entregas/EntregasPage';
import { FlujoCajaPage } from './flujoCaja/FlujoCajaPage';
import { MetasPage } from './metas/MetasPage';
import { ReposicionPage } from './reposicion/ReposicionPage';

/** Pantalla de cada módulo opcional (el resto de su definición está en catalog.ts). */
export const MODULE_PAGES: Record<string, ComponentType> = {
    reposicion: ReposicionPage,
    flujoCaja: FlujoCajaPage,
    metas: MetasPage,
    comisiones: ComisionesPage,
    conteo: ConteoPage,
    entregas: EntregasPage,
};