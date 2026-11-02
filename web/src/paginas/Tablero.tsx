// Tablero del candidato: dónde están sus simpatizantes, qué edades y sexo
// tienen y cómo se comparan con el censo electoral de cada puesto.
// Solo usa cifras agregadas (v_demografia y el catálogo público de puestos).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useSesion } from '../lib/sesion';
import type { Demografia, Localidad, PuestoCenso, Tendencia } from '../lib/tipos';
import { formatoNumero, mensajeError } from '../lib/utilidades';

const RANGOS = ['18-24', '25-34', '35-44', '45-54', '55-64', '65+'];
const ACTUALIZAR_CADA_MS = 60_000;
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
function hora(d: Date) {
  return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
}

export default function Tablero() {
  const { api } = useSesion();
  const [filas, setFilas] = useState<Demografia[] | null>(null);
  const [puestos, setPuestos] = useState<PuestoCenso[]>([]);
  const [localidades, setLocalidades] = useState<Localidad[]>([]);
  const [tendencia, setTendencia] = useState<Tendencia[]>([]);
  const [actualizado, setActualizado] = useState<Date | null>(null);
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
    cargar();
    const t = setInterval(() => { if (!document.hidden) cargar(); }, ACTUALIZAR_CADA_MS);
    const alVolver = () => { if (!document.hidden) cargar(); };
    document.addEventListener('visibilitychange', alVolver);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', alVolver); };
  }, [api, cargar]);

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

  return (
    <>
      <div className="encabezado">
        <div>
          <h1>Tablero</h1>
          <p>{actualizado ? `Actualizado a las ${hora(actualizado)} · se actualiza solo cada minuto` : 'Cargando…'}</p>
        </div>
        <button className="boton chico" onClick={cargar}>Actualizar ahora</button>
      </div>
      {error && <div className="aviso error" role="alert" style={{ marginBottom: '1rem' }}>{error}</div>}

      <div className="tarjeta filtros-tablero" role="group" aria-label="Filtros">
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

      {!datos ? <div className="tarjeta vacio">Cargando…</div> : (
        <>
          <div className="rejilla cifras" style={{ margin: '1rem 0' }}>
            <div className="tarjeta cifra">
              <span className="valor">{formatoNumero(datos.total)}</span>
              <span className="etiqueta">simpatizantes{hayFiltros ? ' con estos filtros' : ' registrados'}</span>
            </div>
            <div className="tarjeta cifra">
              <span className="valor">{fmt1(datos.porMilGeneral)}</span>
              <span className="etiqueta">por cada 1.000 votantes{sexo === 'femenino' ? ' mujeres' : sexo === 'masculino' ? ' hombres' : ''} del censo</span>
            </div>
            <div className="tarjeta cifra">
              <span className="valor">{datos.pctMujeres == null ? '—' : `${Math.round(datos.pctMujeres)}%`}</span>
              <span className="etiqueta">son mujeres</span>
            </div>
            <div className="tarjeta cifra">
              <span className="valor">{datos.edadTop ?? '—'}</span>
              <span className="etiqueta">la edad con más simpatizantes</span>
            </div>
          </div>

          <div className="tarjeta" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '1rem 1rem 0.5rem' }}>
              <h2 style={{ marginBottom: 0 }}>Dónde están</h2>
              <p className="ayuda" style={{ margin: 0 }}>Cada círculo es un puesto de votación. El tamaño es la cantidad de simpatizantes; el color, cuántos hay por cada 1.000 votantes de ese puesto.</p>
            </div>
            <Mapa filas={datos.filasPuesto} localidadId={localidadId} puestos={puestos} />
            <LeyendaMapa filas={datos.filasPuesto} />
            {datos.sinPuesto > 0 && (
              <p className="ayuda" style={{ padding: '0 1rem 1rem', margin: 0 }}>
                {formatoNumero(datos.sinPuesto)} simpatizantes no aparecen en el mapa porque aún no tienen puesto confirmado.
              </p>
            )}
          </div>

          <div className="rejilla" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', marginTop: '1rem' }}>
            <Piramide datos={datos.piramide} edad={edad} />
            <TendenciaDiaria dias={ultimos30} />
          </div>

          <div className="tarjeta" style={{ marginTop: '1rem' }}>
            <h2>{localidadId ? 'La localidad' : 'Por localidad'}</h2>
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
          </div>

          <div className="tarjeta" style={{ marginTop: '1rem' }}>
            <h2>Puestos con más simpatizantes</h2>
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
          </div>

          <p className="ayuda" style={{ marginTop: '1rem' }}>
            Son simpatizantes registrados por la campaña, no votos. El censo electoral es el de la Registraduría (Divipole 2026)
            {edad && '; el censo no está dividido por edad, así que “por cada 1.000” con filtro de edad compara contra todos los votantes del puesto'}.
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
    const m = L.map(contenedor.current, { zoomControl: true, scrollWheelZoom: false, attributionControl: true })
      .setView([4.64, -74.1], 11);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(m);
    capa.current = L.layerGroup().addTo(m);
    mapa.current = m;
    return () => { m.remove(); mapa.current = null; };
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
    if (base.length) m.fitBounds(L.latLngBounds(base.map((p) => [p.latitud!, p.longitud!] as [number, number])), { padding: [24, 24], maxZoom: 15 });
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
function Piramide({ datos, edad }: { datos: { rango: string; f: number; m: number }[]; edad: string }) {
  const max = Math.max(1, ...datos.flatMap((d) => [d.f, d.m]));
  return (
    <div className="tarjeta">
      <h2>Edad y sexo</h2>
      <div className="leyenda-mapa" style={{ padding: 0, marginBottom: '0.6rem' }}>
        <span className="leyenda-item"><span className="muestra" style={{ background: 'var(--serie-1)' }} />Mujeres</span>
        <span className="leyenda-item"><span className="muestra" style={{ background: 'var(--serie-2)' }} />Hombres</span>
      </div>
      <div className="piramide" role="table" aria-label="Simpatizantes por edad y sexo">
        {[...datos].reverse().map((d) => (
          <div key={d.rango} className={`piramide-fila ${edad && edad !== d.rango ? 'atenuada' : ''}`} role="row">
            <span className="num" role="cell" aria-label={`Mujeres ${d.rango}`}>{formatoNumero(d.f)}</span>
            <div className="lado izq" role="presentation">
              <div className="barra-p" style={{ width: `${(100 * d.f) / max}%`, background: 'var(--serie-1)' }} title={`Mujeres ${d.rango}: ${d.f}`} />
            </div>
            <span className="rango" role="rowheader">{d.rango}</span>
            <div className="lado der" role="presentation">
              <div className="barra-p" style={{ width: `${(100 * d.m) / max}%`, background: 'var(--serie-2)' }} title={`Hombres ${d.rango}: ${d.m}`} />
            </div>
            <span className="num" role="cell" aria-label={`Hombres ${d.rango}`}>{formatoNumero(d.m)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Nuevos registros por día ──────────────────────────────────────────
function TendenciaDiaria({ dias }: { dias: { dia: string; nuevos: number }[] }) {
  const max = Math.max(1, ...dias.map((d) => d.nuevos));
  const total = dias.reduce((s, d) => s + d.nuevos, 0);
  const etiqueta = (dia: string) => new Date(dia + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
  return (
    <div className="tarjeta">
      <h2>Nuevos registros</h2>
      <p className="ayuda">{formatoNumero(total)} en los últimos 30 días</p>
      <div className="columnas" role="img" aria-label={`Registros por día en los últimos 30 días: ${total} en total`}>
        {dias.map((d) => (
          <div key={d.dia} className="columna" title={`${etiqueta(d.dia)}: ${d.nuevos}`}>
            <div className="relleno-col" style={{ height: `${(100 * d.nuevos) / max}%` }} />
          </div>
        ))}
      </div>
      <div className="eje-x"><span>{etiqueta(dias[0].dia)}</span><span>Hoy</span></div>
    </div>
  );
}
