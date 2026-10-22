import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Drawer } from '@/shared/components/Drawer';
import { StatusChip } from '@/shared/components/StatusChip';
import { isRemote } from '@/data/domain/remote';
import { useDB } from '@/data/store';
import type { DB } from '@/data/types';
import { formatValue } from '@/shared/lib/format';
import type { Action, Field, RecordsConfig, Row, Value } from './types';

export type DrawerMode = 'new' | 'edit' | 'view';

interface RecordDrawerProps {
  cfg: RecordsConfig;
  mode: DrawerMode;
  /** null when creating. */
  row: Row | null;
  /** Error from the last save/action, shown above the buttons. */
  error?: string;
  canDelete: boolean;
  /** Actions the user is allowed to run. */
  actions: Action[];
  onClose: () => void;
  onSave: (values: Record<string, Value>) => void;
  onDelete: () => void;
  onAction: (a: Action, values: Record<string, string>) => void;
  /** Abre directamente el formulario de la primera acción (p. ej. «Registrar cobro»). */
  startWithAction?: boolean;
}

function optionsOf(f: Field, d: DB): string[] {
  return typeof f.options === 'function' ? f.options(d) : f.options ?? [];
}

function suggestionsOf(f: Field, d: DB): string[] {
  return typeof f.suggestions === 'function' ? f.suggestions(d) : f.suggestions ?? [];
}

function defaultOf(f: Field, d: DB, row?: Row): string {
  if (typeof f.value === 'function') return f.value(d, row);
  if (f.value != null) return f.value;
  return f.type === 'select' ? optionsOf(f, d)[0] ?? '' : '';
}

function initialForm(fields: Field[], d: DB, row: Row | null): Record<string, string> {
  const form: Record<string, string> = {};
  for (const f of fields) {
    if (!row) form[f.k] = defaultOf(f, d);
    else if (row[f.k] != null) form[f.k] = String(row[f.k]);
    else form[f.k] = f.value != null ? defaultOf(f, d, row) : '';
  }
  return form;
}

/** Form grid shared by record editing and action prompts. */
function FieldGrid({ fields, form, setForm, showErrors, d }: { fields: Field[]; form: Record<string, string>; setForm: (fn: (f: Record<string, string>) => Record<string, string>) => void; showErrors: boolean; d: DB }) {
  return (
    <div className="form-grid">
      {fields.filter(f => !f.showIf || f.showIf(form)).map(f => {
        const invalid = showErrors && !!f.required && !String(form[f.k] ?? '').trim();
        const set = (value: string) => setForm(s => ({ ...s, [f.k]: value }));
        const cls = 'field__control' + (invalid ? ' is-invalid' : '');
        const opts = optionsOf(f, d);
        const hints = suggestionsOf(f, d);
        const listId = hints.length ? `hints-${f.k}` : undefined;
        const value = form[f.k] ?? '';
        return (
          <label key={f.k} className={'field' + (f.wide ? ' field--wide' : '')}>
            <span className="field__label">{f.label}{f.required ? ' *' : ''}</span>
            {f.type === 'select' ? (
              <select className={cls} value={value} onChange={e => set(e.target.value)}>
                {/* Keep a stored value visible even if it is no longer an option (e.g. a deleted category). */}
                {value && !opts.includes(value) && <option>{value}</option>}
                {!value && <option value="">— Selecciona —</option>}
                {opts.map(o => <option key={o}>{o}</option>)}
              </select>
            ) : (
              <input
                className={cls}
                type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : f.type === 'password' ? 'password' : 'text'}
                autoComplete={f.type === 'password' ? 'new-password' : undefined}
                step={f.type === 'number' ? 'any' : undefined}
                value={value}
                placeholder={f.placeholder}
                readOnly={f.readOnly}
                title={f.readOnly ? 'Lo calcula el sistema' : undefined}
                list={listId}
                onChange={e => set(e.target.value)}
                aria-invalid={invalid || undefined}
              />
            )}
            {listId && <datalist id={listId}>{hints.map(h => <option key={h} value={h} />)}</datalist>}
            {invalid && <span className="field__error">Campo obligatorio</span>}
          </label>
        );
      })}
    </div>
  );
}

export function RecordDrawer({ cfg, mode, row, error, canDelete, actions, onClose, onSave, onDelete, onAction, startWithAction }: RecordDrawerProps) {
  const navigate = useNavigate();
  const d = useDB();
  const isNew = mode === 'new';
  const isEdit = mode !== 'view';
  // Fields marked `only: 'new'` / `only: 'edit'` appear in just that mode.
  const fields = cfg.fields.filter(f => !f.only || (isNew ? f.only === 'new' : isEdit && f.only === 'edit'));
  // Remote records (backend) are never deleted: "Eliminar" deactivates them.
  const remote = isRemote(cfg.collection);
  const [form, setForm] = useState(() => initialForm(fields, d, row));
  const [showErrors, setShowErrors] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // An action that needs input before running.
  const actionForm = (fields: Field[]) => Object.fromEntries(fields.map(f => [f.k, defaultOf(f, d, row ?? undefined)]));
  const [pending, setPending] = useState<{ action: Action; fields: Field[]; form: Record<string, string> } | null>(() => {
    const a = startWithAction && row ? actions.find(x => !x.href && !x.danger) : undefined;
    const fs = a ? (typeof a.fields === 'function' ? a.fields(row!, d) : a.fields) : undefined;
    return a && fs?.length ? { action: a, fields: fs, form: actionForm(fs) } : null;
  });

  const status = row ? String(row[cfg.statusKey]) : '';
  const note = (row && cfg.notes?.[status]) || cfg.note;

  const save = () => {
    if (fields.some(f => f.required && !String(form[f.k] ?? '').trim())) {
      setShowErrors(true);
      return;
    }
    const values: Record<string, Value> = { ...form };
    for (const f of fields) if (f.type === 'number') values[f.k] = Number(form[f.k]) || 0;
    onSave(values);
  };

  const startAction = (a: Action) => {
    if (a.href) return navigate(typeof a.href === 'function' ? a.href(row!) : a.href);
    const fields = typeof a.fields === 'function' ? a.fields(row!, d) : a.fields;
    if (fields?.length) {
      setShowErrors(false);
      setPending({ action: a, fields, form: actionForm(fields) });
    } else onAction(a, {});
  };

  const confirmAction = () => {
    if (!pending) return;
    if (pending.fields.some(f => f.required && (!f.showIf || f.showIf(pending.form)) && !String(pending.form[f.k] ?? '').trim())) {
      setShowErrors(true);
      return;
    }
    onAction(pending.action, pending.form);
    setPending(null);
  };

  const errorBox = error && <div className="drawer-error" role="alert">{error}</div>;

  const editFooter = (
    <div className="drawer-actions">
      {mode === 'edit' && canDelete && (
        <button type="button" className="btn btn--danger-text" onClick={() => setConfirmDelete(true)}>{remote ? 'Dar de baja' : 'Eliminar'}</button>
      )}
      <span className="drawer-actions__spacer" />
      <button type="button" className="btn" onClick={onClose}>Cancelar</button>
      <button type="button" className="btn btn--primary" style={{ padding: '0 16px' }} onClick={save}>
        {isNew ? 'Crear' : 'Guardar cambios'}
      </button>
    </div>
  );

  const viewFooter = pending ? (
    <div className="drawer-actions">
      <span className="drawer-actions__spacer" />
      {/* Si el formulario se abrió solo (p. ej. cobro), Cancelar cierra la ventana en vez de volver al detalle. */}
      <button type="button" className="btn" onClick={() => (startWithAction ? onClose() : setPending(null))}>Cancelar</button>
      <button type="button" className={'btn ' + (pending.action.danger ? 'btn--danger-text' : 'btn--primary')} style={{ padding: '0 16px' }} onClick={confirmAction}>
        {pending.action.label.replace(' →', '')}
      </button>
    </div>
  ) : actions.length ? (
    actions.map(a => (
      <button
        key={a.label}
        type="button"
        className={'btn btn--block' + (a.primary ? ' btn--primary' : '') + (a.danger ? ' btn--danger-text' : '')}
        onClick={() => startAction(a)}
      >
        {a.label}
      </button>
    ))
  ) : (
    <span className="drawer-readonly">Registro de solo lectura</span>
  );

  return (
    <Drawer
      kicker={isNew ? cfg.newKicker ?? 'Nuevo registro' : cfg.entity}
      title={isNew ? cfg.newTitle ?? 'Nuevo registro' : String(row?.[cfg.titleKey] ?? '')}
      subtitle={isNew ? 'Completa los campos obligatorios (*)' : cfg.subKey && row ? String(row[cfg.subKey] ?? '') : undefined}
      badge={row && <StatusChip label={status} tone={cfg.statuses[status] ?? 'muted'} dot={false} />}
      centered={cfg.centered}
      width={cfg.centered ? 560 : undefined}
      onClose={onClose}
      footer={
        <>
          {errorBox}
          {confirmDelete && (
            <div className="confirm-del">
              <span className="confirm-del__text">{remote ? '¿Dar de baja este registro? Quedará Inactivo y conservará su historial.' : '¿Eliminar este registro? La acción queda registrada en auditoría.'}</span>
              <button type="button" className="confirm-del__no" onClick={() => setConfirmDelete(false)}>No</button>
              <button type="button" className="confirm-del__yes" onClick={onDelete}>{remote ? 'Sí, dar de baja' : 'Sí, eliminar'}</button>
            </div>
          )}
          {isEdit ? editFooter : viewFooter}
        </>
      }
    >
      {isEdit ? (
        <FieldGrid fields={fields} form={form} setForm={setForm} showErrors={showErrors} d={d} />
      ) : (
        row && (
          <div className="form-grid">
            {fields.map(f => (
              <div key={f.k} className={'readfield' + (f.wide ? ' field--wide' : '')}>
                <span className="field__label">{f.label}</span>
                <span className={'readfield__value' + (f.mono || f.fmt ? ' mono' : '')}>{formatValue(row[f.k], f.fmt)}</span>
              </div>
            ))}
          </div>
        )
      )}
      {pending && (
        <div className="action-form">
          <div className="panel__title" style={{ fontSize: 13 }}>{pending.action.label.replace(' →', '')}</div>
          <FieldGrid fields={pending.fields} form={pending.form} setForm={fn => setPending(p => p && { ...p, form: fn(p.form) })} showErrors={showErrors} d={d} />
        </div>
      )}
      {note && !pending && <div className="note">{note}</div>}
    </Drawer>
  );
}