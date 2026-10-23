import { loadMasters } from '@/data/domain/masters';
import { ensureLoaded, reloadIfLoaded } from '@/data/loadAll';
import { fmtDayTime } from '@/shared/lib/dates';
import { COPY_DOMAINS, COPY_PARTS, EMPTY_COPY, hasCopy, useLocalCopy, writeCopy } from './localCopy';

/** Configuración › Módulos opcionales: estado de la copia local que usan los módulos de Gestión. */
export function LocalCopyCard({ canEdit, onMessage }: { canEdit: boolean; onMessage: (m: string) => void }) {
    const copy = useLocalCopy();
    const count = (id: string) => {
        const p = COPY_PARTS.find(x => x.id === id)!;
        return p.orders ? copy.orders.filter(o => o.kind === p.orders).length : (p.colls ?? []).reduce((a, c) => a + (copy.records[c]?.length ?? 0), 0);
    };
    const refresh = () => {
        void loadMasters();
        reloadIfLoaded(COPY_DOMAINS);
        ensureLoaded(COPY_DOMAINS);
        onMessage('Descargando los datos del sistema; la copia local se actualiza en unos segundos');
    };

    return (
        <div className="mod-cfg__row" style={{ gridTemplateColumns: '1fr', gap: 10 }}>
            <div>
                <span className="mod-cfg__name">Copia local para Gestión</span>
                <div className="mod-cfg__desc">
                    Todo se guarda en la base de datos como siempre. Además, cada vez que los datos del sistema cambian (importar, crear o editar en Mantenimiento,
                    ventas, compras, cobros, stock…) se actualiza esta copia en el navegador, y los módulos de Gestión leen solo de ella.
                    {hasCopy(copy) ? ` Última actualización: ${fmtDayTime(new Date(copy.updatedAt))}.` : ' Aún está vacía.'}
                </div>
            </div>
            <div className="mod-copy-grid">
                {COPY_PARTS.map(p => (
                    <div key={p.id} className={'mod-copy-item' + (copy.parts[p.id] ? '' : ' is-empty')} title={copy.parts[p.id] ? `Copiado ${fmtDayTime(new Date(copy.parts[p.id]))}` : 'Aún no se copia: se llena al abrir esa pantalla o con «Actualizar ahora»'}>
                        <span>{p.label}</span>
                        <b className="mono">{copy.parts[p.id] ? count(p.id) : '—'}</b>
                    </div>
                ))}
            </div>
            <div className="mod-toolbar">
                <button type="button" className="btn btn--sm btn--primary" onClick={refresh}>Actualizar ahora</button>
                {canEdit && hasCopy(copy) && (
                    <button type="button" className="btn btn--sm btn--danger-text" onClick={() => { writeCopy(EMPTY_COPY); onMessage('Copia local borrada; se vuelve a llenar con los datos del sistema'); refresh(); }}>
                        Borrar y volver a copiar
                    </button>
                )}
            </div>
        </div>
    );
}