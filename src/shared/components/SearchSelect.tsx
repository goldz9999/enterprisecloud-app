import { useEffect, useMemo, useRef, useState } from 'react';
import './SearchSelect.css';

export interface SearchSelectOption {
    value: string;
    label: string;
    /** Texto secundario a la derecha (p. ej. tipo de vehículo). */
    hint?: string;
}

interface Props {
    value: string;
    options: SearchSelectOption[];
    onChange: (value: string) => void;
    placeholder?: string;
    /** Muestra el texto en monoespaciado (placas, códigos). */
    mono?: boolean;
    ariaLabel?: string;
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Select con buscador: se escribe directamente en el campo para filtrar.
 * Flechas ↑/↓ para moverse, Enter para elegir, Esc para cerrar.
 */
export function SearchSelect({ value, options, onChange, placeholder = 'Elige…', mono, ariaLabel }: Props) {
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState('');
    const [active, setActive] = useState(0);
    const rootRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLUListElement>(null);
    const current = options.find(o => o.value === value);

    const matches = useMemo(() => {
        const tokens = norm(q).split(/\s+/).filter(Boolean);
        return tokens.length ? options.filter(o => tokens.every(t => norm(`${o.label} ${o.hint ?? ''}`).includes(t))) : options;
    }, [q, options]);

    // Cierra al hacer clic fuera.
    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            if (!rootRef.current?.contains(e.target as Node)) close();
        };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [open]);

    useEffect(() => {
        if (open) listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
    }, [active, open, q]);

    const openList = () => {
        if (open) return;
        setOpen(true);
        setQ('');
        setActive(Math.max(0, options.findIndex(o => o.value === value)));
    };
    const close = () => {
        setOpen(false);
        setQ('');
    };
    const pick = (v: string) => {
        onChange(v);
        close();
        inputRef.current?.blur();
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); if (!open) openList(); else setActive(i => Math.min(i + 1, matches.length - 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(i - 1, 0)); }
        else if (e.key === 'Enter') { e.preventDefault(); const o = matches[active]; if (open && o) pick(o.value); else openList(); }
        else if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); close(); }
        else if (e.key === 'Tab') close();
    };

    const shown = open ? q : current ? current.label + (current.hint ? ` · ${current.hint}` : '') : '';

    return (
        <div ref={rootRef} className={'ss' + (open ? ' is-open' : '')}>
            <input
                ref={inputRef}
                className={'field__control ss__input' + (mono ? ' mono' : '')}
                role="combobox"
                aria-expanded={open}
                aria-autocomplete="list"
                aria-label={ariaLabel}
                autoComplete="off"
                value={shown}
                placeholder={open && current ? current.label : placeholder}
                onFocus={openList}
                onClick={openList}
                onChange={e => { if (!open) setOpen(true); setQ(e.target.value); setActive(0); }}
                onKeyDown={onKeyDown}
            />
            <span className="ss__caret" aria-hidden="true">▾</span>
            {open && (
                <ul ref={listRef} className="ss__list" role="listbox">
                    {matches.length === 0 ? (
                        <li className="ss__empty">Sin resultados para «{q}»</li>
                    ) : (
                        matches.map((o, i) => (
                            <li
                                key={o.value}
                                role="option"
                                aria-selected={o.value === value}
                                data-active={i === active}
                                className={'ss__item' + (i === active ? ' is-active' : '') + (o.value === value ? ' is-current' : '')}
                                onMouseEnter={() => setActive(i)}
                                onMouseDown={e => e.preventDefault()}
                                onClick={() => pick(o.value)}
                            >
                                <span className={mono ? 'mono' : undefined}>{o.label}</span>
                                {o.hint && <small>{o.hint}</small>}
                            </li>
                        ))
                    )}
                </ul>
            )}
        </div>
    );
}