import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3, ClipboardCheck, Eye, FileSpreadsheet, Home, LineChart, LogOut, MapPinned, Moon, QrCode,
  Sun, UserPlus, Users, UsersRound, Vote, Contact, type LucideIcon,
} from 'lucide-react';
import { useSesion } from '../lib/sesion';
import { ROLES, type Rol } from '../lib/tipos';
import SelectorVerComo from './VerComo';

const ENLACES: { a: string; texto: string; icono: LucideIcon; roles: Rol[]; textoLider?: string }[] = [
  { a: '/', texto: 'Inicio', icono: Home, roles: ['admin', 'coordinador', 'lider', 'digitador'] },
  { a: '/tablero', texto: 'Tablero', icono: MapPinned, roles: ['admin', 'coordinador', 'candidato'] },
  { a: '/analisis', texto: 'Análisis', icono: BarChart3, roles: ['admin', 'coordinador', 'candidato'] },
  { a: '/registrar', texto: 'Registrar persona', icono: UserPlus, roles: ['admin', 'coordinador', 'lider'] },
  { a: '/personas', texto: 'Personas', textoLider: 'Mis registros', icono: Contact, roles: ['admin', 'coordinador', 'lider'] },
  { a: '/estadisticas', texto: 'Mis estadísticas', icono: LineChart, roles: ['lider'] },
  { a: '/mi-enlace', texto: 'Mi enlace y QR', icono: QrCode, roles: ['lider'] },
  { a: '/revision', texto: 'Puestos por revisar', icono: ClipboardCheck, roles: ['admin'] },
  { a: '/importar', texto: 'Importar Excel', icono: FileSpreadsheet, roles: ['admin'] },
  { a: '/e14', texto: 'E14', icono: Vote, roles: ['admin', 'coordinador', 'candidato', 'digitador'] },
  { a: '/lideres', texto: 'Líderes', icono: UsersRound, roles: ['admin', 'coordinador'] },
  { a: '/equipo', texto: 'Equipo', icono: Users, roles: ['admin'] },
];

// Tema claro/oscuro: se recuerda en este navegador (si se puede)
function temaInicial(): 'claro' | 'oscuro' {
  try {
    const t = localStorage.getItem('tema');
    if (t === 'claro' || t === 'oscuro') return t;
  } catch { /* sin almacenamiento */ }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'oscuro' : 'claro';
}

export default function Marco({ children }: { children: ReactNode }) {
  const { api, sesion, sesionReal, vista, verComo } = useSesion();
  const perfil = sesion!.perfil!;
  const esAdminReal = sesionReal?.perfil?.rol === 'admin';
  const [porRevisar, setPorRevisar] = useState(0);
  const [tema, setTema] = useState(temaInicial);
  const [eligiendo, setEligiendo] = useState(false);
  const ruta = useLocation().pathname;
  const ir = useNavigate();

  useEffect(() => {
    document.documentElement.dataset.tema = tema;
    try { localStorage.setItem('tema', tema); } catch { /* */ }
  }, [tema]);

  useEffect(() => {
    if (perfil.rol !== 'admin') return;
    api.resumen().then((r) => setPorRevisar(r.porRevisar)).catch(() => {});
  }, [api, perfil.rol, ruta]);

  const salirDeVista = async () => { await verComo(null); ir('/equipo'); };

  return (
    <div className={`app${vista ? ' con-cinta' : ''}`}>
      {api.modo === 'demo' && <div className="cinta-demo">Modo demostración: datos inventados, nada se guarda</div>}
      <header className="barra">
        <NavLink to="/" className="marca"><img src="/icono.svg" alt="" />NexoT</NavLink>
        <span className="org">{sesion!.organizacion}</span>
        <span className="espacio" />
        <span className="usuario">{sesionReal!.perfil!.nombre}<small>{ROLES[sesionReal!.perfil!.rol]}</small></span>
        {esAdminReal && !vista && (
          <button className="boton-barra" onClick={() => setEligiendo(true)} title="Ver el panel como otro rol o persona" aria-label="Ver como">
            <Eye className="icono" aria-hidden /><span className="rotulo">Ver como</span>
          </button>
        )}
        <button className="boton-barra" onClick={() => setTema(tema === 'oscuro' ? 'claro' : 'oscuro')}
          title={tema === 'oscuro' ? 'Usar tema claro' : 'Usar tema oscuro'} aria-label="Cambiar tema">
          {tema === 'oscuro' ? <Sun className="icono" aria-hidden /> : <Moon className="icono" aria-hidden />}
        </button>
        <button className="boton-barra" onClick={() => api.cerrarSesion()} title="Cerrar sesión" aria-label="Cerrar sesión">
          <LogOut className="icono" aria-hidden />
        </button>
      </header>
      {vista && (
        <div className="cinta-ver-como" role="status">
          <Eye className="icono" aria-hidden />
          <span>Estás viendo el panel como <strong>{vista.nombre}</strong> ({ROLES[vista.rol]}). Solo lectura: nada se puede cambiar.</span>
          <button onClick={salirDeVista}>Volver a mi panel</button>
        </div>
      )}
      <div className="cuerpo">
        <nav className="menu" aria-label="Secciones">
          {ENLACES.filter((e) => e.roles.includes(perfil.rol)).map((e) => (
            <NavLink key={e.a} to={e.a} end={e.a === '/'} className={({ isActive }) => (isActive ? 'activo' : '')}>
              <e.icono className="icono" aria-hidden />
              {perfil.rol === 'lider' && e.textoLider ? e.textoLider : e.texto}
              {e.a === '/revision' && porRevisar > 0 && <span className="contador">{porRevisar}</span>}
            </NavLink>
          ))}
        </nav>
        <main className="contenido" key={vista?.objetivo ?? 'propio'}>{children}</main>
      </div>
      {eligiendo && <SelectorVerComo alCerrar={() => setEligiendo(false)} />}
    </div>
  );
}
