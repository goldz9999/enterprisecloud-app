import type { ReactNode } from 'react';
import { useEffect } from 'react';

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
  children: ReactNode;
}

/** Right-side panel over a dimmed backdrop. Closes on backdrop click or Esc. */
export function Drawer({ kicker, title, subtitle, badge, footer, onClose, width, children }: DrawerProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer" style={width ? { width } : undefined} role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()}>
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
