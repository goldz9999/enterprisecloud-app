import type { OrderLine } from '../data/types';

/** Validation shared by every screen that saves lines. */
export function linesError(lines: OrderLine[]): string | undefined {
    if (!lines.length) return 'Agrega al menos un producto.';
    if (lines.some(l => !(l.qty > 0))) return 'Todas las cantidades deben ser mayores que cero.';
    if (new Set(lines.map(l => l.sku)).size !== lines.length) return 'Hay productos repetidos; junta sus cantidades en una sola línea.';
}