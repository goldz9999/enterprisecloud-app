import { useEffect, useMemo, useState } from 'react';
import { apiToFormKeys, importBody, importFields, importMaster, type ImportResult, type MasterCollection } from '@/data/domain/masters';
import { downloadCsv } from '@/shared/lib/csv';
import { cleanRow } from '@/shared/lib/import/clean';
import { readCsvFile, type Table } from '@/shared/lib/import/csv';
import { proposeMapping } from '@/shared/lib/import/match';
import { readXlsxFile } from '@/shared/lib/import/xlsx';
import { ColumnMapper, importableFields, requiredError } from './ColumnMapper';
import type { RecordsConfig } from './types';
import './ImportWizard.css';

type Step = 'file' | 'map' | 'review';
const STEPS: [Step, string][] = [['file', 'Archivo'], ['map', 'Columnas'], ['review', 'Revisión']];
const MAX_ROWS = 2000;

/** Qué hay que tener cargado antes, porque esta pantalla hace referencia a esos datos. */
const NEEDS: Partial<Record<MasterCollection, string>> = {
    productos: 'Si el archivo trae categoría o proveedor, carga antes Categorías y Proveedores.',
    categorias: 'Si usas «Categoría padre», esa categoría debe existir (o venir en una fila anterior de otro archivo).',
    conductores: 'Si el conductor es de un transportista, ese transportista debe estar en Proveedores.',
    vehiculos: 'Si el archivo trae conductor, carga antes Conductores (se busca por nombre o DNI).',
    preciosProv: 'Carga antes Proveedores y Productos (se buscan por RUC/nombre y SKU/nombre).',
};

/**
 * Importa un CSV o Excel en una pantalla de Mantenimiento, en 3 pasos: Archivo → Columnas → Revisión.
 * El archivo se lee en el navegador y solo se envía al propio backend (nunca a terceros ni a una IA).
 * Cada fila pasa por las mismas reglas que el formulario; si alguna falla, no se guarda nada.
 */
export function ImportWizard({ cfg, onClose, onDone }: { cfg: RecordsConfig; onClose: () => void; onDone: (msg: string) => void }) {
    const c = cfg.collection as MasterCollection;
    const fields = useMemo(() => importableFields(cfg.fields), [cfg]);
    const [step, setStep] = useState<Step>('file');
    const [fileName, setFileName] = useState('');
    const [table, setTable] = useState<Table | null>(null);
    // Hubo correcciones en la tabla después de revisar: hay que revisar de nuevo antes de importar.
    const [stale, setStale] = useState(false);
    const editCell = (row: number, col: number, value: string) => {
        setTable(t => t && { ...t, rows: t.rows.map((r, k) => (k === row ? r.map((v, c) => (c === col ? value : v)) : r)) });
        if (result) setStale(true);
    };
    const [map, setMap] = useState<Record<number, string | null>>({});
    const [result, setResult] = useState<ImportResult | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose();
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [busy, onClose]);

    const pick = async (file?: File) => {
        if (!file) return;
        setError('');
        try {
            const t = /\.xlsx$/i.test(file.name) ? await readXlsxFile(file) : await readCsvFile(file);
            if (!t.headers.length || !t.rows.length) return setError('El archivo no tiene filas de datos debajo de los encabezados.');
            if (t.rows.length > MAX_ROWS) return setError(`El archivo tiene ${t.rows.length} filas; el máximo es ${MAX_ROWS}. Divídelo en partes.`);
            setFileName(file.name);
            setTable(t);
            setMap(proposeMapping(t.headers, fields, c));
            setResult(null);
            setStale(false);
            setStep('map');
        } catch {
            setError(/\.xls$/i.test(file.name)
                ? 'Los .xls antiguos no se pueden leer. En Excel usa Archivo › Guardar como › «Libro de Excel (.xlsx)» o «CSV UTF-8».'
                : 'No se pudo leer el archivo. Guárdalo como .xlsx o «CSV UTF-8» y vuelve a intentarlo.');
        }
    };

    // Cada fila: valores del archivo → claves del formulario → limpieza → cuerpo de la API (o el error de esa fila).
    const prepared = useMemo(() => {
        if (!table) return [];
        return table.rows.map(cells => {
            const vals: Record<string, string> = {};
            Object.entries(map).forEach(([i, k]) => { if (k) vals[k] = cells[Number(i)] ?? ''; });
            const clean = cleanRow(c, vals);
            const missingValue = requiredError(fields, clean);
            return missingValue ?? importBody(c, clean);
        });
    }, [table, map, c, fields]);

    const mapped = new Set(Object.values(map).filter(Boolean));
    const missing = fields.filter(f => f.required && !mapped.has(f.k));

    const run = async (dryRun: boolean) => {
        setBusy(true);
        setError('');
        try {
            const localErrors = prepared.some(p => p.error);
            // Las filas con error local se envían vacías para que el servidor conserve la numeración; su error se muestra igual.
            // Al actualizar un registro existente solo se cambian las columnas que trae el archivo; el resto se conserva.
            const res = await importMaster(c, prepared.map(p => p.body ?? {}), dryRun || localErrors, importFields(c, [...mapped] as string[]));
            prepared.forEach((p, i) => {
                if (p.error) res.results[i] = { row: i + 1, action: 'error', errors: [p.error], keys: p.keys };
            });
            const count = (a: string) => res.results.filter(r => r.action === a).length;
            res.summary = { create: count('create'), update: count('update'), error: count('error') };
            setResult(res);
            setStale(false);
            setStep('review');
            if (res.saved) onDone(`${cfg.title}: ${res.summary.create} nuevos y ${res.summary.update} actualizados`);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'No se pudo importar.');
        } finally {
            setBusy(false);
        }
    };

    const template = () => downloadCsv(`plantilla-${cfg.title.toLowerCase().replace(/\s+/g, '-')}.csv`, fields.map(f => f.label), []);
    const errors = result?.results.filter(r => r.action === 'error') ?? [];

    return (
        <div className="purchase-modal-backdrop" onClick={() => !busy && onClose()}>
            <div className="purchase-modal iw" role="dialog" aria-modal="true" aria-label={`Importar ${cfg.title}`} onClick={e => e.stopPropagation()}>
                <div className="purchase-modal__head">
                    <div className="panel__title">Importar {cfg.title.toLowerCase()}</div>
                    <ol className="iw__steps" aria-label="Pasos">
                        {STEPS.map(([s, label], i) => (
                            <li key={s} className={step === s ? 'is-on' : STEPS.findIndex(x => x[0] === step) > i ? 'is-done' : undefined}>
                                <span>{i + 1}</span>{label}
                            </li>
                        ))}
                    </ol>
                    <button type="button" className="drawer__close" style={{ marginLeft: 'auto', fontSize: 16 }} aria-label="Cerrar" title="Cerrar" disabled={busy} onClick={onClose}>×</button>
                </div>

                <div className="iw__body">
                    {step === 'file' && (
                        <>
                            <label className="iw__drop" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); void pick(e.dataTransfer.files?.[0]); }}>
                                <input type="file" accept=".csv,.xlsx,text/csv" onChange={e => { void pick(e.target.files?.[0]); e.target.value = ''; }} />
                                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 15V3M7 8l5-5 5 5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" /></svg>
                                <strong>Elige o arrastra un archivo Excel (.xlsx) o CSV</strong>
                                <small>La primera fila deben ser los nombres de las columnas, en cualquier orden y con cualquier nombre. En el siguiente paso confirmas a qué campo va cada una.</small>
                            </label>
                            {NEEDS[c] && <p className="iw__note">{NEEDS[c]}</p>}
                            <div className="iw__row">
                                <button type="button" className="btn btn--sm" onClick={template}>Descargar plantilla</button>
                                <span className="purchase-modal__hint">Si ya existe un registro con el mismo {KEY_LABEL[c]}, se actualiza en vez de duplicarse.</span>
                            </div>
                        </>
                    )}

                    {step === 'map' && table && (
                        <>
                            <p className="purchase-modal__hint">
                                <b>{fileName}</b> · {table.rows.length} filas. Revisa a qué campo va cada columna; las que no necesites, déjalas en «No importar».
                            </p>
                            <ColumnMapper table={table} fields={fields} map={map} onChange={setMap} onEdit={editCell} />
                            {missing.length > 0 && <div className="drawer-error">Falta indicar qué columna es: {missing.map(f => f.label).join(', ')}.</div>}
                        </>
                    )}

                    {step === 'review' && result && (
                        <>
                            <div className="iw__summary">
                                <span className="is-new">{result.summary.create} {result.saved ? 'creados' : 'nuevos'}</span>
                                <span className="is-upd">{result.summary.update} {result.saved ? 'actualizados' : 'se actualizarán'}</span>
                                <span className={result.summary.error ? 'is-err' : 'is-zero'}>{result.summary.error} con errores</span>
                            </div>
                            {result.saved ? (
                                <p className="iw__ok">Listo: los datos se guardaron y ya aparecen en la lista.</p>
                            ) : errors.length ? (
                                <p className="purchase-modal__hint">No se guardó nada. Corrige las filas en rojo aquí mismo o en tu archivo.</p>
                            ) : (
                                <p className="purchase-modal__hint">Todo está correcto. Pulsa «Importar» para guardar.</p>
                            )}
                            {(errors.length > 0 || result.summary.update > 0) && !result.saved && table && (
                                <ColumnMapper table={table} fields={fields} map={map} onChange={m => { setMap(m); setStep('map'); }} errors={new Map(errors.map(r => [r.row, { msgs: r.errors, keys: r.keys ?? apiToFormKeys(c, r.fields ?? []) }]))} updates={new Set(result.results.filter(r => r.action === 'update').map(r => r.row))} onEdit={editCell} />
                            )}
                        </>
                    )}
                    {error && <div className="drawer-error" role="alert">{error}</div>}
                </div>

                <div className="purchase-modal__foot iw__foot">
                    <span className="iw__privacy">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
                        El archivo se lee en tu navegador y solo se envía a tu servidor.
                    </span>
                    {step === 'map' && <button type="button" className="btn" disabled={busy} onClick={() => setStep('file')}>Atrás</button>}
                    {step === 'review' && !result?.saved && <button type="button" className="btn" disabled={busy} onClick={() => setStep(errors.length ? 'file' : 'map')}>{errors.length ? 'Cargar otro archivo' : 'Atrás'}</button>}
                    {step === 'review' && !result?.saved && stale && (
                        <button type="button" className="btn btn--primary" disabled={busy} onClick={() => void run(true)}>{busy ? 'Revisando…' : 'Revisar de nuevo'}</button>
                    )}
                    {step === 'map' && (
                        <button type="button" className="btn btn--primary" disabled={busy || missing.length > 0} onClick={() => void run(true)}>{busy ? 'Revisando…' : 'Revisar'}</button>
                    )}
                    {step === 'review' && !result?.saved && !errors.length && !stale && (
                        <button type="button" className="btn btn--primary" disabled={busy} onClick={() => void run(false)}>{busy ? 'Importando…' : `Importar ${result!.summary.create + result!.summary.update} filas`}</button>
                    )}
                    {(step === 'file' || result?.saved) && <button type="button" className="btn" onClick={onClose}>{result?.saved ? 'Cerrar' : 'Cancelar'}</button>}
                </div>
            </div>
        </div>
    );
}

/** Dato que identifica un registro al importar (igual que la clave del backend). */
const KEY_LABEL: Record<MasterCollection, string> = {
    clientes: 'tipo y número de documento', proveedores: 'RUC', productos: 'SKU', categorias: 'nombre', almacenes: 'nombre',
    conductores: 'DNI', vehiculos: 'placa', preciosProv: 'proveedor y producto',
};