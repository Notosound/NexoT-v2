// Tablero del candidato: dónde están sus simpatizantes, qué edades y sexo
// tienen y cómo se comparan con el censo electoral de cada puesto.
// Solo usa cifras agregadas (v_demografia y el catálogo público de puestos).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useSesion } from '../lib/sesion';
import type { Demografia, Localidad, LocalidadE14, PuestoCenso, Tendencia } from '../lib/tipos';
import { CalendarDays, MapPin, Users, UserRound, Vote } from 'lucide-react';
import { useEnVivo } from '../lib/enVivo';
import EnVivo from '../componentes/EnVivo';
import { BarrasH, Linea, Piramide as PiramideG, SERIES } from '../componentes/Graficos';
import { Cifra, Plegable, QueEs } from '../componentes/Piezas';
import { formatoNumero, mensajeError } from '../lib/utilidades';

const RANGOS = ['18-24', '25-34', '35-44', '45-54', '55-64', '65+'];
// Rampa secuencial (azul) validada: 4 niveles de "por cada 1.000 votantes"
const RAMPA = ['#86b6ef', '#3987e5', '#1c5cab', '#0d366b'];

type Sexo = '' | 'femenino' | 'masculino';

interface FilaPuesto {
  puesto: PuestoCenso;
  localidad: string;
  registrados: number;
  censo: number;
  porMil: number;
}

function porMil(n: number, censo: number) {
  return censo > 0 ? (1000 * n) / censo : 0;
}
function fmt1(n: number) {
  return n.toLocaleString('es-CO', { maximumFractionDigits: 1, minimumFractionDigits: n > 0 && n < 10 ? 1 : 0 });
}

export default function Tablero() {
  const { api } = useSesion();
  const [filas, setFilas] = useState<Demografia[] | null>(null);
  const [puestos, setPuestos] = useState<PuestoCenso[]>([]);
  const [localidades, setLocalidades] = useState<Localidad[]>([]);
  const [tendencia, setTendencia] = useState<Tendencia[]>([]);
  const [, setActualizado] = useState<Date | null>(null);
  const [e14, setE14] = useState<{ nombre: string; localidades: LocalidadE14[] } | null>(null);
  const [error, setError] = useState('');
  const [sexo, setSexo] = useState<Sexo>('');
  const [edad, setEdad] = useState('');
  const [localidadId, setLocalidadId] = useState<number | null>(null);

  const cargar = useCallback(async () => {
    try {
      const [d, t] = await Promise.all([api.demografia(), api.tendencia()]);
      setFilas(d); setTendencia(t); setActualizado(new Date()); setError('');
    } catch (e) {
      setError(mensajeError(e));
    }
  }, [api]);

  useEffect(() => {
    api.censoPuestos().then(setPuestos).catch((e) => setError(mensajeError(e)));
    api.localidades().then(setLocalidades).catch(() => {});
    api.elecciones().then((es) => { if (es[0]) return api.resultadosE14(es[0].id).then((r) => setE14({ nombre: es[0].nombre, ...r })); }).catch(() => {});
  }, [api]);
  const vivo = useEnVivo(cargar, ['registros']);
  useEnVivo(() => api.elecciones().then((es) => { if (es[0]) return api.resultadosE14(es[0].id).then((r) => setE14({ nombre: es[0].nombre, ...r })); }), ['e14']);

  const nombreLocalidad = useMemo(() => new Map(localidades.map((l) => [l.id, l.nombre])), [localidades]);
  const censoDe = useCallback((p: PuestoCenso) =>
    sexo === 'femenino' ? p.censo_mujeres : sexo === 'masculino' ? p.censo_hombres : p.censo_total, [sexo]);

  const datos = useMemo(() => {
    if (!filas) return null;
    const enAlcance = (f: Demografia) => localidadId == null || f.localidad_id === localidadId;
    const cumple = (f: Demografia) => enAlcance(f) && (!sexo || f.sexo === sexo) && (!edad || f.rango_edad === edad);
    const filtradas = filas.filter(cumple);
    const total = filtradas.reduce((s, f) => s + f.personas, 0);
    const sinPuesto = filtradas.filter((f) => f.puesto_id == null).reduce((s, f) => s + f.personas, 0);

    // Por puesto
    const porPuesto = new Map<number, number>();
    for (const f of filtradas) if (f.puesto_id != null) porPuesto.set(f.puesto_id, (porPuesto.get(f.puesto_id) ?? 0) + f.personas);
    const puestosAlcance = puestos.filter((p) => localidadId == null || p.localidad_id === localidadId);
    const filasPuesto: FilaPuesto[] = puestosAlcance
      .map((p) => {
        const n = porPuesto.get(p.id) ?? 0;
        return { puesto: p, localidad: nombreLocalidad.get(p.localidad_id) ?? '', registrados: n, censo: censoDe(p), porMil: porMil(n, censoDe(p)) };
      })
      .filter((x) => x.registrados > 0);

    // Por localidad (el censo cuenta todos sus puestos, tengan o no registrados)
    const loc = new Map<number, { registrados: number; censo: number; mujeres: number; conSexo: number }>();
    for (const p of puestos) {
      const e = loc.get(p.localidad_id) ?? { registrados: 0, censo: 0, mujeres: 0, conSexo: 0 };
      e.censo += censoDe(p);
      loc.set(p.localidad_id, e);
    }
    for (const f of filtradas) {
      if (f.localidad_id == null) continue;
      const e = loc.get(f.localidad_id);
      if (!e) continue;
      e.registrados += f.personas;
    }
    // % mujeres por localidad: ignora el filtro de sexo (si no, sería 0 o 100%)
    for (const f of filas) {
      if (f.localidad_id == null || (edad && f.rango_edad !== edad)) continue;
      const e = loc.get(f.localidad_id);
      if (!e) continue;
      if (f.sexo === 'femenino' || f.sexo === 'masculino') e.conSexo += f.personas;
      if (f.sexo === 'femenino') e.mujeres += f.personas;
    }
    const filasLocalidad = [...loc.entries()]
      .filter(([id]) => localidadId == null || id === localidadId)
      .map(([id, e]) => ({ id, nombre: nombreLocalidad.get(id) ?? '', ...e, porMil: porMil(e.registrados, e.censo) }))
      .sort((a, b) => b.registrados - a.registrados);

    const censoAlcance = puestosAlcance.reduce((s, p) => s + censoDe(p), 0);
    const ubicados = total - sinPuesto;

    // Pirámide: respeta localidad, no sexo ni edad (es justamente lo que muestra)
    const piramide = RANGOS.map((r) => {
      let f = 0, m = 0;
      for (const x of filas) {
        if (!enAlcance(x) || x.rango_edad !== r) continue;
        if (x.sexo === 'femenino') f += x.personas;
        if (x.sexo === 'masculino') m += x.personas;
      }
      return { rango: r, f, m };
    });
    const totalSexo = filas.filter((x) => enAlcance(x) && (!edad || x.rango_edad === edad));
    const mujeres = totalSexo.filter((x) => x.sexo === 'femenino').reduce((s, x) => s + x.personas, 0);
    const conSexo = totalSexo.filter((x) => x.sexo === 'femenino' || x.sexo === 'masculino').reduce((s, x) => s + x.personas, 0);
    const edadTop = [...piramide].sort((a, b) => (b.f + b.m) - (a.f + a.m))[0];

    return {
      total, sinPuesto, ubicados, filasPuesto, filasLocalidad, piramide,
      porMilGeneral: porMil(ubicados, censoAlcance),
      pctMujeres: conSexo ? (100 * mujeres) / conSexo : null,
      edadTop: edadTop && edadTop.f + edadTop.m > 0 ? edadTop.rango : null,
    };
  }, [filas, puestos, sexo, edad, localidadId, nombreLocalidad, censoDe]);

  const ultimos30 = useMemo(() => {
    const m = new Map(tendencia.map((t) => [t.dia, t.nuevos]));
    const dias: { dia: string; nuevos: number }[] = [];
    const hoy = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - i);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      dias.push({ dia: k, nuevos: m.get(k) ?? 0 });
    }
    return dias;
  }, [tendencia]);

  const hayFiltros = !!(sexo || edad || localidadId);
  const semana = ultimos30.slice(-7).reduce((a, d) => a + d.nuevos, 0);
  const t14 = e14?.localidades.reduce((a, l) => ({ conf: a.conf + l.confirmados, falt: a.falt + l.faltantes, adic: a.adic + l.adicionales, verif: a.verif + l.mesas_verificadas, mesas: a.mesas + l.mesas }),
    { conf: 0, falt: 0, adic: 0, verif: 0, mesas: 0 });

  return (
    <>
      <div className="encabezado">
        <div>
          <h1>Resumen de la campaña</h1>
          <EnVivo {...vivo} />
        </div>
      </div>
      {error && <div className="aviso error" role="alert" style={{ marginBottom: '1rem' }}>{error}</div>}

      {!datos ? <div className="tarjeta vacio">Cargando…</div> : (
        <>
          <div className="cifras">
            <Cifra icono={Users} valor={datos.total} etiqueta={`simpatizantes${hayFiltros ? ' con estos filtros' : ''}`} detalle={hayFiltros ? undefined : `+${formatoNumero(semana)} esta semana`} />
            <Cifra icono={MapPin} valor={fmt1(datos.porMilGeneral)} etiqueta="por cada 1.000 votantes" detalle="del censo electoral" />
            <Cifra icono={UserRound} valor={datos.pctMujeres == null ? '—' : `${Math.round(datos.pctMujeres)}%`} etiqueta="son mujeres" detalle={datos.edadTop ? `Edad principal: ${datos.edadTop} años` : undefined} />
            {t14 && t14.verif > 0
              ? <Cifra icono={Vote} valor={t14.conf} etiqueta="votos confirmados (E14)" detalle={`${t14.verif} de ${t14.mesas} mesas verificadas`} tono="ok" />
              : <Cifra icono={CalendarDays} valor={ultimos30.reduce((a, d) => a + d.nuevos, 0)} etiqueta="nuevos en 30 días" />}
          </div>

          <div className="tarjeta filtros-tablero seccion" role="group" aria-label="Filtros">
            <div className="campo">
              <span id="f-sexo">Sexo</span>
              <div className="segmentos" role="group" aria-labelledby="f-sexo">
                {([['', 'Todos'], ['femenino', 'Mujeres'], ['masculino', 'Hombres']] as const).map(([v, t]) => (
                  <button key={v} type="button" className="opcion" aria-pressed={sexo === v} onClick={() => setSexo(v)}>{t}</button>
                ))}
              </div>
            </div>
            <label className="campo"><span>Edad</span>
              <select value={edad} onChange={(e) => setEdad(e.target.value)}>
                <option value="">Todas</option>
                {RANGOS.map((r) => <option key={r} value={r}>{r} años</option>)}
              </select>
            </label>
            <label className="campo"><span>Localidad</span>
              <select value={localidadId ?? ''} onChange={(e) => setLocalidadId(e.target.value ? Number(e.target.value) : null)}>
                <option value="">Toda Bogotá</option>
                {localidades.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
              </select>
            </label>
            {hayFiltros && <button className="enlace" onClick={() => { setSexo(''); setEdad(''); setLocalidadId(null); }}>Quitar filtros</button>}
          </div>

          <div className="tarjeta seccion" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '1.1rem 1.25rem 0.5rem' }}>
              <div className="tarjeta-titulo" style={{ marginBottom: 0 }}>
                <h2>Dónde están <QueEs>Cada círculo es un puesto de votación. El tamaño es la cantidad de simpatizantes; el color, cuántos hay por cada 1.000 votantes de ese puesto (más oscuro = más fuerza).</QueEs></h2>
              </div>
            </div>
            <Mapa filas={datos.filasPuesto} localidadId={localidadId} puestos={puestos} />
            <LeyendaMapa filas={datos.filasPuesto} />
            {datos.sinPuesto > 0 && (
              <p className="ayuda" style={{ padding: '0 1.25rem 1rem', margin: 0 }}>
                {formatoNumero(datos.sinPuesto)} simpatizantes aún no tienen puesto confirmado y no aparecen en el mapa.
              </p>
            )}
          </div>

          <div className="graficos seccion">
            <div className="tarjeta">
              <div className="tarjeta-titulo"><h2>{localidadId ? 'Localidad elegida' : 'Localidades con más simpatizantes'}</h2></div>
              <BarrasH limite={8} filas={datos.filasLocalidad.filter((l) => l.registrados > 0).map((l) => ({ nombre: l.nombre, valores: [l.registrados], detalle: `${fmt1(l.porMil)} por cada 1.000 votantes` }))}
                alElegir={(n) => { const l = datos.filasLocalidad.find((x) => x.nombre === n); if (l) setLocalidadId(l.id); }} />
            </div>
            <div className="tarjeta">
              <div className="tarjeta-titulo"><h2>Registros por día</h2><small>últimos 30 días</small></div>
              <Linea nombre="Registros" puntos={ultimos30.map((d) => ({ etiqueta: new Date(d.dia + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }).replace('.', ''), valor: d.nuevos }))} />
            </div>
            <div className="tarjeta">
              <div className="tarjeta-titulo"><h2>Edad y sexo</h2>{edad && <small>filtro de edad: {edad}</small>}</div>
              <PiramideG filas={datos.piramide.map((p) => ({ rango: p.rango, mujeres: p.f, hombres: p.m }))} />
            </div>
            {t14 && t14.verif > 0 && (
              <div className="tarjeta">
                <div className="tarjeta-titulo"><h2>E14: {e14!.nombre} <QueEs>Confirmados: votos que coinciden con simpatizantes registrados en la mesa. Faltantes: registrados que no aparecen. Adicionales: votos de más, de gente no registrada. Solo mesas verificadas.</QueEs></h2></div>
                <BarrasH limite={6} series={[{ nombre: 'Confirmados', color: SERIES[0] }, { nombre: 'Faltantes', color: SERIES[1] }, { nombre: 'Adicionales', color: SERIES[2] }]}
                  filas={[...e14!.localidades].filter((l) => l.mesas_verificadas > 0).sort((a, b) => b.votos_reales - a.votos_reales)
                    .map((l) => ({ nombre: l.localidad, valores: [l.confirmados, l.faltantes, l.adicionales] }))} />
              </div>
            )}
          </div>

          <div className="seccion" style={{ display: 'grid', gap: '0.75rem' }}>
            <Plegable titulo="Tabla por localidad" cuenta={`${datos.filasLocalidad.length} localidades`}>
              <div className="envoltura-tabla">
                <table className="tabla compacta">
                  <thead><tr><th>Localidad</th><th className="num">Simpatizantes</th><th className="num solo-ancho">Votantes (censo)</th><th className="num">Por cada 1.000</th><th className="num">Mujeres</th></tr></thead>
                  <tbody>
                    {datos.filasLocalidad.map((l) => (
                      <tr key={l.id}>
                        <td><button className="enlace" onClick={() => setLocalidadId(l.id)}>{l.nombre}</button></td>
                        <td className="num">{formatoNumero(l.registrados)}</td>
                        <td className="num solo-ancho">{formatoNumero(l.censo)}</td>
                        <td className="num">{fmt1(l.porMil)}</td>
                        <td className="num">{l.conSexo ? `${Math.round((100 * l.mujeres) / l.conSexo)}%` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Plegable>
            <Plegable titulo="Puestos con más simpatizantes" cuenta="los 10 primeros">
              {datos.filasPuesto.length === 0 ? <p className="ayuda">Sin datos con estos filtros.</p> : (
                <div className="envoltura-tabla">
                  <table className="tabla compacta">
                    <thead><tr><th>Puesto</th><th className="num">Simpatizantes</th><th className="num solo-ancho">Votantes (censo)</th><th className="num">Por cada 1.000</th></tr></thead>
                    <tbody>
                      {[...datos.filasPuesto].sort((a, b) => b.registrados - a.registrados).slice(0, 10).map((p) => (
                        <tr key={p.puesto.id}>
                          <td>{p.puesto.nombre}<small>{p.localidad}</small></td>
                          <td className="num">{formatoNumero(p.registrados)}</td>
                          <td className="num solo-ancho">{formatoNumero(p.censo)}</td>
                          <td className="num">{fmt1(p.porMil)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Plegable>
          </div>

          <p className="ayuda" style={{ marginTop: '1rem' }}>
            Son simpatizantes registrados por la campaña, no votos; los votos reales salen del E14. El censo es el de la Registraduría (Divipole 2026).
          </p>
        </>
      )}
    </>
  );
}

// ── Mapa ──────────────────────────────────────────────────────────────
function cortes(valores: number[]): number[] {
  const v = [...valores].sort((a, b) => a - b);
  if (v.length === 0) return [0, 0, 0];
  const q = (p: number) => v[Math.min(v.length - 1, Math.floor(p * v.length))];
  return [q(0.25), q(0.5), q(0.75)];
}
function colorPara(valor: number, c: number[]) {
  return valor <= c[0] ? RAMPA[0] : valor <= c[1] ? RAMPA[1] : valor <= c[2] ? RAMPA[2] : RAMPA[3];
}

function Mapa({ filas, localidadId, puestos }: { filas: FilaPuesto[]; localidadId: number | null; puestos: PuestoCenso[] }) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<L.Map | null>(null);
  const capa = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!contenedor.current || mapa.current) return;
    const m = L.map(contenedor.current, { zoomControl: true, scrollWheelZoom: false, attributionControl: true, fadeAnimation: false, zoomAnimation: false, markerZoomAnimation: false })
      .setView([4.64, -74.1], 11);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(m);
    capa.current = L.layerGroup().addTo(m);
    mapa.current = m;
    return () => { m.stop(); m.off(); m.remove(); mapa.current = null; capa.current = null; };
  }, []);

  useEffect(() => {
    const m = mapa.current, g = capa.current;
    if (!m || !g) return;
    g.clearLayers();
    const conCoord = filas.filter((f) => f.puesto.latitud != null && f.puesto.longitud != null);
    const max = Math.max(1, ...conCoord.map((f) => f.registrados));
    const c = cortes(conCoord.map((f) => f.porMil));
    // En pantallas angostas, círculos más pequeños para que no se tapen
    const angosto = (contenedor.current?.clientWidth ?? 800) < 600;
    const radioMin = angosto ? 4 : 5, radioMax = angosto ? 13 : 22;
    // Los grandes primero, para que los pequeños queden encima y se puedan tocar
    for (const f of [...conCoord].sort((a, b) => b.registrados - a.registrados)) {
      L.circleMarker([f.puesto.latitud!, f.puesto.longitud!], {
        radius: radioMin + (radioMax - radioMin) * Math.sqrt(f.registrados / max),
        color: '#ffffff', weight: 2, fillColor: colorPara(f.porMil, c), fillOpacity: 0.85,
      })
        .bindTooltip(
          `<strong>${f.puesto.nombre}</strong><br>${f.localidad}<br>` +
          `${formatoNumero(f.registrados)} simpatizantes · ${formatoNumero(f.censo)} votantes<br>` +
          `${fmt1(f.porMil)} por cada 1.000`,
          { direction: 'top', sticky: false },
        )
        .addTo(g);
    }
    // Encuadre: la localidad elegida (todos sus puestos) o donde hay datos
    const base = localidadId != null
      ? puestos.filter((p) => p.localidad_id === localidadId && p.latitud != null && p.longitud != null)
      : conCoord.map((f) => f.puesto);
    if (base.length) m.fitBounds(L.latLngBounds(base.map((p) => [p.latitud!, p.longitud!] as [number, number])), { padding: [24, 24], maxZoom: 15, animate: false });
  }, [filas, localidadId, puestos]);

  return <div ref={contenedor} className="mapa" role="img" aria-label="Mapa de puestos de votación con simpatizantes" />;
}

function LeyendaMapa({ filas }: { filas: FilaPuesto[] }) {
  const c = cortes(filas.map((f) => f.porMil));
  const rangos = [`hasta ${fmt1(c[0])}`, `${fmt1(c[0])} – ${fmt1(c[1])}`, `${fmt1(c[1])} – ${fmt1(c[2])}`, `más de ${fmt1(c[2])}`];
  if (!filas.length) return <p className="ayuda" style={{ padding: '0.75rem 1rem' }}>Sin simpatizantes con puesto confirmado para estos filtros.</p>;
  return (
    <div className="leyenda-mapa">
      <span className="ayuda">Por cada 1.000 votantes:</span>
      {RAMPA.map((col, i) => (
        <span key={col} className="leyenda-item"><span className="muestra" style={{ background: col }} />{rangos[i]}</span>
      ))}
    </div>
  );
}

// ── Pirámide de edad y sexo ───────────────────────────────────────────
