import type { ReactNode } from 'react';
import { useEffect } from 'react';
import './Drawer.css';

interface DrawerProps {
  kicker: string;
  title: string;
  subtitle?: string;
  /** Rendered next to the title (e.g. a status chip). */
  badge?: ReactNode;
  footer: ReactNode;
  onClose: () => void;
  /** Panel width in px (default 460). */
  width?: number;
  /** Ventana centrada en lugar de panel lateral. */
  centered?: boolean;
  children: ReactNode;
}

/** Right-side panel over a dimmed backdrop. Closes on backdrop click or Esc. */
export function Drawer({ kicker, title, subtitle, badge, footer, onClose, width, centered, children }: DrawerProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className={'drawer-backdrop' + (centered ? ' drawer-backdrop--center' : '')} onClick={onClose}>
      <aside className={'drawer' + (centered ? ' drawer--center' : '')} style={width ? { width } : undefined} role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()}>
        <div className="drawer__head">
          <div className="drawer__titles">
            <div className="drawer__kicker">{kicker}</div>
            <div className="drawer__title">{title}</div>
            {subtitle && <div className="drawer__sub">{subtitle}</div>}
          </div>
          {badge}
          <button type="button" className="drawer__close" title="Cerrar (Esc)" onClick={onClose}>×</button>
        </div>
        <div className="drawer__body">{children}</div>
        <div className="drawer__foot">{footer}</div>
      </aside>
    </div>
  );
}