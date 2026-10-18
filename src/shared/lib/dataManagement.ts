import { can } from '@/data/permissions';
import { currentUser, exportBackup } from '@/data/store';
import type { DB } from '@/data/types';
import { downloadBlob } from '@/shared/lib/csv';
import { isoDate } from '@/shared/lib/dates';

/** Who may wipe, restore or import the whole dataset. */
export function canManageData(d: DB): boolean {
    const role = currentUser(d).role;
    return role === 'Administrador' || role === 'Gerente' || can(d, 'Configuración', 'Editar');
}

export function downloadBackup() {
    downloadBlob(`enterprisecloud-respaldo-${isoDate(new Date())}.json`, new Blob([exportBackup()], { type: 'application/json' }));
}