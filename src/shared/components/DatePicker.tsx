import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface DatePickerProps {
    /** Fecha en formato AAAA-MM-DD. */
    value: string;
    onChange: (iso: string) => void;
    ariaLabel?: string;
}

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DIAS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa', 'Do'];

const pad = (n: number) => String(n).padStart(2, '0');
const toIso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
function parse(iso: string): { y: number; m: number; d: number } {
    const [y, m, d] = iso.split('-').map(Number);
    if (!y || !m || !d) {
        const t = new Date();
        return { y: t.getFullYear(), m: t.getMonth(), d: t.getDate() };
    }
    return { y, m: m - 1, d };
}

/**
 * Calendario propio (reemplaza al desplegable nativo, que el navegador dibuja sin borde ni sombra
 * y se confundía con el fondo en tema claro). Usa los colores del tema activo.
 */
export function DatePicker({ value, onChange, ariaLabel = 'Fecha' }: DatePickerProps) {
    const sel = parse(value);
    const [open, setOpen] = useState(false);
    const [view, setView] = useState({ y: sel.y, m: sel.m });
    const [pos, setPos] = useState({ top: 0, left: 0 });
    const btn = useRef<HTMLButtonElement>(null);
    const pop = useRef<HTMLDivElement>(null);

    const toggle = () => {
        if (!open) setView({ y: sel.y, m: sel.m });
        setOpen(o => !o);
    };

    // Posición bajo el botón (se ajusta para no salirse de la pantalla).
    useLayoutEffect(() => {
        if (!open || !btn.current) return;
        const r = btn.current.getBoundingClientRect();
        const w = 280;
        setPos({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) });
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            const t = e.target as Node;
            if (!pop.current?.contains(t) && !btn.current?.contains(t)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                setOpen(false);
                btn.current?.focus();
            }
        };
        const onScroll = () => setOpen(false);
        document.addEventListener('mousedown', onDown);
        window.addEventListener('keydown', onKey, true);
        window.addEventListener('resize', onScroll);
        return () => {
            document.removeEventListener('mousedown', onDown);
            window.removeEventListener('keydown', onKey, true);
            window.removeEventListener('resize', onScroll);
        };
    }, [open]);

    const shift = (delta: number) =>
        setView(v => {
            const d = new Date(v.y, v.m + delta, 1);
            return { y: d.getFullYear(), m: d.getMonth() };
        });

    // Semanas empezando en lunes, con días de los meses vecinos para completar.
    const first = new Date(view.y, view.m, 1);
    const lead = (first.getDay() + 6) % 7;
    const cells = Array.from({ length: 42 }, (_, i) => new Date(view.y, view.m, 1 - lead + i));
    const now = new Date();
    const todayIso = toIso(now.getFullYear(), now.getMonth(), now.getDate());
    const selIso = toIso(sel.y, sel.m, sel.d);

    const pick = (iso: string) => {
        onChange(iso);
        setOpen(false);
        btn.current?.focus();
    };

    return (
        <>
            <button ref={btn} type="button" className="dp-trigger" aria-label={ariaLabel} aria-haspopup="dialog" aria-expanded={open} onClick={toggle}>
                {`${pad(sel.d)}/${pad(sel.m + 1)}/${sel.y}`}
                <svg className="dp-trigger__chev" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
            </button>
            {open &&
                createPortal(
                    <div ref={pop} className="dp" role="dialog" aria-label="Elegir fecha" style={{ top: pos.top, left: pos.left }}>
                        <div className="dp__head">
                            <button type="button" className="dp__nav" aria-label="Mes anterior" onClick={() => shift(-1)}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
                            </button>
                            <div className="dp__title" key={`${view.y}-${view.m}`}>{MESES[view.m]} {view.y}</div>
                            <button type="button" className="dp__nav" aria-label="Mes siguiente" onClick={() => shift(1)}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
                            </button>
                        </div>
                        <div className="dp__grid dp__dow">{DIAS.map(d => <span key={d}>{d}</span>)}</div>
                        <div className="dp__grid" key={`${view.y}-${view.m}`}>
                            {cells.map(c => {
                                const iso = toIso(c.getFullYear(), c.getMonth(), c.getDate());
                                const cls = ['dp__day', c.getMonth() !== view.m && 'is-out', iso === todayIso && 'is-today', iso === selIso && 'is-sel'].filter(Boolean).join(' ');
                                return (
                                    <button key={iso} type="button" className={cls} aria-pressed={iso === selIso} onClick={() => pick(iso)}>
                                        {c.getDate()}
                                    </button>
                                );
                            })}
                        </div>
                        <div className="dp__foot">
                            <button type="button" className="dp__link" onClick={() => setView({ y: now.getFullYear(), m: now.getMonth() })}>Mes actual</button>
                            <button type="button" className="dp__link dp__link--strong" onClick={() => pick(todayIso)}>Hoy</button>
                        </div>
                    </div>,
                    document.body,
                )}
        </>
    );
}