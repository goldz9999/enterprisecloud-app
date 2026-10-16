import { useState } from 'react';
import { Modal } from '../components/Modal';
import { StatusChip } from '../components/StatusChip';
import { collectRemote } from '../data/domain/finance';
import type { Row } from '../data/types';
import { displayDate } from '../lib/dates';
import { formatMoney } from '../lib/format';
import './CollectModal.css';

interface Props {
    row: Row;
    onClose: () => void;
    onDone: (msg: string) => void;
}

const TONE: Record<string, 'blue' | 'amber' | 'red' | 'green'> = { 'Por vencer': 'blue', 'Vence esta semana': 'amber', Vencida: 'red', Cobrada: 'green' };

/** Cobro de una cuenta por cobrar: siempre por el saldo completo, en Caja o Bancos. */
export function CollectModal({ row, onClose, onDone }: Props) {
    const saldo = Number(row.saldo) || 0;
    const paid = String(row.estado) === 'Cobrada' || saldo <= 0;
    const [canal, setCanal] = useState('Caja');
    const [ref, setRef] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const save = async () => {
        setSaving(true);
        setError('');
        const res = await collectRemote(String(row.uuid || row.doc), saldo, canal, ref.trim() || undefined);
        setSaving(false);
        if (!res.ok) return setError(res.error);
        onDone(`${row.doc} cobrado · ${formatMoney(saldo)} en ${canal}`);
    };

    const date = (v: unknown) => (v && String(v) !== '—' ? displayDate(String(v)) : '—');

    return (
        <Modal
            title={paid ? `Comprobante ${row.doc}` : `Registrar cobro · ${row.doc}`}
            onClose={() => !saving && onClose()}
            footer={
                <>
                    <button type="button" className="btn" onClick={onClose} disabled={saving}>{paid ? 'Cerrar' : 'Cancelar'}</button>
                    {!paid && (
                        <button type="button" className="btn btn--primary" onClick={() => void save()} disabled={saving}>
                            {saving ? 'Registrando…' : `Cobrar ${formatMoney(saldo)}`}
                        </button>
                    )}
                </>
            }
        >
            <div className="cm-head">
                <div style={{ minWidth: 0 }}>
                    <div className="cm-client ellipsis">{String(row.cliente)}</div>
                    <div className="cm-sub mono">{[row.ruc, row.orden].filter(Boolean).join(' · ')}</div>
                </div>
                <StatusChip label={String(row.estado)} tone={TONE[String(row.estado)] ?? 'blue'} />
            </div>

            <dl className="cm-grid">
                <div><dt>Emisión</dt><dd>{date(row.emision)}</dd></div>
                <div><dt>Vencimiento</dt><dd className={String(row.estado) === 'Vencida' ? 'cm-late' : undefined}>{date(row.vence)}</dd></div>
            </dl>

            <div className="cm-amount">
                <span>{paid ? 'Cobrado' : 'Monto a cobrar'}</span>
                <strong className="mono">{formatMoney(paid ? Number(row.total) : saldo)}</strong>
            </div>

            {!paid && (
                <div className="cm-fields">
                    <label className="field">
                        <span className="field__label">Canal</span>
                        <select className="field__control" value={canal} onChange={e => setCanal(e.target.value)}>
                            <option value="Caja">Caja (efectivo)</option>
                            <option value="Bancos">Bancos (transferencia)</option>
                        </select>
                    </label>
                    <label className="field">
                        <span className="field__label">Referencia</span>
                        <input className="field__control" value={ref} onChange={e => setRef(e.target.value)} placeholder="Nº operación / voucher" />
                    </label>
                </div>
            )}

            {error && <div className="drawer-error" role="alert">{error}</div>}
        </Modal>
    );
}