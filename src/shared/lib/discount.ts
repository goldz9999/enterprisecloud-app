import type { OrderLine } from '@/data/types';

/** Redondeo a céntimos sin errores de coma flotante (1.005 → 1.01). */
export const cents = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Reparte un descuento global entre las líneas, en proporción al subtotal de cada una.
 * Devuelve las líneas con su precio unitario NETO (ya descontado), de modo que la suma de
 * cantidad × precio de todas las líneas sea exactamente `subtotal − descuento` al céntimo:
 * el céntimo que sobra por redondeo se asigna a las líneas con mayor parte decimal.
 */
export function distributeDiscount(lines: OrderLine[], discount: number): OrderLine[] {
    const gross = lines.reduce((a, l) => a + l.qty * l.price, 0);
    const d = cents(Math.min(Math.max(discount, 0), gross));
    if (!d || gross <= 0) return lines;
    // Importe neto de cada línea en céntimos, repartiendo los céntimos que sobran al redondear hacia abajo.
    const exact = lines.map(l => (l.qty * l.price * (gross - d) / gross) * 100);
    const base = exact.map(Math.floor);
    let left = Math.round((gross - d) * 100) - base.reduce((a, b) => a + b, 0);
    const order = exact.map((x, i) => [x - Math.floor(x), i] as const).sort((a, b) => b[0] - a[0]);
    for (const [, i] of order) {
        if (left <= 0) break;
        base[i] += 1;
        left -= 1;
    }
    return lines.map((l, i) => ({ ...l, price: l.qty > 0 ? Math.round((base[i] / 100 / l.qty) * 1e6) / 1e6 : l.price }));
}

/** Descuento en soles a partir de lo que escribió el usuario («S/» o «%»). */
export function discountAmount(gross: number, mode: 'amount' | 'pct', value: number): number {
    if (!(value > 0) || gross <= 0) return 0;
    return cents(mode === 'pct' ? gross * value / 100 : value);
}