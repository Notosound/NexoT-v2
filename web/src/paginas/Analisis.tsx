// Análisis: jerarquía localidad → puesto → mesa, calidad de los datos,
// rendimiento de líderes y simulación de campaña. Solo cifras agregadas;
// todo se puede exportar a Excel (queda registrado en la auditoría).
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle, CalendarClock, CheckCircle2, Download, MapPin, MapPinOff, Phone, Target, TrendingDown, TrendingUp, Users, Vote,
} from 'lucide-react';
import { useSesion } from '../lib/sesion';
import { BarrasH, Linea, Segmentos, SERIES } from '../componentes/Graficos';
import { Cifra, QueEs } from '../componentes/Piezas';
import { ORDEN_EDAD, partesSexo, resumirDemografia, serieDesdeTendencia } from '../lib/estadisticas';
import type {
  CalidadLider, Demografia, Eleccion, LiderE14, LocalidadE14, MesaE14, PuestoCenso, PuestoCodigos, PuestoE14, RegistrosMesa, Tendencia,
} from '../lib/tipos';
import { descargarExcel, fechaArchivo, type Celda } from '../lib/excel';
import { formatoNumero, mensajeError } from '../lib/utilidades';

type Pestana = 'resumen' | 'jerarquia' | 'calidad' | 'lideres' | 'simulacion';
const PESTANAS: [Pestana, string][] = [['resumen', 'Resumen'], ['jerarquia', 'Territorio'], ['lideres', 'Líderes'], ['calidad', 'Calidad de los datos'], ['simulacion', 'Simulación']];
const pct = (a: number, b: number) => (b > 0 ? Math.round((100 * a) / b) : null);
const pct0 = (a: number, b: number) => pct(a, b) ?? 0;
const porMil = (a: number, b: number) => (b > 0 ? Math.round((10000 * a) / b) / 10 : 0);
const fmtPct = (v: number | null) => (v == null ? '—' : `${v}%`);

interface Datos {
  demo: Demografia[];
  censo: Map<number, PuestoCenso>;
  codigos: Map<number, PuestoCodigos>;
  porMesa: RegistrosMesa[];
  calidad: CalidadLider[];
  tendencia: Tendencia[];
  elecciones: Eleccion[];
}

export default function Analisis() {
  const { api, sesion } = useSesion();
  const rol = sesion!.perfil!.rol;
  const [params, setParams] = useSearchParams();
  const pestana = (PESTANAS.find(([k]) => k === params.get('vista'))?.[0] ?? 'resumen') as Pestana;
  const setPestana = (k: Pestana) => setParams({ vista: k }, { replace: true });
  const [datos, setDatos] = useState<Datos | null>(null);
  const [eleccionId, setEleccionId] = useState('');
  const [e14, setE14] = useState<{ localidades: LocalidadE14[]; puestos: PuestoE14[]; lideres: LiderE14[] } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api.demografia(), api.censoPuestos(), api.puestosConCodigos(), api.registrosMesa(), api.calidadLideres(), api.tendencia(), api.elecciones()])
      .then(([demo, censo, codigos, porMesa, calidad, tendencia, elecciones]) => {
        setDatos({ demo, censo: new Map(censo.map((c) => [c.id, c])), codigos: new Map(codigos.map((c) => [c.id, c])), porMesa, calidad, tendencia, elecciones });
        setEleccionId(elecciones[0]?.id ?? '');
      })
      .catch((e) => setError(mensajeError(e)));
  }, [api]);

  useEffect(() => {
    setE14(null);
    if (eleccionId) api.resultadosE14(eleccionId).then(setE14).catch(() => {});
  }, [api, eleccionId]);

  async function exportar(tipo: string, archivo: string, filas: Celda[][], filtros: Record<string, unknown> = {}) {
    try {
      await api.registrarExportacion(tipo, filas.length - 1, filtros);
      await descargarExcel(`${archivo}_${fechaArchivo()}.xlsx`, [{ nombre: tipo, filas }]);
    } catch (e) { setError(mensajeError(e)); }
  }

  return (
    <>
      <div className="encabezado">
        <div><h1>Análisis</h1><p className="subtitulo">Qué está pasando en la campaña y qué hacer, en palabras sencillas.</p></div>
        {datos && datos.elecciones.length > 0 && (
          <label className="campo" style={{ minWidth: 220 }}><span>Cruzar con E14</span>
            <select value={eleccionId} onChange={(e) => setEleccionId(e.target.value)}>
              <option value="">Sin cruzar</option>
              {datos.elecciones.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </select>
          </label>
        )}
      </div>
      {error && <div className="aviso error" role="alert" style={{ marginBottom: '1rem' }}>{error}</div>}
      <div className="pestanas" role="tablist">
        {PESTANAS.map(([k, t]) => (
          <button key={k} role="tab" aria-selected={pestana === k} onClick={() => setPestana(k)}>{t}</button>
        ))}
      </div>
      {!datos ? <div className="tarjeta vacio">Cargando…</div> : (
        <>
          {pestana === 'resumen' && <Resumen datos={datos} e14={eleccionId ? e14 : null} eleccion={datos.elecciones.find((e) => e.id === eleccionId)} esAdmin={rol === 'admin'} irA={setPestana} />}
          {pestana === 'jerarquia' && <Jerarquia datos={datos} e14={eleccionId ? e14 : null} eleccionId={eleccionId} exportar={exportar} />}
          {pestana === 'calidad' && <Calidad datos={datos} esAdmin={rol === 'admin'} exportar={exportar} />}
          {pestana === 'lideres' && <Lideres datos={datos} e14={eleccionId ? e14 : null} exportar={exportar} />}
          {pestana === 'simulacion' && <Simulacion datos={datos} exportar={exportar} />}
        </>
      )}
    </>
  );
}

type Exportar = (tipo: string, archivo: string, filas: Celda[][], filtros?: Record<string, unknown>) => Promise<void>;

function BotonExportar({ onClick }: { onClick: () => void }) {
  return <button className="boton chico" onClick={onClick}><Download className="icono" aria-hidden />Exportar a Excel</button>;
}

// ── Resumen: hallazgos en palabras sencillas ──────────────────────────
interface Hallazgo { tono: 'bien' | 'atencion' | 'info'; icono: typeof Users; texto: React.ReactNode; accion?: React.ReactNode }

function Resumen({ datos, e14, eleccion, esAdmin, irA }: {
  datos: Datos; e14: { localidades: LocalidadE14[]; lideres: LiderE14[] } | null; eleccion?: Eleccion; esAdmin: boolean; irA: (p: Pestana) => void;
}) {
  const r = resumirDemografia(datos.demo);
  const serie = serieDesdeTendencia(datos.tendencia, 28);
  const ult7 = serie.slice(-7).reduce((a, p) => a + p.valor, 0);
  const prev7 = serie.slice(-14, -7).reduce((a, p) => a + p.valor, 0);
  const cambio = prev7 > 0 ? Math.round((100 * (ult7 - prev7)) / prev7) : null;

  // Territorio: concentración y penetración (por cada 1.000 votantes del censo)
  const censoLoc = new Map<string, number>();
  for (const p of datos.censo.values()) {
    const loc = datos.codigos.get(p.id)?.localidad;
    if (loc) censoLoc.set(loc, (censoLoc.get(loc) ?? 0) + p.censo_total);
  }
  const locs = [...r.localidad.entries()].map(([nombre, n]) => ({ nombre, n, porMil: porMil(n, censoLoc.get(nombre) ?? 0) })).sort((a, b) => b.n - a.n);
  const conLugar = locs.reduce((a, l) => a + l.n, 0);

  // Personas
  const mujeres = r.sexo.get('Femenino') ?? 0;
  const edadTop = ORDEN_EDAD.map((e) => [e, r.edad.get(e) ?? 0] as const).sort((a, b) => b[1] - a[1])[0];

  // Líderes
  const conMeta = datos.calidad.filter((l) => l.meta_votos > 0);
  const sobreMitad = conMeta.filter((l) => l.total >= l.meta_votos / 2).length;
  const quietos = datos.calidad.filter((l) => !l.ultimo_registro || Date.now() - new Date(l.ultimo_registro).getTime() > 7 * 864e5);
  const top = [...datos.calidad].sort((a, b) => b.total - a.total)[0];

  // Calidad
  const total = datos.calidad.reduce((a, l) => a + l.total, 0);
  const ubicados = datos.calidad.reduce((a, l) => a + l.ubicados, 0);
  const porRevisar = datos.calidad.reduce((a, l) => a + l.por_revisar, 0);
  const sinLugar = datos.calidad.reduce((a, l) => a + l.sin_lugar + l.sin_mesa, 0);

  // E14
  const t14 = e14?.localidades.reduce((a, l) => ({
    esperados: a.esperados + l.esperados, conf: a.conf + l.confirmados, falt: a.falt + l.faltantes, adic: a.adic + l.adicionales,
    mesas: a.mesas + l.mesas, verif: a.verif + l.mesas_verificadas,
  }), { esperados: 0, conf: 0, falt: 0, adic: 0, mesas: 0, verif: 0 });

  const h: Hallazgo[] = [];
  h.push({
    tono: cambio != null && cambio < 0 ? 'atencion' : 'bien', icono: cambio != null && cambio < 0 ? TrendingDown : TrendingUp,
    texto: <>Esta semana entraron <strong>{formatoNumero(ult7)}</strong> registros{cambio != null && <>, {cambio >= 0 ? `${cambio}% más` : `${-cambio}% menos`} que la semana anterior</>}.</>,
  });
  if (locs[0]) h.push({
    tono: 'info', icono: MapPin,
    texto: <>{locs[0].nombre} concentra el <strong>{pct0(locs[0].n, conLugar)}%</strong> de los simpatizantes{locs[1] && <>, seguida de {locs[1].nombre} ({pct0(locs[1].n, conLugar)}%)</>}.
      </>,
    accion: <button className="ir" onClick={() => irA('jerarquia')}>Ver territorio →</button>,
  });
  if (r.total) h.push({
    tono: 'info', icono: Users,
    texto: <>El {pct0(mujeres, r.total)}% son mujeres; el grupo de edad más grande es {edadTop[0]} años.</>,
  });
  if (conMeta.length) h.push({
    tono: sobreMitad >= conMeta.length / 2 ? 'bien' : 'atencion', icono: Target,
    texto: <><strong>{sobreMitad} de {conMeta.length}</strong> líderes van por encima de la mitad de su meta.{top && <> El que más lleva: {top.nombre} ({formatoNumero(top.total)}).</>}</>,
    accion: <button className="ir" onClick={() => irA('lideres')}>Ver líderes →</button>,
  });
  if (quietos.length) h.push({
    tono: 'atencion', icono: CalendarClock,
    texto: <><strong>{quietos.length}</strong> {quietos.length === 1 ? 'líder lleva' : 'líderes llevan'} más de una semana sin registrar: {quietos.slice(0, 3).map((l) => l.nombre).join(', ')}{quietos.length > 3 && ' y otros'}.</>,
  });
  if (total) h.push({
    tono: pct0(ubicados, total) >= 85 ? 'bien' : 'atencion', icono: pct0(ubicados, total) >= 85 ? CheckCircle2 : MapPinOff,
    texto: <>El <strong>{pct0(ubicados, total)}%</strong> tiene puesto y mesa: se pueden contar con el E14.{sinLugar > 0 && <> A {formatoNumero(sinLugar)} les falta el dato.</>}</>,
    accion: esAdmin && porRevisar > 0 ? <Link className="ir" to="/revision">Resolver {formatoNumero(porRevisar)} →</Link> : <button className="ir" onClick={() => irA('calidad')}>Ver calidad →</button>,
  });
  if (t14 && eleccion) h.push({
    tono: t14.verif < t14.mesas ? 'atencion' : 'bien', icono: Vote,
    texto: <>E14: <strong>{pct0(t14.conf, t14.conf + t14.falt)}%</strong> de los simpatizantes votaron en las {t14.verif} mesas verificadas (de {t14.mesas}).</>,
    accion: <Link className="ir" to="/e14">Ver E14 →</Link>,
  });

  const porLocalidadE14 = (e14?.localidades ?? []).filter((l) => l.mesas_verificadas > 0).sort((a, b) => b.esperados - a.esperados);
  return (
    <>
      <div className="tarjeta">
        <div className="tarjeta-titulo"><h2>Lo más importante</h2><small>con los datos de este momento</small></div>
        <ul className="hallazgos">
          {h.map((x, i) => (
            <li key={i} className={x.tono}><x.icono aria-hidden /><div>{x.texto}</div>{x.accion ?? <span />}</li>
          ))}
        </ul>
      </div>
      <div className="graficos seccion">
        <div className="tarjeta">
          <div className="tarjeta-titulo"><h2>Registros por día</h2><small>últimas 4 semanas</small></div>
          <Linea puntos={serie} nombre="Registros" />
        </div>
        <div className="tarjeta">
          <div className="tarjeta-titulo">
            <h2>Peso en cada localidad <QueEs>“Por cada 1.000” compara los simpatizantes con el número de votantes de la localidad (censo electoral). Sirve para ver dónde la campaña pesa más, aunque la localidad sea pequeña.</QueEs></h2>
          </div>
          <BarrasH limite={8} filas={locs.map((l) => ({ nombre: l.nombre, valores: [l.n], detalle: `${l.porMil.toLocaleString('es-CO')} por cada 1.000 votantes` }))} />
        </div>
        {porLocalidadE14.length > 0 && (
          <div className="tarjeta">
            <div className="tarjeta-titulo">
              <h2>E14: esperados vs. votos <QueEs>
                <strong>Confirmados</strong>: votos que coinciden con simpatizantes registrados en esa mesa (como máximo, los esperados).{' '}
                <strong>Faltantes</strong>: simpatizantes registrados en la mesa que no aparecen en el E14.{' '}
                <strong>Adicionales</strong>: votos de más, de personas que no estaban registradas. Solo cuentan las mesas verificadas.
              </QueEs></h2>
            </div>
            <BarrasH limite={8} series={[{ nombre: 'Confirmados', color: SERIES[0] }, { nombre: 'Faltantes', color: SERIES[1] }, { nombre: 'Adicionales', color: SERIES[2] }]}
              filas={porLocalidadE14.map((l) => ({ nombre: l.localidad, valores: [l.confirmados, l.faltantes, l.adicionales], detalle: `${l.mesas_verificadas} de ${l.mesas} mesas verificadas` }))} />
          </div>
        )}
        <div className="tarjeta">
          <div className="tarjeta-titulo"><h2>Sexo y edad</h2></div>
          <Segmentos partes={partesSexo(r.sexo, [SERIES[0], SERIES[1], SERIES[2], SERIES[3], 'var(--texto-3)'])} />
          <div style={{ marginTop: '1rem' }}>
            <BarrasH filas={ORDEN_EDAD.map((e) => ({ nombre: `${e} años`, valores: [r.edad.get(e) ?? 0] }))} />
          </div>
        </div>
      </div>
    </>
  );
}

// ── Jerarquía ─────────────────────────────────────────────────────────
function Jerarquia({ datos, e14, eleccionId, exportar }: { datos: Datos; e14: { localidades: LocalidadE14[]; puestos: PuestoE14[] } | null; eleccionId: string; exportar: Exportar }) {
  const { api } = useSesion();
  const [localidad, setLocalidad] = useState<{ id: number; nombre: string } | null>(null);
  const [puesto, setPuesto] = useState<{ id: number; nombre: string } | null>(null);
  const [mesasE14, setMesasE14] = useState<MesaE14[]>([]);

  useEffect(() => {
    setMesasE14([]);
    if (puesto && eleccionId) api.mesasE14(eleccionId, puesto.id).then(setMesasE14).catch(() => {});
  }, [api, puesto, eleccionId]);

  const porPuesto = useMemo(() => {
    const m = new Map<number, number>();
    for (const d of datos.demo) if (d.puesto_id != null) m.set(d.puesto_id, (m.get(d.puesto_id) ?? 0) + d.personas);
    return m;
  }, [datos.demo]);
  const mesasPorPuesto = useMemo(() => {
    const m = new Map<number, number>();
    for (const r of datos.porMesa) m.set(r.puesto_id, (m.get(r.puesto_id) ?? 0) + 1);
    return m;
  }, [datos.porMesa]);
  const sinLugar = datos.demo.filter((d) => d.puesto_id == null).reduce((s, d) => s + d.personas, 0);
  const e14Loc = new Map((e14?.localidades ?? []).map((x) => [x.localidad_id, x]));
  const e14Puesto = new Map((e14?.puestos ?? []).map((x) => [x.puesto_id, x]));
  const cumpl = (x?: { confirmados: number; faltantes: number }) => (x ? pct(x.confirmados, x.confirmados + x.faltantes) : null);

  const localidades = useMemo(() => {
    const m = new Map<number, { id: number; nombre: string; personas: number; censo: number; puestos: number; puestosCon: number; mesasCon: number }>();
    for (const p of datos.censo.values()) {
      const nombre = datos.codigos.get(p.id)?.localidad ?? '';
      const e = m.get(p.localidad_id) ?? { id: p.localidad_id, nombre, personas: 0, censo: 0, puestos: 0, puestosCon: 0, mesasCon: 0 };
      const n = porPuesto.get(p.id) ?? 0;
      e.censo += p.censo_total; e.puestos++; e.personas += n;
      if (n) e.puestosCon++;
      e.mesasCon += mesasPorPuesto.get(p.id) ?? 0;
      m.set(p.localidad_id, e);
    }
    return [...m.values()].sort((a, b) => b.personas - a.personas);
  }, [datos, porPuesto, mesasPorPuesto]);

  const puestos = useMemo(() => !localidad ? [] : [...datos.censo.values()]
    .filter((p) => p.localidad_id === localidad.id)
    .map((p) => ({ id: p.id, nombre: p.nombre, personas: porPuesto.get(p.id) ?? 0, censo: p.censo_total, mesas: datos.codigos.get(p.id)?.mesas_total ?? 0, mesasCon: mesasPorPuesto.get(p.id) ?? 0 }))
    .sort((a, b) => b.personas - a.personas || a.nombre.localeCompare(b.nombre)), [datos, localidad, porPuesto, mesasPorPuesto]);

  const mesas = useMemo(() => {
    if (!puesto) return [];
    const total = datos.codigos.get(puesto.id)?.mesas_total ?? 0;
    const reg = new Map(datos.porMesa.filter((r) => r.puesto_id === puesto.id).map((r) => [r.mesa, r.personas]));
    const e = new Map(mesasE14.map((m) => [m.mesa, m]));
    return Array.from({ length: total }, (_, i) => i + 1).map((n) => ({ mesa: n, personas: reg.get(n) ?? 0, e14: e.get(n) }))
      .filter((m) => m.personas > 0 || m.e14);
  }, [datos, puesto, mesasE14]);

  const conE14 = !!e14;
  const colsE14 = (x?: { confirmados: number; faltantes: number; adicionales: number }) => conE14 && (
    <>
      <td className="num solo-ancho">{x ? formatoNumero(x.confirmados) : '—'}</td>
      <td className="num">{fmtPct(cumpl(x))}</td>
    </>
  );

  return (
    <div className="tarjeta">
      <nav className="migas" aria-label="Nivel">
        <button className="enlace" onClick={() => { setLocalidad(null); setPuesto(null); }}>Bogotá</button>
        {localidad && <> › <button className="enlace" onClick={() => setPuesto(null)}>{localidad.nombre}</button></>}
        {puesto && <> › <span>{puesto.nombre}</span></>}
      </nav>

      {!localidad && (
        <>
          <div className="encabezado"><p>{formatoNumero(localidades.reduce((s, l) => s + l.personas, 0))} simpatizantes con puesto confirmado{sinLugar > 0 && ` · ${formatoNumero(sinLugar)} sin lugar de votación`}</p>
            <BotonExportar onClick={() => exportar('localidades', 'Analisis_localidades', [
              ['Localidad', 'Simpatizantes', 'Votantes (censo)', 'Por cada 1.000', 'Puestos con simpatizantes', 'Puestos', 'Mesas con simpatizantes', ...(conE14 ? ['Confirmados E14', 'Cumplimiento %'] : [])],
              ...localidades.map((l) => [l.nombre, l.personas, l.censo, porMil(l.personas, l.censo), l.puestosCon, l.puestos, l.mesasCon,
                ...(conE14 ? [e14Loc.get(l.id)?.confirmados ?? 0, cumpl(e14Loc.get(l.id)) ?? ''] : [])]),
            ])} />
          </div>
          <div style={{ marginBottom: '1rem' }}>
            {conE14 ? (
              <BarrasH limite={10} series={[{ nombre: 'Confirmados E14', color: SERIES[0] }, { nombre: 'Faltantes', color: SERIES[1] }, { nombre: 'Sin verificar aún', color: 'var(--borde-fuerte)' }]}
                filas={localidades.filter((l) => l.personas).map((l) => {
                  const x = e14Loc.get(l.id);
                  const conf = x?.confirmados ?? 0, falt = x?.faltantes ?? 0;
                  return { nombre: l.nombre, valores: [conf, falt, Math.max(0, l.personas - conf - falt)], detalle: `${formatoNumero(l.personas)} simpatizantes` };
                })} />
            ) : (
              <BarrasH limite={10} filas={localidades.filter((l) => l.personas).map((l) => ({ nombre: l.nombre, valores: [l.personas], detalle: `${porMil(l.personas, l.censo).toLocaleString('es-CO')} por cada 1.000 votantes` }))} />
            )}
            <p className="ayuda" style={{ marginTop: '0.5rem' }}>Toca una localidad en la tabla para ver sus puestos, y un puesto para ver sus mesas.</p>
          </div>
          <div className="envoltura-tabla"><table className="tabla compacta">
            <thead><tr><th>Localidad</th><th className="num">Simpatizantes</th><th className="num solo-ancho">Censo</th><th className="num">Por 1.000</th><th className="num solo-ancho">Puestos</th><th className="num solo-ancho">Mesas</th>{conE14 && <><th className="num solo-ancho">Confirmados E14</th><th className="num">Cumpl.</th></>}</tr></thead>
            <tbody>{localidades.map((l) => (
              <tr key={l.id}>
                <td><button className="enlace" onClick={() => setLocalidad({ id: l.id, nombre: l.nombre })}>{l.nombre}</button></td>
                <td className="num">{formatoNumero(l.personas)}</td>
                <td className="num solo-ancho">{formatoNumero(l.censo)}</td>
                <td className="num">{porMil(l.personas, l.censo).toLocaleString('es-CO')}</td>
                <td className="num solo-ancho">{l.puestosCon}/{l.puestos}</td>
                <td className="num solo-ancho">{formatoNumero(l.mesasCon)}</td>
                {colsE14(e14Loc.get(l.id))}
              </tr>
            ))}</tbody>
          </table></div>
        </>
      )}

      {localidad && !puesto && (
        <>
          <div className="encabezado"><p>{puestos.filter((p) => p.personas).length} de {puestos.length} puestos con simpatizantes</p>
            <BotonExportar onClick={() => exportar('puestos', `Analisis_puestos_${localidad.nombre}`, [
              ['Puesto', 'Simpatizantes', 'Votantes (censo)', 'Por cada 1.000', 'Mesas con simpatizantes', 'Mesas', ...(conE14 ? ['Confirmados E14', 'Cumplimiento %'] : [])],
              ...puestos.map((p) => [p.nombre, p.personas, p.censo, porMil(p.personas, p.censo), p.mesasCon, p.mesas,
                ...(conE14 ? [e14Puesto.get(p.id)?.confirmados ?? 0, cumpl(e14Puesto.get(p.id)) ?? ''] : [])]),
            ], { localidad: localidad.nombre })} />
          </div>
          <div className="envoltura-tabla"><table className="tabla compacta">
            <thead><tr><th>Puesto</th><th className="num">Simpatizantes</th><th className="num solo-ancho">Censo</th><th className="num">Por 1.000</th><th className="num solo-ancho">Mesas</th>{conE14 && <><th className="num solo-ancho">Confirmados E14</th><th className="num">Cumpl.</th></>}</tr></thead>
            <tbody>{puestos.map((p) => (
              <tr key={p.id}>
                <td>{p.personas || e14Puesto.has(p.id) ? <button className="enlace" onClick={() => setPuesto({ id: p.id, nombre: p.nombre })}>{p.nombre}</button> : p.nombre}</td>
                <td className="num">{formatoNumero(p.personas)}</td>
                <td className="num solo-ancho">{formatoNumero(p.censo)}</td>
                <td className="num">{porMil(p.personas, p.censo).toLocaleString('es-CO')}</td>
                <td className="num solo-ancho">{p.mesasCon}/{p.mesas}</td>
                {colsE14(e14Puesto.get(p.id))}
              </tr>
            ))}</tbody>
          </table></div>
        </>
      )}

      {puesto && (
        <>
          <div className="encabezado"><p>{mesas.length} mesas con simpatizantes{conE14 ? ' o votos' : ''}</p>
            <BotonExportar onClick={() => exportar('mesas', `Analisis_mesas_${puesto.nombre}`, [
              ['Mesa', 'Simpatizantes', ...(conE14 ? ['Estado E14', 'Votos E14', 'Confirmados', 'Faltantes', 'Adicionales'] : [])],
              ...mesas.map((m) => [m.mesa, m.personas, ...(conE14 ? [m.e14?.estado ?? 'pendiente', m.e14?.votos_reales ?? '', m.e14?.confirmados ?? '', m.e14?.faltantes ?? '', m.e14?.adicionales ?? ''] : [])]),
            ], { puesto: puesto.nombre })} />
          </div>
          <div className="envoltura-tabla"><table className="tabla compacta">
            <thead><tr><th>Mesa</th><th className="num">Simpatizantes</th>{conE14 && <><th className="num">Votos E14</th><th className="num">Confirmados</th><th className="num">Faltantes</th><th className="num">Adicionales</th></>}</tr></thead>
            <tbody>{mesas.map((m) => (
              <tr key={m.mesa}>
                <td>Mesa {m.mesa}</td>
                <td className="num">{m.personas}</td>
                {conE14 && <>
                  <td className="num">{m.e14?.votos_reales ?? '—'}</td>
                  <td className="num">{m.e14?.confirmados ?? '—'}</td>
                  <td className="num">{m.e14?.faltantes ?? '—'}</td>
                  <td className="num">{m.e14?.adicionales ?? '—'}</td>
                </>}
              </tr>
            ))}</tbody>
          </table></div>
        </>
      )}
    </div>
  );
}

// ── Calidad de los datos ──────────────────────────────────────────────
const PROBLEMAS: { k: keyof CalidadLider; texto: string }[] = [
  { k: 'por_revisar', texto: 'Puesto por revisar' },
  { k: 'sin_lugar', texto: 'Sin lugar de votación' },
  { k: 'sin_mesa', texto: 'Sin mesa' },
  { k: 'sin_sexo', texto: 'Sin sexo' },
  { k: 'sin_edad', texto: 'Sin edad' },
  { k: 'sin_telefono', texto: 'Sin teléfono' },
  { k: 'sin_consentimiento', texto: 'Sin autorización de datos' },
];

function Calidad({ datos, esAdmin, exportar }: { datos: Datos; esAdmin: boolean; exportar: Exportar }) {
  const t = datos.calidad.reduce((s, l) => {
    for (const k of ['total', 'ubicados', ...PROBLEMAS.map((p) => p.k)] as (keyof CalidadLider)[]) s[k] = (s[k] ?? 0) + Number(l[k] ?? 0);
    return s;
  }, {} as Record<string, number>);
  return (
    <>
      <div className="cifras" style={{ marginBottom: '1rem' }}>
        <Cifra icono={CheckCircle2} valor={fmtPct(pct(t.ubicados ?? 0, t.total ?? 0))} tono="ok" etiqueta="con puesto y mesa confirmados"
          detalle={`${formatoNumero(t.ubicados ?? 0)} de ${formatoNumero(t.total ?? 0)} personas`} />
        <Cifra icono={AlertTriangle} valor={t.por_revisar ?? 0} etiqueta="puesto por revisar" tono={t.por_revisar ? 'aviso' : undefined} a={esAdmin ? '/revision' : undefined} />
        <Cifra icono={MapPinOff} valor={(t.sin_lugar ?? 0) + (t.sin_mesa ?? 0)} etiqueta="sin lugar o sin mesa" tono="info" />
        <Cifra icono={Phone} valor={t.sin_telefono ?? 0} etiqueta="sin teléfono" detalle="Difícil contactarlos el día de la elección" />
      </div>
      <div className="tarjeta" style={{ marginBottom: '1rem' }}>
        <div className="tarjeta-titulo">
          <h2>¿Se pueden contar con el E14? <QueEs>Para cruzar un registro con el E14 hace falta saber en qué puesto y en qué mesa vota la persona.
            “Por revisar” son lugares escritos a mano que el sistema no pudo ubicar solo; el administrador los resuelve una vez y el sistema aprende el nombre.</QueEs></h2>
        </div>
        <Segmentos partes={[
          { nombre: 'Puesto y mesa', valor: t.ubicados ?? 0, color: SERIES[2] },
          { nombre: 'Falta la mesa', valor: t.sin_mesa ?? 0, color: SERIES[0] },
          { nombre: 'Puesto por revisar', valor: t.por_revisar ?? 0, color: SERIES[3] },
          { nombre: 'Sin lugar de votación', valor: t.sin_lugar ?? 0, color: 'var(--texto-3)' },
        ]} />
        <p className="ayuda" style={{ marginTop: '0.75rem' }}>
          Además: {formatoNumero(t.sin_sexo ?? 0)} sin sexo, {formatoNumero(t.sin_edad ?? 0)} sin edad y {formatoNumero(t.sin_consentimiento ?? 0)} sin autorización de datos registrada (vienen de Excel importados).
        </p>
      </div>
      {esAdmin && (t.por_revisar ?? 0) > 0 && <div className="aviso atencion" style={{ marginBottom: '1rem' }}><p>{formatoNumero(t.por_revisar)} personas tienen el puesto por revisar. <Link to="/revision">Resolverlas</Link></p></div>}
      <div className="tarjeta">
        <div className="encabezado"><h2 style={{ margin: 0 }}>Por líder</h2>
          <BotonExportar onClick={() => exportar('calidad', 'Calidad_de_datos', [
            ['Líder', 'Registrados', 'Ubicados', '% ubicados', ...PROBLEMAS.map((p) => p.texto), 'Importados'],
            ...datos.calidad.map((l) => [l.nombre, l.total, l.ubicados, pct(l.ubicados, l.total) ?? '', ...PROBLEMAS.map((p) => Number(l[p.k])), l.importados]),
          ])} />
        </div>
        <div className="envoltura-tabla"><table className="tabla compacta">
          <thead><tr><th>Líder</th><th className="num">Registrados</th><th className="num">% ubicados</th>{PROBLEMAS.map((p) => <th key={p.k} className="num solo-ancho">{p.texto}</th>)}</tr></thead>
          <tbody>{[...datos.calidad].sort((a, b) => (pct(a.ubicados, a.total) ?? 101) - (pct(b.ubicados, b.total) ?? 101)).map((l) => (
            <tr key={l.lider_id}>
              <td>{l.nombre}</td><td className="num">{formatoNumero(l.total)}</td><td className="num">{fmtPct(pct(l.ubicados, l.total))}</td>
              {PROBLEMAS.map((p) => <td key={p.k} className="num solo-ancho">{Number(l[p.k]) || ''}</td>)}
            </tr>
          ))}</tbody>
        </table></div>
      </div>
    </>
  );
}

// ── Rendimiento de líderes ────────────────────────────────────────────
function Lideres({ datos, e14, exportar }: { datos: Datos; e14: { lideres: LiderE14[] } | null; exportar: Exportar }) {
  const [orden, setOrden] = useState<'registrados' | 'meta' | 'cumplimiento' | 'nombre'>('registrados');
  const e = new Map((e14?.lideres ?? []).map((l) => [l.lider_id, l]));
  const filas = datos.calidad.map((l) => ({
    ...l, avance: pct(l.total, l.meta_votos), ubicadosPct: pct(l.ubicados, l.total),
    e14: e.get(l.lider_id), dias: l.ultimo_registro ? Math.floor((Date.now() - new Date(l.ultimo_registro).getTime()) / 864e5) : null,
  })).sort((a, b) => orden === 'nombre' ? a.nombre.localeCompare(b.nombre)
    : orden === 'meta' ? (b.avance ?? -1) - (a.avance ?? -1)
    : orden === 'cumplimiento' ? (b.e14?.cumplimiento ?? -1) - (a.e14?.cumplimiento ?? -1)
    : b.total - a.total);
  const conMeta = filas.filter((l) => l.meta_votos > 0);
  return (
    <>
    <div className="graficos" style={{ marginBottom: '1rem' }}>
      <div className="tarjeta">
        <div className="tarjeta-titulo"><h2>Avance de la meta <QueEs>Registrados de cada líder frente a la meta que se le puso. Una meta cumplida no son votos: el E14 dice cuántos votaron de verdad.</QueEs></h2></div>
        <BarrasH max={100} sufijo="%" limite={10} vacio="Ningún líder tiene meta definida"
          filas={[...conMeta].sort((a, b) => (b.avance ?? 0) - (a.avance ?? 0)).map((l) => ({ nombre: l.nombre, valores: [Math.min(100, l.avance ?? 0)], detalle: `${formatoNumero(l.total)} de ${formatoNumero(l.meta_votos)}` }))} />
      </div>
      {e14 && (
        <div className="tarjeta">
          <div className="tarjeta-titulo"><h2>Cumplimiento E14 <QueEs>De los simpatizantes de cada líder en mesas ya verificadas, qué porcentaje aparece confirmado en el E14. Cuando dos líderes comparten mesa, los votos se reparten en proporción a sus registrados.</QueEs></h2></div>
          <BarrasH max={100} sufijo="%" limite={10} vacio="Aún no hay mesas verificadas"
            filas={filas.filter((l) => l.e14?.cumplimiento != null).sort((a, b) => (b.e14!.cumplimiento ?? 0) - (a.e14!.cumplimiento ?? 0))
              .map((l) => ({ nombre: l.nombre, valores: [Math.round(l.e14!.cumplimiento ?? 0)], detalle: `${formatoNumero(l.e14!.confirmados)} confirmados de ${formatoNumero(l.e14!.esperados_verificados ?? 0)} en mesas verificadas` }))} />
        </div>
      )}
    </div>
    <div className="tarjeta">
      <div className="encabezado">
        <label className="campo" style={{ maxWidth: 240 }}><span>Ordenar por</span>
          <select value={orden} onChange={(ev) => setOrden(ev.target.value as typeof orden)}>
            <option value="registrados">Más registrados</option><option value="meta">Avance de la meta</option>
            {e14 && <option value="cumplimiento">Cumplimiento E14</option>}<option value="nombre">Nombre</option>
          </select>
        </label>
        <BotonExportar onClick={() => exportar('lideres', 'Rendimiento_lideres', [
          ['Líder', 'Registrados', 'Meta', '% meta', '% ubicados', 'Días desde el último registro', ...(e14 ? ['Confirmados E14', 'Cumplimiento E14 %'] : [])],
          ...filas.map((l) => [l.nombre, l.total, l.meta_votos, l.avance ?? '', l.ubicadosPct ?? '', l.dias ?? '', ...(e14 ? [l.e14?.confirmados ?? '', l.e14?.cumplimiento ?? ''] : [])]),
        ])} />
      </div>
      <div className="envoltura-tabla"><table className="tabla compacta">
        <thead><tr><th>Líder</th><th className="num">Registrados</th><th className="num">Meta</th><th className="num solo-ancho">% ubicados</th><th className="num solo-ancho">Último registro</th>{e14 && <th className="num">Cumpl. E14</th>}</tr></thead>
        <tbody>{filas.map((l) => (
          <tr key={l.lider_id}>
            <td>{l.nombre}</td>
            <td className="num">{formatoNumero(l.total)}</td>
            <td className="num">{l.meta_votos ? <span className="cumplimiento"><span className="pista"><span style={{ width: `${Math.min(100, l.avance ?? 0)}%` }} /></span>{l.avance}%</span> : '—'}</td>
            <td className="num solo-ancho">{fmtPct(l.ubicadosPct)}</td>
            <td className="num solo-ancho">{l.dias == null ? '—' : l.dias === 0 ? 'hoy' : `hace ${l.dias} d`}</td>
            {e14 && <td className="num">{l.e14?.cumplimiento == null ? '—' : `${Math.round(l.e14.cumplimiento)}%`}</td>}
          </tr>
        ))}</tbody>
      </table></div>
    </div>
    </>
  );
}

// ── Simulación de campaña ─────────────────────────────────────────────
const ESCENARIOS = {
  conservador: { crecimiento: 3, recuperacion: 5, movLideres: 2, movTerritorial: 2 },
  moderado: { crecimiento: 8, recuperacion: 12, movLideres: 5, movTerritorial: 4 },
  optimista: { crecimiento: 15, recuperacion: 20, movLideres: 8, movTerritorial: 7 },
} as const;
type Escenario = keyof typeof ESCENARIOS | 'personalizado';

function Simulacion({ datos, exportar }: { datos: Datos; exportar: Exportar }) {
  const [escenario, setEscenario] = useState<Escenario>('moderado');
  const [p, setP] = useState<{ crecimiento: number; recuperacion: number; movLideres: number; movTerritorial: number }>({ ...ESCENARIOS.moderado });
  const [fecha, setFecha] = useState('');
  const [locSel, setLocSel] = useState<Set<number>>(new Set());
  const [lidSel, setLidSel] = useState<Set<string>>(new Set());

  const elegir = (e: Escenario) => { setEscenario(e); if (e !== 'personalizado') setP({ ...ESCENARIOS[e] }); };
  const cambiar = (k: keyof typeof p, v: string) => { setEscenario('personalizado'); setP((x) => ({ ...x, [k]: Math.max(0, Math.min(100, Number(v) || 0)) })); };

  const r = useMemo(() => {
    // Simpatizantes actuales por localidad (los sin lugar van aparte, para que todo sume)
    const locs = new Map<number, { nombre: string; actual: number }>();
    let sinLugar = 0;
    for (const d of datos.demo) {
      if (d.localidad_id == null) { sinLugar += d.personas; continue; }
      const e = locs.get(d.localidad_id) ?? { nombre: d.localidad, actual: 0 };
      e.actual += d.personas; locs.set(d.localidad_id, e);
    }
    const actual = datos.calidad.reduce((s, l) => s + l.total, 0);
    // 1) Crecimiento de la base: sobre todos, repartido en proporción exacta
    const crecimiento = Math.round(actual * p.crecimiento / 100);
    // 2) Movilización de líderes: solo los elegidos
    const movPorLider = datos.calidad.map((l) => (!lidSel.size || lidSel.has(l.lider_id) ? Math.round(l.total * p.movLideres / 100) : 0));
    const movLideres = movPorLider.reduce((a, b) => a + b, 0);
    // 3) Movilización territorial: solo en las localidades elegidas
    const listaLocs = [...locs.entries()];
    const terrPorLoc = listaLocs.map(([id, l]) => (!locSel.size || locSel.has(id) ? Math.round(l.actual * p.movTerritorial / 100) : 0));
    const movTerritorial = terrPorLoc.reduce((a, b) => a + b, 0);
    const simulado = actual + crecimiento + movLideres + movTerritorial;

    const crecLoc = repartir(crecimiento, [...listaLocs.map(([, l]) => l.actual), sinLugar]);
    const porLocalidad = listaLocs.map(([id, l], i) => ({ id, nombre: l.nombre, actual: l.actual, crec: crecLoc[i], terr: terrPorLoc[i], simulado: l.actual + crecLoc[i] + terrPorLoc[i] }))
      .sort((x, y) => (y.simulado - y.actual) - (x.simulado - x.actual));
    // Lo que no tiene localidad (sin lugar + movilización de líderes) se muestra en una fila aparte
    const noAsignable = { actual: sinLugar, mas: crecLoc[crecLoc.length - 1] + movLideres };

    const crecLid = repartir(crecimiento, datos.calidad.map((l) => l.total));
    const porLider = datos.calidad.map((l, i) => ({
      id: l.lider_id, nombre: l.nombre, meta: l.meta_votos, actual: l.total, crec: crecLid[i], mov: movPorLider[i], simulado: l.total + crecLid[i] + movPorLider[i],
    })).sort((x, y) => (y.simulado - y.actual) - (x.simulado - x.actual));

    // Recuperación: NO suma simpatizantes (ya están registrados); los vuelve contables con el E14
    const ubicados = datos.calidad.reduce((s, l) => s + l.ubicados, 0);
    const recuperables = datos.calidad.reduce((s, l) => s + l.por_revisar + l.sin_lugar + l.sin_mesa, 0);
    const recuperados = Math.round(recuperables * p.recuperacion / 100);

    const meta = datos.calidad.reduce((s, l) => s + l.meta_votos, 0);
    const hace14 = Date.now() - 14 * 864e5;
    const ultimos = datos.tendencia.filter((t) => new Date(t.dia.slice(0, 10) + 'T12:00:00').getTime() >= hace14).reduce((s, t) => s + t.nuevos, 0);
    const ritmo = ultimos / 14;
    const dias = fecha ? Math.max(0, Math.ceil((new Date(fecha + 'T23:59:59').getTime() - Date.now()) / 864e5)) : null;
    return {
      porLocalidad, porLider, noAsignable, actual, crecimiento, movLideres, movTerritorial, simulado, meta, ritmo, dias,
      ubicados, recuperables, recuperados,
      alRitmo: dias != null ? Math.round(actual + ritmo * dias) : null,
      necesario: dias && meta > actual ? Math.ceil((meta - actual) / dias) : null,
    };
  }, [datos, p, locSel, lidSel, fecha]);

  const alternar = <T,>(s: Set<T>, v: T) => { const n = new Set(s); if (n.has(v)) n.delete(v); else n.add(v); return n; };
  const nuevos = r.simulado - r.actual;
  const maxBarra = Math.max(r.simulado, r.meta, 1);
  const barra = (nombre: string, valor: number, color: string, nota?: string) => (
    <div className="sim-barra">
      <span className="sim-nombre">{nombre}</span>
      <span className="pista"><span style={{ width: `${(100 * valor) / maxBarra}%`, background: color }} /></span>
      <span className="sim-valor">{formatoNumero(valor)}{nota && <small>{nota}</small>}</span>
    </div>
  );

  return (
    <>
      <div className="tarjeta">
        <h2>¿Cuántos simpatizantes podríamos tener?</h2>
        <p className="subtitulo" style={{ marginBottom: '1rem' }}>Elige qué tan bien crees que le irá a la campaña y mira el resultado.</p>
        <div className="segmentos" role="group" aria-label="Escenario">
          {(['conservador', 'moderado', 'optimista'] as const).map((e) => (
            <button key={e} type="button" className="opcion" aria-pressed={escenario === e} onClick={() => elegir(e)}>{e[0].toUpperCase() + e.slice(1)}</button>
          ))}
          {escenario === 'personalizado' && <button type="button" className="opcion" aria-pressed>Personalizado</button>}
        </div>

        <div className="sim-resultado">
          <div className="sim-numero"><span>{formatoNumero(r.simulado)}</span><small>simpatizantes proyectados</small></div>
          <div className="sim-numero suave"><span>+{formatoNumero(nuevos)}</span><small>más que hoy ({formatoNumero(r.actual)})</small></div>
          {r.meta > 0 && <div className="sim-numero suave"><span>{fmtPct(pct(r.simulado, r.meta))}</span><small>de la meta ({formatoNumero(r.meta)})</small></div>}
        </div>
        <div className="sim-barras">
          {barra('Hoy', r.actual, SERIES[0])}
          {barra('Proyectado', r.simulado, SERIES[2])}
          {r.meta > 0 && barra('Meta', r.meta, 'var(--texto-3)')}
        </div>
        <p className="sim-explicacion">
          Este escenario supone que llega un <strong>{p.crecimiento}%</strong> más de gente por su cuenta (+{formatoNumero(r.crecimiento)}),
          que los líderes consiguen un <strong>{p.movLideres}%</strong> más (+{formatoNumero(r.movLideres)})
          y que el trabajo de calle suma un <strong>{p.movTerritorial}%</strong> (+{formatoNumero(r.movTerritorial)}).
        </p>

        <details className="sim-ajustes">
          <summary>Ajustar los supuestos</summary>
          <div className="fila-campos" style={{ marginTop: '0.75rem' }}>
            <label className="campo"><span>Gente nueva por su cuenta (%)</span><input type="number" min={0} max={100} value={p.crecimiento} onChange={(e) => cambiar('crecimiento', e.target.value)} /></label>
            <label className="campo"><span>Esfuerzo extra de líderes (%)</span><input type="number" min={0} max={100} value={p.movLideres} onChange={(e) => cambiar('movLideres', e.target.value)} /></label>
            <label className="campo"><span>Trabajo de calle (%)</span><input type="number" min={0} max={100} value={p.movTerritorial} onChange={(e) => cambiar('movTerritorial', e.target.value)} /></label>
          </div>
          <div className="fila-campos" style={{ marginTop: '0.75rem' }}>
            <details><summary className="ayuda">Trabajo de calle solo en: {locSel.size ? `${locSel.size} localidades` : 'todas las localidades'}</summary>
              <div className="lista-check">{[...r.porLocalidad].sort((a, b) => a.nombre.localeCompare(b.nombre)).map((l) => (
                <label key={l.id} className="casilla"><input type="checkbox" checked={locSel.has(l.id)} onChange={() => setLocSel((s) => alternar(s, l.id))} /><span>{l.nombre}</span></label>
              ))}</div>
            </details>
            <details><summary className="ayuda">Esfuerzo extra solo de: {lidSel.size ? `${lidSel.size} líderes` : 'todos los líderes'}</summary>
              <div className="lista-check">{[...r.porLider].sort((a, b) => a.nombre.localeCompare(b.nombre)).map((l) => (
                <label key={l.id} className="casilla"><input type="checkbox" checked={lidSel.has(l.id)} onChange={() => setLidSel((s) => alternar(s, l.id))} /><span>{l.nombre}</span></label>
              ))}</div>
            </details>
          </div>
        </details>
      </div>

      <div className="graficos seccion">
        <div className="tarjeta">
          <h2>¿Llegamos a la meta a tiempo?</h2>
          <label className="campo" style={{ maxWidth: 260 }}><span>Fecha límite</span><input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></label>
          <p style={{ marginTop: '0.75rem' }}>
            Hoy entran unos <strong>{r.ritmo.toLocaleString('es-CO', { maximumFractionDigits: 1 })} registros por día</strong> (promedio de las últimas 2 semanas).
            {r.dias != null && <> A ese ritmo, en {r.dias} días habría unos <strong>{formatoNumero(r.alRitmo ?? 0)}</strong> simpatizantes.</>}
            {r.dias != null && r.meta > 0 && (r.necesario != null
              ? <> Para llegar a la meta hacen falta <strong>{formatoNumero(r.necesario)} por día</strong>.</>
              : <> La meta ya está cumplida.</>)}
            {r.dias == null && <> Elige una fecha para saber si alcanza.</>}
          </p>
        </div>
        <div className="tarjeta">
          <h2>Personas por ubicar</h2>
          <p>
            Hay <strong>{formatoNumero(r.recuperables)}</strong> personas registradas a las que les falta el puesto o la mesa: no se pueden contar con el E14.
            Si se ubica al <strong>{p.recuperacion}%</strong>, serían <strong>{formatoNumero(r.recuperados)}</strong> votos más que se pueden comprobar.
          </p>
          <label className="campo" style={{ maxWidth: 260 }}><span>Porcentaje que se logra ubicar</span>
            <input type="number" min={0} max={100} value={p.recuperacion} onChange={(e) => cambiar('recuperacion', e.target.value)} /></label>
          <p className="ayuda" style={{ marginTop: '0.5rem' }}>Esto no suma gente nueva: son personas que ya están registradas.</p>
        </div>
      </div>

      <details className="tarjeta seccion">
        <summary><strong>Ver el detalle por localidad y por líder</strong></summary>
        <div className="rejilla" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', marginTop: '1rem' }}>
          <div>
            <div className="encabezado"><h3 style={{ margin: 0 }}>Por localidad</h3>
              <BotonExportar onClick={() => exportar('simulacion', 'Simulacion_localidades', [
                ['Localidad', 'Actual', 'Gente nueva', 'Trabajo de calle', 'Proyectado'], ...r.porLocalidad.map((l) => [l.nombre, l.actual, l.crec, l.terr, l.simulado]),
                ['Sin localidad (sin lugar de votación y esfuerzo de líderes)', r.noAsignable.actual, r.noAsignable.mas, 0, r.noAsignable.actual + r.noAsignable.mas],
                ['Total', r.actual, r.crecimiento, r.movTerritorial, r.simulado],
              ], { escenario, ...p })} />
            </div>
            <div className="envoltura-tabla"><table className="tabla compacta">
              <thead><tr><th>Localidad</th><th className="num">Hoy</th><th className="num">Proyectado</th></tr></thead>
              <tbody>
                {r.porLocalidad.map((l) => <tr key={l.id}><td>{l.nombre}</td><td className="num">{formatoNumero(l.actual)}</td><td className="num">{formatoNumero(l.simulado)}</td></tr>)}
                <tr><td>Sin localidad<small>sin lugar de votación + esfuerzo de líderes</small></td><td className="num">{formatoNumero(r.noAsignable.actual)}</td><td className="num">{formatoNumero(r.noAsignable.actual + r.noAsignable.mas)}</td></tr>
                <tr style={{ fontWeight: 700 }}><td>Total</td><td className="num">{formatoNumero(r.actual)}</td><td className="num">{formatoNumero(r.simulado)}</td></tr>
              </tbody>
            </table></div>
          </div>
          <div>
            <div className="encabezado"><h3 style={{ margin: 0 }}>Por líder</h3>
              <BotonExportar onClick={() => exportar('simulacion', 'Simulacion_lideres', [
                ['Líder', 'Actual', 'Gente nueva', 'Esfuerzo extra', 'Proyectado', 'Meta'], ...r.porLider.map((l) => [l.nombre, l.actual, l.crec, l.mov, l.simulado, l.meta]),
                ['Trabajo de calle (no se asigna a un líder)', 0, 0, r.movTerritorial, r.movTerritorial, ''],
                ['Total', r.actual, r.crecimiento, r.movLideres + r.movTerritorial, r.simulado, r.meta],
              ], { escenario, ...p })} />
            </div>
            <div className="envoltura-tabla"><table className="tabla compacta">
              <thead><tr><th>Líder</th><th className="num">Hoy</th><th className="num">Proyectado</th><th className="num">Meta</th></tr></thead>
              <tbody>
                {r.porLider.map((l) => <tr key={l.id}><td>{l.nombre}</td><td className="num">{formatoNumero(l.actual)}</td><td className="num">{formatoNumero(l.simulado)}</td><td className="num">{l.meta ? formatoNumero(l.meta) : '—'}</td></tr>)}
                <tr><td>Trabajo de calle<small>no se asigna a un líder</small></td><td className="num">0</td><td className="num">{formatoNumero(r.movTerritorial)}</td><td className="num">—</td></tr>
                <tr style={{ fontWeight: 700 }}><td>Total</td><td className="num">{formatoNumero(r.actual)}</td><td className="num">{formatoNumero(r.simulado)}</td><td className="num">{r.meta ? formatoNumero(r.meta) : '—'}</td></tr>
              </tbody>
            </table></div>
          </div>
        </div>
      </details>
      <p className="ayuda" style={{ marginTop: '1rem' }}>Es una proyección con los supuestos de arriba, no un pronóstico.</p>
    </>
  );
}

/** Reparte un total entero en proporción a unos pesos (residuo mayor): la suma da exacto */
export function repartir(total: number, pesos: number[]): number[] {
  const suma = pesos.reduce((a, b) => a + b, 0);
  if (!suma) return pesos.map(() => 0);
  const cuotas = pesos.map((p) => (total * p) / suma);
  const pisos = cuotas.map(Math.floor);
  let sobra = total - pisos.reduce((a, b) => a + b, 0);
  const orden = cuotas.map((c, i) => [c - Math.floor(c), i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [, i] of orden) { if (sobra-- <= 0) break; pisos[i]++; }
  return pisos;
}
