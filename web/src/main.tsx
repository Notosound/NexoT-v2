import '@fontsource-variable/inter';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { cargarApi } from './lib/api';
import { ProveedorSesion } from './lib/sesion';
import App from './App';
import './estilos.css';
import { recargarPorVersion } from './lib/version';

// Pestaña abierta antes de publicar una versión nueva: recargar y seguir
window.addEventListener('vite:preloadError', (e) => { if (recargarPorVersion()) e.preventDefault(); });

const raiz = createRoot(document.getElementById('raiz')!);

cargarApi()
  .then((api) => {
    raiz.render(
      <StrictMode>
        <BrowserRouter>
          <ProveedorSesion api={api}>
            <App />
          </ProveedorSesion>
        </BrowserRouter>
      </StrictMode>,
    );
  })
  .catch((e) => {
    raiz.render(<div className="entrada"><div className="aviso error">No se pudo iniciar: {String(e?.message ?? e)}</div></div>);
  });
