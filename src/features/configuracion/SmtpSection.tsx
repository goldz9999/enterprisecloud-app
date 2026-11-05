import { useEffect, useState } from 'react';
import { gestionError, smtpApi, type SmtpSettings } from '@/modules/gestionApi';

const EMPTY: SmtpSettings = { host: '', port: 587, username: '', fromAddress: '', useTls: true, enabled: false };

interface SmtpSectionProps {
    canEdit: boolean;
    onMessage: (msg: string) => void;
}

export function SmtpSection({ canEdit, onMessage }: SmtpSectionProps) {
    const [form, setForm] = useState<SmtpSettings & { password: string }>(
        { ...EMPTY, password: '' }
    );
    const [saved, setSaved] = useState<SmtpSettings>(EMPTY);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState('');

    useEffect(() => {
        smtpApi.get()
            .then(s => { setSaved(s); setForm(f => ({ ...s, password: f.password })); })
            .catch(e => onMessage(gestionError(e)))
            .finally(() => setLoading(false));
    }, [onMessage]);

    const set = (k: keyof typeof form, v: string | number | boolean) =>
        setForm(f => ({ ...f, [k]: v }));

    const save = async () => {
        if (saving) return;
        setSaving(true);
        setTestResult('');
        try {
            const result = await smtpApi.save({ ...form, password: form.password || null });
            setSaved(result);
            setForm(f => ({ ...result, password: f.password }));
            onMessage('Configuración SMTP guardada');
        } catch (e) {
            onMessage(gestionError(e));
        } finally {
            setSaving(false);
        }
    };

    const test = async () => {
        if (testing) return;
        setTesting(true);
        setTestResult('');
        try {
            const r = await smtpApi.test();
            setTestResult(r.ok ? '✓ Email de prueba enviado correctamente' : `✗ Error: ${r.error || 'falló'}`);
        } catch (e) {
            setTestResult(`✗ ${gestionError(e)}`);
        } finally {
            setTesting(false);
        }
    };

    if (loading) return <div className="muted" style={{ fontSize: 14 }}>Cargando…</div>;

    const changed = JSON.stringify({ host: form.host, port: form.port, username: form.username, fromAddress: form.fromAddress, useTls: form.useTls, enabled: form.enabled }) !==
        JSON.stringify({ host: saved.host, port: saved.port, username: saved.username, fromAddress: saved.fromAddress, useTls: saved.useTls, enabled: saved.enabled }) || !!form.password;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="settings__fields">
                {/* Enable toggle */}
                <div className="field field--wide">
                    <span className="field__label">Activar notificaciones</span>
                    <button type="button" role="switch" aria-checked={form.enabled} aria-label="Activar notificaciones" className="switch-row"
                        disabled={!canEdit} onClick={() => set('enabled', !form.enabled)}>
                        <span className={'switch' + (form.enabled ? ' is-on' : '')}><span /></span>
                        {form.enabled ? 'Enviará emails al cliente en cada cambio de estado' : 'No se enviarán emails'}
                    </button>
                </div>

                <div className="field">
                    <span className="field__label">Host SMTP</span>
                    <input className="field__control" placeholder="smtp.gmail.com" value={form.host}
                        disabled={!canEdit} onChange={e => set('host', e.target.value)} />
                </div>
                <div className="field">
                    <span className="field__label">Puerto</span>
                    <input className="field__control" type="number" placeholder="587" value={String(form.port)}
                        disabled={!canEdit} onChange={e => set('port', parseInt(e.target.value) || 587)} />
                </div>
                <div className="field">
                    <span className="field__label">Usuario / Email</span>
                    <input className="field__control" placeholder="tu@empresa.com" value={form.username}
                        disabled={!canEdit} onChange={e => set('username', e.target.value)} />
                </div>
                <div className="field">
                    <span className="field__label">Contraseña</span>
                    <input className="field__control" type="password" placeholder="Dejar en blanco para no cambiar"
                        value={form.password} disabled={!canEdit} onChange={e => set('password', e.target.value)} />
                </div>
                <div className="field">
                    <span className="field__label">Remitente (From)</span>
                    <input className="field__control" placeholder="Sistema ERP &lt;noreply@empresa.com&gt;" value={form.fromAddress}
                        disabled={!canEdit} onChange={e => set('fromAddress', e.target.value)} />
                </div>
                <div className="field">
                    <span className="field__label">Usar TLS/STARTTLS</span>
                    <button type="button" role="switch" aria-checked={form.useTls} aria-label="Usar TLS" className="switch-row"
                        disabled={!canEdit} onClick={() => set('useTls', !form.useTls)}>
                        <span className={'switch' + (form.useTls ? ' is-on' : '')}><span /></span>
                        {form.useTls ? 'TLS activo (recomendado)' : 'Sin TLS'}
                    </button>
                </div>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                {canEdit && (
                    <button type="button" className="btn btn--primary" disabled={saving || !changed} onClick={() => void save()}>
                        {saving ? 'Guardando…' : 'Guardar'}
                    </button>
                )}
                <button type="button" className="btn" disabled={testing || !saved.enabled || !saved.host}
                    onClick={() => void test()} title={!saved.enabled ? 'Activa primero las notificaciones' : ''}>
                    {testing ? 'Enviando…' : 'Enviar email de prueba'}
                </button>
                {testResult && (
                    <span style={{ fontSize: 13, color: testResult.startsWith('✓') ? 'var(--green)' : 'var(--red)' }}>
                        {testResult}
                    </span>
                )}
            </div>

            <div style={{ fontSize: 12, color: 'var(--faint)' }}>
                Eventos que disparan un email: <b>Salió del almacén</b> (al despachar), <b>Entregado</b> y <b>No pudo entregarse</b>. Solo se envía si la venta tiene el email del cliente registrado.
            </div>
        </div>
    );
}
