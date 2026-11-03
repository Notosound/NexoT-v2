import { useState } from 'react';
import { useEnVivo } from '../lib/enVivo';
import EnVivo from '../componentes/EnVivo';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, BarChart3, PhoneCall, ClipboardCheck, Contact, Flag, LineChart, MapPinOff, QrCode, Target, UserPlus, Users, UsersRound, Vote,
} from 'lucide-react';
import { useSesion } from '../lib/sesion';
import type { Demografia, Lider, Resumen, Tendencia } from '../lib/tipos';
import { mensajeError } from '../lib/utilidades';
import { ORDEN_EDAD, partesSexo, resumirDemografia, serieDesdeTendencia } from '../lib/estadisticas';
import { BarrasH, Dona, Linea, SERIES } from '../componentes/Graficos';
import { Cifra, pct } from '../componentes/Piezas';

export default function Inicio() {
  const { sesion } = useSesion();
  const rol = sesion!.perfil!.rol;
  if (rol === 'lider') return <InicioLider />;
  if (rol === 'digitador') return <InicioDigitador />;
  return <InicioEquipo />;
}

function Bienvenida({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="bienvenida">
      <h1>{titulo}</h1>
      <p>{texto}</p>
    </div>
  );
}

// ── Líder: como el panel del piloto ──────────────────────────────────
function InicioLider() {
  const { api, sesion } = useSesion();
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [ficha, setFicha] = useState<Lider | null>(null);
  const [error, setError] = useState('');
  useEnVivo(() => Promise.all([api.resumen().then(setResumen), api.lideres().then((l) => setFicha(l[0] ?? null))]).catch((e) => setError(mensajeError(e))), ['registros']);
  const nombre = sesion!.perfil!.nombre.split(' ')[0];
  const meta = ficha?.meta_votos ?? 0;
  const sinPuesto = resumen ? resumen.porRevisar + resumen.sinUbicacion : null;

  return (
    <>
      <Bienvenida titulo={`¡Hola, ${nombre}!`} texto="Registra a tu gente y haz crecer tu equipo" />
      {error && <div className="aviso error">{error}</div>}
      <div className="acciones-grandes">
        <Link to="/registrar" className="accion-grande">
          <span className="ficha-icono"><UserPlus aria-hidden /></span>
          <h3>Registrar persona</h3>
          <p>Agrega a alguien de tu equipo en menos de un minuto</p>
        </Link>
        <Link to="/mi-enlace" className="accion-grande">
          <span className="ficha-icono"><QrCode aria-hidden /></span>
          <h3>Mi enlace y QR</h3>
          <p>Compártelo por WhatsApp: cada persona se registra sola</p>
        </Link>
        <Link to="/personas" className="accion-grande">
          <span className="ficha-icono"><Contact aria-hidden /></span>
          <h3>Mis registros</h3>
          <p>Busca, revisa y exporta las personas que registraste</p>
        </Link>
        <Link to="/seguimiento" className="accion-grande">
          <span className="ficha-icono"><PhoneCall aria-hidden /></span>
          <h3>Seguimiento</h3>
          <p>Llama o escribe a tu gente y anota quién confirma</p>
        </Link>
        <Link to="/estadisticas" className="accion-grande">
          <span className="ficha-icono"><LineChart aria-hidden /></span>
          <h3>Mis estadísticas</h3>
          <p>Tu avance, edades, sexo y puestos de tu gente</p>
        </Link>
      </div>
      <div className="cifras seccion">
        <Cifra icono={Users} valor={resumen?.personas} etiqueta="personas registradas" a="/personas" />
        {meta > 0 && <Cifra icono={Target} valor={resumen ? `${pct(resumen.personas, meta)}%` : null} etiqueta={`de tu meta (${meta})`} tono="ok" />}
        <Cifra icono={MapPinOff} valor={sinPuesto} etiqueta="sin puesto confirmado" tono={sinPuesto ? 'aviso' : undefined} a="/personas"
          detalle={sinPuesto ? 'Pregúntales dónde votan' : undefined} />
      </div>
    </>
  );
}

// ── Digitador ────────────────────────────────────────────────────────
function InicioDigitador() {
  const { sesion } = useSesion();
  return (
    <>
      <Bienvenida titulo={`¡Hola, ${sesion!.perfil!.nombre.split(' ')[0]}!`} texto="Tu trabajo: pasar los votos de cada E14 tal como aparecen en la foto" />
      <div className="acciones-grandes" style={{ maxWidth: 760, margin: '0 auto' }}>
        <Link to="/e14?vista=digitar" className="accion-grande">
          <span className="ficha-icono"><Vote aria-hidden /></span>
          <h3>Digitar mesas</h3>
          <p>Escribe los votos mesa por mesa</p>
        </Link>
        <Link to="/e14?vista=excel" className="accion-grande">
          <span className="ficha-icono"><ClipboardCheck aria-hidden /></span>
          <h3>Subir un Excel</h3>
          <p>Con la plantilla oficial de mesas</p>
        </Link>
      </div>
    </>
  );
}

// ── Admin y coordinador ──────────────────────────────────────────────
function InicioEquipo() {
  const { api, sesion } = useSesion();
  const rol = sesion!.perfil!.rol;
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [demo, setDemo] = useState<Demografia[] | null>(null);
  const [tendencia, setTendencia] = useState<Tendencia[]>([]);
  const [lideres, setLideres] = useState<Lider[]>([]);
  const [error, setError] = useState('');

  const vivo = useEnVivo(() => {
    const t: Promise<unknown>[] = [api.demografia().then(setDemo), api.tendencia().then(setTendencia)];
    if (rol !== 'candidato') t.push(api.resumen().then(setResumen), api.lideres().then(setLideres));
    return Promise.all(t).catch((e) => setError(mensajeError(e)));
  }, ['registros']);

  const r = demo ? resumirDemografia(demo) : null;
  const serie = serieDesdeTendencia(tendencia, 30);
  const ultimos7 = serie.slice(-7).reduce((a, p) => a + p.valor, 0);
  const meta = lideres.reduce((a, l) => a + l.meta_votos, 0);
  const registrados = lideres.reduce((a, l) => a + l.registrados, 0);
  const ranking = [...lideres].sort((a, b) => b.registrados - a.registrados);

  return (
    <>
      <div className="encabezado">
        <div>
          <h1>Hola, {sesion!.perfil!.nombre.split(' ')[0]}</h1>
          <p className="subtitulo">{sesion!.organizacion} · así va la campaña hoy</p>
          <EnVivo {...vivo} />
        </div>
        {rol !== 'candidato' && <Link to="/registrar" className="boton primario"><UserPlus className="icono" aria-hidden />Registrar persona</Link>}
      </div>
      {error && <div className="aviso error">{error}</div>}

      <div className="cifras">
        <Cifra icono={Users} valor={r?.total} etiqueta={rol === 'coordinador' ? 'registrados por tus líderes' : 'personas registradas'}
          detalle={`${ultimos7} en los últimos 7 días`} a={rol === 'candidato' ? undefined : '/personas'} />
        {meta > 0 && <Cifra icono={Target} valor={`${pct(registrados, meta)}%`} etiqueta={`de la meta de líderes (${meta.toLocaleString('es-CO')})`} tono="ok" />}
        {resumen && rol === 'admin' && (
          <Cifra icono={AlertTriangle} valor={resumen.porRevisar} etiqueta="con puesto por revisar" tono={resumen.porRevisar ? 'aviso' : undefined} a="/revision"
            detalle={resumen.porRevisar ? 'Resuélvelos en un clic' : 'Todo al día'} />
        )}
        {resumen && <Cifra icono={MapPinOff} valor={resumen.sinUbicacion} etiqueta="sin lugar de votación" tono="info" a="/personas" />}
        {rol !== 'candidato' && <Cifra icono={UsersRound} valor={lideres.length} etiqueta="líderes activos" a="/lideres" />}
      </div>

      <div className="graficos seccion">
        <div className="tarjeta">
          <div className="tarjeta-titulo"><h2>Registros por día</h2><small>últimos 30 días</small></div>
          <Linea puntos={serie} nombre="Registros" />
        </div>
        <div className="tarjeta">
          <div className="tarjeta-titulo"><h2>Por sexo</h2></div>
          {r && <Dona partes={partesSexo(r.sexo, [SERIES[0], SERIES[1], SERIES[2], SERIES[3], 'var(--texto-3)'])} sub="personas" />}
        </div>
        <div className="tarjeta">
          <div className="tarjeta-titulo"><h2>Por edad</h2></div>
          {r && <BarrasH filas={[...ORDEN_EDAD, 'sin dato'].filter((e) => r.edad.get(e)).map((e) => ({ nombre: e === 'sin dato' ? 'Sin dato' : `${e} años`, valores: [r.edad.get(e) ?? 0] }))} />}
        </div>
        <div className="tarjeta">
          <div className="tarjeta-titulo"><h2>Localidades con más registrados</h2><Link to="/tablero">Ver mapa</Link></div>
          {r && <BarrasH limite={8} filas={[...r.localidad.entries()].sort((a, b) => b[1] - a[1]).map(([n, v]) => ({ nombre: n, valores: [v] }))} />}
        </div>
        {rol !== 'candidato' && ranking.length > 0 && (
          <div className="tarjeta">
            <div className="tarjeta-titulo"><h2><Flag className="icono" aria-hidden /> Líderes con más registros</h2><Link to="/analisis?vista=lideres">Ver todos</Link></div>
            <BarrasH limite={8} filas={ranking.map((l) => ({
              nombre: l.nombre, valores: [l.registrados],
              detalle: l.meta_votos ? `${pct(l.registrados, l.meta_votos)}% de su meta de ${l.meta_votos}` : 'Sin meta definida',
            }))} />
          </div>
        )}
      </div>
      {rol === 'candidato' && (
        <p className="ayuda seccion"><BarChart3 className="icono" aria-hidden /> Son simpatizantes registrados, no votos. Los votos reales están en E14.</p>
      )}
    </>
  );
}
