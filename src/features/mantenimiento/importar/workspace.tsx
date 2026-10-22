import { useMemo, useState } from 'react';
import { AppShell } from '@/shared/components/AppShell';
import { ColumnMapper, importableFields, requiredError } from '@/shared/components/records/ColumnMapper';
import type { RecordsConfig } from '@/shared/components/records/types';
import { Toast, useToast } from '@/shared/components/Toast';
import { apiToFormKeys, importBody, importFields, importMaster, pendingRow, usesPending, type ImportResult, type MasterCollection, type PendingRows } from '@/data/domain/masters';
import { can } from '@/data/permissions';
import { RECORD_PAGES } from '@/shared/lib/configs';
import { downloadBlob } from '@/shared/lib/csv';
import { cleanRow } from '@/shared/lib/import/clean';
import { readCsvFile, type Table } from '@/shared/lib/import/csv';
import { detectTable, IMPORT_ORDER, type ImportTable } from '@/shared/lib/import/detect';
import { proposeMapping } from '@/shared/lib/import/match';
import { readXlsxBook, writeXlsx } from '@/shared/lib/import/xlsx';
import '@/shared/components/records/ImportWizard.css';
import './importar.css';

const MAX_ROWS = 2000;

const ico = (d: React.ReactNode) => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
);
/** Ícono de cada tabla, para reconocerla sin leer. */
const TABLE_ICON: Record<ImportTable, React.ReactNode> = {
    categorias: ico(<path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />),
    almacenes: ico(<path d="M3 21V8l9-5 9 5v13M7 21v-8h10v8" />),
    proveedores: ico(<path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6" />),
    clientes: ico(<><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></>),
    productos: ico(<path d="M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v8" />),
    conductores: ico(<><circle cx="12" cy="7" r="4" /><path d="M5 21v-2a7 7 0 0 1 14 0v2" /></>),
    vehiculos: ico(<><path d="M2 6h11v10H2z" /><path d="M13 9h4l4 4v3h-8" /><circle cx="6" cy="17.5" r="1.8" /><circle cx="17" cy="17.5" r="1.8" /></>),
    preciosProv: ico(<><path d="M20 12l-8 8-9-9V3h8z" /><circle cx="7.5" cy="7.5" r="1.5" /></>),
};
const XLS = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="4" fill="currentColor" />
        <path d="M8.5 8l7 8M15.5 8l-7 8" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
    </svg>
);
const CHECK = <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5 9-10" /></svg>;

/** Configuración de cada tabla de Mantenimiento (campos, título y permisos), tomada de sus propias pantallas. */
const CFG = Object.fromEntries(
    Object.values(RECORD_PAGES).filter(c => (IMPORT_ORDER as readonly string[]).includes(String(c.collection))).map(c => [c.collection, c]),
) as Record<ImportTable, RecordsConfig>;
const fieldsOf = (t: ImportTable) => importableFields(CFG[t]?.fields ?? []);
const titleOf = (t: ImportTable) => CFG[t]?.title ?? t;
const allowed = (t: ImportTable) => !!CFG[t] && can(undefined, CFG[t].active, 'Crear') && can(undefined, CFG[t].active, 'Editar');

interface SheetState {
    name: string;
    table: Table;
    target: ImportTable | null;
    map: Record<number, string | null>;
    open: boolean;
}

/** Fila del archivo → valores del formulario (ya limpios). */
function rowValues(s: SheetState, t: ImportTable, cells: string[]): Record<string, string> {
    const vals: Record<string, string> = {};
    Object.entries(s.map).forEach(([i, k]) => { if (k) vals[k] = cells[Number(i)] ?? ''; });
    return cleanRow(t, vals);
}

/**
 * Importación general de Mantenimiento: un Excel con varias hojas (Clientes, Productos, Conductores…).
 * Cada hoja se reconoce por su nombre o sus columnas, se revisa todo junto y se guarda en el orden correcto
 * (categorías antes que productos, conductores antes que vehículos…). El archivo se lee en el navegador
 * y solo se envía al propio servidor.
 */
export function ImportarDatosPage() {
    const toast = useToast();
    const [fileName, setFileName] = useState('');
    const [sheets, setSheets] = useState<SheetState[]>([]);
    const [review, setReview] = useState<Record<number, ImportResult> | null>(null);
    // Hubo correcciones en la tabla después de revisar: hay que revisar de nuevo antes de importar.
    const [stale, setStale] = useState(false);
    const [done, setDone] = useState<{ create: number; update: number } | null>(null);
    const [busy, setBusy] = useState('');
    const [error, setError] = useState('');

    const pick = async (file?: File) => {
        if (!file) return;
        setError('');
        setReview(null);
        setDone(null);
        try {
            const book = /\.xlsx$/i.test(file.name)
                ? await readXlsxBook(file)
                : [{ name: file.name.replace(/\.[^.]+$/, ''), table: await readCsvFile(file) }];
            const big = book.find(s => s.table.rows.length > MAX_ROWS);
            if (big) return setError(`La hoja «${big.name}» tiene ${big.table.rows.length} filas; el máximo es ${MAX_ROWS} por hoja.`);
            const used = new Set<ImportTable>();
            setSheets(book.filter(s => s.table.rows.length).map(s => {
                let target = detectTable(s.name, s.table.headers, fieldsOf);
                if (target && used.has(target)) target = null;
                if (target) used.add(target);
                return { ...s, target, map: target ? proposeMapping(s.table.headers, fieldsOf(target), target) : {}, open: false };
            }));
            setFileName(file.name);
        } catch {
            setError(/\.xls$/i.test(file.name)
                ? 'Los .xls antiguos no se pueden leer. En Excel usa Archivo › Guardar como › «Libro de Excel (.xlsx)».'
                : 'No se pudo leer el archivo. Guárdalo como .xlsx o «CSV UTF-8» y vuelve a intentarlo.');
        }
    };

    const change = (i: number, patch: Partial<SheetState>) => {
        setSheets(list => list.map((s, j) => (j === i ? { ...s, ...patch } : s)));
        if (!('open' in patch && Object.keys(patch).length === 1)) setReview(null);
    };
    /** Corrige una celda en la tabla (no toca el Excel original). */
    const editCell = (i: number, row: number, col: number, value: string) => {
        setSheets(list => list.map((s, j) => (j === i
            ? { ...s, table: { ...s.table, rows: s.table.rows.map((r, k) => (k === row ? r.map((v, c) => (c === col ? value : v)) : r)) } }
            : s)));
        if (review) setStale(true);
    };
    const setTarget = (i: number, t: ImportTable | null) =>
        change(i, { target: t, map: t ? proposeMapping(sheets[i].table.headers, fieldsOf(t), t) : {}, open: !!t });

    // Hojas a importar, en el orden de carga.
    const plan = useMemo(() => sheets.map((s, i) => ({ s, i })).filter(x => x.s.target)
        .sort((a, b) => IMPORT_ORDER.indexOf(a.s.target!) - IMPORT_ORDER.indexOf(b.s.target!)), [sheets]);

    const problems = useMemo(() => {
        const out: Record<number, string> = {};
        const seen = new Map<ImportTable, string>();
        for (const { s, i } of plan) {
            const t = s.target!;
            if (seen.has(t)) out[i] = `Dos hojas van a ${titleOf(t)} («${seen.get(t)}» y «${s.name}»). Deja solo una.`;
            else if (!allowed(t)) out[i] = `Tu rol no tiene permiso para crear y editar ${titleOf(t)}.`;
            else {
                const mapped = new Set(Object.values(s.map));
                const missing = fieldsOf(t).filter(f => f.required && !mapped.has(f.k));
                if (missing.length) out[i] = `Falta indicar qué columna es: ${missing.map(f => f.label).join(', ')}.`;
            }
            seen.set(t, s.name);
        }
        return out;
    }, [plan]);

    /** Registros que traen las hojas que se cargan ANTES de `t` (y la propia, para «categoría padre»). */
    const pendingFor = (t: ImportTable): PendingRows => {
        const out: PendingRows = {};
        for (const { s } of plan) {
            const st = s.target!;
            if (IMPORT_ORDER.indexOf(st) > IMPORT_ORDER.indexOf(t) || (st === t && t !== 'categorias')) continue;
            out[st as MasterCollection] = s.table.rows.map(r => pendingRow(st as MasterCollection, rowValues(s, st, r))).filter(Boolean) as NonNullable<PendingRows[MasterCollection]>;
        }
        return out;
    };

    const check = async () => {
        setBusy('Revisando…');
        setError('');
        const out: Record<number, ImportResult> = {};
        try {
            for (const { s, i } of plan) {
                const t = s.target!;
                setBusy(`Revisando ${titleOf(t)}…`);
                const pending = pendingFor(t);
                const prepared = s.table.rows.map(r => {
                    const vals = rowValues(s, t, r);
                    const missingValue = requiredError(fieldsOf(t), vals);
                    return missingValue ?? importBody(t, vals, pending);
                });
                const res = await importMaster(t, prepared.map(p => p.body ?? {}), true, importFields(t, Object.values(s.map).filter(Boolean) as string[]));
                prepared.forEach((p, j) => { if (p.error) res.results[j] = { row: j + 1, action: 'error', errors: [p.error], keys: p.keys }; });
                const count = (a: string) => res.results.filter(r => r.action === a).length;
                res.summary = { create: count('create'), update: count('update'), error: count('error') };
                out[i] = res;
            }
            setReview(out);
            setStale(false);
            setSheets(list => list.map((s, i) => ({ ...s, open: s.open || !!out[i]?.summary.error })));
        } catch (e) {
            setError(e instanceof Error ? e.message : 'No se pudo revisar el archivo.');
        } finally {
            setBusy('');
        }
    };

    const run = async () => {
        setError('');
        const total = { create: 0, update: 0 };
        let current = '';
        try {
            for (const { s } of plan) {
                const t = s.target!;
                current = titleOf(t);
                setBusy(`Guardando ${current}…`);
                const fields = importFields(t, Object.values(s.map).filter(Boolean) as string[]);
                // Las filas que apuntan a otra de la misma hoja (categoría padre) van en una segunda pasada.
                let left = s.table.rows.map(r => rowValues(s, t, r));
                for (let pass = 0; left.length && pass < 10; pass++) {
                    const self = t === 'categorias' ? { categorias: left.map(v => pendingRow(t, v)).filter(Boolean) } as PendingRows : undefined;
                    const prepared = left.map(v => ({ v, ...importBody(t, v, self) }));
                    const ready = prepared.filter(p => p.body && !usesPending(p.body));
                    if (!ready.length) throw new Error(`${current}: hay filas que se refieren entre sí y no se pudieron ordenar.`);
                    const res = await importMaster(t, ready.map(p => p.body!), false, fields);
                    if (!res.saved) throw new Error(`${current}: ${res.results.find(r => r.errors.length)?.errors.join(' · ') ?? 'no se pudo guardar'}`);
                    total.create += res.summary.create;
                    total.update += res.summary.update;
                    left = prepared.filter(p => !ready.includes(p)).map(p => p.v);
                }
            }
            setDone(total);
            toast.flash(`Importación terminada: ${total.create} nuevos y ${total.update} actualizados`);
        } catch (e) {
            setError(`${e instanceof Error ? e.message : 'No se pudo guardar.'} Las tablas anteriores a ${current} ya quedaron guardadas; corrige y vuelve a importar (no se duplican).`);
        } finally {
            setBusy('');
        }
    };

    const template = () => {
        const blob = writeXlsx(IMPORT_ORDER.filter(t => CFG[t]).map(t => ({ name: titleOf(t), rows: [fieldsOf(t).map(f => f.label + (f.required ? ' *' : ''))] })));
        downloadBlob('plantilla-mantenimiento.xlsx', blob);
    };

    const reset = () => { setSheets([]); setFileName(''); setReview(null); setStale(false); setDone(null); setError(''); };
    const totals = review ? Object.values(review).reduce((a, r) => ({ create: a.create + r.summary.create, update: a.update + r.summary.update, error: a.error + r.summary.error }), { create: 0, update: 0, error: 0 }) : null;
    const blocked = Object.keys(problems).length > 0 || !plan.length;
    const step = done ? 3 : review ? 3 : sheets.length ? 2 : 1;

    return (
        <AppShell active="Importar datos" breadcrumb={[{ label: 'Inicio', to: '/' }, { label: 'Mantenimiento' }, { label: 'Importar datos' }]}>
            <div>
                <h1 className="page__title">Importar datos</h1>
                <div className="page__subtitle">Carga de una vez clientes, proveedores, productos, categorías, almacenes, conductores, vehículos y precios desde un Excel</div>
            </div>

            <ol className="iw__steps imp__steps" aria-label="Pasos">
                {['Archivo', 'Hojas y columnas', 'Revisión'].map((label, i) => (
                    <li key={label} className={step === i + 1 ? 'is-on' : step > i + 1 ? 'is-done' : undefined}><span>{i + 1}</span>{label}</li>
                ))}
            </ol>

            {!sheets.length ? (
                <section className="imp__card">
                    <label className="iw__drop imp__drop" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); void pick(e.dataTransfer.files?.[0]); }}>
                        <input type="file" accept=".xlsx,.csv,text/csv" onChange={e => { void pick(e.target.files?.[0]); e.target.value = ''; }} />
                        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 15V3M7 8l5-5 5 5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" /></svg>
                        <strong>Elige o arrastra tu Excel (.xlsx)</strong>
                        <small>Una hoja por tabla: «Clientes», «Productos», «Conductores»… Las columnas pueden ir en cualquier orden y con cualquier nombre. También sirve un CSV con una sola tabla.</small>
                    </label>
                    <div className="imp__how">
                        <div>
                            <b>Cómo funciona</b>
                            <ol>
                                <li>El sistema reconoce cada hoja (por su nombre o sus columnas) y empareja las columnas.</li>
                                <li>Revisas y corriges lo que haga falta. Se valida todo con las mismas reglas de los formularios.</li>
                                <li>Se guarda en orden: categorías, almacenes, proveedores, clientes, productos, conductores, vehículos y precios.</li>
                            </ol>
                        </div>
                        <div className="imp__how-side">
                            <button type="button" className="btn btn--sm" onClick={template}>Descargar plantilla (.xlsx)</button>
                            <small>Si un registro ya existe (mismo RUC, DNI, SKU, placa…), se actualiza en vez de duplicarse.</small>
                        </div>
                    </div>
                    {error && <div className="drawer-error" role="alert">{error}</div>}
                </section>
            ) : (
                <section className="imp__card">
                    <div className="imp__file">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6" /></svg>
                        <b>{fileName}</b>
                        <span>{sheets.length} hoja{sheets.length === 1 ? '' : 's'} · {plan.length} se importará{plan.length === 1 ? '' : 'n'}</span>
                        {!busy && !done && <button type="button" className="link-btn" onClick={reset}>Cambiar archivo</button>}
                    </div>

                    <ul className="imp__sheets">
                        {[...plan.map(x => x.i), ...sheets.map((_, i) => i).filter(i => !sheets[i].target)].map(i => {
                            const s = sheets[i];
                            const t = s.target;
                            const r = review?.[i];
                            const errs = r?.results.filter(x => x.action === 'error') ?? [];
                            const pos = plan.findIndex(x => x.i === i);
                            const mapped = new Set(Object.values(s.map));
                            const missing = t ? fieldsOf(t).filter(f => f.required && !mapped.has(f.k)) : [];
                            // Estado visual: gris = no se importa · ámbar = falta algo · rojo = filas con error · verde = lista.
                            const state = !t ? 'off' : errs.length ? 'err' : problems[i] ? 'warn' : 'ok';
                            const total = r ? r.summary.create + r.summary.update + r.summary.error : 0;
                            return (
                                <li key={i} className={`imp__sheet is-${state}`}>
                                    <div className="imp__sheet-head">
                                        <span className="imp__order" aria-label={t ? `Paso ${pos + 1}` : 'No se importa'}>{t ? pos + 1 : '–'}</span>
                                        <div className="imp__sheet-name" title={s.name}>
                                            <span className="imp__xl" aria-hidden="true">{XLS}</span>
                                            <span><b>{s.name}</b><small>{s.table.rows.length} fila{s.table.rows.length === 1 ? '' : 's'}</small></span>
                                        </div>
                                        <svg className="imp__arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                                        <label className="imp__tbl">
                                            <span className="imp__tbl-ico" aria-hidden="true">{t ? TABLE_ICON[t] : null}</span>
                                            <select value={t ?? ''} disabled={!!busy || !!done} onChange={e => setTarget(i, (e.target.value || null) as ImportTable | null)} aria-label={`Tabla para la hoja ${s.name}`}>
                                                <option value="">No importar</option>
                                                {IMPORT_ORDER.filter(x => CFG[x]).map(x => <option key={x} value={x} disabled={!allowed(x)}>{titleOf(x)}{allowed(x) ? '' : ' (sin permiso)'}</option>)}
                                            </select>
                                        </label>
                                        <button type="button" className="imp__chips" disabled={!t || !!done} onClick={() => change(i, { open: !s.open })} aria-expanded={s.open} title={t ? 'Ver y corregir columnas' : undefined}>
                                            {s.table.headers.map((h, k) => (
                                                <span key={k} className={'imp__chip' + (s.map[k] ? '' : ' is-off')}>{h || '(sin nombre)'}</span>
                                            ))}
                                            {missing.map(f => <span key={f.k} className="imp__chip is-miss">{f.label}</span>)}
                                        </button>
                                        <span className="imp__state">
                                            {r && t ? (
                                                <>
                                                    <span className="imp__nums">
                                                        {r.summary.create > 0 && <b className="is-new" title="Nuevos">{r.summary.create}</b>}
                                                        {r.summary.update > 0 && <b className="is-upd" title="Se actualizan">{r.summary.update}</b>}
                                                        {r.summary.error > 0 && <b className="is-err" title="Con error">{r.summary.error}</b>}
                                                    </span>
                                                    <span className="imp__bar" aria-hidden="true">
                                                        <i className="is-new" style={{ flex: r.summary.create }} />
                                                        <i className="is-upd" style={{ flex: r.summary.update }} />
                                                        <i className="is-err" style={{ flex: r.summary.error }} />
                                                    </span>
                                                    <span className="sr-only">{r.summary.create} nuevos, {r.summary.update} se actualizan, {r.summary.error} con error de {total}</span>
                                                </>
                                            ) : t ? (
                                                <span className="imp__badge" title={problems[i] ?? 'Lista'}>{state === 'ok' ? CHECK : '!'}</span>
                                            ) : null}
                                        </span>
                                    </div>
                                    {problems[i] && !missing.length && <div className="imp__problem">{problems[i]}</div>}
                                    {s.open && t && (
                                        <div className="imp__sheet-body">
                                            <ColumnMapper table={s.table} fields={fieldsOf(t)} map={s.map} onChange={map => change(i, { map })} errors={errs.length ? new Map(errs.map(x => [x.row, { msgs: x.errors, keys: x.keys ?? apiToFormKeys(t, x.fields ?? []) }])) : undefined} updates={r ? new Set(r.results.filter(x => x.action === 'update').map(x => x.row)) : undefined} onEdit={done ? undefined : (row, col, v) => editCell(i, row, col, v)} />
                                        </div>
                                    )}
                                </li>
                            );
                        })}
                    </ul>

                    <div className="imp__legend" aria-hidden="true">
                        {review
                            ? <><span><i className="is-new" />Nuevos</span><span><i className="is-upd" />Se actualizan</span><span><i className="is-err" />Con error</span></>
                            : <><span><i className="is-ok" />Lista</span><span><i className="is-warn" />Falta una columna</span><span><i className="is-off" />No se importa</span></>}
                    </div>

                    {error && <div className="drawer-error" role="alert">{error}</div>}

                    <div className="imp__foot">
                        <span className="iw__privacy">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
                            El archivo se lee en tu navegador y solo se envía a tu servidor.
                        </span>
                        {done ? (
                            <>
                                <span className="iw__ok">Listo: {done.create} nuevos y {done.update} actualizados.</span>
                                <button type="button" className="btn" onClick={reset}>Importar otro archivo</button>
                            </>
                        ) : review && stale ? (
                            <>
                                <span className="imp__summary">Corregiste datos en la tabla.</span>
                                <button type="button" className="btn btn--primary" disabled={!!busy || blocked} onClick={() => void check()}>{busy || 'Revisar de nuevo'}</button>
                            </>
                        ) : review && totals ? (
                            totals.error ? (
                                <>
                                    <span className="imp__summary-err">{totals.error} filas con errores. Corrígelas en la tabla o en el Excel. No se guardó nada.</span>
                                    <button type="button" className="btn" onClick={reset}>Cargar otro archivo</button>
                                </>
                            ) : (
                                <>
                                    <span className="imp__summary">{totals.create} nuevos · {totals.update} se actualizarán</span>
                                    <button type="button" className="btn btn--primary" disabled={!!busy} onClick={() => void run()}>{busy || `Importar todo (${totals.create + totals.update})`}</button>
                                </>
                            )
                        ) : (
                            <button type="button" className="btn btn--primary" disabled={!!busy || blocked} onClick={() => void check()}>{busy || 'Revisar'}</button>
                        )}
                    </div>
                </section>
            )}
            <Toast message={toast.message} />
        </AppShell>
    );
}