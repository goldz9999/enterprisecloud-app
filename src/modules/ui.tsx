import type { ReactNode } from 'react';
import { AppShell } from '@/shared/components/AppShell';
import { MES } from '@/shared/lib/dates';
import './modules.css';

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** «2026-10» → «octubre 2026». */
export const periodLabel = (p: string) => {
    const [y, m] = p.split('-').map(Number);
    return `${MESES[m - 1] ?? ''} ${y}`;
};

/** «2026-10-24» → «24 oct». */
export const shortDay = (iso: string) => {
    const [, m, d] = iso.split('-').map(Number);
    return `${String(d).padStart(2, '0')} ${MES[m - 1] ?? ''}`;
};

/** Marco común de las pantallas de Gestión: menú, migas, título, subtítulo, acciones y aviso de carga o error de lectura. */
export function ModulePage({ label, subtitle, actions, loading, error, onRetry, children }: {
    label: string;
    subtitle: string;
    actions?: ReactNode;
    /** Aún no llegaron los datos propios del módulo desde el servidor. */
    loading?: boolean;
    /** Mensaje si la última lectura falló. */
    error?: string;
    onRetry?: () => void;
    children: ReactNode;
}) {
    return (
        <AppShell active={label} breadcrumb={[{ label: 'Inicio', to: '/' }, { label: 'Gestión' }, { label }]}>
            <div className="page-head">
                <div>
                    <h1 className="page__title">{label}</h1>
                    <div className="page__subtitle">{subtitle}</div>
                </div>
                {actions && <div className="mod-actions">{actions}</div>}
            </div>
            {error ? (
                <div className="mod-hint" role="alert">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 8v4M12 16h.01" /></svg>
                    <span>{error}</span>
                    {onRetry && <button type="button" className="link-btn" style={{ marginLeft: 'auto' }} onClick={onRetry}>Reintentar</button>}
                </div>
            ) : loading ? (
                <div className="mod-copy"><span className="mod-copy__dot is-empty" /><span>Cargando datos del servidor…</span></div>
            ) : null}
            {children}
        </AppShell>
    );
}

export interface Col {
    label: string;
    w: string;
    right?: boolean;
}

/** Tabla con el mismo estilo que las listas del sistema. */
export function DataTable({ cols, rows, empty, foot }: { cols: Col[]; rows: ReactNode[][]; empty: ReactNode; foot?: ReactNode }) {
    const grid = cols.map(c => c.w).join(' ');
    return (
        <section className="table mod-table">
            <div className="table__row table__head" style={{ gridTemplateColumns: grid }}>
                {cols.map(c => <span key={c.label} style={{ textAlign: c.right ? 'right' : 'left' }}>{c.label}</span>)}
            </div>
            {rows.map((r, i) => (
                <div key={i} className="table__row table__body-row mod-row" style={{ gridTemplateColumns: grid }}>
                    {r.map((cell, j) => <div key={j} className={'mod-cell' + (cols[j]?.right ? ' t-right' : '')}>{cell}</div>)}
                </div>
            ))}
            {rows.length === 0 && <div className="table__empty mod-empty">{empty}</div>}
            {foot && <div className="mod-foot">{foot}</div>}
        </section>
    );
}

/** Selector de mes. */
export function PeriodSelect({ value, options, onChange }: { value: string; options: string[]; onChange: (p: string) => void }) {
    return (
        <select className="field__control mod-select" aria-label="Mes" value={value} onChange={e => onChange(e.target.value)}>
            {options.map(p => <option key={p} value={p}>{periodLabel(p)}</option>)}
        </select>
    );
}

/** Barra de avance (0–100+). */
export function Progress({ pct, tone }: { pct: number; tone: 'green' | 'amber' | 'red' | 'blue' }) {
    return (
        <div className="meter mod-meter" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
            <div style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: `var(--${tone})` }} />
        </div>
    );
}

/** Pestañas internas de una pantalla. */
export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string }[]; value: T; onChange: (t: T) => void }) {
    return (
        <nav className="page-tabs mod-tabs" role="tablist">
            {tabs.map(t => (
                <button key={t.id} type="button" role="tab" aria-selected={value === t.id} className={'page-tabs__tab' + (value === t.id ? ' is-on' : '')} onClick={() => onChange(t.id)}>
                    {t.label}
                </button>
            ))}
        </nav>
    );
}