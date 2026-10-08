import { createAdmin, deactivateAdmin, isAdminCollection, loadAdmin, updateAdmin, type AdminCollection } from './admin';
import { createMaster, deactivateMaster, isMaster, loadMasters, updateMaster, type Effects, type MasterCollection, type Result } from './masters';
import type { Value } from '../types';

/** Colecciones que se guardan en el backend (Supabase) en lugar de localStorage. */
export type RemoteCollection = MasterCollection | AdminCollection;

export const isRemote = (c: string | undefined): c is RemoteCollection => isMaster(c) || isAdminCollection(c);

export const loadRemote = (c: RemoteCollection): Promise<void> => (isMaster(c) ? loadMasters() : loadAdmin());

export const createRemote = (c: RemoteCollection, values: Record<string, Value>, effects?: Effects): Promise<Result> =>
    isMaster(c) ? createMaster(c, values, effects) : createAdmin(c, values, effects);

export const updateRemote = (c: RemoteCollection, id: number, values: Record<string, Value>, effects?: Effects): Promise<Result> =>
    isMaster(c) ? updateMaster(c, id, values, effects) : updateAdmin(c, id, values, effects);

export const deactivateRemote = (c: RemoteCollection, id: number, effects?: Effects): Promise<Result> =>
    isMaster(c) ? deactivateMaster(c, id, effects) : deactivateAdmin(c, id, effects);