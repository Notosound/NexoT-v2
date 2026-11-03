import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3, ClipboardCheck, Eye, FileSpreadsheet, Home, LineChart, LogOut, MapPinned, Moon, QrCode,
  ChevronDown, Lock, Target, UserCog, Sun, UserPlus, Users, UsersRound, Vote, Contact, PhoneCall, CalendarCheck, ShieldCheck, type LucideIcon,
} from 'lucide-react';
import { useSesion } from '../lib/sesion';
import { ROLES, type Rol } from '../lib/tipos';
import SelectorVerComo from './VerComo';
import Protector from './Protector';
import NuevaVersion from './NuevaVersion';

type Enlace = { a: string; texto: string; icono: LucideIcon; roles: Rol[]; textoLider?: string };
// Menú por secciones: cada rol ve solo las secciones que tienen algo para él
const SECCIONES: { titulo: string; tituloLider?: string; enlaces: Enlace[] }[] = [
  { titulo: 'General', enlaces: [
    { a: '/', texto: 'Inicio', icono: Home, roles: ['admin', 'coordinador', 'lider', 'digitador'] },
    { a: '/tablero', texto: 'Tablero', icono: MapPinned, roles: ['admin', 'coordinador', 'candidato'] },
    { a: '/analisis', texto: 'Análisis', icono: BarChart3, roles: ['admin', 'coordinador', 'candidato'] },
    { a: '/metas', texto: 'Metas', icono: Target, roles: ['admin', 'coordinador', 'candidato'] },
    { a: '/estadisticas', texto: 'Mis estadísticas', icono: LineChart, roles: ['lider'] },
  ] },
  { titulo: 'Simpatizantes', tituloLider: 'Mi gente', enlaces: [
    { a: '/registrar', texto: 'Registrar persona', icono: UserPlus, roles: ['admin', 'coordinador', 'lider'] },
    { a: '/personas', texto: 'Personas', textoLider: 'Mis registros', icono: Contact, roles: ['admin', 'coordinador', 'lider'] },
    { a: '/mi-enlace', texto: 'Mi enlace y QR', icono: QrCode, roles: ['lider'] },
    { a: '/importar', texto: 'Importar Excel', icono: FileSpreadsheet, roles: ['admin'] },
    { a: '/revision', texto: 'Puestos por revisar', icono: ClipboardCheck, roles: ['admin'] },
  ] },
  { titulo: 'Movilización', enlaces: [
    { a: '/seguimiento', texto: 'Seguimiento', icono: PhoneCall, roles: ['admin', 'coordinador', 'lider'] },
    { a: '/dia-d', texto: 'Día D', icono: CalendarCheck, roles: ['admin', 'coordinador', 'lider', 'candidato'] },
    { a: '/testigos', texto: 'Testigos', icono: ShieldCheck, roles: ['admin', 'coordinador'] },
  ] },
  { titulo: 'Resultados', enlaces: [
    { a: '/e14', texto: 'E14', icono: Vote, roles: ['admin', 'coordinador', 'candidato', 'digitador'] },
  ] },
  { titulo: 'Organización', enlaces: [
    { a: '/lideres', texto: 'Líderes', icono: UsersRound, roles: ['admin', 'coordinador'] },
    { a: '/equipo', texto: 'Equipo', icono: Users, roles: ['admin'] },
    { a: '/datos-personales', texto: 'Datos personales', icono: Lock, roles: ['admin'] },
  ] },
  { titulo: 'Cuenta', enlaces: [
    { a: '/cuenta', texto: 'Mi cuenta', icono: UserCog, roles: ['admin', 'coordinador', 'lider', 'digitador', 'candidato'] },
  ] },
];

// Tema claro/oscuro: se recuerda en este navegador (si se puede)
// Secciones cerradas del menú: se recuerdan en este navegador (si se puede)
function cerradasIniciales(): string[] {
  try { return JSON.parse(localStorage.getItem('menu-cerradas') ?? '[]'); } catch { return []; }
}

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
  const [cerradas, setCerradas] = useState<string[]>(cerradasIniciales);
  const alternar = (titulo: string) => setCerradas((c) => {
    const n = c.includes(titulo) ? c.filter((x) => x !== titulo) : [...c, titulo];
    try { localStorage.setItem('menu-cerradas', JSON.stringify(n)); } catch { /* */ }
    return n;
  });
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
    <div className={`app${vista ? ' con-cinta' : ''}${perfil.rol === 'candidato' ? ' ejecutivo' : ''}`}>
      {api.modo === 'demo' && <div className="cinta-demo">Modo demostración: datos inventados, nada se guarda</div>}
      <header className="barra">
        <NavLink to="/" className="marca"><img src="/icono.svg" alt="" />NexoT</NavLink>
        <span className="org">{sesion!.organizacion}</span>
        <span className="espacio" />
        <NavLink to="/cuenta" className="usuario" title="Mi cuenta">{sesionReal!.perfil!.nombre}<small>{ROLES[sesionReal!.perfil!.rol]}</small></NavLink>
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
      <NuevaVersion />
      <div className="cuerpo">
        <nav className="menu" aria-label="Secciones">
          {SECCIONES.map((sec) => {
            const enlaces = sec.enlaces.filter((e) => e.roles.includes(perfil.rol));
            if (!enlaces.length) return null;
            const titulo = perfil.rol === 'lider' && sec.tituloLider ? sec.tituloLider : sec.titulo;
            const aqui = enlaces.some((e) => (e.a === '/' ? ruta === '/' : ruta.startsWith(e.a)));
            const abierta = aqui || !cerradas.includes(sec.titulo);
            return (
              <div key={sec.titulo} className={`menu-grupo${abierta ? '' : ' cerrada'}`} role="group" aria-label={titulo}>
                <button type="button" className="menu-titulo" aria-expanded={abierta} onClick={() => alternar(sec.titulo)}
                  title={aqui ? 'Estás en esta sección' : abierta ? 'Cerrar sección' : 'Abrir sección'}>
                  <span>{titulo}</span>
                  {!abierta && <span className="menu-cuenta">{enlaces.length}</span>}
                  <ChevronDown className="menu-flecha" aria-hidden />
                </button>
                {enlaces.map((e) => (
                  <NavLink key={e.a} to={e.a} end={e.a === '/'} className={({ isActive }) => (isActive ? 'activo' : '')}>
                    <e.icono className="icono" aria-hidden />
                    {perfil.rol === 'lider' && e.textoLider ? e.textoLider : e.texto}
                    {e.a === '/revision' && porRevisar > 0 && <span className="contador">{porRevisar}</span>}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>
        <main className="contenido" key={vista?.objetivo ?? 'propio'}><Protector clave={ruta + (vista?.objetivo ?? '')}>{children}</Protector></main>
      </div>
      {eligiendo && <SelectorVerComo alCerrar={() => setEligiendo(false)} />}
    </div>
  );
}
