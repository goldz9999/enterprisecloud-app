import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Drawer } from '../../components/Drawer';
import { StatusChip } from '../../components/StatusChip';
import { formatValue } from '../../lib/format';
import type { Action, Field, RecordsConfig, Row, Value } from './types';

export type DrawerMode = 'new' | 'edit' | 'view';

interface RecordDrawerProps {
  cfg: RecordsConfig;
  mode: DrawerMode;
  /** null when creating. */
  row: Row | null;
  onClose: () => void;
  onSave: (values: Record<string, Value>) => void;
  onDelete: () => void;
  onAction: (a: Action) => void;
}

function initialForm(fields: Field[], row: Row | null): Record<string, string> {
  const form: Record<string, string> = {};
  for (const f of fields) form[f.k] = row ? String(row[f.k] ?? '') : f.options ? f.options[0] : '';
  return form;
}

export function RecordDrawer({ cfg, mode, row, onClose, onSave, onDelete, onAction }: RecordDrawerProps) {
  const navigate = useNavigate();
  const [form, setForm] = useState(() => initialForm(cfg.fields, row));
  const [showErrors, setShowErrors] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isNew = mode === 'new';
  const isEdit = mode !== 'view';
  const status = row ? String(row[cfg.statusKey]) : '';
  const note = (row && cfg.notes?.[status]) || cfg.note;
  const actions = row && cfg.actions ? (cfg.actions[status] ?? cfg.actions['*'] ?? []) : [];

  const isMissing = (f: Field) => !!f.required && !String(form[f.k] ?? '').trim();

  const save = () => {
    if (cfg.fields.some(isMissing)) {
      setShowErrors(true);
      return;
    }
    const values: Record<string, Value> = { ...form };
    for (const f of cfg.fields) if (f.type === 'number') values[f.k] = Number(form[f.k]) || 0;
    onSave(values);
  };

  const editFooter = (
    <div className="drawer-actions">
      {mode === 'edit' && (
        <button type="button" className="btn btn--danger-text" onClick={() => setConfirmDelete(true)}>Eliminar</button>
      )}
      <span className="drawer-actions__spacer" />
      <button type="button" className="btn" onClick={onClose}>Cancelar</button>
      <button type="button" className="btn btn--primary" style={{ padding: '0 16px' }} onClick={save}>
        {isNew ? 'Crear' : 'Guardar cambios'}
      </button>
    </div>
  );

  const viewFooter = actions.length ? (
    actions.map(a => (
      <button
        key={a.label}
        type="button"
        className={'btn btn--block' + (a.primary ? ' btn--primary' : '') + (a.danger ? ' btn--danger-text' : '')}
        onClick={() => (a.href ? navigate(a.href) : onAction(a))}
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
      onClose={onClose}
      footer={
        <>
          {confirmDelete && (
            <div className="confirm-del">
              <span className="confirm-del__text">¿Eliminar este registro? La acción queda registrada en auditoría.</span>
              <button type="button" className="confirm-del__no" onClick={() => setConfirmDelete(false)}>No</button>
              <button type="button" className="confirm-del__yes" onClick={onDelete}>Sí, eliminar</button>
            </div>
          )}
          {isEdit ? editFooter : viewFooter}
        </>
      }
    >
      <div className="form-grid">
        {isEdit
          ? cfg.fields.map(f => {
              const invalid = showErrors && isMissing(f);
              const set = (value: string) => setForm(s => ({ ...s, [f.k]: value }));
              const cls = 'field__control' + (invalid ? ' is-invalid' : '');
              return (
                <label key={f.k} className={'field' + (f.wide ? ' field--wide' : '')}>
                  <span className="field__label">{f.label}{f.required ? ' *' : ''}</span>
                  {f.type === 'select' ? (
                    <select className={cls} value={form[f.k]} onChange={e => set(e.target.value)}>
                      {f.options?.map(o => <option key={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input
                      className={cls}
                      type={f.type === 'number' ? 'number' : 'text'}
                      value={form[f.k]}
                      placeholder={f.placeholder}
                      onChange={e => set(e.target.value)}
                      aria-invalid={invalid || undefined}
                    />
                  )}
                  {invalid && <span className="field__error">Campo obligatorio</span>}
                </label>
              );
            })
          : row &&
            cfg.fields.map(f => (
              <div key={f.k} className={'readfield' + (f.wide ? ' field--wide' : '')}>
                <span className="field__label">{f.label}</span>
                <span className={'readfield__value' + (f.mono || f.fmt ? ' mono' : '')}>{formatValue(row[f.k], f.fmt)}</span>
              </div>
            ))}
      </div>
      {note && <div className="note">{note}</div>}
    </Drawer>
  );
}
