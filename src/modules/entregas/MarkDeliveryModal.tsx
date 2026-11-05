import { useState } from 'react';
import { Modal } from '@/shared/components/Modal';
import { deliveriesApi, gestionError } from '../gestionApi';
import type { Delivery, Stop } from './entregasLogic';

const REASONS = ['Cliente ausente', 'Dirección errada', 'Cliente rechazó la mercadería', 'Falta de tiempo en la ruta', 'Otro'];

interface Props {
    stop: Stop;
    onClose: () => void;
    /** Se llama tras guardar con el mensaje a mostrar. */
    onSaved: (msg: string) => void | Promise<void>;
    onError: (msg: string) => void;
}

export function MarkDeliveryModal({ stop, onClose, onSaved, onError }: Props) {
    const [busy, setBusy] = useState(false);
    const [form, setForm] = useState({
        status: stop.delivery?.status ?? ('Entregado' as Delivery['status']),
        receiver: stop.delivery?.receiver ?? '',
        reason: stop.delivery?.reason ?? REASONS[0],
        note: stop.delivery?.note ?? '',
    });

    const run = async (fn: () => Promise<string>) => {
        if (busy) return;
        setBusy(true);
        try {
            const msg = await fn();
            await onSaved(msg);
            onClose();
        } catch (e) {
            onError(gestionError(e));
        } finally {
            setBusy(false);
        }
    };

    const save = () => {
        if (form.status === 'Entregado' && !form.receiver.trim()) return onError('Escribe quién recibió');
        const entry = form.status === 'Entregado'
            ? { status: 'Entregado' as const, receiver: form.receiver.trim(), note: form.note.trim() || undefined }
            : { status: 'No entregado' as const, reason: form.reason, note: form.note.trim() || undefined };
        void run(async () => {
            await deliveriesApi.save(stop.code, entry);
            return `${stop.code}: ${entry.status.toLowerCase()}`;
        });
    };

    const undo = () => void run(async () => {
        await deliveriesApi.remove(stop.code);
        return `${stop.code}: vuelve a pendiente`;
    });

    return (
        <Modal
            title={`Entrega ${stop.code}`}
            onClose={onClose}
            footer={<>
                {stop.delivery && <button type="button" className="btn btn--danger-text" style={{ marginRight: 'auto' }} disabled={busy} onClick={undo}>Volver a pendiente</button>}
                <button type="button" className="btn" onClick={onClose}>Cancelar</button>
                <button type="button" className="btn btn--primary" disabled={busy} onClick={save}>Guardar</button>
            </>}
        >
            <div className="dlv">
                <div className="dlv__who">
                    <span className="dlv__pin" aria-hidden="true">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></svg>
                    </span>
                    <span className="dlv__who-text">
                        <b>{stop.client}</b>
                        <span>{stop.address}</span>
                    </span>
                </div>
                <div className="dlv-seg" role="radiogroup" aria-label="Resultado de la entrega">
                    {(['Entregado', 'No entregado'] as const).map(s => (
                        <button key={s} type="button" role="radio" aria-checked={form.status === s} className={'dlv-seg__opt ' + (s === 'Entregado' ? 'is-ok' : 'is-fail') + (form.status === s ? ' is-on' : '')} onClick={() => setForm(f => ({ ...f, status: s }))}>
                            <span className="dlv-seg__ico" aria-hidden="true">
                                {s === 'Entregado'
                                    ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                                    : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M12 6v7M12 18h.01" /></svg>}
                            </span>
                            {s}
                        </button>
                    ))}
                </div>
                <div className="dlv__fields">
                    {form.status === 'Entregado' ? (
                        <label className="field">
                            <span className="field__label">Recibió (nombre)</span>
                            <input id="dlv-receiver" className="field__control" value={form.receiver} onChange={e => setForm(f => ({ ...f, receiver: e.target.value }))} placeholder="Ej. Juan Pérez (almacenero)" />
                        </label>
                    ) : (
                        <label className="field">
                            <span className="field__label">Motivo</span>
                            <select id="dlv-reason" className="field__control" value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}>{REASONS.map(r => <option key={r}>{r}</option>)}</select>
                        </label>
                    )}
                    <label className="field">
                        <span className="field__label">Observación (opcional)</span>
                        <input id="dlv-note" className="field__control" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="Ej. Dejado en recepción" />
                    </label>
                </div>
            </div>
        </Modal>
    );
}
