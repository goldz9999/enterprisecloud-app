import { useState } from 'react';
import { Modal } from '@/shared/components/Modal';
import { gestionError, routesApi } from '../gestionApi';
import { shortDay } from '../ui';
import type { Stop } from './entregasLogic';

interface Props {
    vehicle: string;
    driver: string;
    day: string;
    stops: Stop[];
    onClose: () => void;
    onStarted: (msg: string) => void | Promise<void>;
    onError: (msg: string) => void;
}

export const departureTime = (iso: string) =>
    new Date(iso).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });

export function StartRouteModal({ vehicle, driver, day, stops, onClose, onStarted, onError }: Props) {
    const [busy, setBusy] = useState(false);
    const pending = stops.filter(s => s.status === 'Pendiente');

    const start = async () => {
        setBusy(true);
        try {
            const res = await routesApi.start({ vehicle, day, driver: driver || undefined, codes: pending.map(s => s.code) });
            const mail = !res.smtpEnabled
                ? 'los correos están desactivados en Configuración'
                : res.emails
                    ? `aviso «en camino» enviado a ${res.emails} cliente(s)`
                    : 'ningún cliente pendiente tiene correo registrado';
            await onStarted(`${vehicle} en ruta · ${mail}`);
            onClose();
        } catch (e) {
            onError(gestionError(e));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Modal
            title={`Salir a ruta · ${vehicle}`}
            onClose={onClose}
            footer={<>
                <button type="button" className="btn" onClick={onClose}>Cancelar</button>
                <button type="button" className="btn btn--primary" disabled={busy} onClick={() => void start()}>{busy ? 'Registrando…' : 'Confirmar salida'}</button>
            </>}
        >
            <p style={{ margin: '0 0 12px', lineHeight: 1.5 }}>
                {vehicle}{driver ? ` (${driver})` : ''} sale con las entregas del {shortDay(day)}. A los clientes de estas {pending.length} entrega(s) pendiente(s) que tengan correo les llega «Tu pedido está en camino».
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
                {pending.map(s => (
                    <div key={s.code} style={{ display: 'flex', gap: 8, minWidth: 0 }}>
                        <span className="mono muted" style={{ flex: 'none' }}>{s.code}</span>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.client}</span>
                    </div>
                ))}
            </div>
        </Modal>
    );
}
