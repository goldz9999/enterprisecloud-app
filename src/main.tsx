import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { devAutoLogin } from './data/domain/auth';
import './styles/global.css';

// En desarrollo, intenta iniciar sesión sola antes de pintar (ver .env.local); si falla, queda el login normal.
void devAutoLogin()
  .catch(() => undefined)
  .then(() => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </StrictMode>,
    );
  });
