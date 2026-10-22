import { useEffect, useState } from 'react';
import type { Table } from '@/shared/lib/import/csv';
import type { Field } from './types';

const PAGE = 50;

/**
 * Vista tipo Excel de la hoja completa, paginada de 50 en 50:
 * - en la cabecera de cada columna se elige a qué campo va;
 * - cada fila lleva su número de Excel; las que tienen error se pintan en rojo con el motivo a la derecha;
 * - si se pasa `onEdit`, las celdas se pueden corregir ahí mismo (la fila queda marcada como editada).
 * La usan el botón «Importar» de cada pantalla y la pantalla general «Importar datos».
 */
export function ColumnMapper({ table, fields, map, onChange, errors, updates, onEdit }: {
    table: Table;
    fields: Field[];
    map: Record<number, string | null>;
    onChange: (map: Record<number, string | null>) => void;
    /** Errores por número de fila de datos (1 = primera fila debajo de los encabezados). */
    errors?: Map<number, RowIssue>;
    /** Filas (mismo número) que ya existen y se actualizarán: se marcan en azul. */
    updates?: Set<number>;
    /** Corrige una celda: fila de datos (desde 0), columna y nuevo valor. */
    onEdit?: (row: number, col: number, value: string) => void;
}) {
    const mapped = new Set(Object.values(map).filter(Boolean));
    const errCount = errors?.size ?? 0;
    const updCount = updates?.size ?? 0;
    const [filter, setFilter] = useState<'all' | 'err' | 'upd'>('all');
    const [page, setPage] = useState(0);
    // Filas corregidas desde la última revisión: se vacía cuando cambian los errores (al revisar de nuevo).
    const [edited, setEdited] = useState<Set<number>>(new Set());
    const errKey = errors ? [...errors.keys()].join(',') : '';
    useEffect(() => { setEdited(new Set()); }, [errKey]);
    useEffect(() => { if ((filter === 'err' && !errCount) || (filter === 'upd' && !updCount)) setFilter('all'); }, [errCount, updCount, filter]);

    const all = table.rows.map((_, i) => i);
    const list = filter === 'err' ? all.filter(i => errors?.has(i + 1) || edited.has(i))
        : filter === 'upd' ? all.filter(i => updates?.has(i + 1)) : all;
    const pages = Math.max(1, Math.ceil(list.length / PAGE));
    const cur = Math.min(page, pages - 1);
    const shown = list.slice(cur * PAGE, cur * PAGE + PAGE);
    const showProblem = errCount > 0;

    const edit = (row: number, col: number, value: string) => {
        if (!onEdit || table.rows[row][col] === value) return;
        onEdit(row, col, value);
        setEdited(s => new Set(s).add(row));
    };

    return (
        <div className="cm">
            <div className="cm__bar">
                {(errCount > 0 || updCount > 0) && (
                    <div className="cm__filter" role="tablist">
                        <button type="button" role="tab" aria-selected={filter === 'all'} className={filter === 'all' ? 'is-on' : undefined} onClick={() => { setFilter('all'); setPage(0); }}>Todas <b>{table.rows.length}</b></button>
                        {updCount > 0 && <button type="button" role="tab" aria-selected={filter === 'upd'} className={'is-upd' + (filter === 'upd' ? ' is-on' : '')} onClick={() => { setFilter('upd'); setPage(0); }}>Se actualizan <b>{updCount}</b></button>}
                        {errCount > 0 && <button type="button" role="tab" aria-selected={filter === 'err'} className={'is-err' + (filter === 'err' ? ' is-on' : '')} onClick={() => { setFilter('err'); setPage(0); }}>Con error <b>{errCount}</b></button>}
                    </div>
                )}
                {pages > 1 && (
                    <div className="cm__pager">
                        <button type="button" disabled={cur === 0} onClick={() => setPage(cur - 1)} aria-label="Página anterior">‹</button>
                        <span>{cur * PAGE + 1}–{Math.min(list.length, cur * PAGE + PAGE)} de {list.length}</span>
                        <button type="button" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)} aria-label="Página siguiente">›</button>
                    </div>
                )}
            </div>
            <div className="cm__scroll">
                <table className="cm__grid">
                    <thead>
                        <tr>
                            <th className="cm__num" aria-label="Fila de Excel" />
                            {table.headers.map((h, c) => (
                                <th key={c} className={map[c] ? undefined : 'is-off'}>
                                    <span className="cm__head" title={h}>{h || '(sin nombre)'}</span>
                                    <select className="cm__select" value={map[c] ?? ''} onChange={e => onChange({ ...map, [c]: e.target.value || null })} aria-label={`Campo para la columna ${h}`}>
                                        <option value="">No importar</option>
                                        {fields.map(f => (
                                            <option key={f.k} value={f.k} disabled={map[c] !== f.k && mapped.has(f.k)}>{f.label}{f.required ? ' *' : ''}</option>
                                        ))}
                                    </select>
                                </th>
                            ))}
                            {showProblem && <th className="cm__problem-h" aria-label="Problema" />}
                        </tr>
                    </thead>
                    <tbody>
                        {shown.map(i => {
                            const r = table.rows[i];
                            const fixed = edited.has(i);
                            const err = fixed ? undefined : errors?.get(i + 1);
                            // Si se sabe en qué columna está el error, se pinta solo esa celda; si no, toda la fila.
                            const badCols = new Set(table.headers.map((_, c) => c).filter(c => err && map[c] && err.keys.includes(map[c]!)));
                            const cls = fixed ? 'is-edited' : err ? (badCols.size ? 'is-err' : 'is-err is-err-row') : updates?.has(i + 1) ? 'is-upd' : undefined;
                            return (
                                <tr key={i} className={cls}>
                                    <td className="cm__num">{i + 2}</td>
                                    {table.headers.map((h, c) => (
                                        <td key={c} className={(map[c] ? '' : 'is-off') + (badCols.has(c) ? ' is-bad' : '') || undefined}>
                                            {onEdit ? (
                                                <input
                                                    className="cm__cell"
                                                    defaultValue={r[c] ?? ''}
                                                    key={`${i}-${c}-${r[c] ?? ''}`}
                                                    title={r[c]}
                                                    aria-label={`Fila ${i + 2}, ${h}`}
                                                    onBlur={e => edit(i, c, e.target.value)}
                                                    onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { (e.target as HTMLInputElement).value = r[c] ?? ''; (e.target as HTMLInputElement).blur(); } }}
                                                />
                                            ) : <span title={r[c]}>{r[c]}</span>}
                                        </td>
                                    ))}
                                    {showProblem && <td className="cm__problem">{fixed ? <span className="cm__fixed">Editada</span> : err?.msgs.join(' · ')}</td>}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

/** Campos que se pueden importar en una pantalla (ni calculados ni solo de edición). */
export const importableFields = (fields: Field[]) => fields.filter(f => !f.readOnly && f.only !== 'edit');

/** Campos obligatorios que vienen vacíos en una fila (el formulario no deja guardarlos así; la importación tampoco). */
export function requiredError(fields: Field[], vals: Record<string, string>): { error: string; keys: string[]; body?: undefined } | undefined {
    const empty = fields.filter(f => f.required && f.k in vals && !String(vals[f.k] ?? '').trim());
    return empty.length ? { error: `Falta ${empty.map(f => `«${f.label}»`).join(', ')}.`, keys: empty.map(f => f.k) } : undefined;
}

/** Problema de una fila: los mensajes y los campos del formulario donde está (para pintar solo esas celdas). */
export interface RowIssue {
    msgs: string[];
    keys: string[];
}