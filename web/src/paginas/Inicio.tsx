import { useEffect, useState } from 'react';
import { useEnVivo } from '../lib/enVivo';
import EnVivo from '../componentes/EnVivo';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, BarChart3, ScanLine, HelpCircle, Inbox, PhoneCall, ShieldAlert, ClipboardCheck, Contact, Flag, LineChart, MapPinOff, QrCode, Target, UserPlus, Users, UsersRound, Vote,
} from 'lucide-react';
import { useSesion } from '../lib/sesion';
import type { AvanceE14, Eleccion, Demografia, Lider, MetaLider, RankingFila, Resumen, Tendencia } from '../lib/tipos';
import { Ranking, SEMAFORO } from './Metas';
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
  const [mia, setMia] = useState<MetaLider | null>(null);
  const [ranking, setRanking] = useState<RankingFila[] | null>(null);
  const [error, setError] = useState('');
  useEnVivo(() => Promise.all([api.resumen().then(setResumen), api.lideres().then((l) => setFicha(l[0] ?? null)),
    api.metasLideres().then((m) => setMia(m[0] ?? null)), api.rankingSemanal().then(setRanking)]).catch((e) => setError(mensajeError(e))), ['registros']);
  const nombre = sesion!.perfil!.nombre.split(' ')[0];
  const meta = ficha?.meta_votos ?? 0;
  const sinPuesto = resumen ? resumen.porRevisar + resumen.sinUbicacion : null;

  return (
    <>
      <Bienvenida titulo={`¡Hola, ${nombre}!`} texto="Registra a tu gente y haz crecer tu equipo" />
      {error && <div className="aviso error">{error}</div>}
      {mia && <MiMeta m={mia} posicion={ranking?.find((r) => r.soy_yo)?.posicion ?? null} />}
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
        {meta > 0 && <Cifra icono={Target} valor={resumen ? `${pct(resumen.personas, meta)}%` : null} etiqueta={`de tu meta (${meta})`}
          tono={mia?.semaforo === 'rojo' ? 'aviso' : 'ok'}
          detalle={mia ? `${SEMAFORO[mia.semaforo].texto}${mia.esperado_hoy != null && mia.semaforo !== 'cumplida' ? ` · hoy deberías llevar ${mia.esperado_hoy}` : ''}` : undefined} />}
        <Cifra icono={MapPinOff} valor={sinPuesto} etiqueta="sin puesto confirmado" tono={sinPuesto ? 'aviso' : undefined} a="/personas"
          detalle={sinPuesto ? 'Pregúntales dónde votan' : undefined} />
      </div>
      {ranking && <div className="seccion" style={{ maxWidth: 520 }}><Ranking filas={ranking} compacto /></div>}
    </>
  );
}

// Tarjeta "Tu meta" del líder: cuánto lleva, cuánto le falta y a qué ritmo
function MiMeta({ m, posicion }: { m: MetaLider; posicion: number | null }) {
  if (!m.meta) {
    return <div className="tarjeta mi-meta"><h2><Target className="icono" aria-hidden /> Tu meta</h2><p className="ayuda">Todavía no tienes una meta asignada. Pídesela a tu coordinador o al administrador.</p></div>;
  }
  const avance = Math.min(100, Math.round((100 * m.registrados) / m.meta));
  const faltan = Math.max(0, m.meta - m.registrados);
  const marca = m.esperado_hoy != null ? Math.min(100, (100 * m.esperado_hoy) / m.meta) : null;
  return (
    <div className={`tarjeta mi-meta ${SEMAFORO[m.semaforo].clase}`}>
      <div className="mi-meta-cabeza">
        <h2><Target className="icono" aria-hidden /> Tu meta: {m.meta.toLocaleString('es-CO')} personas</h2>
        <span className={`chip-semaforo ${SEMAFORO[m.semaforo].clase}`}>{SEMAFORO[m.semaforo].texto}</span>
      </div>
      <div className="mi-meta-num"><strong>{m.registrados.toLocaleString('es-CO')}</strong> registradas · {avance}%</div>
      <div className="meta-barra grande" title={marca != null ? `Hoy deberías llevar ${m.esperado_hoy}` : undefined}>
        <span className={`relleno ${SEMAFORO[m.semaforo].clase}`} style={{ width: `${avance}%` }} />
        {marca != null && m.semaforo !== 'cumplida' && <span className="esperado" style={{ left: `${marca}%` }} />}
      </div>
      <p className="mi-meta-texto">
        {faltan === 0 ? '¡Cumpliste tu meta! Cada persona más suma para la campaña.'
          : <>Te faltan <strong>{faltan.toLocaleString('es-CO')}</strong>{m.esperado_hoy != null && m.registrados < m.esperado_hoy ? `; hoy deberías llevar ${m.esperado_hoy.toLocaleString('es-CO')}` : ''}.</>}
        {' '}Esta semana registraste {m.esta_semana}{posicion ? ` y vas de ${posicion} en el ranking` : ''}.
      </p>
    </div>
  );
}

// ── Digitador ────────────────────────────────────────────────────────
function InicioDigitador() {
  const { sesion } = useSesion();
  const e14 = useResumenE14();
  return (
    <>
      <Bienvenida titulo={`¡Hola, ${sesion!.perfil!.nombre.split(' ')[0]}!`} texto="Tu trabajo: pasar los votos de cada E14 tal como aparecen en la foto" />
      {e14 && <TarjetaE14 r={e14} />}
      <div className="acciones-grandes" style={{ maxWidth: 980, margin: '0 auto' }}>
        <Link to="/e14?vista=lecturas" className="accion-grande">
          <span className="ficha-icono"><ScanLine aria-hidden /></span>
          <h3>Revisar lecturas</h3>
          <p>{e14?.porRevisar ? `${e14.porRevisar} mesas esperan que confirmes el número de la imagen` : 'Confirma lo que el lector no leyó con claridad'}</p>
        </Link>
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
      <p className="ayuda" style={{ textAlign: 'center', marginTop: '1rem' }}>
        <Link to="/e14?vista=guia"><HelpCircle className="icono" aria-hidden /> ¿Primera vez? Mira cómo funciona el E14, con ejemplos</Link>
      </p>
    </>
  );
}

// Estado del E14 de la elección más reciente (si hay una)
type ResumenE14 = { eleccion: Eleccion; avance: AvanceE14; porRevisar: number };
function useResumenE14() {
  const { api, sesion } = useSesion();
  const rol = sesion!.perfil!.rol;
  const [r, setR] = useState<ResumenE14 | null>(null);
  useEffect(() => {
    (async () => {
      const es = await api.elecciones();
      const e = [...es].sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
      if (!e) return;
      const avance = await api.avanceE14(e.id);
      if (!avance) return;
      const lecturas = rol === 'admin' || rol === 'digitador' ? await api.lecturasE14(e.id).catch(() => []) : [];
      setR({ eleccion: e, avance, porRevisar: lecturas.filter((l) => l.estado === 'por_revisar').length });
    })().catch(() => {});
  }, [api, rol]);
  return r;
}

function TarjetaE14({ r }: { r: ResumenE14 }) {
  const { sesion } = useSesion();
  const admin = sesion!.perfil!.rol === 'admin';
  const { avance: a } = r;
  if (!a.mesas) return null;
  return (
    <div className="tarjeta tarjeta-e14 seccion">
      <div className="tarjeta-titulo">
        <h2><Vote className="icono" aria-hidden /> E14 · {r.eleccion.nombre}</h2>
        <Link to="/e14?vista=guia">¿Cómo funciona?</Link>
      </div>
      <p className="tarjeta-e14-cifra"><strong>{pct(a.verificadas, a.mesas)}%</strong> de las {a.mesas.toLocaleString('es-CO')} mesas con simpatizantes ya verificadas</p>
      <div className="tarjeta-e14-pendientes">
        {r.porRevisar > 0 && <Link to="/e14?vista=lecturas" className="chip-pendiente"><ScanLine className="icono" aria-hidden />{r.porRevisar} lecturas por revisar con la imagen</Link>}
        {admin && a.en_revision > 0 && <Link to="/e14?vista=revisar" className="chip-pendiente aviso"><AlertTriangle className="icono" aria-hidden />{a.en_revision} mesas con diferencia</Link>}
        {a.una_digitacion > 0 && <Link to="/e14?vista=digitar" className="chip-pendiente">{a.una_digitacion} esperan la 2.ª digitación</Link>}
        {a.pendientes > 0 && <span className="chip-pendiente suave">{a.pendientes} sin digitar</span>}
      </div>
      {sesion!.perfil!.rol !== 'digitador' && <Link to="/e14" className="boton chico">Ver resultados</Link>}
    </div>
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
  const [sinDosPasos, setSinDosPasos] = useState(false);
  const [solicitudes, setSolicitudes] = useState(0);
  const { vista } = useSesion();
  useEffect(() => {
    if (vista || (rol !== 'admin' && rol !== 'coordinador')) return;
    api.factoresDosPasos().then((f) => setSinDosPasos(!f.some((x) => x.verificado))).catch(() => {});
    if (rol === 'admin') api.solicitudesDatos().then((s) => setSolicitudes(s.filter((x) => x.estado === 'pendiente').length)).catch(() => {});
  }, [api, rol, vista]);

  const vivo = useEnVivo(() => {
    const t: Promise<unknown>[] = [api.demografia().then(setDemo), api.tendencia().then(setTendencia)];
    if (rol !== 'candidato') t.push(api.resumen().then(setResumen), api.lideres().then(setLideres));
    return Promise.all(t).catch((e) => setError(mensajeError(e)));
  }, ['registros']);

  const e14 = useResumenE14();
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
      {sinDosPasos && (
        <div className="aviso atencion aviso-accion">
          <ShieldAlert className="icono" aria-hidden />
          <span>Tu cuenta ve datos de muchas personas y todavía entra solo con contraseña. Activa la verificación en dos pasos: toma 2 minutos.</span>
          <Link to="/cuenta" className="boton chico">Activar</Link>
        </div>
      )}
      {solicitudes > 0 && (
        <div className="aviso info aviso-accion">
          <Inbox className="icono" aria-hidden />
          <span>{solicitudes === 1 ? 'Hay 1 solicitud' : `Hay ${solicitudes} solicitudes`} de datos personales por atender. La ley da 10 a 15 días hábiles.</span>
          <Link to="/datos-personales" className="boton chico">Ver</Link>
        </div>
      )}

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

      {e14 && rol !== 'candidato' && <TarjetaE14 r={e14} />}

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
