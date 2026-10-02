import type { ReactNode } from 'react';
import { useEffect } from 'react';
import './Modal.css';

interface ModalProps {
  title: string;
  onClose: () => void;
  footer: ReactNode;
  children: ReactNode;
}

/** Centered dialog over a dimmed backdrop. Closes on backdrop click or Esc. */
export function Modal({ title, onClose, footer, children }: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()}>
        <div className="modal__head">
          <div className="panel__title">{title}</div>
          <button type="button" className="drawer__close" style={{ marginLeft: 'auto', fontSize: 16 }} title="Cerrar" onClick={onClose}>×</button>
        </div>
        <div className="modal__body">{children}</div>
        <div className="modal__foot">{footer}</div>
      </div>
    </div>
  );
}
