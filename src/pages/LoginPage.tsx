import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { login } from '../data/domain/auth';
import { useSession } from '../data/session';
import { useDB } from '../data/store';
import { useTheme } from '../lib/theme';
import './LoginPage.css';

function validate(email: string, pass: string) {
  return {
    email: !email.trim() ? 'Ingresa tu correo corporativo.' : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? 'El formato del correo no es válido.' : '',
    pass: !pass ? 'Ingresa tu contraseña.' : pass.length < 8 ? 'La contraseña tiene al menos 8 caracteres.' : '',
  };
}

export function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const session = useSession();
  const d = useDB();
  const { theme, toggle } = useTheme();
  const firstRun = d.records.usuarios.length === 0;
  const [email, setEmail] = useState(firstRun ? '' : 'maria.rojas@empresa.pe');
  const [pass, setPass] = useState('');
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const [touched, setTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState<{ title: string; msg: string } | null>(null);
  const [info, setInfo] = useState('');

  const errors = validate(email, pass);
  const next = params.get('next') || '/';

  if (session && !loading) return <Navigate to={next} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    setAuthError(null);
    setInfo('');
    if (errors.email || errors.pass) return;
    setLoading(true);
    // Small delay so the verifying state is visible, as in the design.
    await new Promise(r => setTimeout(r, 500));
    const res = await login(email, pass, remember);
    if (res.ok) return navigate(next, { replace: true });
    setLoading(false);
    setAuthError({
      title: res.locked ? 'Cuenta bloqueada' : 'No pudimos iniciar sesión',
      msg: res.error + (res.left != null && res.left > 0 ? ` Te quedan ${res.left} intento${res.left === 1 ? '' : 's'} antes del bloqueo temporal.` : ''),
    });
  };

  return (
    <div className="login">
      <header className="login__header">
        <div className="sb-logo">E</div>
        <div className="sb-brand__name">EnterpriseCloud</div>
        <button type="button" className="icon-btn" style={{ marginLeft: 'auto' }} title="Cambiar a modo claro / oscuro" onClick={toggle}>
          {theme === 'dark' ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
          )}
        </button>
      </header>

      <main className="login__main">
        <div className="login__col">
          <div>
            <h1 className="login__title">Iniciar sesión</h1>
            <div style={{ color: 'var(--muted)', marginTop: 6 }}>Accede con tu cuenta corporativa de EnterpriseCloud.</div>
          </div>

          <form className="login__card" onSubmit={submit} noValidate>
            {firstRun && (
              <div className="login__info">
                Primer ingreso: no hay usuarios registrados. Escribe tu correo y una contraseña (mínimo 8 caracteres); se creará tu usuario Administrador.
              </div>
            )}
            {authError && !loading && (
              <div role="alert" className="login__alert">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}><path d="M12 3l10 18H2z" /><path d="M12 10v4M12 17.5v.01" /></svg>
                <div>
                  <div style={{ fontWeight: 500 }}>{authError.title}</div>
                  <div style={{ fontSize: 12, marginTop: 2, opacity: 0.9 }}>{authError.msg}</div>
                </div>
              </div>
            )}
            {info && <div className="login__info">{info}</div>}

            <div className="login__field">
              <label htmlFor="ec-email">Correo corporativo</label>
              <input
                id="ec-email"
                type="email"
                autoComplete="username"
                className={'login__input' + (touched && errors.email ? ' is-invalid' : '')}
                value={email}
                onChange={e => { setEmail(e.target.value); setAuthError(null); }}
                placeholder="nombre@empresa.pe"
              />
              {touched && errors.email && <span className="field__error">{errors.email}</span>}
            </div>

            <div className="login__field">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <label htmlFor="ec-pass">Contraseña</label>
                <a style={{ fontSize: 12, cursor: 'pointer' }} onClick={() => setInfo(`Pide al Administrador que la restablezca en Administración › Usuarios. Luego cámbiala desde tu menú de cuenta.`)}>¿Olvidaste tu contraseña?</a>
              </div>
              <div className={'login__input login__pass' + (touched && errors.pass ? ' is-invalid' : '')}>
                <input
                  id="ec-pass"
                  type={show ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={pass}
                  onChange={e => { setPass(e.target.value); setAuthError(null); }}
                  placeholder="••••••••"
                />
                <button type="button" title={show ? 'Ocultar contraseña' : 'Mostrar contraseña'} onClick={() => setShow(s => !s)}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
                </button>
              </div>
              {touched && errors.pass && <span className="field__error">{errors.pass}</span>}
            </div>

            <label className="login__remember">
              <input type="checkbox" checked={remember} onChange={() => setRemember(r => !r)} className="sr-only" />
              <span className={'check' + (remember ? ' is-on' : '')} aria-hidden>{remember ? '✓' : ''}</span>
              Mantener sesión iniciada en este equipo
            </label>

            <button type="submit" className="btn btn--primary login__submit" disabled={loading} style={{ opacity: loading ? 0.7 : 1 }}>
              {loading && <span className="spinner" />}
              {loading ? 'Verificando…' : firstRun ? 'Crear usuario e ingresar' : 'Ingresar'}
            </button>

            <div className="login__or"><span />o<span /></div>
            <button type="button" className="btn login__sso" onClick={() => setInfo('El ingreso con SSO (Microsoft o Google de la empresa) requiere un servidor de identidad; no está disponible en la versión local.')}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /></svg>
              Ingresar con SSO de la empresa
            </button>
          </form>

          <div className="login__notice">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
            <span style={{ textWrap: 'pretty' }}>Conexión cifrada. Tu acceso a cada módulo depende de los roles y permisos asignados por el administrador. Los intentos de ingreso quedan registrados en auditoría.</span>
          </div>
        </div>
      </main>

      <footer className="login__footer">
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span className="dot" style={{ background: 'var(--green)' }} />Servicios operativos</span>
        <span>EnterpriseCloud v1.0</span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 16 }}>
          <a style={{ color: 'var(--muted)', cursor: 'pointer' }}>Soporte</a>
          <a style={{ color: 'var(--muted)', cursor: 'pointer' }}>Política de privacidad</a>
        </span>
      </footer>
    </div>
  );
}