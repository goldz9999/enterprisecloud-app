import { useState } from 'react';
import { audit } from '@/data/domain/audit';
import { clearAllData, mutate, useDB } from '@/data/store';
import { canManageData, downloadBackup } from '@/shared/lib/dataManagement';
import { Modal } from './Modal';

type Step = 'menu' | 'clear';

/** Data management: delete all local data, or download a backup first. */
export function DataDialog({ onClose, onDone, initial = 'menu' }: { onClose: () => void; onDone?: (msg: string) => void; initial?: Step }) {
  const d = useDB();
  const [step, setStep] = useState<Step>(initial);
  const [backedUp, setBackedUp] = useState(false);
  const allowed = canManageData(d);

  const finish = (msg: string) => {
    onClose();
    onDone?.(msg);
  };

  const backupButton = (
    <button type="button" className="btn" style={{ height: 30 }} onClick={() => { downloadBackup(); setBackedUp(true); }}>
      {backedUp ? 'Respaldo descargado ✓' : 'Descargar respaldo'}
    </button>
  );

  if (!allowed)
    return (
      <Modal title="Datos" onClose={onClose} footer={<button type="button" className="btn" style={{ height: 30 }} onClick={onClose}>Cerrar</button>}>
        <div>Estás usando datos locales. Solo un Administrador o Gerente puede borrarlos.</div>
      </Modal>
    );

  if (step === 'menu')
    return (
      <Modal title="Datos locales" onClose={onClose} footer={<button type="button" className="btn" style={{ height: 30 }} onClick={onClose}>Cerrar</button>}>
        <div style={{ textWrap: 'pretty' }}>
          Estás trabajando con tus propios datos, guardados en este navegador. Descarga respaldos con frecuencia: si se borran los datos del navegador, se pierden.
        </div>
        <div className="data-choices">
          <button type="button" className="data-choice is-danger" onClick={() => setStep('clear')}>
            <strong>Borrar todos los datos</strong>
            <span>Deja el sistema vacío para registrar tus almacenes, productos, clientes y operaciones.</span>
          </button>
          <button type="button" className="data-choice" onClick={() => { downloadBackup(); setBackedUp(true); }}>
            <strong>{backedUp ? 'Respaldo descargado ✓' : 'Descargar respaldo (.json)'}</strong>
            <span>Guarda una copia de todo; se puede importar en Configuración › Datos.</span>
          </button>
        </div>
      </Modal>
    );

  return (
    <Modal
      title="Borrar todos los datos"
      onClose={onClose}
      footer={
        <>
          {backupButton}
          <span style={{ flex: 1 }} />
          <button type="button" className="btn" style={{ height: 30 }} onClick={onClose}>Cancelar</button>
          <button
            type="button"
            className="btn btn--primary"
            style={{ height: 30, padding: '0 14px', background: 'var(--danger)' }}
            onClick={() => {
              clearAllData();
              mutate(dr => audit(dr, { action: 'Eliminar', module: 'Administración', ref: 'Datos', desc: 'Todos los datos eliminados' }));
              finish('Listo: el sistema está vacío y listo para tus datos');
            }}
          >
            Sí, borrar
          </button>
        </>
      }
    >
      <div>Se eliminarán clientes, proveedores, productos, categorías, almacenes, stock, kardex, ventas, compras, cotizaciones, solicitudes, comprobantes, cuentas por cobrar y pagar, caja, bancos, documentos y la auditoría.</div>
      <div className="note">Se conservan la configuración, los roles y permisos, y tu usuario como Administrador (con tu misma contraseña).</div>
      <div style={{ fontSize: 12, color: 'var(--muted)', textWrap: 'pretty' }}>
        Para empezar: Mantenimiento › Almacenes → Categorías → Productos → Clientes y Proveedores. Luego Configuración › Tesorería (cuentas bancarias), una compra para ingresar stock y tus ventas.
      </div>
    </Modal>
  );
}