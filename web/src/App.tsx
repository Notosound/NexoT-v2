import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useSesion } from './lib/sesion';
import type { Rol } from './lib/tipos';
import Marco from './componentes/Marco';
import Entrar from './paginas/Entrar';
import CambiarClave from './paginas/CambiarClave';
import SinAcceso from './paginas/SinAcceso';
import Inicio from './paginas/Inicio';
import Registrar from './paginas/Registrar';
import Personas from './paginas/Personas';
import Revision from './paginas/Revision';
import Importar from './paginas/Importar';
import Lideres from './paginas/Lideres';
import Equipo from './paginas/Equipo';
import E14 from './paginas/E14';
import Analisis from './paginas/Analisis';
import MisEstadisticas from './paginas/MisEstadisticas';
import MiEnlace from './paginas/MiEnlace';
import RegistroPublico from './paginas/RegistroPublico';
import Seguimiento from './paginas/Seguimiento';
import DiaD from './paginas/DiaD';
import Testigos from './paginas/Testigos';
import Privacidad from './paginas/Privacidad';
import DatosPersonales from './paginas/DatosPersonales';
import MiCuenta from './paginas/MiCuenta';
import CodigoDosPasos from './paginas/CodigoDosPasos';
import Metas from './paginas/Metas';

// El tablero carga el mapa (Leaflet): solo se descarga cuando se abre
const Tablero = lazy(() => import('./paginas/Tablero'));
const cargandoTablero = <div className="tarjeta vacio">Cargando tablero…</div>;

function Solo({ roles, children }: { roles: Rol[]; children: JSX.Element }) {
  const { sesion } = useSesion();
  return sesion?.perfil && roles.includes(sesion.perfil.rol) ? children : <Navigate to="/" replace />;
}

export default function App() {
  const { sesion, debeCambiarClave } = useSesion();
  const ruta = useLocation().pathname;

  // Formulario público del enlace de un líder: no requiere sesión
  if (ruta.startsWith('/r/')) {
    return <Routes><Route path="/r/:token" element={<RegistroPublico />} /></Routes>;
  }
  // Política de datos y solicitudes de los titulares: pública
  if (ruta.startsWith('/privacidad/')) {
    return <Routes><Route path="/privacidad/:slug" element={<Privacidad />} /></Routes>;
  }

  if (!sesion) {
    return (
      <Routes>
        <Route path="/cambiar-clave" element={<CambiarClave />} />
        <Route path="*" element={<Entrar />} />
      </Routes>
    );
  }
  if (sesion.faltaCodigo) return <CodigoDosPasos />;
  if (debeCambiarClave) return <CambiarClave />;
  if (!sesion.perfil) return <SinAcceso />;

  return (
    <Marco>
      <Routes>
        <Route path="/" element={sesion.perfil.rol === 'candidato' ? <Navigate to="/tablero" replace /> : <Inicio />} />
        <Route path="/estadisticas" element={<Solo roles={['lider']}><MisEstadisticas /></Solo>} />
        <Route path="/mi-enlace" element={<Solo roles={['lider']}><MiEnlace /></Solo>} />
        <Route path="/seguimiento" element={<Solo roles={['admin', 'coordinador', 'lider']}><Seguimiento /></Solo>} />
        <Route path="/dia-d" element={<Solo roles={['admin', 'coordinador', 'lider', 'candidato']}><DiaD /></Solo>} />
        <Route path="/testigos" element={<Solo roles={['admin', 'coordinador']}><Testigos /></Solo>} />
        <Route path="/tablero" element={<Solo roles={['admin', 'coordinador', 'candidato']}><Suspense fallback={cargandoTablero}><Tablero /></Suspense></Solo>} />
        <Route path="/registrar" element={<Solo roles={['admin', 'coordinador', 'lider']}><Registrar /></Solo>} />
        <Route path="/personas" element={<Solo roles={['admin', 'coordinador', 'lider']}><Personas /></Solo>} />
        <Route path="/revision" element={<Solo roles={['admin']}><Revision /></Solo>} />
        <Route path="/importar" element={<Solo roles={['admin']}><Importar /></Solo>} />
        <Route path="/lideres" element={<Solo roles={['admin', 'coordinador']}><Lideres /></Solo>} />
        <Route path="/equipo" element={<Solo roles={['admin']}><Equipo /></Solo>} />
        <Route path="/analisis" element={<Solo roles={['admin', 'coordinador', 'candidato']}><Analisis /></Solo>} />
        <Route path="/e14" element={<Solo roles={['admin', 'coordinador', 'candidato', 'digitador']}><E14 /></Solo>} />
        <Route path="/metas" element={<Solo roles={['admin', 'coordinador', 'candidato']}><Metas /></Solo>} />
        <Route path="/datos-personales" element={<Solo roles={['admin']}><DatosPersonales /></Solo>} />
        <Route path="/cuenta" element={<MiCuenta />} />
        <Route path="/cambiar-clave" element={<CambiarClave />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Marco>
  );
}
