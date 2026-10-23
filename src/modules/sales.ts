import type { OrderLine } from '@/data/types';

/**
 * Una venta ya reconocida (comprobante emitido y no anulado), con lo que necesitan Metas y Comisiones.
 * Se arma en salesData.ts con las mismas reglas que el Dashboard y Reportes, así las cifras cuadran.
 */
export interface SaleFact {
    code: string;
    seller: string;
    client: string;
    /** Fecha del comprobante. */
    at: Date;
    lines: OrderLine[];
    /** Subtotal sin IGV, ya con el descuento global repartido en los precios. */
    base: number;
    /** Cobrada por completo. */
    paid: boolean;
}

const monthOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

/** Ventas cuyo comprobante cae en el mes «YYYY-MM». */
export const inPeriod = (facts: SaleFact[], period: string) => facts.filter(f => monthOf(f.at) === period);