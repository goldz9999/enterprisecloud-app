import { useCallback, useEffect, useRef, useState } from 'react';

/** Transient confirmation message; each call replaces the previous one and restarts the timer. */
export function useToast(duration = 2600) {
  const [message, setMessage] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const flash = useCallback(
    (msg: string) => {
      clearTimeout(timer.current);
      setMessage(msg);
      timer.current = setTimeout(() => setMessage(''), duration);
    },
    [duration],
  );

  useEffect(() => () => clearTimeout(timer.current), []);

  return { message, flash };
}

// Solo decide el icono y el color; el texto del aviso no cambia.
const ERROR_RE = /\b(error|no se pudo|no se puede|no puede|fall[óo]|inv[aá]lid|rechaz|denegad|sin permiso|insuficiente|no existe)/i;

export function Toast({ message }: { message: string }) {
  // Se conserva el último mensaje un instante para poder animar la salida.
  const [shown, setShown] = useState(message);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (message) {
      setShown(message);
      setLeaving(false);
      return;
    }
    setLeaving(true);
    const t = setTimeout(() => {
      setShown('');
      setLeaving(false);
    }, 260);
    return () => clearTimeout(t);
  }, [message]);

  if (!shown) return null;
  const isError = ERROR_RE.test(shown);
  return (
    <div className={'toast' + (isError ? ' toast--error' : '') + (leaving ? ' is-leaving' : '')} role="status">
      <span className="toast__icon">
        {isError ? (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 7v6M12 17.5v.01" /></svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
        )}
      </span>
      {shown}
      {!leaving && <span key={shown} className="toast__bar" />}
    </div>
  );
}