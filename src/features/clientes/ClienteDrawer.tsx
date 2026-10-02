import { useState } from 'react';
import { Drawer } from '../../components/Drawer';
import { StatusChip } from '../../components/StatusChip';
import { CONDICIONES_PAGO, ESTADOS_CLIENTE, TIPOS_DOCUMENTO, VENDEDORES, type Cliente, type ClienteInput } from './types';
import { ESTADO_TONE } from './estado';

type FormKey = keyof ClienteInput;
type FormState = Record<FormKey, string>;

interface FieldDef {
  key: FormKey;
  label: string;
  required?: boolean;
  wide?: boolean;
  placeholder?: string;
  type?: 'text' | 'number';
  options?: readonly string[];
}

const FIELDS: FieldDef[] = [
  { key: 'tipoDocumento', label: 'Tipo de documento', options: TIPOS_DOCUMENTO },
  { key: 'numeroDocumento', label: 'N.º de documento', required: true, placeholder: '11 dígitos para RUC' },
  { key: 'razonSocial', label: 'Razón social / nombre', required: true, wide: true },
  { key: 'direccion', label: 'Dirección fiscal', wide: true },
  { key: 'contacto', label: 'Persona de contacto' },
  { key: 'telefono', label: 'Teléfono' },
  { key: 'correo', label: 'Correo para comprobantes', wide: true },
  { key: 'condicionPago', label: 'Condición de pago', options: CONDICIONES_PAGO },
  { key: 'lineaCredito', label: 'Línea de crédito (S/)', type: 'number' },
  { key: 'vendedor', label: 'Vendedor asignado', options: VENDEDORES },
  { key: 'estado', label: 'Estado', options: ESTADOS_CLIENTE },
];

function initialForm(cliente: Cliente | null): FormState {
  const form = {} as FormState;
  for (const f of FIELDS) {
    form[f.key] = cliente ? String(cliente[f.key] ?? '') : f.options ? f.options[0] : '';
  }
  return form;
}

function toInput(form: FormState): ClienteInput {
  return {
    ...form,
    lineaCredito: Number(form.lineaCredito) || 0,
  } as ClienteInput;
}

interface ClienteDrawerProps {
  /** null → creating a new client. */
  cliente: Cliente | null;
  onClose: () => void;
  onSave: (input: ClienteInput) => void;
  onDelete: () => void;
}

export function ClienteDrawer({ cliente, onClose, onSave, onDelete }: ClienteDrawerProps) {
  const isNew = cliente === null;
  const [form, setForm] = useState<FormState>(() => initialForm(cliente));
  const [showErrors, setShowErrors] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isMissing = (f: FieldDef) => !!f.required && !form[f.key].trim();

  const save = () => {
    if (FIELDS.some(isMissing)) {
      setShowErrors(true);
      return;
    }
    onSave(toInput(form));
  };

  return (
    <Drawer
      kicker={isNew ? 'Mantenimiento · Clientes' : 'Cliente'}
      title={isNew ? 'Nuevo cliente' : cliente.razonSocial}
      subtitle={isNew ? 'Completa los campos obligatorios (*)' : cliente.codigo}
      badge={cliente && <StatusChip label={cliente.estado} tone={ESTADO_TONE[cliente.estado]} dot={false} />}
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
          <div className="drawer-actions">
            {!isNew && (
              <button type="button" className="btn btn--danger-text" onClick={() => setConfirmDelete(true)}>Eliminar</button>
            )}
            <span className="drawer-actions__spacer" />
            <button type="button" className="btn" onClick={onClose}>Cancelar</button>
            <button type="button" className="btn btn--primary" style={{ padding: '0 16px' }} onClick={save}>
              {isNew ? 'Crear' : 'Guardar cambios'}
            </button>
          </div>
        </>
      }
    >
      <div className="form-grid">
        {FIELDS.map(f => {
          const invalid = showErrors && isMissing(f);
          const set = (value: string) => setForm(s => ({ ...s, [f.key]: value }));
          const controlClass = 'field__control' + (invalid ? ' is-invalid' : '');
          return (
            <label key={f.key} className={'field' + (f.wide ? ' field--wide' : '')}>
              <span className="field__label">{f.label}{f.required ? ' *' : ''}</span>
              {f.options ? (
                <select className={controlClass} value={form[f.key]} onChange={e => set(e.target.value)}>
                  {f.options.map(o => <option key={o}>{o}</option>)}
                </select>
              ) : (
                <input
                  className={controlClass}
                  type={f.type ?? 'text'}
                  value={form[f.key]}
                  placeholder={f.placeholder}
                  onChange={e => set(e.target.value)}
                  aria-invalid={invalid || undefined}
                />
              )}
              {invalid && <span className="field__error">Campo obligatorio</span>}
            </label>
          );
        })}
      </div>
      <div className="note">
        Un cliente con órdenes o comprobantes registrados no se elimina: se marca como Inactivo para conservar el historial.
      </div>
    </Drawer>
  );
}
