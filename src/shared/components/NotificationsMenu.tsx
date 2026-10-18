import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { alertsFrom, useDashboard } from '@/data/domain/dashboard';
import { mutate, useDB } from '@/data/store';
import './NotificationsMenu.css';

const GROUP: Record<string, { label: string; color: string }> = {
  stock: { label: 'Stock bajo mínimo', color: 'var(--red)' },
  cxc: { label: 'Facturas vencidas', color: 'var(--amber)' },
  cxp: { label: 'Pagos a proveedores', color: 'var(--amber)' },
  user: { label: 'Usuarios', color: 'var(--blue)' },
};

/** Bell with the unread system alerts (stock, overdue invoices, users). */
export function NotificationsMenu() {
  const d = useDB();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { data } = useDashboard('Mes');
  const all = alertsFrom(data);
  const unread = all.filter(a => !d.alertsRead.includes(a.key));

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const markRead = (keys: string[]) => mutate(dr => { dr.alertsRead = [...new Set([...dr.alertsRead, ...keys])]; });

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" className="icon-btn" title="Notificaciones" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10 21a2 2 0 0 0 4 0" /></svg>
        {unread.length > 0 && <span className="notif-badge">{unread.length > 99 ? '99+' : unread.length}</span>}
      </button>
      {open && (
        <div className="notif-menu" role="menu">
          <div className="notif-menu__head">
            <span className="panel__title" style={{ fontSize: 13 }}>Notificaciones</span>
            {unread.length > 0 && (
              <button type="button" className="link-btn" style={{ marginLeft: 'auto', height: 'auto', padding: 0 }} onClick={() => markRead(all.map(a => a.key))}>
                Marcar todas como leídas
              </button>
            )}
          </div>
          {all.length === 0 && <div className="notif-menu__empty">Sin alertas. Todo en orden.</div>}
          <div className="notif-menu__list">
            {all.slice(0, 12).map(a => (
              <button
                key={a.key}
                type="button"
                role="menuitem"
                className={'notif-item' + (d.alertsRead.includes(a.key) ? ' is-read' : '')}
                onClick={() => {
                  markRead([a.key]);
                  setOpen(false);
                  navigate(a.to);
                }}
              >
                <span className="notif-item__dot" style={{ background: GROUP[a.group].color }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="notif-item__group">{GROUP[a.group].label}</span>
                  <span className="ellipsis" style={{ display: 'block', fontWeight: 500 }}>{a.title}</span>
                  <span className="ellipsis mono" style={{ display: 'block', fontSize: 11, color: 'var(--faint)' }}>{a.sub}</span>
                </span>
                {a.value && <span className="mono" style={{ fontSize: 12 }}>{a.value}</span>}
              </button>
            ))}
          </div>
          {all.length > 12 && <div className="notif-menu__empty">y {all.length - 12} alertas más en el Dashboard</div>}
        </div>
      )}
    </div>
  );
}