import { useEffect, useMemo, useRef, useState } from 'react';

interface Parsed {
    n: number;
    decimals: number;
    grouped: boolean;
    prefix: string;
    suffix: string;
}

/** Separa "S/ 12,345" en prefijo, número y sufijo. Si no hay un número claro, no se anima. */
function parse(text: string): Parsed | null {
    if (/\d,\d{1,2}(?!\d)/.test(text)) return null; // coma decimal: formato distinto, se muestra tal cual
    const m = /-?\d[\d,]*(?:\.\d+)?/.exec(text);
    if (!m) return null;
    const token = m[0];
    const n = Number(token.replace(/,/g, ''));
    if (!Number.isFinite(n)) return null;
    return {
        n,
        decimals: token.includes('.') ? token.split('.')[1].length : 0,
        grouped: token.includes(','),
        prefix: text.slice(0, m.index),
        suffix: text.slice(m.index + token.length),
    };
}

function render(p: Parsed, value: number) {
    const body = p.grouped
        ? value.toLocaleString('en-US', { minimumFractionDigits: p.decimals, maximumFractionDigits: p.decimals })
        : value.toFixed(p.decimals);
    return p.prefix + body + p.suffix;
}

const motionOk = () => !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Muestra un valor ya formateado ("S/ 12,345", "37.5%", "8") y lo hace subir desde 0 (o desde el valor anterior)
 * hasta el real. El texto final es siempre exactamente el que recibió.
 */
export function AnimatedValue({ text, duration = 900 }: { text: string; duration?: number }) {
    const parsed = useMemo(() => parse(text), [text]);
    const prev = useRef<number | null>(null);
    const [shown, setShown] = useState(() => (parsed && motionOk() ? render(parsed, 0) : text));

    useEffect(() => {
        if (!parsed || !motionOk()) {
            setShown(text);
            prev.current = parsed ? parsed.n : null;
            return;
        }
        const from = prev.current ?? 0;
        const to = parsed.n;
        prev.current = to;
        if (from === to) {
            setShown(text);
            return;
        }
        let raf = 0;
        const t0 = performance.now();
        const step = (t: number) => {
            const p = Math.min(1, (t - t0) / duration);
            const eased = 1 - Math.pow(1 - p, 3);
            setShown(p < 1 ? render(parsed, from + (to - from) * eased) : text);
            if (p < 1) raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
        return () => cancelAnimationFrame(raf);
    }, [text, parsed, duration]);

    return (
        <>
            <span aria-hidden="true">{shown}</span>
            <span className="sr-only">{text}</span>
        </>
    );
}