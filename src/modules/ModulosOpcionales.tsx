import { useRef, useState } from 'react';
import { downloadBlob } from '@/shared/lib/csv';
import { exportModules, importModules } from './backup';
import { isEnabled, OPTIONAL_MODULES, setEnabled } from './catalog';
import { LocalCopyCard } from './LocalCopyCard';
import './modules.css';

/**
 * Configuración › Módulos opcionales: encender/apagar cada módulo (activación gradual) y respaldar sus datos,
 * que viven en este navegador.
 */
export function ModulosOpcionales({ canEdit, onMessage }: { canEdit: boolean; onMessage: (m: string) => void }) {
    const [, force] = useState(0);
    const file = useRef<HTMLInputElement>(null);

    const toggle = (id: string, on: boolean) => {
        // El menú, el buscador y las rutas escuchan los interruptores: se actualizan al instante, sin recargar.
        setEnabled(id, on);
        force(n => n + 1);
        onMessage(`${OPTIONAL_MODULES.find(m => m.id === id)?.label} ${on ? 'activado' : 'apagado'}`);
    };
    const doExport = () => {
        downloadBlob(`modulos-enterprisecloud-${new Date().toISOString().slice(0, 10)}.json`, exportModules());
        onMessage('Respaldo descargado');
    };
    const doImport = async (f: File | undefined) => {
        if (!f) return;
        try {
            const n = await importModules(f);
            onMessage(`Respaldo restaurado · ${n} conjunto(s) de datos`);
            window.setTimeout(() => window.location.reload(), 600);
        } catch (e) {
            onMessage(e instanceof Error ? e.message : 'No se pudo leer el respaldo');
        }
        if (file.current) file.current.value = '';
    };

    return (
        <div className="mod-cfg">
            <LocalCopyCard canEdit={canEdit} onMessage={onMessage} />
            {OPTIONAL_MODULES.map(m => {
                const on = isEnabled(m.id);
                return (
                    <div key={m.id} className="mod-cfg__row">
                        <div>
                            <span className="mod-cfg__name">{m.label}</span>
                            <span className="mod-cfg__sec">{m.section}</span>
                            <div className="mod-cfg__desc">{m.desc} Permiso: {m.viewPerm}.</div>
                        </div>
                        <button type="button" role="switch" aria-checked={on} aria-label={`${on ? 'Apagar' : 'Encender'} ${m.label}`} className="switch-row" disabled={!canEdit} onClick={() => toggle(m.id, !on)}>
                            <span className={'switch' + (on ? ' is-on' : '')}><span /></span>
                            {on ? 'Activo' : 'Apagado'}
                        </button>
                    </div>
                );
            })}
            <div className="mod-cfg__backup">
                <button type="button" className="btn btn--sm" onClick={doExport}>Exportar respaldo (.json)</button>
                {canEdit && <button type="button" className="btn btn--sm" onClick={() => file.current?.click()}>Importar respaldo</button>}
                <input ref={file} type="file" accept=".json,application/json" hidden onChange={e => void doImport(e.target.files?.[0])} />
                <small>Metas, reglas de comisión, conteos y entregas se guardan en este navegador. Exporta el respaldo para pasarlos a otra PC o no perderlos si se borran los datos del sitio.</small>
            </div>
        </div>
    );
}