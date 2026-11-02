import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useSesion } from '../lib/sesion';
import { ROLES, type Rol } from '../lib/tipos';

const ENLACES: { a: string; texto: string; roles: Rol[] }[] = [
  { a: '/', texto: 'Inicio', roles: ['admin', 'coordinador', 'lider', 'candidato', 'digitador'] },
  { a: '/tablero', texto: 'Tablero', roles: ['admin', 'coordinador'] },
  { a: '/registrar', texto: 'Registrar persona', roles: ['admin', 'coordinador', 'lider'] },
  { a: '/personas', texto: 'Personas', roles: ['admin', 'coordinador', 'lider'] },
  { a: '/revision', texto: 'Puestos por revisar', roles: ['admin'] },
  { a: '/importar', texto: 'Importar Excel', roles: ['admin'] },
  { a: '/e14', texto: 'E14', roles: ['admin', 'coordinador', 'candidato', 'digitador'] },
  { a: '/lideres', texto: 'Líderes', roles: ['admin', 'coordinador'] },
  { a: '/equipo', texto: 'Equipo', roles: ['admin'] },
];

export default function Marco({ children }: { children: ReactNode }) {
  const { api, sesion } = useSesion();
  const perfil = sesion!.perfil!;
  const [porRevisar, setPorRevisar] = useState(0);
  const ruta = useLocation().pathname;

  useEffect(() => {
    if (perfil.rol !== 'admin') return;
    api.resumen().then((r) => setPorRevisar(r.porRevisar)).catch(() => {});
  }, [api, perfil.rol, ruta]);

  return (
    <div className="app">
      {api.modo === 'demo' && <div className="cinta-demo">Modo demostración: datos inventados, nada se guarda</div>}
      <header className="barra">
        <NavLink to="/" className="marca"><img src="/icono.svg" alt="" />NexoT</NavLink>
        <span className="org">{sesion!.organizacion}</span>
        <span className="espacio" />
        <span className="usuario">{perfil.nombre}<small>{ROLES[perfil.rol]}</small></span>
        <button className="boton chico" onClick={() => api.cerrarSesion()}>Salir</button>
      </header>
      <div className="cuerpo">
        <nav className="menu" aria-label="Secciones">
          {ENLACES.filter((e) => e.roles.includes(perfil.rol)).map((e) => (
            <NavLink key={e.a} to={e.a} end={e.a === '/'} className={({ isActive }) => (isActive ? 'activo' : '')}>
              {perfil.rol === 'lider' && e.a === '/personas' ? 'Mis registrados' : perfil.rol === 'candidato' && e.a === '/' ? 'Tablero' : e.texto}
              {e.a === '/revision' && porRevisar > 0 && <span className="contador">{porRevisar}</span>}
            </NavLink>
          ))}
        </nav>
        <main className="contenido">{children}</main>
      </div>
    </div>
  );
}
