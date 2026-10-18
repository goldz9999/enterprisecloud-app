import { useCallback, useEffect, useRef, useState } from 'react';
import './Toast.css';

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

export function Toast({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="toast" role="status">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
      {message}
    </div>
  );
}
