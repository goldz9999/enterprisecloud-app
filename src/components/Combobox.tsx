import { useEffect, useMemo, useRef, useState } from 'react';
import './Combobox.css';

export interface ComboOption {
    value: string;
    label: string;
    /** Texto secundario a la derecha (p. ej. tipo de vehículo). */
    hint?: string;
}

interface Props {
    value: string;
    options: ComboOption[];
    onChange: (value: string) => void;
    placeholder?: string;
    mono?: boolean;
    ariaLabel?: string;
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Select con buscador: al hacer clic se escribe para filtrar; flechas + Enter para elegir. */
export function Combobox({ value, options, onChange, placeholder = 'Elegir…', mono, ariaLabel }: Props) {
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState('');
    const [active, setActive] = useState(0);
    const box = useRef<HTMLDivElement>(null);
    const list = useRef<HTMLUListElement>(null);
    const current = options.find(o => o.value === value);

    const matches = useMemo(() => {
        const t = norm(q).trim();
        return t ? options.filter(o => norm(`${o.label} ${o.hint ?? ''}`).includes(t)) : options;
    }, [q, options]);

    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [open]);

    useEffect(() => {
        list.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
    }, [active, open]);

    const openList = () => {
        setQ('');
        setActive(Math.max(0, options.findIndex(o => o.value === value)));
        setOpen(true);
    };
    const pick = (o: ComboOption) => {
        onChange(o.value);
        setOpen(false);
    };

    const onKeyDown = (e: React.KeyboardEvent) => {
        if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) { e.preventDefault(); openList(); return; }
        if (!open) return;
        if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(i + 1, matches.length - 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(i - 1, 0)); }
        else if (e.key === 'Enter') { e.preventDefault(); const o = matches[active]; if (o) pick(o); }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); }
        else if (e.key === 'Tab') setOpen(false);
    };

    return (
        <div ref={box} className={'cb' + (open ? ' is-open' : '')}>
            <input
                className={'field__control cb__input' + (mono ? ' mono' : '')}
                value={open ? q : current?.label ?? ''}
                placeholder={open ? 'Buscar…' : placeholder}
                onFocus={() => !open && openList()}
                onClick={() => !open && openList()}
                onChange={e => { setQ(e.target.value); setActive(0); if (!open) setOpen(true); }}
                onKeyDown={onKeyDown}
                aria-label={ariaLabel}
                role="combobox"
                aria-expanded={open}
                autoComplete="off"
            />
            <svg className="cb__chev" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
            {open && (
                <ul ref={list} className="cb__list" role="listbox">
                    {matches.length === 0 ? (
                        <li className="cb__empty">Sin coincidencias</li>
                    ) : matches.map((o, i) => (
                        <li
                            key={o.value}
                            role="option"
                            aria-selected={o.value === value}
                            data-active={i === active}
                            className={'cb__item' + (i === active ? ' is-active' : '') + (o.value === value ? ' is-current' : '') + (mono ? ' mono' : '')}
                            onMouseEnter={() => setActive(i)}
                            onMouseDown={e => e.preventDefault()}
                            onClick={() => pick(o)}
                        >
                            <span className="ellipsis">{o.label}</span>
                            {o.hint && <small>{o.hint}</small>}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}