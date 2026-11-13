import { describe, expect, it } from 'vitest';
import { orderByNearest, pathAfter, pathMeters, pointAlong, type LatLng } from './geo';

const p = (code: string, ll: LatLng | null) => ({ code, ll });

describe('orderByNearest', () => {
    it('visita primero la parada más cercana y luego la más cercana a esa', () => {
        const almacen: LatLng = [-12.05, -77.05];
        const stops = [p('lejos', [-12.20, -77.05]), p('cerca', [-12.06, -77.05]), p('medio', [-12.10, -77.05])];
        expect(orderByNearest(almacen, stops).map(s => s.code)).toEqual(['cerca', 'medio', 'lejos']);
    });

    it('deja al final las paradas sin coordenadas', () => {
        const stops = [p('sin', null), p('b', [-12.10, -77.05]), p('a', [-12.06, -77.05])];
        expect(orderByNearest([-12.05, -77.05], stops).map(s => s.code)).toEqual(['a', 'b', 'sin']);
    });

    it('sin punto de partida empieza por la primera con coordenadas', () => {
        const stops = [p('x', [-12.0, -77.0]), p('y', [-12.5, -77.0]), p('z', [-12.1, -77.0])];
        expect(orderByNearest(null, stops).map(s => s.code)).toEqual(['x', 'z', 'y']);
    });
});

describe('pointAlong', () => {
    const path: LatLng[] = [[-12.0, -77.0], [-12.0, -77.01], [-12.01, -77.01]];
    it('empieza en el origen y termina en el destino', () => {
        expect(pointAlong(path, 0)).toEqual(path[0]);
        expect(pointAlong(path, pathMeters(path) + 50)).toEqual(path[2]);
    });
    it('a mitad del primer tramo queda entre sus dos puntos', () => {
        const half = pointAlong(path, pathMeters(path.slice(0, 2)) / 2);
        expect(half[0]).toBeCloseTo(-12.0, 6);
        expect(half[1]).toBeCloseTo(-77.005, 6);
    });
});

describe('pathAfter', () => {
    const path: LatLng[] = [[-12.0, -77.0], [-12.0, -77.01], [-12.01, -77.01]];
    it('sin avanzar es el recorrido completo', () => {
        expect(pathAfter(path, 0)).toEqual(path);
    });
    it('a mitad del primer tramo empieza en el vehículo y conserva lo que falta', () => {
        const rest = pathAfter(path, pathMeters(path.slice(0, 2)) / 2);
        expect(rest).toHaveLength(3);
        expect(rest[1]).toEqual(path[1]);
        expect(rest[0][1]).toBeCloseTo(-77.005, 6);
    });
    it('al llegar solo queda el destino', () => {
        expect(pathAfter(path, pathMeters(path) + 1)).toEqual([path[2]]);
    });
});
