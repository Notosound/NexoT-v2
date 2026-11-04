// "Mi campaña": la vista del candidato. Una sola página, en lenguaje
// sencillo: cuánto llevamos, cómo crece, dónde estamos fuertes o débiles y
// qué necesita atención. Sin datos de personas: solo cifras.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownRight, ArrowUpRight, BarChart3, CalendarCheck, CalendarDays, MapPinned, Minus, SlidersHorizontal, Target, Vote } from 'lucide-react';
import { useVistaAvanzada } from '../lib/vistaCandidato';
import { useSesion } from '../lib/sesion';
import { useEnVivo } from '../lib/enVivo';
import type { Demografia, Eleccion, LocalidadE14, MetaLider, PuestoCenso, SeguimientoLider, Tendencia } from '../lib/tipos';
import { formatoNumero, mensajeError } from '../lib/utilidades';
import EnVivo from '../componentes/EnVivo';
import { BarrasH, Dona, Linea, Piramide, Segmentos, SERIES } from '../componentes/Graficos';
import { resumirDemografia } from '../lib/estadisticas';

interface Datos {
  demo: Demografia[]; tendencia: Tendencia[]; metas: MetaLider[]; seguimiento: SeguimientoLider[]; censo: PuestoCenso[];
  eleccion: Eleccion | null; e14: LocalidadE14[] | null;
}
const pct = (a: number, b: number) => (b > 0 ? Math.round((100 * a) / b) : 0);

export default function MiCampana() {
  const { api, sesion, vista } = useSesion();
  const [d, setD] = useState<Datos | null>(null);
  const [error, setError] = useState('');

  const vivo = useEnVivo(async () => {
    try {
      const [demo, tendencia, metas, seguimiento, censo, elecciones] = await Promise.all([
        api.demografia(), api.tendencia(), api.metasLideres(), api.seguimientoLideres(), api.censoPuestos(), api.elecciones()]);
      const eleccion = [...elecciones].sort((a, b) => b.fecha.localeCompare(a.fecha))[0] ?? null;
      const e14 = eleccion ? (await api.resultadosE14(eleccion.id).catch(() => null))?.localidades ?? null : null;
      setD({ demo, tendencia, metas, seguimiento, censo, eleccion, e14 });
    } catch (e) { setError(mensajeError(e)); }
  }, ['registros', 'e14']);

  const r = useMemo(() => (d ? calcular(d) : null), [d]);
  // En "Ver como" por rol no hay una persona concreta: sin nombre
  const nombre = vista?.objetivo.startsWith('rol:') ? null : sesion!.perfil!.nombre.split(' ')[0];

  return (
    <div className="mi-campana">
      <div className="mc-cabeza">
        <div>
          {nombre && <p className="mc-saludo">Hola, {nombre}</p>}
          <h1>Así va tu campaña</h1>
        </div>
        <EnVivo {...vivo} />
      </div>
      {error && <div className="aviso error" role="alert">{error}</div>}
      {!r ? <div className="tarjeta vacio">Cargando…</div> : (
        <>
          {/* 1. El número principal */}
          <section className="mc-heroe tarjeta">
            <div className="mc-heroe-num">
              <span className="mc-grande">{formatoNumero(r.total)}</span>
              <span className="mc-etiqueta">simpatizantes registrados</span>
              <span className={`mc-tendencia ${r.delta > 0 ? 'sube' : r.delta < 0 ? 'baja' : ''}`}>
                {r.delta > 0 ? <ArrowUpRight aria-hidden /> : r.delta < 0 ? <ArrowDownRight aria-hidden /> : <Minus aria-hidden />}
                {formatoNumero(r.semana)} esta semana{r.anterior > 0 ? ` (${r.delta > 0 ? '+' : ''}${r.delta}% frente a la anterior)` : ''}
              </span>
            </div>
            {r.meta > 0 && (
              <div className="mc-meta">
                <div className="mc-meta-texto"><strong>{r.avanceMeta}%</strong> de la meta de {formatoNumero(r.meta)}</div>
                <div className="mc-barra"><span style={{ width: `${Math.min(100, r.avanceMeta)}%` }} /></div>
              </div>
            )}
          </section>

          {/* 2. Tres cifras clave */}
          <section className="mc-tres">
            <div className="tarjeta mc-cifra">
              <span className="mc-cifra-num">{r.confirmadosPct}%</span>
              <span>ya confirmó que vota por ti</span>
              <small>{formatoNumero(r.confirmados)} personas · {r.contactadosPct}% ya fue contactado</small>
            </div>
            <div className="tarjeta mc-cifra">
              <span className="mc-cifra-num">{r.lideresAlDia} <small>de {r.lideres}</small></span>
              <span>líderes van al día con su meta</span>
              <small>{r.lideresAtras ? `${r.lideresAtras} van muy atrás` : 'Ninguno va muy atrás'}</small>
            </div>
            <div className="tarjeta mc-cifra">
              <span className="mc-cifra-num">{r.presencia} <small>de {r.localidades}</small></span>
              <span>localidades con presencia</span>
              <small>{r.porMil.toLocaleString('es-CO')} simpatizantes por cada 1.000 votantes</small>
            </div>
          </section>

          {/* 3. Gráficos: crecimiento, apoyo, perfil, territorio, líderes */}
          <section className="mc-graficos seccion">
            <div className="tarjeta">
              <div className="tarjeta-titulo"><h2>Registros por semana</h2><small>últimas 12 semanas</small></div>
              <Linea puntos={r.semanas} color={SERIES[0]} nombre="Registros" alto={170} />
            </div>
            <div className="tarjeta">
              <div className="tarjeta-titulo"><h2>Total acumulado</h2><small>simpatizantes al cierre de cada semana</small></div>
              <Linea puntos={r.acumulado} color={SERIES[2]} nombre="Total" alto={170} />
              {r.proyeccion && <p className="mc-nota">{r.proyeccion}</p>}
            </div>
            <div className="tarjeta">
              <div className="tarjeta-titulo"><h2>¿Con quién contamos?</h2><small>resultado de las llamadas</small></div>
              <Dona partes={r.apoyo} centro={`${r.confirmadosPct}%`} sub="confirmados" />
            </div>
            <div className="tarjeta">
              <div className="tarjeta-titulo"><h2>Quiénes te apoyan</h2><small>edad y sexo</small></div>
              <Piramide filas={r.piramide} />
              <p className="mc-nota">{r.perfil}</p>
            </div>
            <div className="tarjeta">
              <div className="tarjeta-titulo"><h2>Simpatizantes por localidad</h2><small>de más a menos</small></div>
              <BarrasH limite={8} filas={r.porLocalidad.map((l) => ({ nombre: l.nombre, valores: [l.n], detalle: `${l.porMil.toLocaleString('es-CO')} por cada 1.000 votantes` }))} />
            </div>
            <div className="tarjeta">
              <div className="tarjeta-titulo"><h2>Cómo van los líderes</h2><small>frente a su meta</small></div>
              <Segmentos partes={r.semaforo} />
              <h3 className="mc-sub">Los que más aportan</h3>
              <BarrasH filas={r.topLideres} series={[{ nombre: 'Registrados', color: SERIES[0] }]} />
            </div>
          </section>

          {/* 4. Fuertes y débiles */}
          <section className="mc-dos seccion">
            <div className="tarjeta">
              <h2>Donde eres más fuerte</h2>
              <ol className="mc-lista">{r.fuertes.map((l) => <li key={l.nombre}><span>{l.nombre}</span><strong>{l.porMil.toLocaleString('es-CO')}</strong></li>)}</ol>
              <small className="ayuda">simpatizantes por cada 1.000 votantes</small>
            </div>
            <div className="tarjeta">
              <h2>Donde hay que crecer</h2>
              <ol className="mc-lista">{r.debiles.map((l) => <li key={l.nombre}><span>{l.nombre}</span><strong>{l.porMil.toLocaleString('es-CO')}</strong></li>)}</ol>
              <small className="ayuda">simpatizantes por cada 1.000 votantes</small>
            </div>
          </section>

          {/* 5. Lo que necesita atención */}
          {r.atencion.length > 0 && (
            <section className="tarjeta seccion mc-atencion">
              <h2>Para tener en cuenta</h2>
              <ul>{r.atencion.map((t) => <li key={t}>{t}</li>)}</ul>
            </section>
          )}

          {/* 6. Resultados, cuando haya E14 */}
          {d!.eleccion && r.e14 && r.e14.votos > 0 && (
            <section className="tarjeta seccion">
              <div className="tarjeta-titulo"><h2>Resultados: {d!.eleccion.nombre}</h2><small>{r.e14.mesasPct}% de las mesas verificadas</small></div>
              <div className="mc-tres">
                <div className="mc-cifra"><span className="mc-cifra-num">{formatoNumero(r.e14.votos)}</span><span>votos en los E14 verificados</span></div>
                <div className="mc-cifra"><span className="mc-cifra-num">{r.e14.cumplimiento}%</span><span>de lo esperado en esas mesas</span></div>
              </div>
            </section>
          )}

          <MasDetalle />
        </>
      )}
    </div>
  );
}

// Lo avanzado no estorba: está a un toque, para cuando se quiera mirar más
const AVANZADO = [
  { a: '/tablero', icono: MapPinned, titulo: 'Mapa y detalle', texto: 'Dónde están los simpatizantes, puesto por puesto' },
  { a: '/analisis', icono: BarChart3, titulo: 'Análisis', texto: 'Hallazgos, comparación con la elección anterior y simulación' },
  { a: '/metas', icono: Target, titulo: 'Metas de los líderes', texto: 'Quién va al día, quién va atrás y el ranking de la semana' },
  { a: '/eventos', icono: CalendarDays, titulo: 'Eventos', texto: 'Asistencia y nuevos registros en cada evento' },
  { a: '/dia-d', icono: CalendarCheck, titulo: 'Día D', texto: 'El día de la elección: quiénes ya votaron, por puesto' },
  { a: '/e14', icono: Vote, titulo: 'Resultados E14', texto: 'Votos reales por mesa frente a los simpatizantes' },
];

function MasDetalle() {
  const [avanzada, setAvanzada] = useVistaAvanzada();
  return (
    <section className="tarjeta seccion mc-mas">
      <div className="tarjeta-titulo">
        <h2><SlidersHorizontal className="icono" aria-hidden /> {avanzada ? 'Vista avanzada' : '¿Quieres ver más detalle?'}</h2>
        <button className="boton chico" onClick={() => setAvanzada(!avanzada)}>{avanzada ? 'Volver a la vista simple' : 'Activar la vista avanzada'}</button>
      </div>
      {!avanzada ? (
        <p className="ayuda" style={{ margin: 0 }}>
          Esta página es el resumen. La vista avanzada agrega al menú el análisis, las metas, los eventos, el Día D y los resultados
          de los E14. Puedes volver a la simple cuando quieras. <Link to="/tablero">O mira ya el mapa y el detalle</Link>.
        </p>
      ) : (
        <div className="mc-mas-rejilla">
          {AVANZADO.map((x) => (
            <Link key={x.a} to={x.a} className="mc-mas-enlace">
              <x.icono className="icono" aria-hidden />
              <span><strong>{x.titulo}</strong><small>{x.texto}</small></span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function calcular(d: Datos) {
  const total = d.demo.reduce((a, x) => a + x.personas, 0);
  // semana actual y anterior (por días)
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const porDia = new Map(d.tendencia.map((t) => [t.dia.slice(0, 10), t.nuevos]));
  const sumar = (desde: number, hasta: number) => {
    let s = 0;
    for (let i = desde; i < hasta; i++) {
      const f = new Date(hoy); f.setDate(f.getDate() - i);
      s += porDia.get(`${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`) ?? 0;
    }
    return s;
  };
  const semana = sumar(0, 7), anterior = sumar(7, 14);
  const delta = anterior > 0 ? Math.round((100 * (semana - anterior)) / anterior) : 0;
  const semanas = Array.from({ length: 12 }, (_, k) => {
    const i = 11 - k;
    const fin = new Date(hoy); fin.setDate(fin.getDate() - i * 7);
    return { etiqueta: fin.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }).replace('.', ''), valor: sumar(i * 7, i * 7 + 7) };
  });

  const meta = d.metas.reduce((a, m) => a + m.meta, 0);
  const avance = d.metas.filter((m) => m.meta > 0).reduce((a, m) => a + Math.min(m.registrados, m.meta), 0);
  const conMeta = d.metas.filter((m) => m.meta > 0);
  const lideresAlDia = conMeta.filter((m) => m.semaforo === 'verde' || m.semaforo === 'cumplida').length;
  const lideresAtras = conMeta.filter((m) => m.semaforo === 'rojo').length;
  const quietos = conMeta.filter((m) => m.semaforo !== 'cumplida' && (!m.ultimo_registro || Date.now() - new Date(m.ultimo_registro).getTime() > 7 * 86_400_000)).length;

  const seg = d.seguimiento.reduce((a, s) => ({ t: a.t + s.total, c: a.c + s.confirmados, k: a.k + s.contactados }), { t: 0, c: 0, k: 0 });

  // por localidad: simpatizantes por cada 1.000 votantes
  const censo = new Map<number, number>();
  for (const p of d.censo) censo.set(p.localidad_id, (censo.get(p.localidad_id) ?? 0) + (p.censo_total ?? 0));
  const porLoc = new Map<number, { nombre: string; n: number }>();
  for (const x of d.demo) {
    if (x.localidad_id == null) continue;
    const v = porLoc.get(x.localidad_id) ?? { nombre: x.localidad ?? '', n: 0 };
    v.n += x.personas; porLoc.set(x.localidad_id, v);
  }
  const censoDe = new Map<string, number>();
  const locs = [...censo.entries()].filter(([, c]) => c > 0).map(([id, c]) => {
    const v = porLoc.get(id);
    if (v) censoDe.set(v.nombre, c);
    return { nombre: v?.nombre ?? '', n: v?.n ?? 0, porMil: Math.round((10_000 * (v?.n ?? 0)) / c) / 10 };
  }).filter((l) => l.nombre);
  // Para comparar fuerza solo cuentan localidades grandes (una muy pequeña, como Sumapaz, distorsiona)
  const ordenadas = [...locs].filter((l) => (censoDe.get(l.nombre) ?? 0) >= 20_000).sort((a, b) => b.porMil - a.porMil);
  const censoTotal = [...censo.values()].reduce((a, c) => a + c, 0);
  const sinLugar = d.demo.filter((x) => x.localidad_id == null).reduce((a, x) => a + x.personas, 0);

  const atencion: string[] = [];
  if (lideresAtras) atencion.push(`${lideresAtras} ${lideresAtras === 1 ? 'líder va' : 'líderes van'} muy atrás de su meta.`);
  if (quietos) atencion.push(`${quietos} ${quietos === 1 ? 'líder no registra' : 'líderes no registran'} a nadie hace más de una semana.`);
  if (anterior > 0 && delta <= -20) atencion.push(`Los registros bajaron ${-delta}% frente a la semana anterior.`);
  if (total && pct(sinLugar, total) >= 5) atencion.push(`${pct(sinLugar, total)}% de los simpatizantes todavía no tiene lugar de votación confirmado.`);
  if (seg.t && pct(seg.k, seg.t) < 50) atencion.push(`Solo ${pct(seg.k, seg.t)}% de los simpatizantes ha sido contactado para confirmar su apoyo.`);

  let e14: { votos: number; cumplimiento: number; mesasPct: number } | null = null;
  if (d.e14) {
    const t = d.e14.reduce((a, l) => ({ v: a.v + (l.votos_reales ?? 0), e: a.e + (l.esperados ?? 0), c: a.c + (l.confirmados ?? 0), m: a.m + l.mesas, mv: a.mv + l.mesas_verificadas }),
      { v: 0, e: 0, c: 0, m: 0, mv: 0 });
    e14 = { votos: t.v, cumplimiento: pct(t.c, t.e), mesasPct: pct(t.mv, t.m) };
  }

  // Acumulado por semana y proyección a la meta
  let acum = total - semanas.reduce((a, w) => a + w.valor, 0);
  const acumulado = semanas.map((w) => ({ etiqueta: w.etiqueta, valor: (acum += w.valor) }));
  const ritmo = Math.round(semanas.slice(-4).reduce((a, w) => a + w.valor, 0) / 4);
  const faltanMeta = Math.max(0, meta - avance);
  let proyeccion: string | null = null;
  if (meta > 0 && faltanMeta === 0) proyeccion = 'La meta de los líderes ya se cumplió.';
  else if (meta > 0 && ritmo > 0) {
    const sem = Math.ceil(faltanMeta / ritmo);
    const f = new Date(); f.setDate(f.getDate() + sem * 7);
    proyeccion = `A este ritmo (${ritmo.toLocaleString('es-CO')} por semana) la meta se alcanza en unas ${sem} semanas, hacia el ${f.toLocaleDateString('es-CO', { day: 'numeric', month: 'long' })}.`;
  } else if (meta > 0) proyeccion = 'En las últimas 4 semanas no hubo registros: así no se llega a la meta.';

  // Apoyo (seguimiento)
  const sumaSeg = (k: keyof SeguimientoLider) => d.seguimiento.reduce((a, x) => a + Number(x[k] ?? 0), 0);
  const apoyo = [
    { nombre: 'Confirmados', valor: sumaSeg('confirmados'), color: 'var(--ok)' },
    { nombre: 'Dudosos', valor: sumaSeg('dudosos'), color: 'var(--aviso)' },
    { nombre: 'No apoyan', valor: sumaSeg('no_apoya'), color: 'var(--error)' },
    { nombre: 'Número equivocado', valor: sumaSeg('numero_errado'), color: SERIES[4] },
    { nombre: 'Sin contactar', valor: sumaSeg('sin_contactar'), color: 'var(--borde-fuerte)' },
  ];

  // Perfil: edad y sexo
  const dem = resumirDemografia(d.demo);
  const piramide = dem.piramide;
  const mujeres = piramide.reduce((a, f) => a + f.mujeres, 0), hombres = piramide.reduce((a, f) => a + f.hombres, 0);
  const rangoMayor = [...piramide].sort((a, b) => (b.mujeres + b.hombres) - (a.mujeres + a.hombres))[0];
  const perfil = `${pct(mujeres, mujeres + hombres)}% mujeres y ${pct(hombres, mujeres + hombres)}% hombres. El grupo más grande tiene ${rangoMayor?.rango ?? '—'} años.`;

  // Territorio y líderes
  const porLocalidad = [...locs].sort((a, b) => b.n - a.n);
  const semaforo = [
    { nombre: 'Meta cumplida', valor: conMeta.filter((m) => m.semaforo === 'cumplida').length, color: 'var(--ok)' },
    { nombre: 'Al día', valor: conMeta.filter((m) => m.semaforo === 'verde').length, color: SERIES[2] },
    { nombre: 'Un poco atrás', valor: conMeta.filter((m) => m.semaforo === 'amarillo').length, color: 'var(--aviso)' },
    { nombre: 'Muy atrás', valor: lideresAtras, color: 'var(--error)' },
  ];
  const topLideres = [...d.metas].sort((a, b) => b.registrados - a.registrados).slice(0, 5)
    .map((m) => ({ nombre: m.nombre, valores: [m.registrados], detalle: m.meta ? `${pct(m.registrados, m.meta)}% de su meta de ${m.meta.toLocaleString('es-CO')}` : 'sin meta' }));

  return {
    acumulado, proyeccion, apoyo, piramide, perfil, porLocalidad, semaforo, topLideres,
    total, semana, anterior, delta, semanas, meta, avanceMeta: pct(avance, meta),
    confirmados: seg.c, confirmadosPct: pct(seg.c, seg.t), contactadosPct: pct(seg.k, seg.t),
    lideres: conMeta.length, lideresAlDia, lideresAtras,
    presencia: locs.filter((l) => l.n > 0).length, localidades: locs.length,
    porMil: censoTotal ? Math.round((10_000 * (total - sinLugar)) / censoTotal) / 10 : 0,
    fuertes: ordenadas.slice(0, 3), debiles: ordenadas.slice(-3).reverse(),
    atencion: atencion.slice(0, 4), e14,
  };
}
