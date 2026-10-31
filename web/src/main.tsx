import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { cargarApi } from './lib/api';
import { ProveedorSesion } from './lib/sesion';
import App from './App';
import './estilos.css';

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
