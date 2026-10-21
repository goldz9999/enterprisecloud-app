import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
  title: string;
  onClose: () => void;
  footer: ReactNode;
  children: ReactNode;
}

/**
 * Diálogo centrado sobre un fondo atenuado. Se cierra con clic fuera o Esc.
 *
 * Se renderiza en <body> (portal) y no dentro de quien lo abre: antes, "Mi perfil" y
 * "Cambiar contraseña" nacían dentro del sidebar, que en tema claro redefine las variables
 * de color a azul marino. Por eso el modal salía mitad oscuro y mitad claro.
 */
export function Modal({ title, onClose, footer, children }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Bloquea el scroll de fondo y enfoca el primer campo al abrir.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const t = window.setTimeout(() => {
      ref.current?.querySelector<HTMLElement>('input:not(:disabled), select, textarea')?.focus();
    }, 60);
    return () => {
      document.body.style.overflow = prev;
      window.clearTimeout(t);
    };
  }, []);

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div ref={ref} className="modal" role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()}>
        <div className="modal__head">
          <div className="panel__title">{title}</div>
          <button type="button" className="modal__close" title="Cerrar" aria-label="Cerrar" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="modal__body">{children}</div>
        <div className="modal__foot">{footer}</div>
      </div>
    </div>,
    document.body,
  );
}