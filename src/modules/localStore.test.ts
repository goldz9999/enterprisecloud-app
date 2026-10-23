// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { moduleKey, readModule, resetModuleCache, writeModule } from './localStore';

describe('localStore', () => {
    beforeEach(() => {
        localStorage.clear();
        resetModuleCache();
    });
    it('usa una clave versionada por módulo', () => {
        expect(moduleKey('metas')).toBe('ec-mod-metas-v1');
    });
    it('devuelve el valor por defecto si no hay nada guardado o está corrupto', () => {
        expect(readModule('metas', { items: [] })).toEqual({ items: [] });
        resetModuleCache();
        localStorage.setItem('ec-mod-metas-v1', '{malo');
        expect(readModule('metas', { items: [] })).toEqual({ items: [] });
    });
    it('guarda y vuelve a leer, también tras olvidar la caché', () => {
        writeModule('metas', { items: [1] });
        expect(readModule('metas', { items: [] })).toEqual({ items: [1] });
        resetModuleCache();
        expect(readModule('metas', { items: [] })).toEqual({ items: [1] });
    });
});