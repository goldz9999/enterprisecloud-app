import { useState } from 'react';
import { isEnabled, OPTIONAL_MODULES, setEnabled, useModuleSwitches } from './catalog';
import { gestionError } from './gestionApi';
import './modules.css';

/**
 * Configuración › Módulos opcionales: encender/apagar cada módulo de Gestión (activación gradual).
 * El interruptor se guarda en el servidor y vale para todos los usuarios; igual que el resto de los datos de cada módulo.
 */
export function ModulosOpcionales({ canEdit, onMessage }: { canEdit: boolean; onMessage: (m: string) => void }) {
    useModuleSwitches(); // al cambiar un interruptor (aquí o desde otro equipo) la lista se pinta de nuevo
    const [busy, setBusy] = useState<string | null>(null);

    const toggle = async (id: string, on: boolean) => {
        setBusy(id);
        try {
            // El menú, el buscador y las rutas escuchan los interruptores: se actualizan al instante, sin recargar.
            await setEnabled(id, on);
            onMessage(`${OPTIONAL_MODULES.find(m => m.id === id)?.label} ${on ? 'activado' : 'apagado'}`);
        } catch (e) {
            onMessage(gestionError(e));
        } finally {
            setBusy(null);
        }
    };

    return (
        <div className="mod-cfg">
            {OPTIONAL_MODULES.map(m => {
                const on = isEnabled(m.id);
                return (
                    <div key={m.id} className="mod-cfg__row">
                        <div>
                            <span className="mod-cfg__name">{m.label}</span>
                            <span className="mod-cfg__sec">{m.section}</span>
                            <div className="mod-cfg__desc">{m.desc} Permiso: {m.viewPerm}.</div>
                        </div>
                        <button type="button" role="switch" aria-checked={on} aria-label={`${on ? 'Apagar' : 'Encender'} ${m.label}`} className="switch-row" disabled={!canEdit || busy === m.id} onClick={() => void toggle(m.id, !on)}>
                            <span className={'switch' + (on ? ' is-on' : '')}><span /></span>
                            {on ? 'Activo' : 'Apagado'}
                        </button>
                    </div>
                );
            })}
            <div className="mod-cfg__backup">
                <small>Los interruptores y los datos de cada módulo (metas, reglas y pagos de comisión, conteos, entregas, saldo inicial de caja) se guardan en la base de datos del sistema, no en este navegador.</small>
            </div>
        </div>
    );
}