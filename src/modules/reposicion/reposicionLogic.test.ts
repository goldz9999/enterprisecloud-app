import { describe, expect, it } from 'vitest';
import { suggestRestock } from './reposicionLogic';

const stock = [
    { sku: 'CEM-001', prod: 'Cemento', alm: 'Almacén Central Lurín', stock: 50, res: 10, min: 200 },
    { sku: 'GAS-010', prod: 'Codo', alm: 'Almacén Central Lurín', stock: 500, res: 0, min: 200 },
    { sku: 'PIN-010', prod: 'Pintura', alm: 'Tienda Comas', stock: 0, res: 0, min: 0 },
];
const prices = [
    { prov: 'Cementos Andinos', prod: 'CEM-001', costo: 27.42, estado: 'Activo' },
    { prov: 'Ladrillera', prod: 'CEM-001', costo: 28.73, estado: 'Activo' },
    { prov: 'Barato pero inactivo', prod: 'CEM-001', costo: 1, estado: 'Inactivo' },
];

describe('suggestRestock', () => {
    it('solo trae lo que está bajo el mínimo (disponible = stock − reservado; sin mínimo no cuenta)', () => {
        expect(suggestRestock(stock, prices).map(x => x.sku)).toEqual(['CEM-001']);
    });
    it('sugiere llegar al doble del mínimo y elige el proveedor activo más barato', () => {
        const [x] = suggestRestock(stock, prices, { 'CEM-001': 'Bolsa' });
        expect(x.available).toBe(40);
        expect(x.suggested).toBe(360);
        expect(x.unit).toBe('Bolsa');
        expect(x.supplier).toBe('Cementos Andinos');
        expect(x.cost).toBe(27.42);
        expect(x.amount).toBeCloseTo(9871.2);
    });
    it('encuentra el proveedor con el formato del sistema (sku = código, prod = nombre)', () => {
        const sys = [{ prov: 'Tubosistemas Perú S.A.', prod: 'Cemento', sku: 'CEM-001', costo: 0.99, estado: 'Activo' }];
        const [x] = suggestRestock(stock, sys);
        expect(x.supplier).toBe('Tubosistemas Perú S.A.');
        expect(x.cost).toBe(0.99);
    });
    it('sin proveedor registrado deja el proveedor vacío e importe 0', () => {
        const [x] = suggestRestock(stock, []);
        expect(x.supplier).toBe('');
        expect(x.amount).toBe(0);
    });
});