import { Navigate, Route, Routes } from 'react-router-dom';
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

function Solo({ roles, children }: { roles: Rol[]; children: JSX.Element }) {
  const { sesion } = useSesion();
  return sesion?.perfil && roles.includes(sesion.perfil.rol) ? children : <Navigate to="/" replace />;
}

export default function App() {
  const { sesion, debeCambiarClave } = useSesion();

  if (!sesion) {
    return (
      <Routes>
        <Route path="/cambiar-clave" element={<CambiarClave />} />
        <Route path="*" element={<Entrar />} />
      </Routes>
    );
  }
  if (debeCambiarClave) return <CambiarClave />;
  if (!sesion.perfil) return <SinAcceso />;

  return (
    <Marco>
      <Routes>
        <Route path="/" element={<Inicio />} />
        <Route path="/registrar" element={<Solo roles={['admin', 'coordinador', 'lider']}><Registrar /></Solo>} />
        <Route path="/personas" element={<Solo roles={['admin', 'coordinador', 'lider']}><Personas /></Solo>} />
        <Route path="/revision" element={<Solo roles={['admin']}><Revision /></Solo>} />
        <Route path="/importar" element={<Solo roles={['admin']}><Importar /></Solo>} />
        <Route path="/lideres" element={<Solo roles={['admin', 'coordinador']}><Lideres /></Solo>} />
        <Route path="/equipo" element={<Solo roles={['admin']}><Equipo /></Solo>} />
        <Route path="/cambiar-clave" element={<CambiarClave />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Marco>
  );
}
